import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { coreFixture } from "../../helpers/fixtures/core";
import { E2E_TAG } from "../../helpers/tags";

describe(`${E2E_TAG} Market Operations - Stress Tests`, function () {
  const ALPHA = ethers.parseEther("1");
  const TICK_COUNT = 100;
  const MARKET_DURATION = 7 * 24 * 60 * 60; // 7 days
  const WAD = ethers.parseEther("1");

  it("Should handle maximum tick count", async function () {
    const { core, keeper } = await loadFixture(coreFixture);

    const currentTime = await time.latest();
    const startTime = currentTime + 3600;
    const endTime = startTime + MARKET_DURATION;

    // This might be slow, so we test with a smaller but significant number
    const largeTicks = 50000;

    await core
      .connect(keeper)
      .createMarket(1, largeTicks, startTime, endTime, ALPHA);

    const market = await core.getMarket(1);
    expect(market.numTicks).to.equal(largeTicks);

    // Test settlement with large tick count
    await core.connect(keeper).settleMarket(1, largeTicks - 2, largeTicks - 1);

    const settledMarket = await core.getMarket(1);
    expect(settledMarket.settlementUpperTick).to.equal(largeTicks - 1);
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

      const settlementTick = i % TICK_COUNT;
      await core
        .connect(keeper)
        .settleMarket(
          i,
          settlementTick === 0 ? 0 : settlementTick - 1,
          settlementTick
        );

      const market = await core.getMarket(i);
      expect(market.settled).to.be.true;
      expect(market.settlementUpperTick).to.equal(settlementTick);
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

  it("Should handle multiple markets with varied parameters", async function () {
    const { core, keeper } = await loadFixture(coreFixture);

    const currentTime = await time.latest();
    const baseStartTime = currentTime + 3600;

    // Create markets with various tick counts and liquidity parameters
    const marketConfigs = [
      { id: 1, ticks: 10, alpha: ethers.parseEther("0.001") },
      { id: 2, ticks: 100, alpha: ethers.parseEther("0.1") },
      { id: 3, ticks: 1000, alpha: ethers.parseEther("1") },
      { id: 4, ticks: 10000, alpha: ethers.parseEther("10") },
      { id: 5, ticks: 50000, alpha: ethers.parseEther("100") },
    ];

    for (let i = 0; i < marketConfigs.length; i++) {
      const config = marketConfigs[i];
      const startTime = baseStartTime + i * 1000;
      const endTime = startTime + MARKET_DURATION;

      await core
        .connect(keeper)
        .createMarket(
          config.id,
          config.ticks,
          startTime,
          endTime,
          config.alpha
        );

      const market = await core.getMarket(config.id);
      expect(market.numTicks).to.equal(config.ticks);
      expect(market.liquidityParameter).to.equal(config.alpha);
      expect(market.isActive).to.be.true;
      expect(market.settled).to.be.false;
    }

    // Settle all markets with different winning ticks
    for (let i = 0; i < marketConfigs.length; i++) {
      const config = marketConfigs[i];
      const winningTick = Math.floor(config.ticks / 2); // Middle tick

      await core
        .connect(keeper)
        .settleMarket(
          config.id,
          winningTick === 0 ? 0 : winningTick - 1,
          winningTick
        );

      const market = await core.getMarket(config.id);
      expect(market.settled).to.be.true;
      expect(market.isActive).to.be.false;
      expect(market.settlementUpperTick).to.equal(winningTick);
    }
  });

  it("Should handle large-scale tick value queries", async function () {
    const { core, keeper } = await loadFixture(coreFixture);

    const currentTime = await time.latest();
    const startTime = currentTime + 3600;
    const endTime = startTime + MARKET_DURATION;
    const largeTicks = 10000;

    await core
      .connect(keeper)
      .createMarket(1, largeTicks, startTime, endTime, ALPHA);

    // Query many tick values (sampling approach for performance)
    const sampleSize = 100;
    const step = Math.floor(largeTicks / sampleSize);

    for (let i = 0; i < largeTicks; i += step) {
      const tickValue = await core.getTickValue(1, i);
      expect(tickValue).to.equal(WAD);
    }

    // Test edge cases
    expect(await core.getTickValue(1, 0)).to.equal(WAD);
    expect(await core.getTickValue(1, largeTicks - 1)).to.equal(WAD);
  });

  it("Should handle stress test: rapid market operations", async function () {
    const { core, keeper } = await loadFixture(coreFixture);

    const currentTime = await time.latest();
    const baseStartTime = currentTime + 3600;
    const numMarkets = 50;

    // Create many markets rapidly
    for (let i = 1; i <= numMarkets; i++) {
      await core
        .connect(keeper)
        .createMarket(
          i,
          TICK_COUNT,
          baseStartTime + i * 10,
          baseStartTime + i * 10 + MARKET_DURATION,
          ALPHA
        );
    }

    // Verify all markets were created correctly
    for (let i = 1; i <= numMarkets; i++) {
      const market = await core.getMarket(i);
      expect(market.isActive).to.be.true;
      expect(market.settled).to.be.false;
      expect(market.numTicks).to.equal(TICK_COUNT);
    }

    // Settle markets in reverse order
    for (let i = numMarkets; i >= 1; i--) {
      const settlementTick = i % TICK_COUNT;
      await core
        .connect(keeper)
        .settleMarket(
          i,
          settlementTick === 0 ? 0 : settlementTick - 1,
          settlementTick
        );
    }

    // Verify all settlements
    for (let i = 1; i <= numMarkets; i++) {
      const market = await core.getMarket(i);
      expect(market.settled).to.be.true;
      expect(market.isActive).to.be.false;
      expect(market.settlementUpperTick).to.equal(i % TICK_COUNT);
    }
  });
});
