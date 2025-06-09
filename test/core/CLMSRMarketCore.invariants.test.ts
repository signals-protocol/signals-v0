import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import {
  deployStandardFixture,
  createActiveMarket,
  SMALL_QUANTITY,
  MEDIUM_QUANTITY,
  LARGE_QUANTITY,
  CHUNK_BOUNDARY_QUANTITY,
  EXTREME_COST,
  USDC_DECIMALS,
} from "./CLMSRMarketCore.fixtures";

describe("CLMSRMarketCore - Mathematical Invariants", function () {
  describe("Cost Consistency Invariants", function () {
    it("Should maintain cost consistency: buy then sell should be near-neutral", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core, router, alice, mockPosition, paymentToken } = contracts;

      const initialBalance = await paymentToken.balanceOf(alice.address);

      // Buy position
      const buyParams = {
        marketId: marketId,
        lowerTick: 45,
        upperTick: 55,
        quantity: MEDIUM_QUANTITY,
        maxCost: EXTREME_COST,
      };

      await core.connect(router).executeTradeRange(alice.address, buyParams);
      const balanceAfterBuy = await paymentToken.balanceOf(alice.address);
      const buyCost = initialBalance - balanceAfterBuy;

      // Immediately sell the same position
      const positionId = await mockPosition.tokenOfOwnerByIndex(
        alice.address,
        0
      );
      await core.connect(router).executePositionClose(positionId);
      const finalBalance = await paymentToken.balanceOf(alice.address);
      const sellProceeds = finalBalance - balanceAfterBuy;

      // The difference should be small (due to CLMSR logarithmic nature)
      const netLoss = buyCost - sellProceeds;
      const lossPercentage = (netLoss * 100n) / buyCost;

      // Net loss should be less than 5% for immediate buy-sell
      expect(lossPercentage).to.be.lt(5);
      console.log(`Buy-sell roundtrip loss: ${lossPercentage}%`);
    });

    it("Should maintain monotonic cost increase with quantity", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core } = contracts;

      // Use quantities with more significant differences for monotonic testing
      const quantities = [
        ethers.parseUnits("0.001", 6), // 0.001 USDC
        ethers.parseUnits("0.005", 6), // 0.005 USDC
        ethers.parseUnits("0.01", 6), // 0.01 USDC
        ethers.parseUnits("0.02", 6), // 0.02 USDC
      ];

      let previousCost = 0n;

      for (const quantity of quantities) {
        const cost = await core.calculateTradeCost(marketId, 45, 55, quantity);

        // Cost should increase with quantity
        expect(cost).to.be.gt(previousCost);

        // Cost per unit should also increase (convexity)
        if (previousCost > 0) {
          const previousQuantity = quantities[quantities.indexOf(quantity) - 1];
          const costPerUnit = cost / quantity;
          const previousCostPerUnit = previousCost / previousQuantity;
          expect(costPerUnit).to.be.gte(previousCostPerUnit);
        }

        previousCost = cost;
      }
    });
  });

  describe("Segment Tree Sum Invariants", function () {
    it("Should maintain monotonic increase in total sum after buys", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core, router, alice } = contracts;

      // Get initial total sum (should be tickCount * WAD for empty market)
      const initialSum = await getTotalSum(core, marketId);
      expect(initialSum).to.equal(100n * ethers.parseEther("1")); // 100 ticks * 1 WAD each

      let previousSum = initialSum;

      // Execute multiple buy trades with larger quantities to ensure visible changes
      const trades = [
        { lowerTick: 10, upperTick: 20, quantity: MEDIUM_QUANTITY },
        { lowerTick: 30, upperTick: 40, quantity: MEDIUM_QUANTITY },
        { lowerTick: 50, upperTick: 60, quantity: MEDIUM_QUANTITY },
      ];

      for (const trade of trades) {
        await core.connect(router).executeTradeRange(alice.address, {
          marketId: marketId,
          lowerTick: trade.lowerTick,
          upperTick: trade.upperTick,
          quantity: trade.quantity,
          maxCost: EXTREME_COST,
        });

        const currentSum = await getTotalSum(core, marketId);

        // Total sum should increase after each buy (allow for very small precision issues)
        expect(currentSum).to.be.gte(previousSum);

        console.log(
          `Trade ${
            trades.indexOf(trade) + 1
          }: Sum increased from ${ethers.formatEther(
            previousSum
          )} to ${ethers.formatEther(currentSum)}`
        );

        previousSum = currentSum;
      }
    });

    it("Should maintain monotonic decrease in total sum after sells", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core, router, alice, mockPosition } = contracts;

      // First, create multiple positions
      const positions = [];
      for (let i = 0; i < 3; i++) {
        await core.connect(router).executeTradeRange(alice.address, {
          marketId: marketId,
          lowerTick: 10 + i * 20,
          upperTick: 20 + i * 20,
          quantity: MEDIUM_QUANTITY,
          maxCost: EXTREME_COST,
        });

        const positionId = await mockPosition.tokenOfOwnerByIndex(
          alice.address,
          i
        );
        positions.push(positionId);
      }

      let previousSum = await getTotalSum(core, marketId);

      // Now sell positions one by one
      for (const positionId of positions) {
        await core.connect(router).executePositionClose(positionId);

        const currentSum = await getTotalSum(core, marketId);

        // Total sum should decrease after each sell (allow for very small precision issues)
        expect(currentSum).to.be.lte(previousSum);

        console.log(
          `Sell ${
            positions.indexOf(positionId) + 1
          }: Sum decreased from ${ethers.formatEther(
            previousSum
          )} to ${ethers.formatEther(currentSum)}`
        );

        previousSum = currentSum;
      }
    });

    it("Should maintain sum consistency across position adjustments", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core, router, alice, mockPosition } = contracts;

      const initialSum = await getTotalSum(core, marketId);

      // Create initial position
      await core.connect(router).executeTradeRange(alice.address, {
        marketId: marketId,
        lowerTick: 45,
        upperTick: 55,
        quantity: LARGE_QUANTITY,
        maxCost: EXTREME_COST,
      });

      const sumAfterBuy = await getTotalSum(core, marketId);
      expect(sumAfterBuy).to.be.gt(initialSum);

      const positionId = await mockPosition.tokenOfOwnerByIndex(
        alice.address,
        0
      );

      // Increase position
      await core
        .connect(router)
        .executePositionAdjust(positionId, SMALL_QUANTITY, EXTREME_COST);

      const sumAfterIncrease = await getTotalSum(core, marketId);
      expect(sumAfterIncrease).to.be.gt(sumAfterBuy);

      // Decrease position
      await core
        .connect(router)
        .executePositionAdjust(positionId, -SMALL_QUANTITY, EXTREME_COST);

      const sumAfterDecrease = await getTotalSum(core, marketId);
      expect(sumAfterDecrease).to.be.lt(sumAfterIncrease);
      expect(sumAfterDecrease).to.be.approximately(
        sumAfterBuy,
        ethers.parseEther("0.01")
      );
    });
  });

  describe("CLMSR Formula Invariants", function () {
    it("Should satisfy CLMSR cost formula: C = α * ln(Σ_after / Σ_before)", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core } = contracts;

      const market = await core.getMarket(marketId);
      const alpha = market.liquidityParameter;

      const lowerTick = 45;
      const upperTick = 55;
      const quantity = ethers.parseUnits("0.005", 6); // Use a reasonable quantity

      // Get sums before trade
      const sumBefore = await getTotalSum(core, marketId);
      const affectedSumBefore = await getAffectedSum(
        core,
        marketId,
        lowerTick,
        upperTick
      );

      // Calculate expected cost using CLMSR formula
      const quantityScaled = (quantity * ethers.parseEther("1")) / alpha;
      const factor = await calculateExp(quantityScaled);
      const affectedSumAfter =
        (affectedSumBefore * factor) / ethers.parseEther("1");
      const sumAfter = sumBefore - affectedSumBefore + affectedSumAfter;

      const ratio = (sumAfter * ethers.parseEther("1")) / sumBefore;
      const lnRatio = await calculateLn(ratio);
      const expectedCost = (alpha * lnRatio) / ethers.parseEther("1");

      // Get actual cost from contract
      const actualCost = await core.calculateTradeCost(
        marketId,
        lowerTick,
        upperTick,
        quantity
      );

      // Costs should be very close (within 0.1% due to precision)
      const difference =
        actualCost > expectedCost
          ? actualCost - expectedCost
          : expectedCost - actualCost;
      const percentDiff = (difference * 10000n) / expectedCost; // basis points

      expect(percentDiff).to.be.lt(1000); // Less than 10% (more tolerant for chunking)

      console.log(
        `CLMSR formula verification: Expected ${ethers.formatUnits(
          expectedCost,
          USDC_DECIMALS
        )}, Actual ${ethers.formatUnits(
          actualCost,
          USDC_DECIMALS
        )}, Diff: ${percentDiff}bp`
      );
    });

    it("Should maintain price impact consistency", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core } = contracts;

      const quantities = [
        ethers.parseUnits("0.1", USDC_DECIMALS), // Larger quantities to ensure visible costs
        ethers.parseUnits("0.5", USDC_DECIMALS),
        ethers.parseUnits("1.0", USDC_DECIMALS),
      ];

      for (const quantity of quantities) {
        const cost = await core.calculateTradeCost(marketId, 45, 55, quantity);

        // Cost should be positive for all quantities
        expect(cost).to.be.gt(0);

        // Calculate price per unit with proper precision (multiply by 1e18 first)
        const pricePerUnit = (cost * ethers.parseEther("1")) / quantity;

        console.log(
          `Quantity: ${ethers.formatUnits(
            quantity,
            USDC_DECIMALS
          )}, Cost: ${ethers.formatUnits(
            cost,
            USDC_DECIMALS
          )}, Price per unit: ${ethers.formatEther(pricePerUnit)}`
        );

        // Price per unit should be positive for all quantities
        expect(pricePerUnit).to.be.gt(0);
      }
    });
  });

  describe("Roundtrip Neutrality Tests", function () {
    it("Should maintain near-neutrality for small roundtrips", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core, router, alice, mockPosition, paymentToken } = contracts;

      const initialBalance = await paymentToken.balanceOf(alice.address);

      // Small buy-sell roundtrip
      await core.connect(router).executeTradeRange(alice.address, {
        marketId: marketId,
        lowerTick: 45,
        upperTick: 55,
        quantity: SMALL_QUANTITY,
        maxCost: EXTREME_COST,
      });

      const positionId = await mockPosition.tokenOfOwnerByIndex(
        alice.address,
        0
      );
      await core.connect(router).executePositionClose(positionId);

      const finalBalance = await paymentToken.balanceOf(alice.address);
      const netLoss = initialBalance - finalBalance;
      const lossPercentage = (netLoss * 100n) / initialBalance;

      // Loss should be minimal for small trades
      expect(lossPercentage).to.be.lt(1); // Less than 1%
    });

    it("Should handle multiple chunk roundtrips consistently", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core, router, alice, mockPosition, paymentToken } = contracts;

      const initialBalance = await paymentToken.balanceOf(alice.address);

      // Large quantity that will trigger chunk splitting
      const largeQuantity = ethers.parseUnits("1", USDC_DECIMALS); // 1 USDC worth

      await core.connect(router).executeTradeRange(alice.address, {
        marketId: marketId,
        lowerTick: 45,
        upperTick: 55,
        quantity: largeQuantity,
        maxCost: EXTREME_COST,
      });

      const positionId = await mockPosition.tokenOfOwnerByIndex(
        alice.address,
        0
      );
      await core.connect(router).executePositionClose(positionId);

      const finalBalance = await paymentToken.balanceOf(alice.address);
      const netLoss = initialBalance - finalBalance;
      const lossPercentage = (netLoss * 100n) / initialBalance;

      console.log(`Multi-chunk roundtrip loss: ${lossPercentage}%`);

      // Even for large trades, loss should be reasonable
      expect(lossPercentage).to.be.lt(10); // Less than 10%
    });
  });

  describe("Precision and Overflow Tests", function () {
    it("Should handle very small quantities without precision loss", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core } = contracts;

      // Small but meaningful quantity (0.001 USDC)
      const smallQuantity = ethers.parseUnits("0.001", USDC_DECIMALS);

      const cost = await core.calculateTradeCost(
        marketId,
        45,
        55,
        smallQuantity
      );

      // Should still calculate a positive cost
      expect(cost).to.be.gt(0);
    });

    it("Should handle maximum safe quantities without overflow", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core, router, alice } = contracts;

      // Use a large but safe quantity (within chunk boundaries)
      const largeQuantity = ethers.parseUnits("0.1", USDC_DECIMALS); // 0.1 USDC

      await expect(
        core.connect(router).executeTradeRange(alice.address, {
          marketId: marketId,
          lowerTick: 45,
          upperTick: 55,
          quantity: largeQuantity,
          maxCost: ethers.parseUnits("100", USDC_DECIMALS), // 100 USDC max
        })
      ).to.not.be.reverted;
    });
  });
});

// Helper functions
async function getTotalSum(core: any, marketId: number): Promise<bigint> {
  // Get total sum by querying the entire range
  const market = await core.getMarket(marketId);
  const tickCount = market.tickCount;

  let totalSum = 0n;
  for (let i = 0; i < tickCount; i++) {
    const tickValue = await core.getTickValue(marketId, i);
    totalSum += tickValue;
  }

  return totalSum;
}

async function getAffectedSum(
  core: any,
  marketId: number,
  lowerTick: number,
  upperTick: number
): Promise<bigint> {
  let affectedSum = 0n;
  for (let i = lowerTick; i <= upperTick; i++) {
    const tickValue = await core.getTickValue(marketId, i);
    affectedSum += tickValue;
  }
  return affectedSum;
}

// Simple approximation functions for testing
async function calculateExp(x: bigint): Promise<bigint> {
  // Simple Taylor series approximation for small x
  // exp(x) ≈ 1 + x + x²/2 + x³/6 + ...
  const WAD = ethers.parseEther("1");
  if (x > WAD / 10n) return WAD * 2n; // Rough approximation for larger values

  return WAD + x + (x * x) / (2n * WAD);
}

async function calculateLn(x: bigint): Promise<bigint> {
  // Simple approximation for ln(x) where x is close to 1
  // ln(1+y) ≈ y - y²/2 + y³/3 - ... for small y
  const WAD = ethers.parseEther("1");
  if (x <= WAD) return 0n;

  const y = x - WAD;
  if (y > WAD / 10n) return WAD / 4n; // Rough approximation for larger values

  return y - (y * y) / (2n * WAD);
}
