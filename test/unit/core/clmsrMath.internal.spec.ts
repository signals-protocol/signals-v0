import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { coreFixture } from "../../helpers/fixtures/core";
import { UNIT_TAG } from "../../helpers/tags";

describe(`${UNIT_TAG} CLMSR Math Internal Functions`, function () {
  const SMALL_QUANTITY = ethers.parseUnits("0.01", 6); // 0.01 USDC
  const MEDIUM_QUANTITY = ethers.parseUnits("0.05", 6); // 0.05 USDC
  const LARGE_QUANTITY = ethers.parseUnits("1", 6); // 1 USDC
  const MEDIUM_COST = ethers.parseUnits("5", 6); // 5 USDC
  const TICK_COUNT = 100;

  async function createActiveMarketFixture() {
    const contracts = await loadFixture(coreFixture);
    const { core, keeper } = contracts;

    const currentTime = await time.latest();
    const startTime = currentTime + 100;
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

  describe("Cost Calculation Functions", function () {
    it("Should calculate open cost correctly", async function () {
      const { core, marketId } = await loadFixture(createActiveMarketFixture);

      const cost = await core.calculateOpenCost(
        marketId,
        45,
        55,
        MEDIUM_QUANTITY
      );

      expect(cost).to.be.gt(0);
      expect(cost).to.be.lt(ethers.parseUnits("100", 6)); // Reasonable upper bound
    });

    it("Should calculate increase cost correctly", async function () {
      const { core, router, alice, mockPosition, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Create initial position
      await core.connect(router).openPosition(alice.address, {
        marketId,
        lowerTick: 45,
        upperTick: 55,
        quantity: MEDIUM_QUANTITY,
        maxCost: MEDIUM_COST,
      });

      const positions = await mockPosition.getPositionsByOwner(alice.address);
      const positionId = positions[0];

      const cost = await core.calculateIncreaseCost(positionId, SMALL_QUANTITY);
      expect(cost).to.be.gt(0);
    });

    it("Should calculate decrease payout correctly", async function () {
      const { core, router, alice, mockPosition, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Create initial position
      await core.connect(router).openPosition(alice.address, {
        marketId,
        lowerTick: 45,
        upperTick: 55,
        quantity: MEDIUM_QUANTITY,
        maxCost: MEDIUM_COST,
      });

      const positions = await mockPosition.getPositionsByOwner(alice.address);
      const positionId = positions[0];

      const payout = await core.calculateDecreaseProceeds(
        positionId,
        SMALL_QUANTITY
      );
      expect(payout).to.be.gt(0);
    });

    it("Should calculate close payout correctly", async function () {
      const { core, router, alice, mockPosition, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Create initial position
      await core.connect(router).openPosition(alice.address, {
        marketId,
        lowerTick: 45,
        upperTick: 55,
        quantity: MEDIUM_QUANTITY,
        maxCost: MEDIUM_COST,
      });

      const positions = await mockPosition.getPositionsByOwner(alice.address);
      const positionId = positions[0];

      const payout = await core.calculateCloseProceeds(positionId);
      expect(payout).to.be.gt(0);
    });
  });

  describe("Market Math Consistency", function () {
    it("Should maintain consistent pricing across tick ranges", async function () {
      const { core, marketId } = await loadFixture(createActiveMarketFixture);

      // Test various tick ranges
      const ranges = [
        { lower: 10, upper: 20 },
        { lower: 40, upper: 60 },
        { lower: 80, upper: 90 },
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
        50,
        50, // Single tick
        SMALL_QUANTITY
      );

      expect(cost).to.be.gt(0);
    });

    it("Should handle large quantity calculations", async function () {
      const { core, marketId } = await loadFixture(createActiveMarketFixture);

      const cost = await core.calculateOpenCost(
        marketId,
        0,
        TICK_COUNT - 1, // Full range
        LARGE_QUANTITY
      );

      expect(cost).to.be.gt(0);
      expect(cost).to.be.lt(ethers.parseUnits("10000", 6)); // Sanity check
    });

    it("Should maintain cost proportionality", async function () {
      const { core, marketId } = await loadFixture(createActiveMarketFixture);

      const smallCost = await core.calculateOpenCost(
        marketId,
        45,
        55,
        SMALL_QUANTITY
      );

      const largeCost = await core.calculateOpenCost(
        marketId,
        45,
        55,
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

      // Zero quantity should return zero cost (not error)
      const cost = await core.calculateOpenCost(marketId, 45, 55, 0);
      expect(cost).to.equal(0);
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
        45,
        55,
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
        49,
        51,
        SMALL_QUANTITY
      );
      const cost2 = await core.calculateOpenCost(
        marketId,
        50,
        50,
        SMALL_QUANTITY
      );

      expect(cost1).to.be.gt(cost2); // Wider range should cost more
    });

    it("Should handle boundary precision correctly", async function () {
      const { core, marketId } = await loadFixture(createActiveMarketFixture);

      // Test boundary ticks
      const costFirst = await core.calculateOpenCost(
        marketId,
        0,
        0,
        SMALL_QUANTITY
      );
      const costLast = await core.calculateOpenCost(
        marketId,
        TICK_COUNT - 1,
        TICK_COUNT - 1,
        SMALL_QUANTITY
      );

      expect(costFirst).to.be.gt(0);
      expect(costLast).to.be.gt(0);
    });

    it("Should handle rounding consistency", async function () {
      const { core, router, alice, mockPosition, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Create position
      await core.connect(router).openPosition(alice.address, {
        marketId,
        lowerTick: 45,
        upperTick: 55,
        quantity: MEDIUM_QUANTITY,
        maxCost: MEDIUM_COST,
      });

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

      // Cost should increase with quantity (convexity)
      const cost1 = await core.calculateOpenCost(
        marketId,
        45,
        55,
        SMALL_QUANTITY
      );
      const cost2 = await core.calculateOpenCost(
        marketId,
        45,
        55,
        SMALL_QUANTITY * 2n
      );
      const cost3 = await core.calculateOpenCost(
        marketId,
        45,
        55,
        SMALL_QUANTITY * 4n
      );

      expect(cost2).to.be.gt(cost1 * 2n); // Convex function
      expect(cost3).to.be.gt(cost2 * 2n); // Increasing marginal cost
    });

    it("Should maintain range additivity properties", async function () {
      const { core, marketId } = await loadFixture(createActiveMarketFixture);

      // Compare single large range vs two smaller ranges
      const fullRangeCost = await core.calculateOpenCost(
        marketId,
        40,
        60,
        SMALL_QUANTITY
      );

      const leftRangeCost = await core.calculateOpenCost(
        marketId,
        40,
        50,
        SMALL_QUANTITY
      );

      const rightRangeCost = await core.calculateOpenCost(
        marketId,
        51,
        60,
        SMALL_QUANTITY
      );

      // Full range should typically cost less than sum of parts (economies of scale)
      expect(fullRangeCost).to.be.lt(leftRangeCost + rightRangeCost);
    });
  });
});
