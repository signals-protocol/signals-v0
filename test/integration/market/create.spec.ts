import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import {
  coreFixture,
  getTickValue,
  setMarketActivation,
} from "../../helpers/fixtures/core";
import { INTEGRATION_TAG } from "../../helpers/tags";
describe(`${INTEGRATION_TAG} Market Creation`, function () {
  const ALPHA = ethers.parseEther("1");
  const MARKET_DURATION = 7 * 24 * 60 * 60; // 7 days
  const SETTLEMENT_OFFSET = 3600; // 1 hour after end

  // 표준 틱 시스템 파라미터
  const MIN_TICK = 100000;
  const MAX_TICK = 100990;
  const TICK_SPACING = 10;

  function calculateNumBins(
    minTick: number,
    maxTick: number,
    tickSpacing: number
  ) {
    return (maxTick - minTick) / tickSpacing;
  }

  it("Should create market successfully", async function () {
    const { core, keeper } = await loadFixture(coreFixture);

    const currentTime = await time.latest();
    const startTime = currentTime + 3600;
    const endTime = startTime + MARKET_DURATION;
    const settlementTime = endTime + SETTLEMENT_OFFSET;

    const expectedId = await core
      .connect(keeper)
      .createMarket.staticCall(
        MIN_TICK,
        MAX_TICK,
        TICK_SPACING,
        startTime,
        endTime,
        settlementTime,
        ALPHA,
        ethers.ZeroAddress
      );

    const tx = core
      .connect(keeper)
      .createMarket(
        MIN_TICK,
        MAX_TICK,
        TICK_SPACING,
        startTime,
        endTime,
        settlementTime,
        ALPHA,
        ethers.ZeroAddress
      );

    await expect(tx)
      .to.emit(core, "MarketCreated")
      .withArgs(
        expectedId,
        BigInt(startTime),
        BigInt(endTime),
        BigInt(MIN_TICK),
        BigInt(MAX_TICK),
        BigInt(TICK_SPACING),
        calculateNumBins(MIN_TICK, MAX_TICK, TICK_SPACING),
        ALPHA
      );

    await expect(tx)
      .to.emit(core, "MarketActivationUpdated")
      .withArgs(expectedId, false);

    const market = await core.getMarket(Number(expectedId));
    expect(market.minTick).to.equal(BigInt(MIN_TICK));
    expect(market.maxTick).to.equal(BigInt(MAX_TICK));
    expect(market.tickSpacing).to.equal(BigInt(TICK_SPACING));
    expect(market.numBins).to.equal(
      calculateNumBins(MIN_TICK, MAX_TICK, TICK_SPACING)
    );
    expect(market.liquidityParameter).to.equal(ALPHA);
    expect(market.startTimestamp).to.equal(BigInt(startTime));
    expect(market.endTimestamp).to.equal(BigInt(endTime));
    expect(market.settlementTimestamp).to.equal(BigInt(settlementTime));
    expect(market.isActive).to.be.false;
    expect(market.settled).to.be.false;
    expect(market.settlementTick).to.equal(BigInt(0));
    expect(market.settlementValue).to.equal(BigInt(0));

    await setMarketActivation(core, keeper, Number(expectedId), true);
    const activated = await core.getMarket(Number(expectedId));
    expect(activated.isActive).to.be.true;
  });

  it("Should initialize segment tree correctly", async function () {
    const { core, keeper } = await loadFixture(coreFixture);

    const WAD = ethers.parseEther("1");
    const currentTime = await time.latest();
    const startTime = currentTime + 3600;
    const endTime = startTime + MARKET_DURATION;
    const settlementTime = endTime + SETTLEMENT_OFFSET;

    const marketId = await core
      .connect(keeper)
      .createMarket.staticCall(
        1000,
        1099,
        1,
        startTime,
        endTime,
        settlementTime,
        ALPHA,
        ethers.ZeroAddress
      );

    await core
      .connect(keeper)
      .createMarket(
        1000,
        1099,
        1,
        startTime,
        endTime,
        settlementTime,
        ALPHA,
        ethers.ZeroAddress
      );

    for (let i = 0; i < 10; i++) {
      const actualTick = 1000 + i;
      const tickValue = await getTickValue(core, Number(marketId), actualTick);
      expect(tickValue).to.equal(WAD);
    }
  });

  it("Should create multiple markets sequentially", async function () {
    const { core, keeper } = await loadFixture(coreFixture);

    const currentTime = await time.latest();
    const startTime = currentTime + 3600;
    const endTime = startTime + MARKET_DURATION;
    const settlementTime = endTime + SETTLEMENT_OFFSET;

    for (let i = 1; i <= 5; i++) {
      const expectedId = await core
        .connect(keeper)
        .createMarket.staticCall(
          MIN_TICK,
          MAX_TICK,
          TICK_SPACING,
          startTime + i * 1000,
          endTime + i * 1000,
          settlementTime + i * 1000,
          ALPHA
        );

      const tx = await core
        .connect(keeper)
        .createMarket(
          MIN_TICK,
          MAX_TICK,
          TICK_SPACING,
          startTime + i * 1000,
          endTime + i * 1000,
          settlementTime + i * 1000,
          ALPHA
        );
      await tx.wait();

      expect(expectedId).to.equal(BigInt(i));
      const market = await core.getMarket(Number(expectedId));
      expect(market.isActive).to.be.false;
      expect(market.numBins).to.equal(
        calculateNumBins(MIN_TICK, MAX_TICK, TICK_SPACING)
      );

      await setMarketActivation(core, keeper, Number(expectedId), true);
      const activated = await core.getMarket(Number(expectedId));
      expect(activated.isActive).to.be.true;
    }
  });

  it("Should compute bin counts for various ranges", async function () {
    const { core, keeper } = await loadFixture(coreFixture);

    const currentTime = await time.latest();
    const startTime = currentTime + 3600;
    const endTime = startTime + MARKET_DURATION;
    const settlementTime = endTime + SETTLEMENT_OFFSET;

    const testCases = [
      { minTick: 100000, maxTick: 100010 },
      { minTick: 100000, maxTick: 100090 },
      { minTick: 100000, maxTick: 100990 },
      { minTick: 100000, maxTick: 109990 },
      { minTick: 100000, maxTick: 149990 },
    ];

    for (const { minTick, maxTick } of testCases) {
      const marketId = await core
        .connect(keeper)
        .createMarket.staticCall(
          minTick,
          maxTick,
          TICK_SPACING,
          startTime,
          endTime,
          settlementTime,
          ALPHA
        );

      await core
        .connect(keeper)
        .createMarket(
          minTick,
          maxTick,
          TICK_SPACING,
          startTime,
          endTime,
          settlementTime,
          ALPHA
        );

      const market = await core.getMarket(Number(marketId));
      expect(market.numBins).to.equal(
        calculateNumBins(minTick, maxTick, TICK_SPACING)
      );
    }
  });

  it("Should handle various liquidity parameters", async function () {
    const { core, keeper } = await loadFixture(coreFixture);

    const currentTime = await time.latest();
    const startTime = currentTime + 3600;
    const endTime = startTime + MARKET_DURATION;
    const settlementTime = endTime + SETTLEMENT_OFFSET;

    const testAlphas = [
      ethers.parseEther("0.001"),
      ethers.parseEther("0.01"),
      ethers.parseEther("0.1"),
      ethers.parseEther("1"),
      ethers.parseEther("10"),
      ethers.parseEther("100"),
      ethers.parseEther("1000"),
    ];

    for (const alpha of testAlphas) {
      const marketId = await core
        .connect(keeper)
        .createMarket.staticCall(
          MIN_TICK,
          MAX_TICK,
          TICK_SPACING,
          startTime,
          endTime,
          settlementTime,
          alpha
        );

      await core
        .connect(keeper)
        .createMarket(
          MIN_TICK,
          MAX_TICK,
          TICK_SPACING,
          startTime,
          endTime,
          settlementTime,
          alpha
        );

      const market = await core.getMarket(Number(marketId));
      expect(market.liquidityParameter).to.equal(alpha);
    }
  });

  it("Should validate time range correctly", async function () {
    const { core, keeper } = await loadFixture(coreFixture);

    const currentTime = await time.latest();
    const startTime = currentTime + 3600;
    const endTime = startTime + MARKET_DURATION;
    const settlementTime = endTime + SETTLEMENT_OFFSET;

    await expect(
      core
        .connect(keeper)
        .createMarket(
          MIN_TICK,
          MAX_TICK,
          TICK_SPACING,
          startTime,
          startTime,
          settlementTime,
          ALPHA
        )
    ).to.be.revertedWithCustomError(core, "InvalidTimeRange");

    await expect(
      core
        .connect(keeper)
        .createMarket(
          MIN_TICK,
          MAX_TICK,
          TICK_SPACING,
          endTime,
          startTime,
          settlementTime,
          ALPHA
        )
    ).to.be.revertedWithCustomError(core, "InvalidTimeRange");

    await expect(
      core
        .connect(keeper)
        .createMarket(
          MIN_TICK,
          MAX_TICK,
          TICK_SPACING,
          startTime,
          endTime,
          endTime,
          ALPHA
        )
    ).to.be.revertedWithCustomError(core, "InvalidTimeRange");
  });

  it("Should validate liquidity parameter boundaries", async function () {
    const { core, keeper } = await loadFixture(coreFixture);

    const currentTime = await time.latest();
    const startTime = currentTime + 3600;
    const endTime = startTime + MARKET_DURATION;
    const settlementTime = endTime + SETTLEMENT_OFFSET;

    const minAlpha = await core.MIN_LIQUIDITY_PARAMETER();
    const maxAlpha = await core.MAX_LIQUIDITY_PARAMETER();

    await expect(
      core
        .connect(keeper)
        .createMarket(
          MIN_TICK,
          MAX_TICK,
          TICK_SPACING,
          startTime,
          endTime,
          settlementTime,
          minAlpha - 1n
        )
    ).to.be.revertedWithCustomError(core, "InvalidLiquidityParameter");

    await expect(
      core
        .connect(keeper)
        .createMarket(
          MIN_TICK,
          MAX_TICK,
          TICK_SPACING,
          startTime,
          endTime,
          settlementTime,
          maxAlpha + 1n
        )
    ).to.be.revertedWithCustomError(core, "InvalidLiquidityParameter");

    await core
      .connect(keeper)
      .createMarket(
        MIN_TICK,
        MAX_TICK,
        TICK_SPACING,
        startTime,
        endTime,
        settlementTime,
        minAlpha
      );

    await core
      .connect(keeper)
      .createMarket(
        MIN_TICK,
        MAX_TICK,
        TICK_SPACING,
        startTime,
        endTime,
        settlementTime,
        maxAlpha
      );
  });

  it("Should only allow manager to create markets", async function () {
    const { core, alice, bob } = await loadFixture(coreFixture);

    const currentTime = await time.latest();
    const startTime = currentTime + 3600;
    const endTime = startTime + MARKET_DURATION;
    const settlementTime = endTime + SETTLEMENT_OFFSET;

    await expect(
      core
        .connect(alice)
        .createMarket(
          MIN_TICK,
          MAX_TICK,
          TICK_SPACING,
          startTime,
          endTime,
          settlementTime,
          ALPHA
        )
    )
      .to.be.revertedWithCustomError(core, "OwnableUnauthorizedAccount")
      .withArgs(alice.address);

    await expect(
      core
        .connect(bob)
        .createMarket(
          MIN_TICK,
          MAX_TICK,
          TICK_SPACING,
          startTime,
          endTime,
          settlementTime,
          ALPHA
        )
    )
      .to.be.revertedWithCustomError(core, "OwnableUnauthorizedAccount")
      .withArgs(bob.address);
  });
});
