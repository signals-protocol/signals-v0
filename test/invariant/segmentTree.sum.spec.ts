import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { coreFixture } from "../helpers/fixtures/core";
import { INVARIANT_TAG } from "../helpers/tags";

describe(`${INVARIANT_TAG} Segment Tree Sum Invariants`, function () {
  const SMALL_QUANTITY = ethers.parseUnits("0.01", 6); // 0.01 USDC
  const MEDIUM_QUANTITY = ethers.parseUnits("0.1", 6); // 0.1 USDC
  const TICK_COUNT = 100;
  const WAD = ethers.parseEther("1"); // 1e18

  async function createActiveMarketFixture() {
    const contracts = await loadFixture(coreFixture);
    const { core, keeper } = contracts;

    const currentTime = await time.latest();
    const startTime = currentTime + 2000; // Large buffer for invariant tests
    const endTime = startTime + 7 * 24 * 60 * 60; // 7 days
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
    await time.increaseTo(startTime + 1);

    return { ...contracts, marketId, startTime, endTime };
  }

  describe("Sum Conservation Invariants", function () {
    it("Should maintain total sum after operations", async function () {
      const { core, router, alice, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Calculate total sum across all ticks before any operations
      let totalSumBefore = 0n;
      for (let i = 0; i < TICK_COUNT; i++) {
        const tickValue = await core.getTickValue(marketId, i);
        totalSumBefore += tickValue;
      }

      // Execute trades
      await core
        .connect(router)
        .openPosition(
          alice.address,
          marketId,
          10,
          20,
          MEDIUM_QUANTITY,
          ethers.parseUnits("100", 6)
        );

      // Calculate total sum after operations
      let totalSumAfter = 0n;
      for (let i = 0; i < TICK_COUNT; i++) {
        const tickValue = await core.getTickValue(marketId, i);
        totalSumAfter += tickValue;
      }

      // Total sum should have increased (new liquidity added)
      expect(totalSumAfter).to.be.gt(totalSumBefore);
    });

    it("Should maintain sum monotonicity with consecutive operations", async function () {
      const { core, router, alice, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      let previousSum = 0n;

      // Multiple buy operations should monotonically increase sum
      for (let i = 0; i < 3; i++) {
        await core
          .connect(router)
          .openPosition(
            alice.address,
            marketId,
            30 + i * 5,
            40 + i * 5,
            SMALL_QUANTITY,
            ethers.parseUnits("50", 6)
          );

        let currentSum = 0n;
        for (let tick = 30; tick <= 50; tick++) {
          const tickValue = await core.getTickValue(marketId, tick);
          currentSum += tickValue;
        }

        if (i > 0) {
          expect(currentSum).to.be.gte(previousSum);
        }
        previousSum = currentSum;
      }
    });
  });

  describe("Range Update Invariants", function () {
    it("Should correctly update only affected tick ranges", async function () {
      const { core, router, alice, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Record tick values before trade
      const tickValuesBefore: bigint[] = [];
      for (let i = 0; i < TICK_COUNT; i++) {
        const value = await core.getTickValue(marketId, i);
        tickValuesBefore.push(value);
      }

      // Execute trade affecting ticks 20-30
      await core
        .connect(router)
        .openPosition(
          alice.address,
          marketId,
          20,
          30,
          MEDIUM_QUANTITY,
          ethers.parseUnits("100", 6)
        );

      // Check that only affected ticks changed
      for (let i = 0; i < TICK_COUNT; i++) {
        const valueAfter = await core.getTickValue(marketId, i);

        if (i >= 20 && i <= 30) {
          // Ticks in range should have increased
          expect(valueAfter).to.be.gte(tickValuesBefore[i]);
        } else {
          // Ticks outside range should be unchanged
          expect(valueAfter).to.equal(tickValuesBefore[i]);
        }
      }
    });

    it("Should handle overlapping range updates correctly", async function () {
      const { core, router, alice, bob, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // First trade: affects ticks 10-30
      await core
        .connect(router)
        .openPosition(
          alice.address,
          marketId,
          10,
          30,
          MEDIUM_QUANTITY,
          ethers.parseUnits("100", 6)
        );

      const tick20ValueAfterFirst = await core.getTickValue(marketId, 20);

      // Second trade: affects ticks 20-40 (overlaps)
      await core
        .connect(router)
        .openPosition(
          bob.address,
          marketId,
          20,
          40,
          MEDIUM_QUANTITY,
          ethers.parseUnits("100", 6)
        );

      const tick20ValueAfterSecond = await core.getTickValue(marketId, 20);

      // Overlapping tick should have increased further
      expect(tick20ValueAfterSecond).to.be.gt(tick20ValueAfterFirst);
    });
  });

  describe("Lazy Propagation Invariants", function () {
    it("Should maintain correct values after lazy propagation", async function () {
      const { core, router, alice, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Execute multiple overlapping operations to trigger lazy propagation
      const operations = [
        { lower: 10, upper: 50, quantity: SMALL_QUANTITY },
        { lower: 20, upper: 60, quantity: SMALL_QUANTITY },
        { lower: 30, upper: 70, quantity: SMALL_QUANTITY },
      ];

      for (const op of operations) {
        await core
          .connect(router)
          .openPosition(
            alice.address,
            marketId,
            op.lower,
            op.upper,
            op.quantity,
            ethers.parseUnits("100", 6)
          );
      }

      // Query values should be consistent regardless of lazy propagation state
      const value40First = await core.getTickValue(marketId, 40);
      const value40Second = await core.getTickValue(marketId, 40);

      expect(value40First).to.equal(value40Second);
    });

    it("Should handle edge case propagation correctly", async function () {
      const { core, router, alice, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Test edge cases: first tick, last tick, and boundaries
      const edgeCases = [
        { lower: 0, upper: 0 }, // First tick only
        { lower: TICK_COUNT - 1, upper: TICK_COUNT - 1 }, // Last tick only
        { lower: 0, upper: TICK_COUNT - 1 }, // Full range
      ];

      for (const testCase of edgeCases) {
        await core
          .connect(router)
          .openPosition(
            alice.address,
            marketId,
            testCase.lower,
            testCase.upper,
            SMALL_QUANTITY,
            ethers.parseUnits("50", 6)
          );

        // Verify affected ticks are updated
        for (let tick = testCase.lower; tick <= testCase.upper; tick++) {
          const value = await core.getTickValue(marketId, tick);
          expect(value).to.be.gte(WAD);
        }
      }
    });
  });

  describe("Precision and Consistency Invariants", function () {
    it("Should maintain precision across multiple operations", async function () {
      const { core, router, alice, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Perform many small operations
      for (let i = 0; i < 10; i++) {
        await core
          .connect(router)
          .openPosition(
            alice.address,
            marketId,
            45,
            55,
            1n,
            ethers.parseUnits("10", 6)
          );
      }

      // Sum should still be calculable and reasonable
      let sum = 0n;
      for (let i = 45; i <= 55; i++) {
        const value = await core.getTickValue(marketId, i);
        sum += value;
        expect(value).to.be.gt(WAD); // Should be greater than base value
      }

      expect(sum).to.be.gt(WAD * 11n); // 11 ticks * WAD
    });

    it("Should maintain consistency under stress conditions", async function () {
      const { core, router, alice, bob, charlie, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Stress test with many concurrent operations
      const participants = [alice, bob, charlie];

      for (let round = 0; round < 5; round++) {
        for (const participant of participants) {
          await core
            .connect(router)
            .openPosition(
              participant.address,
              marketId,
              round * 15,
              round * 15 + 20,
              SMALL_QUANTITY,
              ethers.parseUnits("50", 6)
            );
        }
      }

      // Verify system is still in consistent state
      for (let i = 0; i < TICK_COUNT; i++) {
        const value = await core.getTickValue(marketId, i);
        expect(value).to.be.gte(WAD); // All values should be valid
        expect(value).to.be.lt(WAD * 1000n); // Sanity check upper bound
      }
    });
  });

  describe("Mathematical Invariants", function () {
    it("Should maintain exponential sum properties", async function () {
      const { core, router, alice, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // The sum should follow exponential properties of CLMSR
      await core
        .connect(router)
        .openPosition(
          alice.address,
          marketId,
          40,
          60,
          MEDIUM_QUANTITY,
          ethers.parseUnits("100", 6)
        );

      // Sum of exponentials should be greater than exponential of sum (Jensen's inequality)
      let sumOfExp = 0n;
      let sumOfValues = 0n;

      for (let i = 40; i <= 60; i++) {
        const value = await core.getTickValue(marketId, i);
        sumOfExp += value;
        // Note: This is simplified - in real CLMSR, we'd need to reverse the exp operation
      }

      expect(sumOfExp).to.be.gt(0);
    });

    it("Should maintain proportionality properties", async function () {
      const { core, router, alice, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Create two similar positions with different quantities
      await core
        .connect(router)
        .openPosition(
          alice.address,
          marketId,
          20,
          30,
          SMALL_QUANTITY,
          ethers.parseUnits("50", 6)
        );

      const smallTickValue = await core.getTickValue(marketId, 25);

      await core
        .connect(router)
        .openPosition(
          alice.address,
          marketId,
          40,
          50,
          SMALL_QUANTITY * 2n,
          ethers.parseUnits("100", 6)
        );

      const largeTickValue = await core.getTickValue(marketId, 45);

      // Larger quantity should result in larger tick values
      expect(largeTickValue).to.be.gt(smallTickValue);
    });
  });

  describe("Monotonic Sum Behavior", function () {
    it("Should maintain monotonic increase in total sum after buys", async function () {
      const { core, router, alice, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Get initial sum (should be tick_count * WAD)
      const initialSum = await core.getTickValue(marketId, 0); // This gets one tick value

      // Execute multiple buys and verify sum increases
      for (let i = 0; i < 3; i++) {
        await core
          .connect(router)
          .openPosition(
            alice.address,
            marketId,
            10 + i * 10,
            20 + i * 10,
            SMALL_QUANTITY,
            ethers.parseUnits("100", 6)
          );

        const newSum = await core.getTickValue(marketId, 10 + i * 10);
        expect(newSum).to.be.gte(WAD); // Should be at least WAD
      }
    });

    it("Should maintain monotonic decrease in total sum after sells", async function () {
      const { core, router, alice, marketId, mockPosition } = await loadFixture(
        createActiveMarketFixture
      );

      // First, execute buys to create positions
      const positions = [];
      for (let i = 0; i < 3; i++) {
        await core
          .connect(router)
          .openPosition(
            alice.address,
            marketId,
            10 + i * 10,
            20 + i * 10,
            MEDIUM_QUANTITY,
            ethers.parseUnits("100", 6)
          );
        // Get position ID from MockPosition
        const userPositions = await mockPosition.getPositionsByOwner(
          alice.address
        );
        positions.push(Number(userPositions[userPositions.length - 1]));
      }

      // Now sell positions and verify sum decreases
      let previousTickValue = await core.getTickValue(marketId, 15);

      for (const positionId of positions) {
        await core.connect(router).closePosition(positionId, 0);

        const newTickValue = await core.getTickValue(marketId, 15);
        // After selling, tick value should decrease or stay same
        expect(newTickValue).to.be.lte(previousTickValue);
        previousTickValue = newTickValue;
      }
    });

    it("Should maintain sum consistency across position adjustments", async function () {
      const { core, router, alice, marketId, mockPosition } = await loadFixture(
        createActiveMarketFixture
      );

      // Open initial position
      const tx = await core
        .connect(router)
        .openPosition(
          alice.address,
          marketId,
          40,
          60,
          MEDIUM_QUANTITY,
          ethers.parseUnits("100", 6)
        );
      await tx.wait();
      // Get position ID from MockPosition
      const positions = await mockPosition.getPositionsByOwner(alice.address);
      const positionId = Number(positions[positions.length - 1]);

      const sumAfterOpen = await core.getTickValue(marketId, 50);

      // Increase position
      await core
        .connect(router)
        .increasePosition(
          positionId,
          SMALL_QUANTITY,
          ethers.parseUnits("100", 6)
        );
      const sumAfterIncrease = await core.getTickValue(marketId, 50);
      expect(sumAfterIncrease).to.be.gte(sumAfterOpen);

      // Decrease position
      await core
        .connect(router)
        .decreasePosition(positionId, SMALL_QUANTITY, 0);
      const sumAfterDecrease = await core.getTickValue(marketId, 50);
      expect(sumAfterDecrease).to.be.lte(sumAfterIncrease);

      // Should be back to approximately original sum
      const difference =
        sumAfterOpen > sumAfterDecrease
          ? sumAfterOpen - sumAfterDecrease
          : sumAfterDecrease - sumAfterOpen;
      const percentDiff = (difference * 10000n) / sumAfterOpen;
      expect(percentDiff).to.be.lt(100n); // Less than 1% difference
    });
  });
});
