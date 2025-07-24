import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import {
  coreFixture,
  createActiveMarketFixture,
} from "../../helpers/fixtures/core";
import { E2E_TAG } from "../../helpers/tags";

describe(`${E2E_TAG} Market Limits and Stress Tests`, function () {
  const ALPHA = ethers.parseEther("1");
  const TICK_COUNT = 100;
  const MARKET_DURATION = 7 * 24 * 60 * 60; // 7 days

  it("Should handle maximum tick count", async function () {
    const { core, keeper } = await loadFixture(createActiveMarketFixture);

    const currentTime = await time.latest();
    const startTime = currentTime + 3600;
    const endTime = startTime + MARKET_DURATION;

    // This might be slow, so we test with a smaller but significant number
    const largeTicks = 50000;
    const minTick = 100000;
    const maxTick = minTick + (largeTicks - 1) * 10;

    const market = await core.getMarket(marketId);
    expect(market.numTicks).to.equal(largeTicks);

    // Test settlement with large tick count
    await core.connect(keeper).settleMarket(1, maxTick - 20, maxTick - 10);

    const settledMarket = await core.getMarket(1);
    expect(settledMarket.settlementLowerTick).to.equal(maxTick - 20);
    expect(settledMarket.settlementUpperTick).to.equal(maxTick - 10);
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
      await core
        .connect(keeper)
        .settleMarket(i, settlementLower, settlementUpper);

      const market = await core.getMarket(i);
      expect(market.settled).to.be.true;
      expect(market.settlementLowerTick).to.equal(settlementLower);
      expect(market.settlementUpperTick).to.equal(settlementUpper);
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
    expect(market.numTicks).to.equal(maxTickCount);

    // Sample a few tick values to ensure tree initialization
    const WAD = ethers.parseEther("1");
    expect(await core.getTickValue(1, minTick)).to.equal(WAD);
    expect(await core.getTickValue(1, minTick + 100000 * tickSpacing)).to.equal(
      WAD
    );
    expect(await core.getTickValue(1, maxTick)).to.equal(WAD);
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

  it("Should prevent duplicate market creation", async function () {
    const { core, keeper } = await loadFixture(coreFixture);

    const currentTime = await time.latest();
    const startTime = currentTime + 3600;
    const endTime = startTime + MARKET_DURATION;
    const minTick = 100000;
    const maxTick = 100990;
    const tickSpacing = 10;

    // Create first market
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

    // Try to create market with same ID
    await expect(
      core
        .connect(keeper)
        .createMarket(
          1,
          minTick,
          maxTick,
          tickSpacing,
          startTime + 1000,
          endTime + 1000,
          ALPHA
        )
    ).to.be.revertedWithCustomError(core, "MarketAlreadyExists");
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
