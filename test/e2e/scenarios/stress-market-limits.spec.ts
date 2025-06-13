import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { coreFixture } from "../../helpers/fixtures/core";
import { E2E_TAG } from "../../helpers/tags";

describe(`${E2E_TAG} Market Limits and Stress Tests`, function () {
  const ALPHA = ethers.parseEther("1");
  const TICK_COUNT = 100;
  const MARKET_DURATION = 7 * 24 * 60 * 60; // 7 days

  it("Should handle maximum tick count", async function () {
    const { core, keeper } = await loadFixture(coreFixture);

    const currentTime = await time.latest();
    const startTime = currentTime + 3600;
    const endTime = startTime + MARKET_DURATION;
    const maxTicks = await core.MAX_TICK_COUNT();

    // This might be slow, so we test with a smaller but significant number
    const largeTicks = 50000;

    await core
      .connect(keeper)
      .createMarket(1, largeTicks, startTime, endTime, ALPHA);

    const market = await core.getMarket(1);
    expect(market.numTicks).to.equal(largeTicks);

    // Test settlement with large tick count
    await core.connect(keeper).settleMarket(1, largeTicks - 1);

    const settledMarket = await core.getMarket(1);
    expect(settledMarket.settlementTick).to.equal(largeTicks - 1);
  });

  it("Should handle rapid market creation and settlement", async function () {
    const { core, keeper } = await loadFixture(coreFixture);

    const currentTime = await time.latest();
    const baseStartTime = currentTime + 3600;

    // Create and settle multiple markets rapidly
    for (let i = 1; i <= 10; i++) {
      await core
        .connect(keeper)
        .createMarket(
          i,
          TICK_COUNT,
          baseStartTime + i * 100,
          baseStartTime + i * 100 + MARKET_DURATION,
          ALPHA
        );

      await core.connect(keeper).settleMarket(i, i % TICK_COUNT);

      const market = await core.getMarket(i);
      expect(market.settled).to.be.true;
      expect(market.settlementTick).to.equal(i % TICK_COUNT);
    }
  });

  it("Should handle maximum tick count of 1,000,000", async function () {
    const { core, keeper } = await loadFixture(coreFixture);

    const currentTime = await time.latest();
    const startTime = currentTime + 3600;
    const endTime = startTime + MARKET_DURATION;
    const maxTicks = await core.MAX_TICK_COUNT(); // 1,000,000

    // Test with actual maximum tick count
    await core
      .connect(keeper)
      .createMarket(1, maxTicks, startTime, endTime, ALPHA);

    const market = await core.getMarket(1);
    expect(market.numTicks).to.equal(maxTicks);

    // Sample a few tick values to ensure tree initialization
    const WAD = ethers.parseEther("1");
    expect(await core.getTickValue(1, 0)).to.equal(WAD);
    expect(await core.getTickValue(1, 100000)).to.equal(WAD);
    expect(await core.getTickValue(1, Number(maxTicks) - 1)).to.equal(WAD);
  });

  it("Should validate time range correctly", async function () {
    const { core, keeper } = await loadFixture(coreFixture);

    const currentTime = await time.latest();

    // Test start == end (should fail)
    await expect(
      core
        .connect(keeper)
        .createMarket(1, TICK_COUNT, currentTime, currentTime, ALPHA)
    ).to.be.revertedWithCustomError(core, "InvalidTimeRange");

    // Test start > end (should fail)
    await expect(
      core
        .connect(keeper)
        .createMarket(1, TICK_COUNT, currentTime + 1000, currentTime, ALPHA)
    ).to.be.revertedWithCustomError(core, "InvalidTimeRange");
  });

  it("Should prevent duplicate market creation", async function () {
    const { core, keeper } = await loadFixture(coreFixture);

    const currentTime = await time.latest();
    const startTime = currentTime + 3600;
    const endTime = startTime + MARKET_DURATION;

    // Create first market
    await core
      .connect(keeper)
      .createMarket(1, TICK_COUNT, startTime, endTime, ALPHA);

    // Try to create market with same ID
    await expect(
      core
        .connect(keeper)
        .createMarket(1, TICK_COUNT, startTime + 1000, endTime + 1000, ALPHA)
    ).to.be.revertedWithCustomError(core, "MarketAlreadyExists");
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
      .createMarket(1, TICK_COUNT, startTime, endTime, minAlpha);

    // Test maximum boundary (should succeed)
    await core
      .connect(keeper)
      .createMarket(2, TICK_COUNT, startTime, endTime, maxAlpha);

    // Test below minimum (should fail)
    await expect(
      core
        .connect(keeper)
        .createMarket(3, TICK_COUNT, startTime, endTime, minAlpha - 1n)
    ).to.be.revertedWithCustomError(core, "InvalidLiquidityParameter");

    // Test above maximum (should fail)
    await expect(
      core
        .connect(keeper)
        .createMarket(4, TICK_COUNT, startTime, endTime, maxAlpha + 1n)
    ).to.be.revertedWithCustomError(core, "InvalidLiquidityParameter");
  });
});
