import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { E2E_TAG } from "../../helpers/tags";
import {
  createActiveMarketFixture,
  settleMarketAtTick,
} from "../../helpers/fixtures/core";

describe(`${E2E_TAG} Normal Market Lifecycle`, function () {
  const SMALL_QUANTITY = ethers.parseUnits("0.01", 6); // 0.01 USDC
  const MEDIUM_QUANTITY = ethers.parseUnits("0.1", 6); // 0.1 USDC
  const LARGE_QUANTITY = ethers.parseUnits("0.5", 6); // 0.5 USDC
  const COST_BUFFER_BPS = 50n;
  const BPS_DENOMINATOR = 10000n;

  const applyBuffer = (amount: bigint, buffer: bigint = COST_BUFFER_BPS) =>
    (amount * (BPS_DENOMINATOR + buffer)) / BPS_DENOMINATOR + 1n;

  const openWithBuffer = async (
    core: any,
    signer: any,
    marketId: number,
    lowerTick: number,
    upperTick: number,
    quantity: bigint,
    buffer: bigint = COST_BUFFER_BPS
  ) => {
    const cost = await core.calculateOpenCost(
      marketId,
      lowerTick,
      upperTick,
      quantity
    );
    return core
      .connect(signer)
      .openPosition(
        marketId,
        lowerTick,
        upperTick,
        quantity,
        applyBuffer(cost, buffer)
      );
  };
  const TICK_COUNT = 100;

  async function createMarketLifecycleFixture() {
    const contracts = await loadFixture(createActiveMarketFixture);
    const { marketId, startTime, endTime } = contracts;
    return {
      ...contracts,
      marketId,
      startTime,
      endTime,
      mockPosition: contracts.mockPosition,
    };
  }

  describe("Complete Market Lifecycle", function () {
    it("Should handle complete market lifecycle with multiple participants", async function () {
      const {
        core,
        keeper,
        alice,
        bob,
        charlie,
        paymentToken,
        mockPosition,
        marketId,
        startTime,
        endTime,
      } = await loadFixture(createMarketLifecycleFixture);

      // Phase 1: Market is already active since we use setupActiveMarket
      let market = await core.getMarket(marketId);
      expect(market.isActive).to.be.true;

      // Can calculate costs
      const premarketCost = await core.calculateOpenCost(
        marketId,
        100450,
        100550,
        MEDIUM_QUANTITY
      );
      expect(premarketCost).to.be.gt(0);

      // Phase 2: Early trading phase - Alice opens positions
      const alicePositions = [];

      // Alice creates multiple positions
      for (let i = 0; i < 3; i++) {
        await openWithBuffer(
          core,
          alice,
          marketId,
          100200 + i * 100,
          100250 + i * 100,
          MEDIUM_QUANTITY
        );
      }

      const alicePositionList = await mockPosition.getPositionsByOwner(
        alice.address
      );
      expect(alicePositionList.length).to.equal(3);

      // Phase 3: Mid-market activity - Bob and Charlie join
      await time.increaseTo(startTime + 2 * 24 * 60 * 60); // 2 days later

      // Bob creates overlapping positions
      await openWithBuffer(
        core,
        bob,
        marketId,
        100250,
        100750,
        LARGE_QUANTITY,
        2000n
      );

      // Charlie creates focused position
      await openWithBuffer(
        core,
        charlie,
        marketId,
        100480,
        100520,
        MEDIUM_QUANTITY
      );

      // Phase 4: Position adjustments
      const bobPositions = await mockPosition.getPositionsByOwner(bob.address);
      const bobPositionId = bobPositions[0];

      // Bob increases his position
      const bobIncreaseCost = await core.calculateIncreaseCost(
        bobPositionId,
        MEDIUM_QUANTITY
      );

      await core
        .connect(bob)
        .increasePosition(
          bobPositionId,
          MEDIUM_QUANTITY,
          applyBuffer(bobIncreaseCost, 2000n)
        );

      // Alice decreases one of her positions
      const alicePositionId = alicePositionList[0];
      await core
        .connect(alice)
        .decreasePosition(alicePositionId, SMALL_QUANTITY, 0);

      // Phase 6: Some users exit early
      await time.increaseTo(startTime + 5 * 24 * 60 * 60); // 5 days later

      // Charlie closes his position
      const charliePositions = await mockPosition.getPositionsByOwner(
        charlie.address
      );
      const charlieInitialBalance = await paymentToken.balanceOf(
        charlie.address
      );

      await core.connect(charlie).closePosition(charliePositions[0], 0);

      const charlieFinalBalance = await paymentToken.balanceOf(charlie.address);
      expect(charlieFinalBalance).to.be.gt(charlieInitialBalance);

      // Phase 6: Market ends
      await time.increaseTo(endTime + 1);
      market = await core.getMarket(marketId);
      expect(market.isActive).to.be.true; // Market remains active until settlement

      // Phase 7: Settlement
      const settlementTick = 100495; // Midpoint around Charlie's position
      await settleMarketAtTick(core, keeper, marketId, settlementTick);

      // Phase 8: Claims phase
      // Bob should win since his range included tick 100500
      const bobFinalPositions = await mockPosition.getPositionsByOwner(
        bob.address
      );
      const bobBalanceBefore = await paymentToken.balanceOf(bob.address);

      await core.connect(bob).claimPayout(bobFinalPositions[0]);

      const bobBalanceAfter = await paymentToken.balanceOf(bob.address);
      expect(bobBalanceAfter).to.be.gt(bobBalanceBefore);

      // Alice should get partial payouts (some positions may include winning tick)
      const aliceFinalPositions = await mockPosition.getPositionsByOwner(
        alice.address
      );
      let aliceClaimedAny = false;

      for (const positionId of aliceFinalPositions) {
        try {
          const balanceBefore = await paymentToken.balanceOf(alice.address);
          await core.connect(alice).claimPayout(positionId);
          const balanceAfter = await paymentToken.balanceOf(alice.address);
          if (balanceAfter > balanceBefore) {
            aliceClaimedAny = true;
          }
        } catch (error) {
          // Some positions may have no payout
        }
      }

      // Verify market integrity
      const finalMarket = await core.getMarket(marketId);
      expect(finalMarket.isActive).to.be.false;
    });

    it("Should handle market with no trading activity", async function () {
      const { core, keeper, marketId, startTime, endTime } = await loadFixture(
        createMarketLifecycleFixture
      );

      // Go through entire lifecycle without trading
      await time.increaseTo(startTime + 10);
      await time.increaseTo(endTime + 10);

      // Should still be able to settle
      await settleMarketAtTick(core, keeper, marketId, 100490);

      const market = await core.getMarket(marketId);
      expect(market.isActive).to.be.false;
    });

    it("Should handle single participant market", async function () {
      const {
        core,
        keeper,
        alice,
        paymentToken,
        mockPosition,
        marketId,
        startTime,
        endTime,
      } = await loadFixture(createMarketLifecycleFixture);

      await time.increaseTo(startTime + 10);

      // Alice is the only participant
      await openWithBuffer(
        core,
        alice,
        marketId,
        100400,
        100600,
        MEDIUM_QUANTITY
      );

      await time.increaseTo(endTime + 1);
      await settleMarketAtTick(core, keeper, marketId, 100490);

      // Alice should be able to claim her winnings
      const positions = await mockPosition.getPositionsByOwner(alice.address);
      const balanceBefore = await paymentToken.balanceOf(alice.address);

      await core.connect(alice).claimPayout(positions[0]);

      const balanceAfter = await paymentToken.balanceOf(alice.address);
      expect(balanceAfter).to.be.gt(balanceBefore);
    });
  });

  describe("Market Edge Cases", function () {
    it("Should handle last-minute trading rush", async function () {
      const { core, alice, bob, charlie, marketId, startTime, endTime } =
        await loadFixture(createMarketLifecycleFixture);

      await time.increaseTo(startTime + 10);

      // Wait until near market end
      await time.increaseTo(endTime - 3600); // 1 hour before end

      // Sudden burst of activity
      const participants = [alice, bob, charlie];
      const rushRanges = [
        { lower: 100400, upper: 100600 },
        { lower: 100420, upper: 100580 },
        { lower: 100440, upper: 100560 },
      ];

      const promises = participants.map((participant, i) => {
        const { lower, upper } = rushRanges[i % rushRanges.length];
        return openWithBuffer(
          core,
          participant,
          marketId,
          lower,
          upper,
          MEDIUM_QUANTITY,
          3000n
        );
      });

      // All should succeed
      await Promise.all(promises);
    });

    it("Should handle market with extreme tick concentration", async function () {
      const { core, alice, bob, charlie, marketId, startTime } =
        await loadFixture(createMarketLifecycleFixture);

      await time.increaseTo(startTime + 10);

      // Everyone bets on the same narrow range
      const participants = [alice, bob, charlie];

      for (const participant of participants) {
        await openWithBuffer(
          core,
          participant,
          marketId,
          100490,
          100510,
          MEDIUM_QUANTITY,
          1000n
        );
      }

      // Market should still function normally
      const market = await core.getMarket(marketId);
      expect(market.isActive).to.be.true;
    });

    it("Should handle mixed trading strategies", async function () {
      const { core, alice, bob, charlie, marketId, startTime, mockPosition } =
        await loadFixture(createMarketLifecycleFixture);

      await time.increaseTo(startTime + 10);

      // Alice: Wide range strategy
      await openWithBuffer(
        core,
        alice,
        marketId,
        100100,
        100900,
        SMALL_QUANTITY
      );

      // Bob: Focused strategy
      await openWithBuffer(
        core,
        bob,
        marketId,
        100480,
        100520,
        LARGE_QUANTITY,
        1000n
      );

      // Charlie: Edge strategy
      await openWithBuffer(
        core,
        charlie,
        marketId,
        100000,
        100050,
        MEDIUM_QUANTITY
      );

      // All strategies should coexist
      const alicePositions = await mockPosition.getPositionsByOwner(
        alice.address
      );
      const bobPositions = await mockPosition.getPositionsByOwner(bob.address);
      const charliePositions = await mockPosition.getPositionsByOwner(
        charlie.address
      );

      expect(alicePositions.length).to.equal(1);
      expect(bobPositions.length).to.equal(1);
      expect(charliePositions.length).to.equal(1);
    });
  });

  describe("Market Stress Scenarios", function () {
    it("Should handle high-frequency position adjustments", async function () {
      const { core, alice, mockPosition, marketId, startTime } =
        await loadFixture(createMarketLifecycleFixture);

      await time.increaseTo(startTime + 10);

      // Create initial position
      await openWithBuffer(
        core,
        alice,
        marketId,
        100400,
        100600,
        LARGE_QUANTITY,
        1000n
      );

      const positions = await mockPosition.getPositionsByOwner(alice.address);
      const positionId = positions[0];

      // Rapidly adjust position multiple times
      for (let i = 0; i < 5; i++) {
        const adjustCost = await core.calculateIncreaseCost(
          positionId,
          SMALL_QUANTITY
        );

        await core
          .connect(alice)
          .increasePosition(
            positionId,
            SMALL_QUANTITY,
            applyBuffer(adjustCost)
          );
        await core
          .connect(alice)
          .decreasePosition(positionId, SMALL_QUANTITY / 2n, 0);
      }

      // Position should still be valid
      const finalPosition = await mockPosition.getPosition(positionId);
      expect(finalPosition.quantity).to.be.gt(0);
    });

    it("Should maintain system integrity under maximum load", async function () {
      const { core, alice, bob, charlie, marketId, startTime } =
        await loadFixture(createMarketLifecycleFixture);

      await time.increaseTo(startTime + 10);

      // Create maximum reasonable number of positions
      const participants = [alice, bob, charlie];

      for (let i = 0; i < 10; i++) {
        const participant = participants[i % 3];
        await openWithBuffer(
          core,
          participant,
          marketId,
          100000 + i * 50,
          100000 + i * 50 + 100,
          SMALL_QUANTITY
        );
      }

      // System should still be responsive
      const market = await core.getMarket(marketId);
      expect(market.isActive).to.be.true;

      // Should still be able to calculate costs
      const cost = await core.calculateOpenCost(
        marketId,
        100450,
        100550,
        SMALL_QUANTITY
      );
      expect(cost).to.be.gt(0);
    });
  });
});
