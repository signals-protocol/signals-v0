import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { coreFixture } from "../../helpers/fixtures/core";
import { INTEGRATION_TAG } from "../../helpers/tags";

describe(`${INTEGRATION_TAG} Market Creation`, function () {
  const ALPHA = ethers.parseEther("1");
  const TICK_COUNT = 100;
  const MARKET_DURATION = 7 * 24 * 60 * 60; // 7 days

  // 표준 틱 시스템 파라미터
  const MIN_TICK = 100000;
  const MAX_TICK = 100990;
  const TICK_SPACING = 10;

  it("Should create market successfully", async function () {
    const { core, keeper } = await loadFixture(coreFixture);

    const currentTime = await time.latest();
    const startTime = currentTime + 3600;
    const endTime = startTime + MARKET_DURATION;
    const marketId = Math.floor(Math.random() * 1000000) + 1;

    await expect(
      core
        .connect(keeper)
        .createMarket(
          marketId,
          MIN_TICK,
          MAX_TICK,
          TICK_SPACING,
          startTime,
          endTime,
          ALPHA
        )
    )
      .to.emit(core, "MarketCreated")
      .withArgs(
        marketId,
        startTime,
        endTime,
        MIN_TICK,
        MAX_TICK,
        TICK_SPACING,
        TICK_COUNT,
        ALPHA
      );

    const market = await core.getMarket(marketId);
    expect(market.minTick).to.equal(MIN_TICK);
    expect(market.maxTick).to.equal(MAX_TICK);
    expect(market.tickSpacing).to.equal(TICK_SPACING);
    expect(market.numTicks).to.equal(TICK_COUNT);
    expect(market.liquidityParameter).to.equal(ALPHA);
    expect(market.startTimestamp).to.equal(startTime);
    expect(market.endTimestamp).to.equal(endTime);
    expect(market.isActive).to.be.true;
    expect(market.settled).to.be.false;
    expect(market.settlementLowerTick).to.equal(0);
    expect(market.settlementUpperTick).to.equal(0);
  });

  it("Should initialize segment tree correctly", async function () {
    const { core, keeper } = await loadFixture(coreFixture);

    const WAD = ethers.parseEther("1");
    const currentTime = await time.latest();
    const startTime = currentTime + 3600;
    const endTime = startTime + MARKET_DURATION;
    const marketId = Math.floor(Math.random() * 1000000) + 1;

    // 새로운 틱 시스템: 1000부터 1099까지, 간격 1
    const minTick = 1000;
    const maxTick = 1099;
    const tickSpacing = 1;

    await core
      .connect(keeper)
      .createMarket(
        marketId,
        minTick,
        maxTick,
        tickSpacing,
        startTime,
        endTime,
        ALPHA
      );

    // Check that all ticks start with value 1 WAD (e^0 = 1)
    for (let i = 0; i < 10; i++) {
      // Check first 10 ticks (actual tick values: 1000, 1001, 1002, ...)
      const actualTick = minTick + i * tickSpacing;
      const tickValue = await core.getTickValue(marketId, actualTick);
      expect(tickValue).to.equal(WAD);
    }
  });

  it("Should prevent duplicate market creation", async function () {
    const { core, keeper } = await loadFixture(coreFixture);

    const currentTime = await time.latest();
    const startTime = currentTime + 3600;
    const endTime = startTime + MARKET_DURATION;
    const marketId = Math.floor(Math.random() * 1000000) + 1;

    // Create first market
    await core
      .connect(keeper)
      .createMarket(
        marketId,
        MIN_TICK,
        MAX_TICK,
        TICK_SPACING,
        startTime,
        endTime,
        ALPHA
      );

    // Try to create duplicate market
    await expect(
      core.connect(keeper).createMarket(
        marketId, // same ID
        MIN_TICK,
        MAX_TICK,
        TICK_SPACING,
        startTime + 1000,
        endTime + 1000,
        ALPHA
      )
    ).to.be.revertedWithCustomError(core, "MarketAlreadyExists");
  });

  it("Should create multiple markets with different IDs", async function () {
    const { core, keeper } = await loadFixture(coreFixture);

    const currentTime = await time.latest();
    const startTime = currentTime + 3600;
    const endTime = startTime + MARKET_DURATION;

    // Create multiple markets
    for (let i = 1; i <= 5; i++) {
      await expect(
        core
          .connect(keeper)
          .createMarket(
            i,
            MIN_TICK,
            MAX_TICK,
            TICK_SPACING,
            startTime + i * 1000,
            endTime + i * 1000,
            ALPHA
          )
      ).to.emit(core, "MarketCreated");

      const market = await core.getMarket(i);
      expect(market.isActive).to.be.true;
      expect(market.numTicks).to.equal(TICK_COUNT);
    }
  });

  it("Should handle various tick counts", async function () {
    const { core, keeper } = await loadFixture(coreFixture);

    const currentTime = await time.latest();
    const startTime = currentTime + 3600;
    const endTime = startTime + MARKET_DURATION;

    const testCases = [
      { tickCount: 2, minTick: 100000, maxTick: 100010 },
      { tickCount: 10, minTick: 100000, maxTick: 100090 },
      { tickCount: 100, minTick: 100000, maxTick: 100990 },
      { tickCount: 1000, minTick: 100000, maxTick: 109990 },
      { tickCount: 5000, minTick: 100000, maxTick: 149990 },
    ];

    for (let i = 0; i < testCases.length; i++) {
      const { tickCount, minTick, maxTick } = testCases[i];
      const marketId = i + 1;

      await core
        .connect(keeper)
        .createMarket(
          marketId,
          minTick,
          maxTick,
          TICK_SPACING,
          startTime,
          endTime,
          ALPHA
        );

      const market = await core.getMarket(marketId);
      expect(market.numTicks).to.equal(tickCount);
    }
  });

  it("Should handle various liquidity parameters", async function () {
    const { core, keeper } = await loadFixture(coreFixture);

    const currentTime = await time.latest();
    const startTime = currentTime + 3600;
    const endTime = startTime + MARKET_DURATION;

    const testAlphas = [
      ethers.parseEther("0.001"), // MIN
      ethers.parseEther("0.01"),
      ethers.parseEther("0.1"),
      ethers.parseEther("1"),
      ethers.parseEther("10"),
      ethers.parseEther("100"),
      ethers.parseEther("1000"), // MAX
    ];

    for (let i = 0; i < testAlphas.length; i++) {
      const alpha = testAlphas[i];
      const marketId = i + 1;

      await core
        .connect(keeper)
        .createMarket(
          marketId,
          MIN_TICK,
          MAX_TICK,
          TICK_SPACING,
          startTime,
          endTime,
          alpha
        );

      const market = await core.getMarket(marketId);
      expect(market.liquidityParameter).to.equal(alpha);
    }
  });

  it("Should validate time range correctly", async function () {
    const { core, keeper } = await loadFixture(coreFixture);

    const currentTime = await time.latest();

    // Test start == end (should fail)
    await expect(
      core
        .connect(keeper)
        .createMarket(
          1,
          MIN_TICK,
          MAX_TICK,
          TICK_SPACING,
          currentTime,
          currentTime,
          ALPHA
        )
    ).to.be.revertedWithCustomError(core, "InvalidTimeRange");

    // Test start > end (should fail)
    await expect(
      core
        .connect(keeper)
        .createMarket(
          1,
          MIN_TICK,
          MAX_TICK,
          TICK_SPACING,
          currentTime + 1000,
          currentTime,
          ALPHA
        )
    ).to.be.revertedWithCustomError(core, "InvalidTimeRange");
  });

  it("Should validate liquidity parameter boundaries", async function () {
    const { core, keeper } = await loadFixture(coreFixture);

    const currentTime = await time.latest();
    const startTime = currentTime + 3600;
    const endTime = startTime + MARKET_DURATION;

    const minAlpha = await core.MIN_LIQUIDITY_PARAMETER();
    const maxAlpha = await core.MAX_LIQUIDITY_PARAMETER();

    // Test minimum boundary (should succeed)
    await core
      .connect(keeper)
      .createMarket(
        1,
        MIN_TICK,
        MAX_TICK,
        TICK_SPACING,
        startTime,
        endTime,
        minAlpha
      );

    // Test maximum boundary (should succeed)
    await core
      .connect(keeper)
      .createMarket(
        2,
        MIN_TICK,
        MAX_TICK,
        TICK_SPACING,
        startTime,
        endTime,
        maxAlpha
      );

    // Test below minimum (should fail)
    await expect(
      core
        .connect(keeper)
        .createMarket(
          3,
          MIN_TICK,
          MAX_TICK,
          TICK_SPACING,
          startTime,
          endTime,
          minAlpha - 1n
        )
    ).to.be.revertedWithCustomError(core, "InvalidLiquidityParameter");

    // Test above maximum (should fail)
    await expect(
      core
        .connect(keeper)
        .createMarket(
          4,
          MIN_TICK,
          MAX_TICK,
          TICK_SPACING,
          startTime,
          endTime,
          maxAlpha + 1n
        )
    ).to.be.revertedWithCustomError(core, "InvalidLiquidityParameter");
  });

  it("Should only allow manager to create markets", async function () {
    const { core, alice, bob } = await loadFixture(coreFixture);

    const currentTime = await time.latest();
    const startTime = currentTime + 3600;
    const endTime = startTime + MARKET_DURATION;

    await expect(
      core
        .connect(alice)
        .createMarket(
          1,
          MIN_TICK,
          MAX_TICK,
          TICK_SPACING,
          startTime,
          endTime,
          ALPHA
        )
    ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");

    await expect(
      core
        .connect(bob)
        .createMarket(
          1,
          MIN_TICK,
          MAX_TICK,
          TICK_SPACING,
          startTime,
          endTime,
          ALPHA
        )
    ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");
  });
});
