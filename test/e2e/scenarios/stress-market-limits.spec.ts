import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import {
  coreFixture,
  getTickValue,
  settleMarketAtTick,
} from "../../helpers/fixtures/core";
import { E2E_TAG } from "../../helpers/tags";

const describeMaybe = process.env.COVERAGE ? describe.skip : describe;

describeMaybe(`${E2E_TAG} Market Limits and Stress Tests`, function () {
  const ALPHA = ethers.parseEther("1");
  const TICK_COUNT = 100;
  const MARKET_DURATION = 7 * 24 * 60 * 60; // 7 days

  it("Should handle maximum tick count", async function () {
    const { core, keeper } = await loadFixture(coreFixture);

    const currentTime = await time.latest();
    const startTime = currentTime + 3600;
    const endTime = startTime + MARKET_DURATION;

    const largeTicks = 50000;
    const minTick = 100000;
    const maxTick = minTick + (largeTicks - 1) * 10;
    const tickSpacing = 10;

    const marketIdBig = await core
      .connect(keeper)
      .createMarket.staticCall(
        1,
        minTick,
        maxTick,
        tickSpacing,
        startTime,
        endTime,
        ALPHA
      );
    await core
      .connect(keeper)
      .createMarket(
        1,
        minTick,
        maxTick,
        tickSpacing,
        startTime,
        endTime,
        ALPHA
      );

    const marketId = Number(marketIdBig);
    const market = await core.getMarket(marketId);
    expect(Number(market.numBins)).to.equal(largeTicks - 1);

    await settleMarketAtTick(core, keeper, marketId, maxTick - 15);

    const settledMarket = await core.getMarket(marketId);
    expect(settledMarket.settlementTick).to.equal(BigInt(maxTick - 15));
  });

  it("Should handle rapid market creation and settlement", async function () {
    const { core, keeper } = await loadFixture(coreFixture);

    const currentTime = await time.latest();
    const baseStartTime = currentTime + 3600;

    // Create and settle multiple markets rapidly
    for (let i = 1; i <= 10; i++) {
      const minTick = 100000;
      const maxTick = 100990;
      const tickSpacing = 10;

      await core
        .connect(keeper)
        .createMarket(
          i,
          minTick,
          maxTick,
          tickSpacing,
          baseStartTime + i * 100,
          baseStartTime + i * 100 + MARKET_DURATION,
          ALPHA
        );

      const settlementLower = 100000 + (i % 100) * 10;
      const settlementUpper = settlementLower + 10;
      const settlementTick = (settlementLower + settlementUpper) / 2;
      await settleMarketAtTick(core, keeper, i, settlementTick);

      const market = await core.getMarket(i);
      expect(market.settled).to.be.true;
      expect(market.settlementTick).to.equal(BigInt(settlementTick));
    }
  });

  it("Should handle maximum tick count of 1,000,000", async function () {
    const { core, keeper } = await loadFixture(coreFixture);

    const currentTime = await time.latest();
    const startTime = currentTime + 3600;
    const endTime = startTime + MARKET_DURATION;
    const maxTickCount = await core.MAX_TICK_COUNT(); // 1,000,000

    // Calculate tick range for max count
    const minTick = 100000;
    const tickSpacing = 10;
    const maxTick = minTick + (Number(maxTickCount) - 1) * tickSpacing;

    // Test with actual maximum tick count
    await core
      .connect(keeper)
      .createMarket(
        1,
        minTick,
        maxTick,
        tickSpacing,
        startTime,
        endTime,
        ALPHA
      );

    const market = await core.getMarket(1);
    expect(market.numBins).to.equal(maxTickCount - 1n);

    // Sample a few tick values to ensure tree initialization
    const WAD = ethers.parseEther("1");
    expect(await getTickValue(core, 1, minTick, tickSpacing)).to.equal(WAD);
    expect(
      await getTickValue(core, 1, minTick + 100000 * tickSpacing, tickSpacing)
    ).to.equal(
      WAD
    );
    expect(await getTickValue(core, 1, maxTick, tickSpacing)).to.equal(WAD);
  });

  it("Should validate time range correctly", async function () {
    const { core, keeper } = await loadFixture(coreFixture);

    const currentTime = await time.latest();
    const minTick = 100000;
    const maxTick = 100990;
    const tickSpacing = 10;

    // Test start == end (should fail)
    await expect(
      core
        .connect(keeper)
        .createMarket(
          1,
          minTick,
          maxTick,
          tickSpacing,
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
          minTick,
          maxTick,
          tickSpacing,
          currentTime + 1000,
          currentTime,
          ALPHA
        )
    ).to.be.revertedWithCustomError(core, "InvalidTimeRange");
  });

  it("Should auto-increment market IDs on creation", async function () {
    const { core, keeper } = await loadFixture(coreFixture);

    const currentTime = await time.latest();
    const startTime = currentTime + 3600;
    const endTime = startTime + MARKET_DURATION;
    const minTick = 100000;
    const maxTick = 100990;
    const tickSpacing = 10;

    const firstId = await core
      .connect(keeper)
      .createMarket.staticCall(
        1,
        minTick,
        maxTick,
        tickSpacing,
        startTime,
        endTime,
        ALPHA
      );
    await core
      .connect(keeper)
      .createMarket(
        1,
        minTick,
        maxTick,
        tickSpacing,
        startTime,
        endTime,
        ALPHA
      );

    const secondId = await core
      .connect(keeper)
      .createMarket.staticCall(
        1,
        minTick,
        maxTick,
        tickSpacing,
        endTime + 100,
        endTime + 100 + MARKET_DURATION,
        ALPHA
      );
    await core
      .connect(keeper)
      .createMarket(
        1,
        minTick,
        maxTick,
        tickSpacing,
        endTime + 100,
        endTime + 100 + MARKET_DURATION,
        ALPHA
      );

    expect(secondId).to.equal(firstId + 1n);

    const firstMarket = await core.getMarket(Number(firstId));
    const secondMarket = await core.getMarket(Number(secondId));
    expect(firstMarket.minTick).to.equal(minTick);
    expect(secondMarket.minTick).to.equal(minTick);
  });

  it("Should validate liquidity parameter boundaries", async function () {
    const { core, keeper } = await loadFixture(coreFixture);

    const currentTime = await time.latest();
    const startTime = currentTime + 3600;
    const endTime = startTime + MARKET_DURATION;
    const minTick = 100000;
    const maxTick = 100990;
    const tickSpacing = 10;

    const minAlpha = await core.MIN_LIQUIDITY_PARAMETER();
    const maxAlpha = await core.MAX_LIQUIDITY_PARAMETER();

    // Test minimum boundary (should succeed)
    await core
      .connect(keeper)
      .createMarket(
        1,
        minTick,
        maxTick,
        tickSpacing,
        startTime,
        endTime,
        minAlpha
      );

    // Test maximum boundary (should succeed)
    await core
      .connect(keeper)
      .createMarket(
        2,
        minTick,
        maxTick,
        tickSpacing,
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
          minTick,
          maxTick,
          tickSpacing,
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
          minTick,
          maxTick,
          tickSpacing,
          startTime,
          endTime,
          maxAlpha + 1n
        )
    ).to.be.revertedWithCustomError(core, "InvalidLiquidityParameter");
  });
});
