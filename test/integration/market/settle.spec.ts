import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import {
  createActiveMarketFixture,
  coreFixture,
} from "../../helpers/fixtures/core";
import { INTEGRATION_TAG } from "../../helpers/tags";

describe(`${INTEGRATION_TAG} Market Settlement`, function () {
  const ALPHA = ethers.parseEther("1");
  const TICK_COUNT = 100;
  const MARKET_DURATION = 7 * 24 * 60 * 60; // 7 days

  // 표준 틱 시스템 파라미터
  const MIN_TICK = 100000;
  const MAX_TICK = 100990;
  const TICK_SPACING = 10;

  it("Should settle market successfully", async function () {
    const { core, keeper, marketId } = await loadFixture(
      createActiveMarketFixture
    );

    const winningLowerTick = 100490;
    const winningUpperTick = 100500;

    await expect(
      core
        .connect(keeper)
        .settleMarket(marketId, winningLowerTick, winningUpperTick)
    )
      .to.emit(core, "MarketSettled")
      .withArgs(marketId, winningLowerTick, winningUpperTick);

    const market = await core.getMarket(marketId);
    expect(market.settled).to.be.true;
    expect(market.settlementLowerTick).to.equal(winningLowerTick);
    expect(market.settlementUpperTick).to.equal(winningUpperTick);
    expect(market.isActive).to.be.false;
  });

  it("Should prevent double settlement", async function () {
    const { core, keeper, marketId } = await loadFixture(
      createActiveMarketFixture
    );

    const winningLowerTick = 100490;
    const winningUpperTick = 100500;

    // First settlement
    await core
      .connect(keeper)
      .settleMarket(marketId, winningLowerTick, winningUpperTick);

    // Try to settle again
    await expect(
      core.connect(keeper).settleMarket(marketId, 100600, 100610)
    ).to.be.revertedWithCustomError(core, "MarketAlreadySettled");
  });

  it("Should validate winning tick range", async function () {
    const { core, keeper, marketId } = await loadFixture(
      createActiveMarketFixture
    );

    // Test completely invalid tick (outside market range)
    await expect(
      core.connect(keeper).settleMarket(marketId, 200000, 200010) // way outside range
    ).to.be.revertedWithCustomError(core, "InvalidTick");

    await expect(
      core.connect(keeper).settleMarket(marketId, 99000, 99010) // below min tick
    ).to.be.revertedWithCustomError(core, "InvalidTick");

    await expect(
      core.connect(keeper).settleMarket(marketId, 100500, 100520) // gap of 2
    ).to.be.revertedWithCustomError(core, "InvalidWinningRange");

    await expect(
      core.connect(keeper).settleMarket(marketId, 100500, 100500) // same tick
    ).to.be.revertedWithCustomError(core, "InvalidWinningRange");
  });

  it("Should settle with edge case winning ranges", async function () {
    const { core, keeper } = await loadFixture(createActiveMarketFixture);

    const currentTime = await time.latest();
    const startTime = currentTime + 3600;
    const endTime = startTime + MARKET_DURATION;

    // Test first tick range - use different market IDs
    const marketId1 = 10;
    await core
      .connect(keeper)
      .createMarket(
        marketId1,
        MIN_TICK,
        MAX_TICK,
        TICK_SPACING,
        startTime,
        endTime,
        ALPHA
      );
    await time.increaseTo(startTime + 1);
    await core.connect(keeper).settleMarket(marketId1, MIN_TICK, MIN_TICK + 10);

    let market = await core.getMarket(marketId1);
    expect(market.settlementLowerTick).to.equal(MIN_TICK);
    expect(market.settlementUpperTick).to.equal(MIN_TICK + 10);

    // Test last tick range
    const marketId2 = 20;
    await core
      .connect(keeper)
      .createMarket(
        marketId2,
        MIN_TICK,
        MAX_TICK,
        TICK_SPACING,
        startTime,
        endTime,
        ALPHA
      );
    await core
      .connect(keeper)
      .settleMarket(marketId2, MAX_TICK - 20, MAX_TICK - 10);

    market = await core.getMarket(marketId2);
    expect(market.settlementLowerTick).to.equal(MAX_TICK - 20);
    expect(market.settlementUpperTick).to.equal(MAX_TICK - 10);
  });

  it("Should prevent settlement of non-existent market", async function () {
    const { core, keeper } = await loadFixture(createActiveMarketFixture);

    await expect(
      core.connect(keeper).settleMarket(999, 100490, 100500) // non-existent market
    ).to.be.revertedWithCustomError(core, "MarketNotFound");
  });

  it("Should only allow manager to settle markets", async function () {
    const { core, alice, bob, marketId } = await loadFixture(
      createActiveMarketFixture
    );

    await expect(
      core.connect(alice).settleMarket(marketId, 100490, 100500)
    ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");

    await expect(
      core.connect(bob).settleMarket(marketId, 100490, 100500)
    ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");
  });

  describe("Market Reopen", function () {
    it("Should reopen settled market successfully", async function () {
      const { core, keeper, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Settle the market first
      const settlementValue = 100490000000; // 100490.0 with 6 decimals
      await core.connect(keeper).settleMarket(marketId, settlementValue);

      let market = await core.getMarket(marketId);
      expect(market.settled).to.be.true;
      expect(market.isActive).to.be.false;

      // Reopen the market
      await expect(core.connect(keeper).reopenMarket(marketId))
        .to.emit(core, "MarketReopened")
        .withArgs(marketId);

      market = await core.getMarket(marketId);
      expect(market.settled).to.be.false;
      expect(market.isActive).to.be.true;
      expect(market.settlementValue).to.equal(0);
      expect(market.settlementTick).to.equal(0);
    });

    it("Should prevent reopening unsettled market", async function () {
      const { core, keeper, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Try to reopen without settling first
      await expect(
        core.connect(keeper).reopenMarket(marketId)
      ).to.be.revertedWithCustomError(core, "MarketNotSettled");
    });

    it("Should only allow owner to reopen markets", async function () {
      const { core, keeper, alice, bob, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Settle the market first
      const settlementValue = 100490000000;
      await core.connect(keeper).settleMarket(marketId, settlementValue);

      // Try unauthorized reopen
      await expect(
        core.connect(alice).reopenMarket(marketId)
      ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");

      await expect(
        core.connect(bob).reopenMarket(marketId)
      ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");
    });

    it("Should preserve market timing after reopen", async function () {
      const { core, keeper, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Get original timing
      const originalMarket = await core.getMarket(marketId);
      const originalStartTime = originalMarket.startTimestamp;
      const originalEndTime = originalMarket.endTimestamp;

      // Settle and reopen
      const settlementValue = 100490000000;
      await core.connect(keeper).settleMarket(marketId, settlementValue);
      await core.connect(keeper).reopenMarket(marketId);

      // Check timing is preserved
      const reopenedMarket = await core.getMarket(marketId);
      expect(reopenedMarket.startTimestamp).to.equal(originalStartTime);
      expect(reopenedMarket.endTimestamp).to.equal(originalEndTime);
    });
  });
});
