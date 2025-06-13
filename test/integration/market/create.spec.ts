import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { coreFixture } from "../../helpers/fixtures/core";
import { INTEGRATION_TAG } from "../../helpers/tags";

describe(`${INTEGRATION_TAG} Market Creation`, function () {
  const ALPHA = ethers.parseEther("1");
  const TICK_COUNT = 100;
  const MARKET_DURATION = 7 * 24 * 60 * 60; // 7 days

  it("Should create market successfully", async function () {
    const { core, keeper } = await loadFixture(coreFixture);

    const currentTime = await time.latest();
    const startTime = currentTime + 3600;
    const endTime = startTime + MARKET_DURATION;
    const marketId = 1;

    await expect(
      core
        .connect(keeper)
        .createMarket(marketId, TICK_COUNT, startTime, endTime, ALPHA)
    )
      .to.emit(core, "MarketCreated")
      .withArgs(marketId, startTime, endTime, TICK_COUNT, ALPHA);

    const market = await core.getMarket(marketId);
    expect(market.numTicks).to.equal(TICK_COUNT);
    expect(market.liquidityParameter).to.equal(ALPHA);
    expect(market.startTimestamp).to.equal(startTime);
    expect(market.endTimestamp).to.equal(endTime);
    expect(market.isActive).to.be.true;
    expect(market.settled).to.be.false;
    expect(market.settlementTick).to.equal(0);
  });

  it("Should initialize segment tree correctly", async function () {
    const { core, keeper } = await loadFixture(coreFixture);

    const WAD = ethers.parseEther("1");
    const currentTime = await time.latest();
    const startTime = currentTime + 3600;
    const endTime = startTime + MARKET_DURATION;
    const marketId = 1;

    await core
      .connect(keeper)
      .createMarket(marketId, TICK_COUNT, startTime, endTime, ALPHA);

    // Check that all ticks start with value 1 WAD (e^0 = 1)
    for (let i = 0; i < 10; i++) {
      // Check first 10 ticks
      const tickValue = await core.getTickValue(marketId, i);
      expect(tickValue).to.equal(WAD);
    }
  });

  it("Should prevent duplicate market creation", async function () {
    const { core, keeper } = await loadFixture(coreFixture);

    const currentTime = await time.latest();
    const startTime = currentTime + 3600;
    const endTime = startTime + MARKET_DURATION;
    const marketId = 1;

    // Create first market
    await core
      .connect(keeper)
      .createMarket(marketId, TICK_COUNT, startTime, endTime, ALPHA);

    // Try to create duplicate market
    await expect(
      core.connect(keeper).createMarket(
        marketId, // same ID
        TICK_COUNT,
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
            TICK_COUNT,
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

    const testCases = [1, 10, 100, 1000, 10000];

    for (let i = 0; i < testCases.length; i++) {
      const tickCount = testCases[i];
      const marketId = i + 1;

      await core
        .connect(keeper)
        .createMarket(marketId, tickCount, startTime, endTime, ALPHA);

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
        .createMarket(marketId, TICK_COUNT, startTime, endTime, alpha);

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
        .createMarket(1, TICK_COUNT, currentTime, currentTime, ALPHA)
    ).to.be.revertedWithCustomError(core, "InvalidTimeRange");

    // Test start > end (should fail)
    await expect(
      core
        .connect(keeper)
        .createMarket(1, TICK_COUNT, currentTime + 1000, currentTime, ALPHA)
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

  it("Should only allow manager to create markets", async function () {
    const { core, alice, bob } = await loadFixture(coreFixture);

    const currentTime = await time.latest();
    const startTime = currentTime + 3600;
    const endTime = startTime + MARKET_DURATION;

    await expect(
      core.connect(alice).createMarket(1, TICK_COUNT, startTime, endTime, ALPHA)
    ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");

    await expect(
      core.connect(bob).createMarket(1, TICK_COUNT, startTime, endTime, ALPHA)
    ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");
  });
});
