import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import {
  createActiveMarketFixture,
  coreFixture,
  settleMarketAtTick,
  toSettlementValue,
} from "../../helpers/fixtures/core";
import { INTEGRATION_TAG } from "../../helpers/tags";

describe(`${INTEGRATION_TAG} Market Lifecycle`, function () {
  const ALPHA = ethers.parseEther("1");
  const MARKET_DURATION = 7 * 24 * 60 * 60; // 7 days
  const SETTLEMENT_OFFSET = 3600;

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

    let market = await core.getMarket(marketId);
    expect(market.isActive).to.be.true;
    expect(market.settled).to.be.false;

    await time.increaseTo(startTime + 1000);
    market = await core.getMarket(marketId);
    expect(market.isActive).to.be.true;

    await time.increaseTo(endTime + SETTLEMENT_OFFSET + 1);
    const settlementTick = 100420;
    await settleMarketAtTick(core, keeper, marketId, settlementTick);

    market = await core.getMarket(marketId);
    expect(market.isActive).to.be.false;
    expect(market.settled).to.be.true;
    expect(market.settlementTick).to.equal(BigInt(settlementTick));
    expect(market.settlementValue).to.equal(toSettlementValue(settlementTick));
  });

  it("Should handle multiple markets in different states", async function () {
    const { core, keeper } = await loadFixture(coreFixture);

    const currentTime = await time.latest();
    const baseStartTime = currentTime + 3600;

    const markets = [
      { start: baseStartTime, end: baseStartTime + 1000 },
      { start: baseStartTime + 2000, end: baseStartTime + 3000 },
      { start: baseStartTime + 4000, end: baseStartTime + 5000 },
    ];

    const marketIds: number[] = [];

    for (const { start, end } of markets) {
      const settlementTime = end + SETTLEMENT_OFFSET;
      const marketId = await core.connect(keeper).createMarket.staticCall(
        MIN_TICK,
        MAX_TICK,
        TICK_SPACING,
        start,
        end,
        settlementTime,
        ALPHA
      );
      await core.connect(keeper).createMarket(
        MIN_TICK,
        MAX_TICK,
        TICK_SPACING,
        start,
        end,
        settlementTime,
        ALPHA
      );
      marketIds.push(Number(marketId));
    }

    await time.increaseTo(markets[0].end + SETTLEMENT_OFFSET + 1);
    await settleMarketAtTick(core, keeper, marketIds[0], 100100);

    let market1 = await core.getMarket(marketIds[0]);
    let market2 = await core.getMarket(marketIds[1]);
    let market3 = await core.getMarket(marketIds[2]);

    expect(market1.settled).to.be.true;
    expect(market1.isActive).to.be.false;
    expect(market2.settled).to.be.false;
    expect(market2.isActive).to.be.true;
    expect(market3.settled).to.be.false;
    expect(market3.isActive).to.be.true;

    await time.increaseTo(markets[1].end + SETTLEMENT_OFFSET + 1);
    await settleMarketAtTick(core, keeper, marketIds[1], 100200);

    market2 = await core.getMarket(marketIds[1]);
    expect(market2.settled).to.be.true;
    expect(market2.isActive).to.be.false;

    market3 = await core.getMarket(marketIds[2]);
    expect(market3.settled).to.be.false;
    expect(market3.isActive).to.be.true;
  });

  it("Should handle complete position lifecycle", async function () {
    const { core, keeper, alice, mockPosition, marketId, endTime } =
      await loadFixture(createActiveMarketFixture);

    await core
      .connect(alice)
      .openPosition(marketId, 100450, 100550, LARGE_QUANTITY, LARGE_COST);

    const positions = await mockPosition.getPositionsByOwner(alice.address);
    const positionId = positions[0];

    await core
      .connect(alice)
      .increasePosition(positionId, MEDIUM_QUANTITY, MEDIUM_COST);

    await expect(
      core.connect(alice).decreasePosition(positionId, MEDIUM_QUANTITY, 0)
    ).to.not.be.reverted;

    await core.connect(alice).closePosition(positionId, 0);
    expect(await mockPosition.balanceOf(alice.address)).to.equal(0);

    await time.increaseTo(endTime + SETTLEMENT_OFFSET + 1);
    await settleMarketAtTick(core, keeper, marketId, 100480);
  });

  it("Should handle position lifecycle with settlement", async function () {
    const { core, keeper, alice, mockPosition, marketId, endTime } =
      await loadFixture(createActiveMarketFixture);

    await core
      .connect(alice)
      .openPosition(marketId, 100450, 100550, MEDIUM_QUANTITY, MEDIUM_COST);

    const positions = await mockPosition.getPositionsByOwner(alice.address);
    const positionId = positions[0];

    await time.increaseTo(endTime + SETTLEMENT_OFFSET + 1);
    await settleMarketAtTick(core, keeper, marketId, 100500);

    await expect(core.connect(alice).claimPayout(positionId)).to.emit(
      core,
      "PositionClaimed"
    );

    expect(await mockPosition.balanceOf(alice.address)).to.equal(0);
  });
});
