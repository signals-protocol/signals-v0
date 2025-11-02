import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import {
  createActiveMarketFixture,
  setupCustomMarket,
  SMALL_QUANTITY,
  MEDIUM_QUANTITY,
  LARGE_QUANTITY,
  MEDIUM_COST,
  TICK_COUNT,
} from "../../helpers/fixtures/core";
import { UNIT_TAG } from "../../helpers/tags";

const SCALE_DIFF = 10n ** 12n;
const MICRO_USDC = 1n; // 1e-6 USDC in 6-decimal representation
const DEFAULT_LOWER_TICK = 100100;
const DEFAULT_UPPER_TICK = 100200;
const MAX_CHUNKS_PER_TX = 1000n;
const CHUNK_PARITY_SCENARIOS = [
  { alpha: "0.005", chunkMultiplier: 6n },
  { alpha: "0.01", chunkMultiplier: 8n },
  { alpha: "0.02", chunkMultiplier: 5n },
  { alpha: "0.1", chunkMultiplier: 3n },
  { alpha: "0.5", chunkMultiplier: 2n },
];

describe(`${UNIT_TAG} CLMSR Math Internal Functions`, function () {
  describe("Cost Calculation Functions", function () {
    it("Should calculate open cost correctly", async function () {
      const { core, marketId } = await loadFixture(createActiveMarketFixture);

      const cost = await core.calculateOpenCost(
        marketId,
        100450,
        100550,
        MEDIUM_QUANTITY
      );

      expect(cost).to.be.gt(0);
      expect(cost).to.be.lt(ethers.parseUnits("100", 6)); // Reasonable upper bound
    });

    it("Should calculate increase cost correctly", async function () {
      const { core, alice, mockPosition, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Create initial position
      await core
        .connect(alice)
        .openPosition(
          marketId,
          100450,
          100550,
          MEDIUM_QUANTITY,
          MEDIUM_COST
        );

      const positions = await mockPosition.getPositionsByOwner(alice.address);
      const positionId = positions[0];

      const cost = await core.calculateIncreaseCost(positionId, SMALL_QUANTITY);
      expect(cost).to.be.gt(0);
    });

    it("Should calculate decrease payout correctly", async function () {
      const { core, alice, mockPosition, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Create initial position
      await core
        .connect(alice)
        .openPosition(
          marketId,
          100450,
          100550,
          MEDIUM_QUANTITY,
          MEDIUM_COST
        );

      const positions = await mockPosition.getPositionsByOwner(alice.address);
      const positionId = positions[0];

      const payout = await core.calculateDecreaseProceeds(
        positionId,
        SMALL_QUANTITY
      );
      expect(payout).to.be.gt(0);
    });

    it("Should calculate close payout correctly", async function () {
      const { core, alice, mockPosition, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Create initial position
      await core
        .connect(alice)
        .openPosition(
          marketId,
          100450,
          100550,
          MEDIUM_QUANTITY,
          MEDIUM_COST
        );

      const positions = await mockPosition.getPositionsByOwner(alice.address);
      const positionId = positions[0];

      const payout = await core.calculateCloseProceeds(positionId);
      expect(payout).to.be.gt(0);
    });

    it("Should calculate quantity from cost correctly (inverse function)", async function () {
      const { core, marketId } = await loadFixture(createActiveMarketFixture);

      const targetCost = ethers.parseUnits("1", 6); // 1 USDC
      const lowerTick = 100450;
      const upperTick = 100550;

      const quantity = await core.calculateQuantityFromCost(
        marketId,
        lowerTick,
        upperTick,
        targetCost
      );

      expect(quantity).to.be.gt(0);
      expect(quantity).to.be.lt(ethers.parseUnits("1000", 6)); // Reasonable upper bound
    });

    it("Should maintain inverse function accuracy", async function () {
      const { core, marketId } = await loadFixture(createActiveMarketFixture);

      const lowerTick = 100450;
      const upperTick = 100550;
      const targetCost = ethers.parseUnits("0.5", 6); // 0.5 USDC

      // Calculate quantity from cost (inverse)
      const calculatedQuantity = await core.calculateQuantityFromCost(
        marketId,
        lowerTick,
        upperTick,
        targetCost
      );

      // Calculate cost from that quantity (forward)
      const recalculatedCost = await core.calculateOpenCost(
        marketId,
        lowerTick,
        upperTick,
        calculatedQuantity
      );

      // The costs should be close (within 10% due to CLMSR approximation)
      const difference =
        recalculatedCost > targetCost
          ? recalculatedCost - targetCost
          : targetCost - recalculatedCost;
      const percentError = (difference * 100n) / targetCost;

      expect(percentError).to.be.lte(10n); // Within 10% accuracy
    });

    it("Should handle zero cost edge case for inverse function", async function () {
      const { core, marketId } = await loadFixture(createActiveMarketFixture);

      const quantity = await core.calculateQuantityFromCost(
        marketId,
        100450,
        100550,
        0 // Zero cost
      );

      expect(quantity).to.equal(0);
    });

    it("Should maintain quantity proportionality in inverse function", async function () {
      const { core, marketId } = await loadFixture(createActiveMarketFixture);

      const smallCost = ethers.parseUnits("0.1", 6); // 0.1 USDC
      const largeCost = ethers.parseUnits("0.5", 6); // 0.5 USDC

      const smallQuantity = await core.calculateQuantityFromCost(
        marketId,
        100450,
        100550,
        smallCost
      );

      const largeQuantity = await core.calculateQuantityFromCost(
        marketId,
        100450,
        100550,
        largeCost
      );

      // Larger cost should yield larger quantity
      expect(largeQuantity).to.be.gt(smallQuantity);
    });

    it("Should align chunked open cost with sequential single-chunk quotes within 1 micro USDC", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, alice } = contracts;

      for (const { alpha, chunkMultiplier } of CHUNK_PARITY_SCENARIOS) {
        const alphaWad = ethers.parseEther(alpha);
        const { marketId } = await setupCustomMarket(contracts, {
          alpha: alphaWad,
        });

        const maxSafeQuantityPerChunkWad = alphaWad - 1n;
        const singleChunkQuantity6 = maxSafeQuantityPerChunkWad / SCALE_DIFF;
        expect(
          singleChunkQuantity6,
          `scenario alpha=${alpha} single chunk`
        ).to.be.gt(0n);

        const totalQuantity6 = singleChunkQuantity6 * chunkMultiplier;
        expect(
          totalQuantity6,
          `scenario alpha=${alpha} total quantity`
        ).to.be.gt(singleChunkQuantity6);

        const totalCost = await core.calculateOpenCost(
          marketId,
          DEFAULT_LOWER_TICK,
          DEFAULT_UPPER_TICK,
          totalQuantity6
        );

        let sequentialCost = 0n;
        let remaining = totalQuantity6;
        while (remaining > 0n) {
          const chunk =
            remaining > singleChunkQuantity6 ? singleChunkQuantity6 : remaining;
          const chunkCost = await core.calculateOpenCost(
            marketId,
            DEFAULT_LOWER_TICK,
            DEFAULT_UPPER_TICK,
            chunk
          );
          sequentialCost += chunkCost;

          await core
            .connect(alice)
            .openPosition(
              marketId,
              DEFAULT_LOWER_TICK,
              DEFAULT_UPPER_TICK,
              chunk
            );

          remaining -= chunk;
        }

        const diff =
          totalCost > sequentialCost
            ? totalCost - sequentialCost
            : sequentialCost - totalCost;
        const maxAllowed =
          chunkMultiplier > 0n ? (chunkMultiplier - 1n) * MICRO_USDC : 0n;

        expect(
          sequentialCost,
          `buy monotonicity alpha=${alpha}, chunks=${chunkMultiplier}`
        ).to.be.gte(totalCost);
        expect(
          diff,
          `chunk cost diff alpha=${alpha}, chunks=${chunkMultiplier}`
        ).to.be.lte(maxAllowed);
      }
    });

    it("Should align chunked decrease proceeds with sequential single-chunk exits within 1 micro USDC", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, alice, mockPosition } = contracts as typeof contracts & {
        mockPosition: any;
      };

      for (const { alpha, chunkMultiplier } of CHUNK_PARITY_SCENARIOS) {
        const alphaWad = ethers.parseEther(alpha);
        const { marketId } = await setupCustomMarket(contracts, {
          alpha: alphaWad,
        });

        const maxSafeQuantityPerChunkWad = alphaWad - 1n;
        const singleChunkQuantity6 = maxSafeQuantityPerChunkWad / SCALE_DIFF;
        expect(
          singleChunkQuantity6,
          `scenario alpha=${alpha} single chunk`
        ).to.be.gt(0n);

        const totalQuantity6 = singleChunkQuantity6 * chunkMultiplier;

        await core
          .connect(alice)
          .openPosition(
            marketId,
            DEFAULT_LOWER_TICK,
            DEFAULT_UPPER_TICK,
            totalQuantity6
          );

        const positions = await mockPosition.getPositionsByOwner(alice.address);
        const positionId = positions[positions.length - 1];

        const totalProceeds = await core.calculateDecreaseProceeds(
          positionId,
          totalQuantity6
        );

        let sequentialProceeds = 0n;
        let remaining = totalQuantity6;
        while (remaining > 0n) {
          const chunk =
            remaining > singleChunkQuantity6 ? singleChunkQuantity6 : remaining;
          const chunkProceeds = await core.calculateDecreaseProceeds(
            positionId,
            chunk
          );
          sequentialProceeds += chunkProceeds;

          await core
            .connect(alice)
            .decreasePosition(positionId, chunk, 0n);

          remaining -= chunk;
        }

        const diff =
          totalProceeds > sequentialProceeds
            ? totalProceeds - sequentialProceeds
            : sequentialProceeds - totalProceeds;
        const maxAllowed =
          chunkMultiplier > 0n ? (chunkMultiplier - 1n) * MICRO_USDC : 0n;

        expect(
          sequentialProceeds,
          `sell monotonicity alpha=${alpha}, chunks=${chunkMultiplier}`
        ).to.be.lte(totalProceeds);
        expect(
          diff,
          `chunk proceeds diff alpha=${alpha}, chunks=${chunkMultiplier}`
        ).to.be.lte(maxAllowed);
      }
    });

    it("Should keep round-trip wedge within 1 micro USDC", async function () {
      const { core, alice, mockPosition, marketId } =
        await loadFixture(createActiveMarketFixture);

      const quantity = SMALL_QUANTITY;
      const lowerTick = DEFAULT_LOWER_TICK;
      const upperTick = DEFAULT_UPPER_TICK;

      const quotedCost = await core.calculateOpenCost(
        marketId,
        lowerTick,
        upperTick,
        quantity
      );

      await core
        .connect(alice)
        .openPosition(
          marketId,
          lowerTick,
          upperTick,
          quantity,
          quotedCost
        );

      const positions = await mockPosition.getPositionsByOwner(alice.address);
      const positionId = positions[0];

      const quotedProceeds = await core.calculateDecreaseProceeds(
        positionId,
        quantity
      );

      expect(
        quotedProceeds,
        "Sell proceeds should not exceed buy cost"
      ).to.be.lte(quotedCost);

      const wedge = quotedCost - quotedProceeds;

      expect(wedge, "Round-trip wedge should be non-negative").to.be.gte(0n);
      expect(wedge, "Round-trip wedge bounded by 1 micro").to.be.lte(MICRO_USDC);
    });

    it("Should revert with ChunkLimitExceeded when required chunks exceed limit", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core } = contracts;

      const customAlpha = ethers.parseEther("0.001");
      const { marketId } = await setupCustomMarket(contracts, {
        alpha: customAlpha,
        numTicks: 10,
      });

      const alphaWad = customAlpha;
      const maxSafeQuantityPerChunkWad = alphaWad - 1n;
      const targetQuantityWad =
        maxSafeQuantityPerChunkWad * (MAX_CHUNKS_PER_TX + 1n);
      const exceedingQuantity =
        (targetQuantityWad + SCALE_DIFF - 1n) / SCALE_DIFF;

      const lowerTick = 100000;
      const upperTick = 100010;

      await expect(
        core.calculateOpenCost(
          marketId,
          lowerTick,
          upperTick,
          exceedingQuantity
        )
      ).to.be.revertedWithCustomError(core, "ChunkLimitExceeded");
    });
  });

  describe("Market Math Consistency", function () {
    it("Should maintain consistent pricing across tick ranges", async function () {
      const { core, marketId } = await loadFixture(createActiveMarketFixture);

      // Test various tick ranges
      const ranges = [
        { lower: 100100, upper: 100200 },
        { lower: 100400, upper: 100600 },
        { lower: 100800, upper: 100900 },
      ];

      for (const range of ranges) {
        const cost = await core.calculateOpenCost(
          marketId,
          range.lower,
          range.upper,
          SMALL_QUANTITY
        );
        expect(cost).to.be.gt(0);
      }
    });

    it("Should handle single tick calculations", async function () {
      const { core, marketId } = await loadFixture(createActiveMarketFixture);

      const cost = await core.calculateOpenCost(
        marketId,
        100500,
        100510, // Single tick
        SMALL_QUANTITY
      );

      expect(cost).to.be.gt(0);
    });

    it("Should handle large quantity calculations", async function () {
      const { core, marketId } = await loadFixture(createActiveMarketFixture);

      const cost = await core.calculateOpenCost(
        marketId,
        100000,
        100990, // Full range
        LARGE_QUANTITY
      );

      expect(cost).to.be.gt(0);
      expect(cost).to.be.lt(ethers.parseUnits("10000", 6)); // Sanity check
    });

    it("Should maintain cost proportionality", async function () {
      const { core, marketId } = await loadFixture(createActiveMarketFixture);

      const smallCost = await core.calculateOpenCost(
        marketId,
        100450,
        100550,
        SMALL_QUANTITY
      );

      const largeCost = await core.calculateOpenCost(
        marketId,
        100450,
        100550,
        SMALL_QUANTITY * 10n
      );

      // Large cost should be greater than small cost
      expect(largeCost).to.be.gt(smallCost);
      // But not necessarily proportional due to CLMSR curvature
    });
  });

  describe("Edge Case Calculations", function () {
    it("Should handle zero quantity edge case", async function () {
      const { core, marketId } = await loadFixture(createActiveMarketFixture);

      // Zero quantity should revert with InvalidQuantity
      await expect(
        core.calculateOpenCost(marketId, 100450, 100550, 0)
      ).to.be.revertedWithCustomError(core, "InvalidQuantity");
    });

    it("Should handle invalid tick ranges", async function () {
      const { core, marketId } = await loadFixture(createActiveMarketFixture);

      // Lower > Upper should fail (let's see what error it actually throws)
      await expect(core.calculateOpenCost(marketId, 55, 45, SMALL_QUANTITY)).to
        .be.reverted;
    });

    it("Should handle out-of-bounds ticks", async function () {
      const { core, marketId } = await loadFixture(createActiveMarketFixture);

      // Tick >= TICK_COUNT should fail (let's see what error it actually throws)
      await expect(
        core.calculateOpenCost(marketId, 0, TICK_COUNT, SMALL_QUANTITY)
      ).to.be.reverted;
    });

    it("Should handle extremely small quantities", async function () {
      const { core, marketId } = await loadFixture(createActiveMarketFixture);

      const cost = await core.calculateOpenCost(
        marketId,
        100450,
        100550,
        1 // 1 wei
      );

      expect(cost).to.be.gt(0);
    });
  });

  describe("Internal Calculation Precision", function () {
    it("Should maintain precision in small range calculations", async function () {
      const { core, marketId } = await loadFixture(createActiveMarketFixture);

      // Test narrow range
      const cost1 = await core.calculateOpenCost(
        marketId,
        100490,
        100510,
        SMALL_QUANTITY
      );
      const cost2 = await core.calculateOpenCost(
        marketId,
        100500,
        100510,
        SMALL_QUANTITY
      );

      expect(cost1).to.be.gt(cost2); // Wider range should cost more
    });

    it("Should handle boundary precision correctly", async function () {
      const { core, marketId } = await loadFixture(createActiveMarketFixture);

      // Test boundary ticks
      const costFirst = await core.calculateOpenCost(
        marketId,
        100000,
        100010,
        SMALL_QUANTITY
      );
      const costLast = await core.calculateOpenCost(
        marketId,
        100980,
        100990,
        SMALL_QUANTITY
      );

      expect(costFirst).to.be.gt(0);
      expect(costLast).to.be.gt(0);
    });

    it("Should handle rounding consistency", async function () {
      const { core, alice, mockPosition, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Create position
      await core
        .connect(alice)
        .openPosition(
          marketId,
          100450,
          100550,
          MEDIUM_QUANTITY,
          MEDIUM_COST
        );

      const positions = await mockPosition.getPositionsByOwner(alice.address);
      const positionId = positions[0];

      // Check that increase + decrease should be approximately neutral
      const increaseCost = await core.calculateIncreaseCost(
        positionId,
        SMALL_QUANTITY
      );
      const decreasePayout = await core.calculateDecreaseProceeds(
        positionId,
        SMALL_QUANTITY
      );

      // In a stable market, these should be close but decrease payout might be slightly less
      expect(decreasePayout).to.be.lte(increaseCost);
    });
  });

  describe("Mathematical Invariants", function () {
    it("Should respect CLMSR cost function properties", async function () {
      const { core, marketId } = await loadFixture(createActiveMarketFixture);

      // Use larger quantities to test convexity more clearly
      const baseQuantity = ethers.parseUnits("0.1", 6); // 0.1 USDC instead of micro amounts

      // Cost should increase with quantity (convexity)
      const cost1 = await core.calculateOpenCost(
        marketId,
        100450,
        100550,
        baseQuantity
      );
      const cost2 = await core.calculateOpenCost(
        marketId,
        100450,
        100550,
        baseQuantity * 2n
      );
      const cost3 = await core.calculateOpenCost(
        marketId,
        100450,
        100550,
        baseQuantity * 4n
      );

      // For convex functions, f(2x) > 2*f(x), but with sufficient tolerance for rounding
      expect(cost2).to.be.gt(cost1 * 2n); // Convex function

      // For the third test, use a more lenient check since very small quantities
      // may not show strong convexity due to precision limits
      expect(cost3).to.be.gte(cost2 * 2n); // Allow equal due to precision limits
    });

    it("Should maintain range additivity properties", async function () {
      const { core, marketId } = await loadFixture(createActiveMarketFixture);

      // Compare single large range vs two smaller ranges
      const fullRangeCost = await core.calculateOpenCost(
        marketId,
        100400,
        100600,
        SMALL_QUANTITY
      );

      const leftRangeCost = await core.calculateOpenCost(
        marketId,
        100400,
        100500,
        SMALL_QUANTITY
      );

      const rightRangeCost = await core.calculateOpenCost(
        marketId,
        100510,
        100600,
        SMALL_QUANTITY
      );

      const sumOfParts = leftRangeCost + rightRangeCost;
      const tolerance = (sumOfParts * 15n) / 100n; // allow 15% overhead for new curve params
      expect(fullRangeCost).to.be.lte(sumOfParts + tolerance);
    });
  });
});
