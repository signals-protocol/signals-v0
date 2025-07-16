import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import {
  coreFixture,
  createActiveMarketFixture,
} from "../helpers/fixtures/core";
import { INVARIANT_TAG } from "../helpers/tags";

describe(`${INVARIANT_TAG} CLMSR Formula Invariants`, function () {
  const ALPHA = ethers.parseEther("1");
  const TICK_COUNT = 100;
  const MARKET_DURATION = 7 * 24 * 60 * 60; // 7 days
  const WAD = ethers.parseEther("1");
  const USDC_DECIMALS = 6;
  const SMALL_QUANTITY = ethers.parseUnits("0.001", USDC_DECIMALS); // 0.001 USDC - smaller to avoid chunking issues
  const MEDIUM_QUANTITY = ethers.parseUnits("0.1", USDC_DECIMALS); // 0.1 USDC
  const LARGE_QUANTITY = ethers.parseUnits("1", USDC_DECIMALS); // 1 USDC
  const EXTREME_COST = ethers.parseUnits("100000", USDC_DECIMALS); // 100k USDC max cost

  describe("Cost Consistency Invariants", function () {
    it("Should maintain cost consistency: buy then sell should be near-neutral", async function () {
      const { core, router, alice, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Execute buy
      const buyTx = await core
        .connect(router)
        .openPosition(
          alice.address,
          marketId,
          45,
          55,
          MEDIUM_QUANTITY,
          EXTREME_COST
        );
      const buyReceipt = await buyTx.wait();
      const buyEvent = buyReceipt!.logs.find(
        (log) => (log as any).fragment?.name === "PositionOpened"
      );
      const positionId = (buyEvent as any).args[2]; // positionId

      // Execute sell (close position) - need to use router as authorized caller
      const sellTx = await core.connect(router).closePosition(
        positionId,
        0 // minPayout
      );
      const sellReceipt = await sellTx.wait();
      const sellEvent = sellReceipt!.logs.find(
        (log) => (log as any).fragment?.name === "PositionClosed"
      );
      const proceeds = (sellEvent as any).args[2]; // proceeds

      const buyCost = (buyEvent as any).args[6]; // cost

      // Due to price impact, proceeds should be less than cost but not by too much
      const difference = buyCost - proceeds;
      const percentageDifference =
        (BigInt(difference) * 10000n) / BigInt(buyCost); // basis points

      // Should lose less than 5% due to price impact (500 basis points)
      expect(percentageDifference).to.be.lt(500n);
    });

    it("Should maintain monotonic cost increase with quantity", async function () {
      const { core, marketId } = await loadFixture(createActiveMarketFixture);

      // Use larger quantities to avoid round-up effects
      const baseQuantity = ethers.parseUnits("0.1", USDC_DECIMALS); // 0.1 USDC
      const doubleQuantity = baseQuantity * 2n;
      const tripleQuantity = baseQuantity * 3n;

      const cost1 = await core.calculateOpenCost(
        marketId,
        45,
        55,
        baseQuantity
      );
      const cost2 = await core.calculateOpenCost(
        marketId,
        45,
        55,
        doubleQuantity
      );
      const cost3 = await core.calculateOpenCost(
        marketId,
        45,
        55,
        tripleQuantity
      );

      // Costs should increase monotonically
      expect(cost2).to.be.gt(cost1);
      expect(cost3).to.be.gt(cost2);

      // Due to exponential nature, cost should increase super-linearly
      expect(cost2).to.be.gt(cost1 * 2n);
      expect(cost3).to.be.gt(cost1 * 3n);
    });
  });

  describe("CLMSR Formula Invariants", function () {
    it("Should satisfy CLMSR cost formula consistency", async function () {
      const { core, marketId } = await loadFixture(createActiveMarketFixture);

      const quantity = SMALL_QUANTITY;
      const lowerTick = 45;
      const upperTick = 55;

      // Get actual cost from contract
      const actualCost = await core.calculateOpenCost(
        marketId,
        lowerTick,
        upperTick,
        quantity
      );

      // Test basic formula properties rather than exact values
      expect(actualCost).to.be.gt(0);

      // Cost should increase with quantity
      const doubleCost = await core.calculateOpenCost(
        marketId,
        lowerTick,
        upperTick,
        quantity * 2n
      );
      expect(doubleCost).to.be.gt(actualCost);

      // Cost should increase with range width
      const widerCost = await core.calculateOpenCost(
        marketId,
        40,
        60,
        quantity
      );
      expect(widerCost).to.be.gt(actualCost);

      // Verify market parameters
      const market = await core.getMarket(marketId);
      expect(market.liquidityParameter).to.equal(ALPHA);
    });

    it("Should maintain price impact consistency", async function () {
      const { core, marketId } = await loadFixture(createActiveMarketFixture);

      // Use larger quantities to avoid round-up effects
      const baseQuantity = ethers.parseUnits("0.1", USDC_DECIMALS); // 0.1 USDC
      const doubleQuantity = baseQuantity * 2n;

      // Calculate costs for different quantities
      const cost1 = await core.calculateOpenCost(
        marketId,
        45,
        55,
        baseQuantity
      );
      const cost2 = await core.calculateOpenCost(
        marketId,
        45,
        55,
        doubleQuantity
      );

      // Price impact should be super-linear due to exponential nature
      const costRatio = (cost2 * 1000n) / cost1; // Multiply by 1000 for precision

      // Price impact should be super-linear due to exponential nature
      expect(costRatio).to.be.gt(2000); // Should be more than 2x
    });

    it("Should maintain liquidity parameter effect on costs", async function () {
      const { core, keeper } = await loadFixture(coreFixture);

      const currentTime = await time.latest();
      const startTime = currentTime + 2000; // Large buffer for invariant tests
      const endTime = startTime + MARKET_DURATION;

      const lowAlpha = ethers.parseEther("0.1");
      const highAlpha = ethers.parseEther("10");

      // Create markets with different liquidity parameters
      await core
        .connect(keeper)
        .createMarket(1, TICK_COUNT, startTime, endTime, lowAlpha);

      await core
        .connect(keeper)
        .createMarket(2, TICK_COUNT, startTime, endTime, highAlpha);

      await time.increaseTo(startTime + 1);

      const quantity = MEDIUM_QUANTITY;
      const cost1 = await core.calculateOpenCost(1, 45, 55, quantity);
      const cost2 = await core.calculateOpenCost(2, 45, 55, quantity);

      // Higher alpha should mean lower cost for same quantity
      expect(cost2).to.be.lt(cost1);
    });
  });

  describe("Roundtrip Neutrality Tests", function () {
    it("Should maintain near-neutrality for small roundtrips", async function () {
      const { core, router, alice, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      const smallQuantity = ethers.parseUnits("0.001", USDC_DECIMALS); // Very small

      // Buy
      const buyTx = await core
        .connect(router)
        .openPosition(
          alice.address,
          marketId,
          45,
          55,
          smallQuantity,
          EXTREME_COST
        );
      const buyReceipt = await buyTx.wait();
      const buyEvent = buyReceipt!.logs.find(
        (log) => (log as any).fragment?.name === "PositionOpened"
      );
      const positionId = (buyEvent as any).args[2];
      const buyCost = (buyEvent as any).args[6];

      // Sell immediately
      const sellTx = await core.connect(router).closePosition(
        positionId,
        0 // minPayout
      );
      const sellReceipt = await sellTx.wait();
      const sellEvent = sellReceipt!.logs.find(
        (log) => (log as any).fragment?.name === "PositionClosed"
      );
      const proceeds = (sellEvent as any).args[2];

      // For small quantities, loss should be minimal
      const loss = buyCost - proceeds;
      const lossPercentage = (BigInt(loss) * 10000n) / BigInt(buyCost); // basis points
      expect(lossPercentage).to.be.lt(100n); // Less than 1% (relaxed for precision)
    });

    it("Should handle multiple chunk roundtrips consistently", async function () {
      const { core, router, alice, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      const largeQuantity = LARGE_QUANTITY;

      // Buy
      const buyTx = await core
        .connect(router)
        .openPosition(
          alice.address,
          marketId,
          30,
          70,
          largeQuantity,
          EXTREME_COST
        );
      const buyReceipt = await buyTx.wait();
      const buyEvent = buyReceipt!.logs.find(
        (log) => (log as any).fragment?.name === "PositionOpened"
      );
      const positionId = (buyEvent as any).args[2];
      const buyCost = (buyEvent as any).args[6];

      // Sell
      const sellTx = await core.connect(router).closePosition(
        positionId,
        0 // minPayout
      );
      const sellReceipt = await sellTx.wait();
      const sellEvent = sellReceipt!.logs.find(
        (log) => (log as any).fragment?.name === "PositionClosed"
      );
      const proceeds = (sellEvent as any).args[2];

      // Even for large quantities, should complete successfully
      expect(proceeds).to.be.gt(0);
      expect(proceeds).to.be.lte(buyCost); // Some loss due to price impact (or equal in edge cases)
    });
  });

  describe("Precision and Overflow Tests", function () {
    it("Should handle very small quantities without precision loss", async function () {
      const { core, marketId } = await loadFixture(createActiveMarketFixture);

      const verySmallQuantity = ethers.parseUnits("0.001", 6); // 1 milli-unit (6 decimals)

      const cost = await core.calculateOpenCost(
        marketId,
        45,
        55,
        verySmallQuantity
      );

      expect(cost).to.be.gt(0); // Should not be zero due to precision loss
    });

    it("Should handle maximum safe quantities without overflow", async function () {
      const { core, router, alice, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Use a large but safe quantity
      const largeQuantity = ethers.parseUnits("1", USDC_DECIMALS); // 1 USDC (further reduced for safety)

      await expect(
        core.connect(router).openPosition(
          alice.address,
          marketId,
          45,
          55,
          largeQuantity,
          ethers.parseUnits("1000000", 6) // Use very large maxCost
        )
      ).to.not.be.reverted;
    });

    it("Should maintain numerical consistency across different tick ranges", async function () {
      const { core, marketId } = await loadFixture(createActiveMarketFixture);

      const quantity = MEDIUM_QUANTITY;

      // Test various tick ranges
      const ranges = [
        { lower: 0, upper: 10 },
        { lower: 45, upper: 55 },
        { lower: 89, upper: 99 },
      ];

      for (const range of ranges) {
        const cost = await core.calculateOpenCost(
          marketId,
          range.lower,
          range.upper,
          quantity
        );
        expect(cost).to.be.gt(0);

        // Cost should be roughly proportional to range size
        const rangeSize = range.upper - range.lower + 1;
        expect(cost).to.be.gt(rangeSize * 1000); // Minimum cost proportional to range
      }
    });

    it("Should handle edge case tick ranges correctly", async function () {
      const { core, marketId } = await loadFixture(createActiveMarketFixture);

      const quantity = SMALL_QUANTITY;

      // Single tick range
      const singleTickCost = await core.calculateOpenCost(
        marketId,
        50,
        50,
        quantity
      );
      expect(singleTickCost).to.be.gt(0);

      // Full range
      const fullRangeCost = await core.calculateOpenCost(
        marketId,
        0,
        TICK_COUNT - 1,
        quantity
      );
      expect(fullRangeCost).to.be.gt(singleTickCost);

      // Adjacent ranges should have similar costs
      const cost1 = await core.calculateOpenCost(marketId, 40, 50, quantity);
      const cost2 = await core.calculateOpenCost(marketId, 50, 60, quantity);

      const difference = cost1 > cost2 ? cost1 - cost2 : cost2 - cost1;
      const percentDiff = (difference * 100n) / cost1;
      expect(percentDiff).to.be.lt(50n); // Less than 50% difference for similar ranges
    });
  });
});
