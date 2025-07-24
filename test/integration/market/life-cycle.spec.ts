import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import {
  createActiveMarketFixture,
  coreFixture,
} from "../../helpers/fixtures/core";
import { INTEGRATION_TAG } from "../../helpers/tags";

describe(`${INTEGRATION_TAG} Market Lifecycle`, function () {
  const ALPHA = ethers.parseEther("1");
  const TICK_COUNT = 100;
  const MARKET_DURATION = 7 * 24 * 60 * 60; // 7 days

  // 표준 틱 시스템 파라미터
  const MIN_TICK = 100000;
  const MAX_TICK = 100990;
  const TICK_SPACING = 10;

  const LARGE_QUANTITY = ethers.parseUnits("0.1", 6);
  const MEDIUM_QUANTITY = ethers.parseUnits("0.05", 6);
  const LARGE_COST = ethers.parseUnits("10", 6);
  const MEDIUM_COST = ethers.parseUnits("5", 6);

  it("Should handle complete market lifecycle", async function () {
    const { core, keeper, marketId, startTime, endTime } = await loadFixture(
      createActiveMarketFixture
    );

    // 1. Market created (already done in fixture)
    let market = await core.getMarket(marketId);
    expect(market.isActive).to.be.true;
    expect(market.settled).to.be.false;

    // 2. Market can be active during trading period
    await time.increaseTo(startTime + 1000);
    market = await core.getMarket(marketId);
    expect(market.isActive).to.be.true;

    // 3. Market can be settled after end time
    await time.increaseTo(endTime + 1);
    const winningTick = 100420;
    await core
      .connect(keeper)
      .settleMarket(marketId, winningTick, winningTick + 10);

    // 4. Market is settled and inactive
    market = await core.getMarket(marketId);
    expect(market.isActive).to.be.false;
    expect(market.settled).to.be.true;
    expect(market.settlementLowerTick).to.equal(winningTick);
    expect(market.settlementUpperTick).to.equal(winningTick + 10);
  });

  it("Should handle multiple markets in different states", async function () {
    const { core, keeper } = await loadFixture(coreFixture);

    const currentTime = await time.latest();
    const baseStartTime = currentTime + 3600;

    // Create markets with different timelines
    const markets = [
      { id: 1, start: baseStartTime, end: baseStartTime + 1000 },
      { id: 2, start: baseStartTime + 2000, end: baseStartTime + 3000 },
      { id: 3, start: baseStartTime + 4000, end: baseStartTime + 5000 },
    ];

    // Create all markets
    for (const m of markets) {
      await core
        .connect(keeper)
        .createMarket(
          m.id,
          MIN_TICK,
          MAX_TICK,
          TICK_SPACING,
          m.start,
          m.end,
          ALPHA
        );
    }

    // Settle first market
    await core.connect(keeper).settleMarket(1, 100100, 100110);

    // Check states
    let market1 = await core.getMarket(1);
    let market2 = await core.getMarket(2);
    let market3 = await core.getMarket(3);

    expect(market1.settled).to.be.true;
    expect(market1.isActive).to.be.false;
    expect(market2.settled).to.be.false;
    expect(market2.isActive).to.be.true;
    expect(market3.settled).to.be.false;
    expect(market3.isActive).to.be.true;

    // Settle second market
    await core.connect(keeper).settleMarket(2, 100200, 100210);

    market2 = await core.getMarket(2);
    expect(market2.settled).to.be.true;
    expect(market2.isActive).to.be.false;

    // Third market should still be active
    market3 = await core.getMarket(3);
    expect(market3.settled).to.be.false;
    expect(market3.isActive).to.be.true;
  });

  it("Should handle complete positio  n lifecycle", async function () {
    const { core, keeper, alice, mockPosition, marketId } = await loadFixture(
      createActiveMarketFixture
    );

    // 1. Open position
    await core
      .connect(alice)
      .openPosition(
        alice.address,
        marketId,
        100450,
        100550,
        LARGE_QUANTITY,
        LARGE_COST
      );

    const positions = await mockPosition.getPositionsByOwner(alice.address);
    const positionId = positions[0];

    // 2. Increase position
    await core
      .connect(alice)
      .increasePosition(positionId, MEDIUM_QUANTITY, MEDIUM_COST);

    // 3. Decrease position partially
    await expect(
      core.connect(alice).decreasePosition(positionId, MEDIUM_QUANTITY, 0)
    ).to.not.be.reverted;

    // 4. Close remaining position
    await core.connect(alice).closePosition(positionId, 0);

    // Position should be burned
    expect(await mockPosition.balanceOf(alice.address)).to.equal(0);
  });

  it("Should handle position lifecycle with settlement", async function () {
    const { core, keeper, alice, mockPosition, marketId } = await loadFixture(
      createActiveMarketFixture
    );

    // 1. Open position
    await core
      .connect(alice)
      .openPosition(
        alice.address,
        marketId,
        100450,
        100550,
        MEDIUM_QUANTITY,
        MEDIUM_COST
      );

    const positions = await mockPosition.getPositionsByOwner(alice.address);
    const positionId = positions[0];

    // 2. Settle market
    await core.connect(keeper).settleMarket(marketId, 100500, 100510);

    // 3. Claim payout
    await expect(core.connect(alice).claimPayout(positionId)).to.emit(
      core,
      "PositionClaimed"
    );

    // Position should be burned
    expect(await mockPosition.balanceOf(alice.address)).to.equal(0);
  });
});
