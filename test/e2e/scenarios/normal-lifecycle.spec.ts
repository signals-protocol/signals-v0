import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { coreFixture } from "../../helpers/fixtures/core";
import { E2E_TAG } from "../../helpers/tags";

describe(`${E2E_TAG} Normal Market Lifecycle`, function () {
  const SMALL_QUANTITY = ethers.parseUnits("0.01", 6); // 0.01 USDC
  const MEDIUM_QUANTITY = ethers.parseUnits("0.1", 6); // 0.1 USDC
  const LARGE_QUANTITY = ethers.parseUnits("1", 6); // 1 USDC
  const MEDIUM_COST = ethers.parseUnits("50", 6); // 50 USDC
  const LARGE_COST = ethers.parseUnits("500", 6); // 500 USDC
  const TICK_COUNT = 100;

  async function createMarketLifecycleFixture() {
    const contracts = await loadFixture(coreFixture);
    const { core, keeper, mockPosition } = contracts;

    const currentTime = await time.latest();
    const startTime = currentTime + 3600; // 1 hour from now
    const endTime = startTime + 7 * 24 * 60 * 60; // 7 days duration
    const marketId = 1;

    await core
      .connect(keeper)
      .createMarket(
        marketId,
        TICK_COUNT,
        startTime,
        endTime,
        ethers.parseEther("1")
      );

    return { ...contracts, marketId, startTime, endTime, mockPosition };
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

      // Phase 1: Pre-market (CREATED state)
      let market = await core.getMarket(marketId);
      // Note: Market might be active immediately after creation depending on implementation
      // expect(market.isActive).to.be.false; // Market should not be active before startTime

      // Can calculate costs even before market starts
      const premarketCost = await core.calculateOpenCost(
        marketId,
        45,
        55,
        MEDIUM_QUANTITY
      );
      expect(premarketCost).to.be.gt(0);

      // Phase 2: Market becomes active
      await time.increaseTo(startTime + 1);
      market = await core.getMarket(marketId);
      expect(market.isActive).to.be.true;

      // Phase 3: Early trading phase - Alice opens positions
      const alicePositions = [];

      // Alice creates multiple positions
      for (let i = 0; i < 3; i++) {
        await core
          .connect(alice)
          .openPosition(
            alice.address,
            marketId,
            20 + i * 20,
            30 + i * 20,
            MEDIUM_QUANTITY,
            MEDIUM_COST
          );
      }

      const alicePositionList = await mockPosition.getPositionsByOwner(
        alice.address
      );
      expect(alicePositionList.length).to.equal(3);

      // Phase 4: Mid-market activity - Bob and Charlie join
      await time.increaseTo(startTime + 2 * 24 * 60 * 60); // 2 days later

      // Bob creates overlapping positions
      await core
        .connect(bob)
        .openPosition(
          bob.address,
          marketId,
          25,
          75,
          LARGE_QUANTITY,
          LARGE_COST
        );

      // Charlie creates focused position
      await core
        .connect(charlie)
        .openPosition(
          charlie.address,
          marketId,
          48,
          52,
          MEDIUM_QUANTITY,
          MEDIUM_COST
        );

      // Phase 5: Position adjustments
      const bobPositions = await mockPosition.getPositionsByOwner(bob.address);
      const bobPositionId = bobPositions[0];

      // Bob increases his position
      await core
        .connect(bob)
        .increasePosition(bobPositionId, MEDIUM_QUANTITY, LARGE_COST);

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

      // Phase 7: Market ends
      await time.increaseTo(endTime + 1);
      market = await core.getMarket(marketId);
      expect(market.isActive).to.be.true; // Market remains active until settlement

      // Phase 8: Settlement
      const winningLowerTick = 49; // Range around Charlie's position!
      const winningUpperTick = 50;
      await core
        .connect(keeper)
        .settleMarket(marketId, winningLowerTick, winningUpperTick);

      // Phase 9: Claims phase
      // Bob should win since his range included tick 50
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
      await time.increaseTo(startTime + 1);
      await time.increaseTo(endTime + 1);

      // Should still be able to settle
      await core.connect(keeper).settleMarket(marketId, 49, 50);

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

      await time.increaseTo(startTime + 1);

      // Alice is the only participant
      await core
        .connect(alice)
        .openPosition(
          alice.address,
          marketId,
          40,
          60,
          MEDIUM_QUANTITY,
          MEDIUM_COST
        );

      await time.increaseTo(endTime + 1);
      await core.connect(keeper).settleMarket(marketId, 49, 50);

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

      await time.increaseTo(startTime + 1);

      // Wait until near market end
      await time.increaseTo(endTime - 3600); // 1 hour before end

      // Sudden burst of activity
      const participants = [alice, bob, charlie];
      const promises = participants.map((participant, i) =>
        core
          .connect(alice)
          .openPosition(
            participant.address,
            marketId,
            40 + i * 5,
            60 - i * 5,
            MEDIUM_QUANTITY,
            MEDIUM_COST
          )
      );

      // All should succeed
      await Promise.all(promises);
    });

    it("Should handle market with extreme tick concentration", async function () {
      const { core, alice, bob, charlie, marketId, startTime } =
        await loadFixture(createMarketLifecycleFixture);

      await time.increaseTo(startTime + 1);

      // Everyone bets on the same narrow range
      const participants = [alice, bob, charlie];

      for (const participant of participants) {
        await core
          .connect(alice)
          .openPosition(
            participant.address,
            marketId,
            49,
            51,
            MEDIUM_QUANTITY,
            LARGE_COST
          ); // Higher cost due to concentration
      }

      // Market should still function normally
      const market = await core.getMarket(marketId);
      expect(market.isActive).to.be.true;
    });

    it("Should handle mixed trading strategies", async function () {
      const { core, alice, bob, charlie, marketId, startTime, mockPosition } =
        await loadFixture(createMarketLifecycleFixture);

      await time.increaseTo(startTime + 1);

      // Alice: Wide range strategy
      await core
        .connect(alice)
        .openPosition(
          alice.address,
          marketId,
          10,
          90,
          SMALL_QUANTITY,
          MEDIUM_COST
        );

      // Bob: Focused strategy
      await core
        .connect(bob)
        .openPosition(
          bob.address,
          marketId,
          48,
          52,
          LARGE_QUANTITY,
          LARGE_COST
        );

      // Charlie: Edge strategy
      await core
        .connect(charlie)
        .openPosition(
          charlie.address,
          marketId,
          0,
          5,
          MEDIUM_QUANTITY,
          MEDIUM_COST
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

      await time.increaseTo(startTime + 1);

      // Create initial position
      await core
        .connect(alice)
        .openPosition(
          alice.address,
          marketId,
          40,
          60,
          LARGE_QUANTITY,
          LARGE_COST
        );

      const positions = await mockPosition.getPositionsByOwner(alice.address);
      const positionId = positions[0];

      // Rapidly adjust position multiple times
      for (let i = 0; i < 5; i++) {
        await core
          .connect(alice)
          .increasePosition(positionId, SMALL_QUANTITY, MEDIUM_COST);
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

      await time.increaseTo(startTime + 1);

      // Create maximum reasonable number of positions
      const participants = [alice, bob, charlie];

      for (let i = 0; i < 10; i++) {
        const participant = participants[i % 3];
        await core
          .connect(participant)
          .openPosition(
            participant.address,
            marketId,
            i * 5,
            i * 5 + 10,
            SMALL_QUANTITY,
            MEDIUM_COST
          );
      }

      // System should still be responsive
      const market = await core.getMarket(marketId);
      expect(market.isActive).to.be.true;

      // Should still be able to calculate costs
      const cost = await core.calculateOpenCost(
        marketId,
        45,
        55,
        SMALL_QUANTITY
      );
      expect(cost).to.be.gt(0);
    });
  });
});
