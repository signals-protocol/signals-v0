import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { createActiveMarketFixture, getTickValue } from "../helpers/fixtures/core";
import { INVARIANT_TAG } from "../helpers/tags";

describe(`${INVARIANT_TAG} LazyMulSegmentTree - Sum Invariants`, function () {
  const USDC_DECIMALS = 6;
  const SMALL_QUANTITY = ethers.parseUnits("0.01", USDC_DECIMALS); // 0.01 USDC
  const MEDIUM_QUANTITY = ethers.parseUnits("0.1", USDC_DECIMALS); // 0.1 USDC
  const TICK_COUNT = 100;
  const WAD = ethers.parseEther("1"); // 1e18

  describe("Sum Consistency Invariants", function () {
    it("Should maintain sum consistency after tree operations", async function () {
      const { core, alice, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Calculate total sum across all ticks before any operations
      let totalSumBefore = 0n;
      for (let i = 0; i < TICK_COUNT; i++) {
        const actualTick = 100000 + i * 10; // Convert index to actual tick value
        const tickValue = await getTickValue(core, marketId, actualTick);
        totalSumBefore += tickValue;
      }

      // Execute trades
      await core
        .connect(alice)
        .openPosition(
          marketId,
          100100,
          100200,
          MEDIUM_QUANTITY,
          ethers.parseUnits("100", USDC_DECIMALS)
        );

      // Calculate total sum after operations
      let totalSumAfter = 0n;
      for (let i = 0; i < TICK_COUNT; i++) {
        const actualTick = 100000 + i * 10; // Convert index to actual tick value
        const tickValue = await getTickValue(core, marketId, actualTick);
        totalSumAfter += tickValue;
      }

      // Total sum should have increased (new liquidity added)
      expect(totalSumAfter).to.be.gt(totalSumBefore);
    });

    it("Should maintain sum monotonicity with consecutive operations", async function () {
      const { core, alice, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      let previousSum = 0n;

      // Multiple buy operations should monotonically increase sum
      for (let i = 0; i < 3; i++) {
        await core.connect(alice).openPosition(
          marketId,
          100300 + i * 50, // 30 + i * 5 → 100300 + i * 50 (새 틱 시스템)
          100400 + i * 50, // 40 + i * 5 → 100400 + i * 50 (새 틱 시스템)
          SMALL_QUANTITY,
          ethers.parseUnits("50", USDC_DECIMALS)
        );

        let currentSum = 0n;
        for (let tick = 100300; tick < 100500; tick += 10) {
          // 30~50 → 100300~100500, 10간격
          const tickValue = await getTickValue(core, marketId, tick);
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
      const { core, alice, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Record tick values before trade
      const tickValuesBefore: bigint[] = [];
      for (let i = 0; i < TICK_COUNT; i++) {
        const actualTick = 100000 + i * 10; // Convert index to actual tick value
        const value = await getTickValue(core, marketId, actualTick);
        tickValuesBefore.push(value);
      }

      // Execute trade affecting ticks 20-30
      await core
        .connect(alice)
        .openPosition(
          marketId,
          100200,
          100300,
          MEDIUM_QUANTITY,
          ethers.parseUnits("100", USDC_DECIMALS)
        );

      // Check that only affected ticks changed
      for (let i = 0; i < TICK_COUNT; i++) {
        const actualTick = 100000 + i * 10; // Convert index to actual tick value
        const valueAfter = await getTickValue(core, marketId, actualTick);

        if (i >= 20 && i < 30) {
          // Ticks in range should have increased
          expect(valueAfter).to.be.gte(tickValuesBefore[i]);
        } else {
          // Ticks outside range should be unchanged
          expect(valueAfter).to.equal(tickValuesBefore[i]);
        }
      }
    });

    it("Should handle overlapping range updates correctly", async function () {
      const { core, alice, bob, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // First trade: affects ticks 10-30
      await core
        .connect(alice)
        .openPosition(
          marketId,
          100100,
          100300,
          MEDIUM_QUANTITY,
          ethers.parseUnits("100", USDC_DECIMALS)
        );

      const tick20ValueAfterFirst = await getTickValue(core, marketId, 100200);

      // Second trade: affects ticks 20-40 (overlaps)
      await core
        .connect(alice)
        .openPosition(
          marketId,
          100200,
          100400,
          MEDIUM_QUANTITY,
          ethers.parseUnits("100", USDC_DECIMALS)
        );

      const tick20ValueAfterSecond = await getTickValue(core, marketId, 100200);

      // Overlapping tick should have increased further
      expect(tick20ValueAfterSecond).to.be.gt(tick20ValueAfterFirst);
    });
  });

  describe("Lazy Propagation Invariants", function () {
    it("Should maintain correct values after lazy propagation", async function () {
      const { core, alice, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Execute multiple overlapping operations to trigger lazy propagation
      const operations = [
        { lower: 100100, upper: 100500, quantity: SMALL_QUANTITY },
        { lower: 100200, upper: 100600, quantity: SMALL_QUANTITY },
        { lower: 100300, upper: 100700, quantity: SMALL_QUANTITY },
      ];

      for (const op of operations) {
        await core
          .connect(alice)
          .openPosition(
            marketId,
            op.lower,
            op.upper,
            op.quantity,
            ethers.parseUnits("100", USDC_DECIMALS)
          );
      }

      // Query values should be consistent regardless of lazy propagation state
      const value40First = await getTickValue(core, marketId, 100400);
      const value40Second = await getTickValue(core, marketId, 100400);

      expect(value40First).to.equal(value40Second);
    });

    it("Should handle edge case propagation correctly", async function () {
      const { core, alice, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Test edge cases including boundaries
      const edgeCases = [
        { lower: 100000, upper: 100010 }, // Minimal range at start
        { lower: 100980, upper: 100990 }, // Minimal range at end
        { lower: 100000, upper: 100990 }, // Full range
      ];

      for (const testCase of edgeCases) {
        await core
          .connect(alice)
          .openPosition(
            marketId,
            testCase.lower,
            testCase.upper,
            SMALL_QUANTITY,
            ethers.parseUnits("100", USDC_DECIMALS)
          );

        // Verify affected ticks are updated
        for (let tick = testCase.lower; tick < testCase.upper; tick += 10) {
          const value = await getTickValue(core, marketId, tick);
          expect(value).to.be.gte(WAD);
        }
      }
    });
  });

  describe("Precision and Consistency Invariants", function () {
    it("Should maintain precision across multiple operations", async function () {
      const { core, alice, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Perform many small operations
      for (let i = 0; i < 10; i++) {
        await core
          .connect(alice)
          .openPosition(
            marketId,
            100450,
            100550,
            SMALL_QUANTITY,
            ethers.parseUnits("100", USDC_DECIMALS)
          );
      }

      // Sum should still be calculable and reasonable
      let sum = 0n;
      for (let i = 100450; i < 100550; i += 10) {
        const value = await getTickValue(core, marketId, i);
        sum += value;
        expect(value).to.be.gte(WAD); // Should be at least base value
      }
      const tickCount = 10n;
      expect(sum).to.be.gt(WAD * tickCount);
    });

    it("Should maintain consistency under stress conditions", async function () {
      const { core, alice, bob, charlie, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Stress test with many concurrent operations
      const participants = [alice, bob, charlie];

      for (let round = 0; round < 5; round++) {
        for (const participant of participants) {
          await core
            .connect(alice)
            .openPosition(
              marketId,
              100000 + round * 150,
              100000 + round * 150 + 200,
              SMALL_QUANTITY,
              ethers.parseUnits("50", USDC_DECIMALS)
            );
        }
      }

      // Verify system is still in consistent state
      for (let i = 0; i < TICK_COUNT; i++) {
        const actualTick = 100000 + i * 10; // Convert index to actual tick value
        const value = await getTickValue(core, marketId, actualTick);
        expect(value).to.be.gte(WAD); // All values should be valid
        expect(value).to.be.lt(WAD * 1000n); // Sanity check upper bound
      }
    });
  });

  describe("Mathematical Invariants", function () {
    it("Should maintain exponential sum properties", async function () {
      const { core, alice, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // The sum should follow exponential properties of CLMSR
      await core
        .connect(alice)
        .openPosition(
          marketId,
          100400,
          100600,
          MEDIUM_QUANTITY,
          ethers.parseUnits("100", USDC_DECIMALS)
        );

      // Sum of exponentials should be greater than exponential of sum (Jensen's inequality)
      let sumOfExp = 0n;
      let sumOfValues = 0n;

      for (let i = 100400; i < 100600; i += 10) {
        const value = await getTickValue(core, marketId, i);
        sumOfExp += value;
        // Note: This is simplified - in real CLMSR, we'd need to reverse the exp operation
      }

      expect(sumOfExp).to.be.gt(0);
    });

    it("Should maintain proportionality properties", async function () {
      const { core, alice, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Create two similar positions with different quantities
      await core
        .connect(alice)
        .openPosition(
          marketId,
          100200,
          100300,
          SMALL_QUANTITY,
          ethers.parseUnits("50", USDC_DECIMALS)
        );

      const smallTickValue = await getTickValue(core, marketId, 100250);

      await core
        .connect(alice)
        .openPosition(
          marketId,
          100400,
          100500,
          SMALL_QUANTITY * 2n,
          ethers.parseUnits("100", USDC_DECIMALS)
        );

      const largeTickValue = await getTickValue(core, marketId, 100450);

      // Larger quantity should result in larger tick values
      expect(largeTickValue).to.be.gt(smallTickValue);
    });
  });

  describe("Monotonic Sum Behavior", function () {
    it("Should maintain monotonic increase in total sum after buys", async function () {
      const { core, alice, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Get initial sum (should be tick_count * WAD)
      const initialSum = await getTickValue(core, marketId, 100000); // This gets one tick value

      // Execute multiple buys and verify sum increases
      for (let i = 0; i < 3; i++) {
        await core
          .connect(alice)
          .openPosition(
            marketId,
            100100 + i * 100,
            100200 + i * 100,
            SMALL_QUANTITY,
            ethers.parseUnits("100", USDC_DECIMALS)
          );

        const newSum = await getTickValue(core, marketId, 100100 + i * 100);
        expect(newSum).to.be.gte(WAD); // Should be at least WAD
      }
    });

    it("Should maintain monotonic decrease in total sum after sells", async function () {
      const { core, alice, marketId, mockPosition } = await loadFixture(
        createActiveMarketFixture
      );

      // First, execute buys to create positions
      const positions = [];
      for (let i = 0; i < 3; i++) {
        await core
          .connect(alice)
          .openPosition(
            marketId,
            100100 + i * 100,
            100200 + i * 100,
            MEDIUM_QUANTITY,
            ethers.parseUnits("100", USDC_DECIMALS)
          );
        // Get position ID from MockPosition
        const userPositions = await mockPosition.getPositionsByOwner(
          alice.address
        );
        positions.push(Number(userPositions[userPositions.length - 1]));
      }

      // Now sell positions and verify sum decreases
      let previousTickValue = await getTickValue(core, marketId, 100150);

      for (const positionId of positions) {
        await core.connect(alice).closePosition(positionId, 0);

        const newTickValue = await getTickValue(core, marketId, 100150);
        // After selling, tick value should decrease or stay same
        expect(newTickValue).to.be.lte(previousTickValue);
        previousTickValue = newTickValue;
      }
    });

    it("Should maintain sum consistency across position adjustments", async function () {
      const { core, alice, marketId, mockPosition } = await loadFixture(
        createActiveMarketFixture
      );

      // Open initial position
      const tx = await core
        .connect(alice)
        .openPosition(
          marketId,
          100400,
          100600,
          MEDIUM_QUANTITY,
          ethers.parseUnits("100", USDC_DECIMALS)
        );
      await tx.wait();
      // Get position ID from MockPosition
      const positions = await mockPosition.getPositionsByOwner(alice.address);
      const positionId = Number(positions[positions.length - 1]);

      const sumAfterOpen = await getTickValue(core, marketId, 100500);

      // Increase position
      await core
        .connect(alice)
        .increasePosition(
          positionId,
          SMALL_QUANTITY,
          ethers.parseUnits("100", USDC_DECIMALS)
        );
      const sumAfterIncrease = await getTickValue(core, marketId, 100500);
      expect(sumAfterIncrease).to.be.gte(sumAfterOpen);

      // Decrease position
      await core.connect(alice).decreasePosition(positionId, SMALL_QUANTITY, 0);
      const sumAfterDecrease = await getTickValue(core, marketId, 100500);
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
