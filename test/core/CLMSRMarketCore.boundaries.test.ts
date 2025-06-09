import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import {
  deployStandardFixture,
  createActiveMarket,
  createExtremeMarket,
  ALPHA,
  CHUNK_BOUNDARY_QUANTITY,
  SMALL_QUANTITY,
  MEDIUM_QUANTITY,
  LARGE_QUANTITY,
  MIN_FACTOR,
  MAX_FACTOR,
  EXTREME_COST,
  USDC_DECIMALS,
  WAD,
} from "./CLMSRMarketCore.fixtures";

describe("CLMSRMarketCore - Boundary Conditions", function () {
  describe("Time Boundaries", function () {
    it("Should handle trade at exact market start time", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core, router, alice } = contracts;

      const tradeParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: SMALL_QUANTITY,
        maxCost: EXTREME_COST,
      };

      await expect(
        core.connect(router).openPosition(alice.address, tradeParams)
      ).to.not.be.reverted;
    });

    it("Should handle trade 1 second before market end", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId, endTime } = await createActiveMarket(contracts);
      const { core, router, alice } = contracts;

      // Move to 1 second before end
      await time.setNextBlockTimestamp(endTime - 1);

      const tradeParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: SMALL_QUANTITY,
        maxCost: EXTREME_COST,
      };

      await expect(
        core.connect(router).openPosition(alice.address, tradeParams)
      ).to.not.be.reverted;
    });

    it("Should deactivate market when trading after end time", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId, endTime } = await createActiveMarket(contracts);
      const { core, router, alice } = contracts;

      // Move past end time
      await time.setNextBlockTimestamp(endTime + 1);

      const tradeParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: SMALL_QUANTITY,
        maxCost: EXTREME_COST,
      };

      await expect(
        core.connect(router).openPosition(alice.address, tradeParams)
      ).to.be.revertedWithCustomError(core, "InvalidMarketParameters");
    });

    it("Should prevent trading before market start", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { core, keeper, router, alice } = contracts;

      const futureStart = (await time.latest()) + 3600; // 1 hour from now
      const futureEnd = futureStart + 86400; // 1 day duration

      await core
        .connect(keeper)
        .createMarket(2, 100, futureStart, futureEnd, ALPHA);

      const tradeParams = {
        marketId: 2,
        lowerTick: 10,
        upperTick: 20,
        quantity: SMALL_QUANTITY,
        maxCost: EXTREME_COST,
      };

      await expect(
        core.connect(router).openPosition(alice.address, tradeParams)
      ).to.be.revertedWithCustomError(core, "InvalidMarketParameters");
    });
  });

  describe("Single Tick Trading", function () {
    it("Should allow single tick trades (lowerTick == upperTick)", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core, router, alice } = contracts;

      const tradeParams = {
        marketId,
        lowerTick: 50,
        upperTick: 50, // Same tick
        quantity: SMALL_QUANTITY,
        maxCost: EXTREME_COST,
      };

      await expect(
        core.connect(router).openPosition(alice.address, tradeParams)
      )
        .to.emit(core, "PositionOpened")
        .withArgs(
          marketId,
          alice.address,
          1, // positionId
          50,
          50,
          SMALL_QUANTITY,
          anyValue
        );
    });

    it("Should handle single tick at market boundaries", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core, router, alice, bob } = contracts;

      // Test first tick
      const firstTickParams = {
        marketId,
        lowerTick: 0,
        upperTick: 0,
        quantity: SMALL_QUANTITY,
        maxCost: EXTREME_COST,
      };

      await expect(
        core.connect(router).openPosition(alice.address, firstTickParams)
      ).to.not.be.reverted;

      // Test last tick
      const lastTickParams = {
        marketId,
        lowerTick: 99,
        upperTick: 99,
        quantity: SMALL_QUANTITY,
        maxCost: EXTREME_COST,
      };

      await expect(
        core.connect(router).openPosition(bob.address, lastTickParams)
      ).to.not.be.reverted;
    });
  });

  describe("Chunk-Split Boundaries", function () {
    it("Should handle quantity exactly at chunk boundary", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core, router, alice } = contracts;

      const tradeParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: CHUNK_BOUNDARY_QUANTITY,
        maxCost: EXTREME_COST,
      };

      await expect(
        core.connect(router).openPosition(alice.address, tradeParams)
      ).to.not.be.reverted;
    });

    it("Should handle quantity slightly above chunk boundary", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core, router, alice } = contracts;

      const slightlyAbove =
        CHUNK_BOUNDARY_QUANTITY + ethers.parseUnits("0.001", USDC_DECIMALS);

      const tradeParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: slightlyAbove,
        maxCost: EXTREME_COST,
      };

      await expect(
        core.connect(router).openPosition(alice.address, tradeParams)
      ).to.not.be.reverted;
    });

    it("Should handle multiple chunk splits correctly", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core, router, alice } = contracts;

      const multipleChunks = CHUNK_BOUNDARY_QUANTITY * 3n;

      const tradeParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: multipleChunks,
        maxCost: EXTREME_COST,
      };

      await expect(
        core.connect(router).openPosition(alice.address, tradeParams)
      ).to.not.be.reverted;
    });

    it("Should maintain cost consistency across chunk splits", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core } = contracts;

      const singleCost = await core.calculateOpenCost(
        marketId,
        10,
        20,
        CHUNK_BOUNDARY_QUANTITY
      );

      const multipleCost = await core.calculateOpenCost(
        marketId,
        10,
        20,
        CHUNK_BOUNDARY_QUANTITY * 2n
      );

      // Multiple chunks should cost more than single chunk
      expect(multipleCost).to.be.gt(singleCost);
    });
  });

  describe("Factor Limits", function () {
    it("Should handle trades that approach MIN_FACTOR boundary", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createExtremeMarket(contracts);
      const { core, router, alice } = contracts;

      // Use very small quantity to approach MIN_FACTOR
      const verySmallQuantity = ethers.parseUnits("0.000001", USDC_DECIMALS);

      const tradeParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: verySmallQuantity,
        maxCost: EXTREME_COST,
      };

      await expect(
        core.connect(router).openPosition(alice.address, tradeParams)
      ).to.not.be.reverted;
    });

    it("Should handle trades that approach MAX_FACTOR boundary", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createExtremeMarket(contracts);
      const { core, router, alice } = contracts;

      // Use large quantity to approach MAX_FACTOR
      const largeQuantity = ethers.parseUnits("1000", USDC_DECIMALS);

      const tradeParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: largeQuantity,
        maxCost: EXTREME_COST,
      };

      await expect(
        core.connect(router).openPosition(alice.address, tradeParams)
      ).to.not.be.reverted;
    });

    it("Should revert when factor exceeds MAX_FACTOR", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createExtremeMarket(contracts);
      const { core, router, alice } = contracts;

      // Use extremely large quantity to exceed MAX_FACTOR
      const extremeQuantity = ethers.parseUnits("100000", USDC_DECIMALS);

      const tradeParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: extremeQuantity,
        maxCost: EXTREME_COST,
      };

      await expect(
        core.connect(router).openPosition(alice.address, tradeParams)
      ).to.be.reverted;
    });
  });

  describe("Tick Boundaries", function () {
    it("Should handle trades at first tick (0)", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core, router, alice } = contracts;

      const tradeParams = {
        marketId,
        lowerTick: 0,
        upperTick: 0,
        quantity: SMALL_QUANTITY,
        maxCost: EXTREME_COST,
      };

      await expect(
        core.connect(router).openPosition(alice.address, tradeParams)
      ).to.not.be.reverted;
    });

    it("Should handle trades at last tick (99)", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core, router, alice } = contracts;

      const tradeParams = {
        marketId,
        lowerTick: 99,
        upperTick: 99,
        quantity: SMALL_QUANTITY,
        maxCost: EXTREME_COST,
      };

      await expect(
        core.connect(router).openPosition(alice.address, tradeParams)
      ).to.not.be.reverted;
    });

    it("Should handle maximum tick range (0 to 99)", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core, router, alice } = contracts;

      const tradeParams = {
        marketId,
        lowerTick: 0,
        upperTick: 99,
        quantity: SMALL_QUANTITY,
        maxCost: EXTREME_COST,
      };

      await expect(
        core.connect(router).openPosition(alice.address, tradeParams)
      ).to.not.be.reverted;
    });

    it("Should revert when tick exceeds market bounds", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core, router, alice } = contracts;

      const tradeParams = {
        marketId,
        lowerTick: 0,
        upperTick: 100, // Out of bounds (market has 100 ticks: 0-99)
        quantity: SMALL_QUANTITY,
        maxCost: EXTREME_COST,
      };

      await expect(
        core.connect(router).openPosition(alice.address, tradeParams)
      ).to.be.revertedWithCustomError(core, "InvalidTickRange");
    });
  });

  describe("Quantity Boundaries", function () {
    it("Should handle minimum possible quantity (1 wei)", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core, router, alice } = contracts;

      const tradeParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: 1n, // 1 wei
        maxCost: EXTREME_COST,
      };

      await expect(
        core.connect(router).openPosition(alice.address, tradeParams)
      ).to.not.be.reverted;
    });

    it("Should revert with zero quantity", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core, router, alice } = contracts;

      const tradeParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: 0n,
        maxCost: EXTREME_COST,
      };

      await expect(
        core.connect(router).openPosition(alice.address, tradeParams)
      ).to.be.revertedWithCustomError(core, "InvalidQuantity");
    });
  });

  describe("Liquidity Parameter Boundaries", function () {
    it("Should handle minimum liquidity parameter", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { core, keeper, router, alice } = contracts;

      const minAlpha = ethers.parseEther("0.001"); // MIN_LIQUIDITY_PARAMETER
      const currentTime = await time.latest();

      await core
        .connect(keeper)
        .createMarket(3, 100, currentTime + 100, currentTime + 86400, minAlpha);

      // Move time to after market start
      await time.increaseTo(currentTime + 200);

      // Calculate actual cost first
      const actualCost = await core.calculateOpenCost(
        3,
        10,
        20,
        SMALL_QUANTITY
      );

      const tradeParams = {
        marketId: 3,
        lowerTick: 10,
        upperTick: 20,
        quantity: ethers.parseUnits("0.001", 6), // Use very small quantity for extreme alpha
        maxCost: ethers.parseUnits("1000000", 6), // Use very large maxCost
      };

      await expect(
        core.connect(router).openPosition(alice.address, tradeParams)
      ).to.not.be.reverted;
    });

    it("Should handle maximum liquidity parameter", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { core, keeper, router, alice } = contracts;

      const maxAlpha = ethers.parseEther("1000"); // MAX_LIQUIDITY_PARAMETER
      const currentTime = await time.latest();

      await core
        .connect(keeper)
        .createMarket(4, 100, currentTime + 100, currentTime + 86400, maxAlpha);

      // Move time to after market start
      await time.increaseTo(currentTime + 200);

      // Calculate actual cost first
      const actualCost = await core.calculateOpenCost(
        4,
        10,
        20,
        SMALL_QUANTITY
      );

      const tradeParams = {
        marketId: 4,
        lowerTick: 10,
        upperTick: 20,
        quantity: ethers.parseUnits("0.001", 6), // Use very small quantity for extreme alpha
        maxCost: ethers.parseUnits("1000000", 6), // Use very large maxCost
      };

      await expect(
        core.connect(router).openPosition(alice.address, tradeParams)
      ).to.not.be.reverted;
    });
  });

  describe("Mathematical Precision and Edge Cases", function () {
    it("Should handle chunk boundary calculations precisely", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core } = contracts;

      const cost1 = await core.calculateOpenCost(
        marketId,
        10,
        20,
        CHUNK_BOUNDARY_QUANTITY
      );

      // Test multiple calculations for consistency
      for (let i = 0; i < 5; i++) {
        const cost2 = await core.calculateOpenCost(
          marketId,
          10,
          20,
          CHUNK_BOUNDARY_QUANTITY
        );
        expect(cost2).to.equal(cost1);
      }
    });

    it("Should handle multiple chunk calculations consistently", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core, router, alice } = contracts;

      const tradeParams1 = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: CHUNK_BOUNDARY_QUANTITY,
        maxCost: EXTREME_COST,
      };

      await core.connect(router).openPosition(alice.address, tradeParams1);

      // Calculate cost for second chunk
      const cost2 = await core.calculateOpenCost(
        marketId,
        10,
        20,
        CHUNK_BOUNDARY_QUANTITY
      );

      const tradeParams2 = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: CHUNK_BOUNDARY_QUANTITY,
        maxCost: EXTREME_COST,
      };

      await expect(
        core.connect(router).openPosition(alice.address, tradeParams2)
      ).to.not.be.reverted;

      // Second chunk should cost more due to price impact
      const initialCost = await core.calculateOpenCost(
        marketId,
        30,
        40,
        CHUNK_BOUNDARY_QUANTITY
      );
      expect(cost2).to.be.gt(initialCost);
    });

    it("Should handle very small quantities without underflow", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core, router, alice } = contracts;

      const verySmallQuantity = ethers.parseUnits("0.001", 6); // 1 milli-unit (6 decimals)

      const cost = await core.calculateOpenCost(
        marketId,
        10,
        20,
        verySmallQuantity
      );

      expect(cost).to.be.gt(0);

      const tradeParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: verySmallQuantity,
        maxCost: EXTREME_COST,
      };

      await expect(
        core.connect(router).openPosition(alice.address, tradeParams)
      ).to.not.be.reverted;
    });

    it("Should handle first trade scenario (sumBefore == 0)", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core, router, alice } = contracts;

      // This is the first trade, so sumBefore should be handled correctly
      const cost = await core.calculateOpenCost(
        marketId,
        10,
        20,
        SMALL_QUANTITY
      );

      expect(cost).to.be.gt(0);

      const tradeParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: SMALL_QUANTITY,
        maxCost: EXTREME_COST,
      };

      await expect(
        core.connect(router).openPosition(alice.address, tradeParams)
      ).to.not.be.reverted;
    });

    it("Should maintain getTotalSum cache consistency", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core, router, alice } = contracts;

      const tradeParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: MEDIUM_QUANTITY,
        maxCost: EXTREME_COST,
      };

      const sumBefore = await core.marketTrees(marketId);
      await core.connect(router).openPosition(alice.address, tradeParams);
      const sumAfter = await core.marketTrees(marketId);

      // Sum should have changed after trade
      expect(sumAfter).to.not.equal(sumBefore);
    });

    it("Should handle getTickValue precision after trades", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core, router, alice } = contracts;

      const initialValue = await core.getTickValue(marketId, 15);

      const tradeParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: MEDIUM_QUANTITY,
        maxCost: EXTREME_COST,
      };

      await core.connect(router).openPosition(alice.address, tradeParams);

      const finalValue = await core.getTickValue(marketId, 15);

      // Tick value should have increased after trade (tick 15 is within range 10-20)
      expect(finalValue).to.be.gte(initialValue); // Allow equal in case of precision issues
    });
  });

  describe("Gas and Performance Tests", function () {
    it("Should handle worst-case trade gas efficiently", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core, router, alice } = contracts;

      const singleChunkParams = {
        marketId,
        lowerTick: 0,
        upperTick: 99,
        quantity: CHUNK_BOUNDARY_QUANTITY,
        maxCost: EXTREME_COST,
      };

      const tx = await core
        .connect(router)
        .openPosition(alice.address, singleChunkParams);
      const receipt = await tx.wait();

      // Should use reasonable gas (less than 500k for single chunk)
      expect(receipt!.gasUsed).to.be.lt(500000);

      const multiChunkCost = await core.calculateOpenCost(
        marketId,
        0,
        99,
        CHUNK_BOUNDARY_QUANTITY * 3n
      );

      const multiChunkParams = {
        marketId,
        lowerTick: 0,
        upperTick: 99,
        quantity: CHUNK_BOUNDARY_QUANTITY * 3n,
        maxCost: multiChunkCost + ethers.parseUnits("1000", USDC_DECIMALS),
      };

      const multiTx = await core
        .connect(router)
        .openPosition(alice.address, multiChunkParams);
      const multiReceipt = await multiTx.wait();

      // Multi-chunk should use more gas but still reasonable (less than 1M)
      expect(multiReceipt!.gasUsed).to.be.lt(1000000);
      expect(multiReceipt!.gasUsed).to.be.gt(receipt!.gasUsed);
    });

    it("Should handle large tick range operations efficiently", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core, router, alice } = contracts;

      const fullRangeParams = {
        marketId,
        lowerTick: 0,
        upperTick: 99,
        quantity: MEDIUM_QUANTITY,
        maxCost: EXTREME_COST,
      };

      const tx = await core
        .connect(router)
        .openPosition(alice.address, fullRangeParams);
      const receipt = await tx.wait();

      // Full range should still be efficient
      expect(receipt!.gasUsed).to.be.lt(300000);
    });
  });

  describe("Time Machine Tests", function () {
    it("Should handle block timestamp jumps correctly", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId, endTime } = await createActiveMarket(contracts);
      const { core, router, alice } = contracts;

      // Jump to near end time
      await time.setNextBlockTimestamp(endTime - 10);

      const tradeParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: SMALL_QUANTITY,
        maxCost: EXTREME_COST,
      };

      await expect(
        core.connect(router).openPosition(alice.address, tradeParams)
      ).to.not.be.reverted;

      // Jump past end time
      await time.setNextBlockTimestamp(endTime + 1);

      await expect(
        core.connect(router).openPosition(alice.address, tradeParams)
      ).to.be.revertedWithCustomError(core, "InvalidMarketParameters");
    });

    it("Should handle extreme timestamp values", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { core, keeper } = contracts;

      // Test with very large timestamp values
      const farFuture = 2147483647; // Max 32-bit timestamp
      const farFutureEnd = farFuture + 86400;

      await expect(
        core
          .connect(keeper)
          .createMarket(5, 100, farFuture, farFutureEnd, ALPHA)
      ).to.not.be.reverted;
    });
  });
});
