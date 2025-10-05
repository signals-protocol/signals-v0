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

describe(`${INTEGRATION_TAG} Market Settlement`, function () {
  const ALPHA = ethers.parseEther("1");
  const MARKET_DURATION = 7 * 24 * 60 * 60; // 7 days

  // 표준 틱 시스템 파라미터
  const MIN_TICK = 100000;
  const MAX_TICK = 100990;
  const TICK_SPACING = 10;

  it("Should settle market successfully", async function () {
    const { core, keeper, marketId, endTime } = await loadFixture(
      createActiveMarketFixture
    );
    const settlementTick = 100490;

    await time.increaseTo(endTime + 3601);

    await expect(settleMarketAtTick(core, keeper, marketId, settlementTick))
      .to.emit(core, "MarketSettled")
      .withArgs(marketId, BigInt(settlementTick));

    const market = await core.getMarket(marketId);
    expect(market.settled).to.be.true;
    expect(market.settlementTick).to.equal(BigInt(settlementTick));
    expect(market.settlementValue).to.equal(toSettlementValue(settlementTick));
    expect(market.isActive).to.be.false;
  });

  it("Should prevent double settlement", async function () {
    const { core, keeper, marketId, endTime } = await loadFixture(
      createActiveMarketFixture
    );

    await time.increaseTo(endTime + 3601);

    await settleMarketAtTick(core, keeper, marketId, 100490);

    await expect(settleMarketAtTick(core, keeper, marketId, 100500)).to.be
      .revertedWithCustomError(core, "MarketAlreadySettled");
  });

  it("Should validate settlement tick bounds", async function () {
    const { core, keeper, marketId, endTime } = await loadFixture(
      createActiveMarketFixture
    );

    await time.increaseTo(endTime + 3601);

    await expect(
      core
        .connect(keeper)
        .settleMarket(marketId, toSettlementValue(200000))
    ).to.be.revertedWithCustomError(core, "InvalidTick");

    await expect(
      core
        .connect(keeper)
        .settleMarket(marketId, toSettlementValue(99000))
    ).to.be.revertedWithCustomError(core, "InvalidTick");
  });

  it("Should settle with edge ticks", async function () {
    const { core, keeper, endTime } = await loadFixture(createActiveMarketFixture);

    const startTime = await time.latest();
    const newEndTime = startTime + MARKET_DURATION;
    const settlementTime = newEndTime + 3600;

    const marketId1 = await core.connect(keeper).createMarket.staticCall(
      MIN_TICK,
      MAX_TICK,
      TICK_SPACING,
      startTime,
      newEndTime,
      settlementTime,
      ALPHA
    );

    await core.connect(keeper).createMarket(
      MIN_TICK,
      MAX_TICK,
      TICK_SPACING,
      startTime,
      newEndTime,
      settlementTime,
      ALPHA
    );

    await time.increaseTo(settlementTime + 1);
    await settleMarketAtTick(core, keeper, Number(marketId1), MIN_TICK);
    let market = await core.getMarket(Number(marketId1));
    expect(market.settlementTick).to.equal(BigInt(MIN_TICK));

    const marketId2 = await core.connect(keeper).createMarket.staticCall(
      MIN_TICK,
      MAX_TICK,
      TICK_SPACING,
      startTime + 10,
      newEndTime + 10,
      settlementTime + 10,
      ALPHA
    );

    await core.connect(keeper).createMarket(
      MIN_TICK,
      MAX_TICK,
      TICK_SPACING,
      startTime + 10,
      newEndTime + 10,
      settlementTime + 10,
      ALPHA
    );

    await time.increaseTo(settlementTime + 11);
    await settleMarketAtTick(core, keeper, Number(marketId2), MAX_TICK);
    market = await core.getMarket(Number(marketId2));
    expect(market.settlementTick).to.equal(BigInt(MAX_TICK));
  });

  it("Should prevent settlement of non-existent market", async function () {
    const { core, keeper } = await loadFixture(createActiveMarketFixture);

    await expect(
      core.connect(keeper).settleMarket(999, toSettlementValue(100490))
    ).to.be.revertedWithCustomError(core, "MarketNotFound");
  });

  it("Should only allow manager to settle markets", async function () {
    const { core, alice, bob, keeper, marketId, endTime } = await loadFixture(
      createActiveMarketFixture
    );

    await time.increaseTo(endTime + 3601);

    await expect(
      core.connect(alice).settleMarket(marketId, toSettlementValue(100490))
    )
      .to.be.revertedWithCustomError(core, "OwnableUnauthorizedAccount")
      .withArgs(alice.address);

    await expect(
      core.connect(bob).settleMarket(marketId, toSettlementValue(100490))
    )
      .to.be.revertedWithCustomError(core, "OwnableUnauthorizedAccount")
      .withArgs(bob.address);

    await expect(
      core.connect(keeper).settleMarket(marketId, toSettlementValue(100490))
    ).to.not.be.reverted;
  });

  describe("Market Reopen", function () {
    it("Should reopen settled market successfully", async function () {
      const { core, keeper, marketId, endTime } = await loadFixture(
        createActiveMarketFixture
      );

      const settlementValue = toSettlementValue(100490);

      await time.increaseTo(endTime + 3601);
      await core.connect(keeper).settleMarket(marketId, settlementValue);

      let market = await core.getMarket(marketId);
      expect(market.settled).to.be.true;
      expect(market.isActive).to.be.false;

      await expect(core.connect(keeper).reopenMarket(marketId))
        .to.emit(core, "MarketReopened")
        .withArgs(marketId);

      market = await core.getMarket(marketId);
      expect(market.settled).to.be.false;
      expect(market.isActive).to.be.true;
      expect(market.settlementValue).to.equal(BigInt(0));
      expect(market.settlementTick).to.equal(BigInt(0));
    });

    it("Should prevent reopening unsettled market", async function () {
      const { core, keeper, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      await expect(
        core.connect(keeper).reopenMarket(marketId)
      ).to.be.revertedWithCustomError(core, "MarketNotSettled");
    });

    it("Should only allow owner to reopen markets", async function () {
      const { core, keeper, alice, bob, marketId, endTime } = await loadFixture(
        createActiveMarketFixture
      );

      const settlementValue = toSettlementValue(100490);

      await time.increaseTo(endTime + 3601);
      await core.connect(keeper).settleMarket(marketId, settlementValue);

      await expect(
        core.connect(alice).reopenMarket(marketId)
      )
        .to.be.revertedWithCustomError(core, "OwnableUnauthorizedAccount")
        .withArgs(alice.address);

      await expect(
        core.connect(bob).reopenMarket(marketId)
      )
        .to.be.revertedWithCustomError(core, "OwnableUnauthorizedAccount")
        .withArgs(bob.address);
    });

    it("Should preserve market timing after reopen", async function () {
      const { core, keeper, marketId, endTime } = await loadFixture(
        createActiveMarketFixture
      );

      const originalMarket = await core.getMarket(marketId);
      const originalStartTime = originalMarket.startTimestamp;
      const originalEndTime = originalMarket.endTimestamp;

      const settlementValue = toSettlementValue(100490);

      await time.increaseTo(endTime + 3601);
      await core.connect(keeper).settleMarket(marketId, settlementValue);
      await core.connect(keeper).reopenMarket(marketId);

      const reopenedMarket = await core.getMarket(marketId);
      expect(reopenedMarket.startTimestamp).to.equal(originalStartTime);
      expect(reopenedMarket.endTimestamp).to.equal(originalEndTime);
    });
  });
});
