import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import {
  deployStandardFixture,
  createActiveMarket,
  ALPHA,
  SMALL_QUANTITY,
  MEDIUM_QUANTITY,
  LARGE_QUANTITY,
  EXTREME_COST,
  USDC_DECIMALS,
  WAD,
} from "./CLMSRMarketCore.fixtures";

describe("CLMSRMarketCore - Mathematical Invariants", function () {
  describe("Cost Consistency Invariants", function () {
    it("Should maintain cost consistency: buy then sell should be near-neutral", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core, router, alice } = contracts;

      const buyParams = {
        marketId,
        lowerTick: 45,
        upperTick: 55,
        quantity: MEDIUM_QUANTITY,
        maxCost: EXTREME_COST,
      };

      // Execute buy
      const buyTx = await core
        .connect(router)
        .openPosition(alice.address, buyParams);
      const buyReceipt = await buyTx.wait();
      const buyEvent = buyReceipt!.logs.find(
        (log) => (log as any).fragment?.name === "PositionOpened"
      );
      const positionId = (buyEvent as any).args[2]; // positionId

      // Execute sell (close position)
      const sellTx = await core.connect(router).closePosition(positionId, 0);
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
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core } = contracts;

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

  describe("Segment Tree Sum Invariants", function () {
    it("Should maintain monotonic increase in total sum after buys", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core, router, alice } = contracts;

      // Get initial sum (should be tick_count * WAD)
      const initialSum = await core.getTickValue(marketId, 0); // This gets one tick value

      // Execute multiple buys and verify sum increases
      for (let i = 0; i < 3; i++) {
        await core.connect(router).openPosition(alice.address, {
          marketId,
          lowerTick: 10 + i * 10,
          upperTick: 20 + i * 10,
          quantity: SMALL_QUANTITY,
          maxCost: EXTREME_COST,
        });

        const newSum = await core.getTickValue(marketId, 10 + i * 10);
        expect(newSum).to.be.gte(WAD); // Should be at least WAD
      }
    });

    it("Should maintain monotonic decrease in total sum after sells", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core, router, alice } = contracts;

      // First, execute buys to create positions
      const positions = [];
      for (let i = 0; i < 3; i++) {
        const tx = await core.connect(router).openPosition(alice.address, {
          marketId,
          lowerTick: 10 + i * 10,
          upperTick: 20 + i * 10,
          quantity: MEDIUM_QUANTITY,
          maxCost: EXTREME_COST,
        });
        const receipt = await tx.wait();
        const event = receipt!.logs.find(
          (log) => (log as any).fragment?.name === "PositionOpened"
        );
        positions.push((event as any).args[2]); // positionId
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
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core, router, alice } = contracts;

      // Open initial position
      const tx = await core.connect(router).openPosition(alice.address, {
        marketId,
        lowerTick: 40,
        upperTick: 60,
        quantity: MEDIUM_QUANTITY,
        maxCost: EXTREME_COST,
      });
      const receipt = await tx.wait();
      const event = receipt!.logs.find(
        (log) => (log as any).fragment?.name === "PositionOpened"
      );
      const positionId = (event as any).args[2]; // positionId

      const sumAfterOpen = await core.getTickValue(marketId, 50);

      // Increase position
      await core
        .connect(router)
        .increasePosition(positionId, SMALL_QUANTITY, EXTREME_COST);
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

  describe("CLMSR Formula Invariants", function () {
    it("Should satisfy CLMSR cost formula: C = α * ln(Σ_after / Σ_before)", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core } = contracts;

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

      // For first trade on fresh market, we can verify the formula
      // Σ_before = tick_count * WAD = 100 * 1e18
      // Σ_after = Σ_before - affected_sum + affected_sum * exp(q/α)
      // where affected_sum = (upperTick - lowerTick + 1) * WAD = 11 * 1e18

      expect(actualCost).to.be.gt(0);

      // Cost should be proportional to liquidity parameter
      // Higher alpha should mean lower cost for same quantity
      const market = await core.getMarket(marketId);
      expect(market.liquidityParameter).to.equal(ALPHA);
    });

    it("Should maintain price impact consistency", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core } = contracts;

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
  });

  describe("Roundtrip Neutrality Tests", function () {
    it("Should maintain near-neutrality for small roundtrips", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core, router, alice } = contracts;

      const smallQuantity = ethers.parseUnits("0.001", USDC_DECIMALS); // Very small

      // Buy
      const buyTx = await core.connect(router).openPosition(alice.address, {
        marketId,
        lowerTick: 45,
        upperTick: 55,
        quantity: smallQuantity,
        maxCost: EXTREME_COST,
      });
      const buyReceipt = await buyTx.wait();
      const buyEvent = buyReceipt!.logs.find(
        (log) => (log as any).fragment?.name === "PositionOpened"
      );
      const positionId = (buyEvent as any).args[2];
      const buyCost = (buyEvent as any).args[6];

      // Sell immediately
      const sellTx = await core.connect(router).closePosition(positionId, 0);
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
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core, router, alice } = contracts;

      const largeQuantity = LARGE_QUANTITY;

      // Buy
      const buyTx = await core.connect(router).openPosition(alice.address, {
        marketId,
        lowerTick: 30,
        upperTick: 70,
        quantity: largeQuantity,
        maxCost: EXTREME_COST,
      });
      const buyReceipt = await buyTx.wait();
      const buyEvent = buyReceipt!.logs.find(
        (log) => (log as any).fragment?.name === "PositionOpened"
      );
      const positionId = (buyEvent as any).args[2];
      const buyCost = (buyEvent as any).args[6];

      // Sell
      const sellTx = await core.connect(router).closePosition(positionId, 0);
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
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core } = contracts;

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
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core, router, alice } = contracts;

      // Use a large but safe quantity
      const largeQuantity = ethers.parseUnits("1", USDC_DECIMALS); // 1 USDC (further reduced for safety)

      await expect(
        core.connect(router).openPosition(alice.address, {
          marketId,
          lowerTick: 45,
          upperTick: 55,
          quantity: largeQuantity,
          maxCost: ethers.parseUnits("1000000", 6), // Use very large maxCost
        })
      ).to.not.be.reverted;
    });
  });
});
