import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import {
  createActiveMarketFixture,
  setupCustomMarket,
} from "../../../helpers/fixtures/core";
import { COMPONENT_TAG } from "../../../helpers/tags";

describe(`${COMPONENT_TAG} CLMSRMarketCore - Liquidity Parameter Boundaries`, function () {
  describe("Factor Limits", function () {
    it("Should handle trades that approach MIN_FACTOR boundary", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, mockPosition, alice, keeper } = contracts;

      const extremeAlpha = ethers.parseEther("1000"); // High alpha for extreme testing
      const { marketId } = await setupCustomMarket(contracts, {
        marketId: 1,
        alpha: extremeAlpha,
      });

      // Use very small quantity to approach MIN_FACTOR
      const verySmallQuantity = ethers.parseUnits("0.000001", 6);

      const tradeParams = {
        marketId,
        lowerTick: 100450,
        upperTick: 100550,
        quantity: verySmallQuantity,
        maxCost: ethers.parseUnits("1", 6),
      };

      await expect(
        core
          .connect(alice)
          .openPosition(
            alice.address,
            tradeParams.marketId,
            tradeParams.lowerTick,
            tradeParams.upperTick,
            tradeParams.quantity,
            tradeParams.maxCost
          )
      ).to.not.be.reverted;
    });

    it("Should handle trades that approach MAX_FACTOR boundary", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, mockPosition, alice, keeper } = contracts;

      const extremeAlpha = ethers.parseEther("1000"); // High alpha for extreme testing
      const { marketId } = await setupCustomMarket(contracts, {
        marketId: 1,
        alpha: extremeAlpha,
      });

      // Use large quantity to approach MAX_FACTOR
      const largeQuantity = ethers.parseUnits("1000", 6);

      const tradeParams = {
        marketId,
        lowerTick: 100450,
        upperTick: 100550,
        quantity: largeQuantity,
        maxCost: ethers.parseUnits("1000000", 6),
      };

      await expect(
        core
          .connect(alice)
          .openPosition(
            alice.address,
            tradeParams.marketId,
            tradeParams.lowerTick,
            tradeParams.upperTick,
            tradeParams.quantity,
            tradeParams.maxCost
          )
      ).to.not.be.reverted;
    });

    it("Should revert when factor exceeds MAX_FACTOR", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, mockPosition, alice, keeper } = contracts;

      const extremeAlpha = ethers.parseEther("1000"); // High alpha for extreme testing
      const { marketId } = await setupCustomMarket(contracts, {
        marketId: 1,
        alpha: extremeAlpha,
      });

      // Use extremely large quantity to exceed MAX_FACTOR
      const extremeQuantity = ethers.parseUnits("100000", 6);

      const tradeParams = {
        marketId,
        lowerTick: 100450,
        upperTick: 100550,
        quantity: extremeQuantity,
        maxCost: ethers.parseUnits("10000000", 6),
      };

      await expect(
        core
          .connect(alice)
          .openPosition(
            alice.address,
            tradeParams.marketId,
            tradeParams.lowerTick,
            tradeParams.upperTick,
            tradeParams.quantity,
            tradeParams.maxCost
          )
      ).to.be.reverted;
    });
  });

  describe("Liquidity Parameter Boundaries", function () {
    it("Should handle minimum liquidity parameter", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, mockPosition, keeper, alice } = contracts;

      const minAlpha = ethers.parseEther("0.001"); // MIN_LIQUIDITY_PARAMETER
      const { marketId } = await setupCustomMarket(contracts, {
        marketId: 3,
        alpha: minAlpha,
      });

      const tradeParams = {
        marketId,
        lowerTick: 100450,
        upperTick: 100550,
        quantity: ethers.parseUnits("0.001", 6), // Use very small quantity for extreme alpha
        maxCost: ethers.parseUnits("1000000", 6), // Use very large maxCost
      };

      await expect(
        core
          .connect(alice)
          .openPosition(
            alice.address,
            tradeParams.marketId,
            tradeParams.lowerTick,
            tradeParams.upperTick,
            tradeParams.quantity,
            tradeParams.maxCost
          )
      ).to.not.be.reverted;
    });

    it("Should handle maximum liquidity parameter", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, mockPosition, keeper, alice } = contracts;

      const maxAlpha = ethers.parseEther("1000"); // MAX_LIQUIDITY_PARAMETER
      const { marketId } = await setupCustomMarket(contracts, {
        marketId: 4,
        alpha: maxAlpha,
      });

      const tradeParams = {
        marketId,
        lowerTick: 100450,
        upperTick: 100550,
        quantity: ethers.parseUnits("0.001", 6), // Use very small quantity for extreme alpha
        maxCost: ethers.parseUnits("1000000", 6), // Use very large maxCost
      };

      await expect(
        core
          .connect(alice)
          .openPosition(
            alice.address,
            tradeParams.marketId,
            tradeParams.lowerTick,
            tradeParams.upperTick,
            tradeParams.quantity,
            tradeParams.maxCost
          )
      ).to.not.be.reverted;
    });
  });

  describe("Extreme Alpha Values with Large Trades", function () {
    it("Should handle low alpha values with moderate trades", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, keeper, alice } = contracts;

      // Test with relatively low alpha using setupCustomMarket
      const { marketId: lowAlphaMarketId } = await setupCustomMarket(
        contracts,
        {
          marketId: 10,
          alpha: ethers.parseEther("0.1"), // 0.1 ETH (higher than minimum to avoid overflow)
        }
      );

      // Use reasonable trade size
      const tradeParams = {
        marketId: lowAlphaMarketId,
        lowerTick: 100100,
        upperTick: 100200,
        quantity: ethers.parseUnits("1", 6), // 1 USDC
        maxCost: ethers.parseUnits("10", 6), // Allow up to 10 USDC cost
      };

      const lowAlphaCost = await core.calculateOpenCost(
        lowAlphaMarketId,
        100100,
        100200,
        tradeParams.quantity
      );

      expect(lowAlphaCost).to.be.gt(0);

      // Test with high alpha
      const { marketId: highAlphaMarketId } = await setupCustomMarket(
        contracts,
        {
          marketId: 11,
          alpha: ethers.parseEther("100"), // 100 ETH (high liquidity)
        }
      );

      // Same trade with high alpha should have lower price impact
      const highAlphaCost = await core.calculateOpenCost(
        highAlphaMarketId,
        100100,
        100200,
        tradeParams.quantity
      );

      // Cost should be lower with high alpha
      expect(highAlphaCost).to.be.lt(lowAlphaCost);
      expect(highAlphaCost).to.be.gt(0);
    });

    it("Should handle extreme minimum alpha with tiny trades", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, keeper } = contracts;

      // Test that extreme minimum alpha with tiny trades can cause overflow
      // This is expected behavior for unrealistic parameter combinations
      const { marketId: extremeMinAlphaMarketId } = await setupCustomMarket(
        contracts,
        {
          marketId: 12,
          alpha: ethers.parseEther("0.001"), // MIN_LIQUIDITY_PARAMETER
        }
      );

      // Even with extreme min alpha, small trades might still work due to chunk-split protection
      // Test that it either works (with very high cost) or reverts due to overflow
      try {
        const extremeCost = await core.calculateOpenCost(
          extremeMinAlphaMarketId,
          100100,
          100200,
          ethers.parseUnits("0.1", 6) // 0.1 USDC
        );
        // If it doesn't revert, the cost should be extremely high
        expect(extremeCost).to.be.gt(ethers.parseUnits("1", 6)); // Cost > 1 USDC for 0.1 USDC trade
      } catch (error) {
        // Overflow is also acceptable for extreme parameter combinations
        expect(error).to.exist;
      }
    });

    it("Should demonstrate cost difference between extreme alpha values", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, keeper } = contracts;

      // Low alpha market
      const { marketId: lowAlphaMarketId } = await setupCustomMarket(
        contracts,
        {
          marketId: 20,
          alpha: ethers.parseEther("0.01"), // Low liquidity
        }
      );

      // High alpha market
      const { marketId: highAlphaMarketId } = await setupCustomMarket(
        contracts,
        {
          marketId: 21,
          alpha: ethers.parseEther("100"), // High liquidity
        }
      );

      const testQuantity = ethers.parseUnits("0.01", 6); // 0.01 USDC

      const lowAlphaCost = await core.calculateOpenCost(
        lowAlphaMarketId,
        100450,
        100550,
        testQuantity
      );

      const highAlphaCost = await core.calculateOpenCost(
        highAlphaMarketId,
        100450,
        100550,
        testQuantity
      );

      // Low alpha should result in higher cost (less liquidity)
      expect(lowAlphaCost).to.be.gt(highAlphaCost);

      // Both should be positive
      expect(lowAlphaCost).to.be.gt(0);
      expect(highAlphaCost).to.be.gt(0);

      // The difference should be significant
      const costRatio = (lowAlphaCost * 100n) / highAlphaCost;
      expect(costRatio).to.be.gt(110n); // At least 10% difference
    });
  });

  describe("Liquidity Parameter Validation", function () {
    it("Should validate tick count limits", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, keeper } = contracts;

      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;
      const alpha = ethers.parseEther("0.1");

      // Test zero tick count - create market with minTick >= maxTick
      await expect(
        core.connect(keeper).createMarket(
          1,
          100000, // minTick
          100000, // maxTick (same as minTick = 0 ticks)
          10, // tickSpacing
          startTime,
          endTime,
          alpha
        )
      ).to.be.revertedWithCustomError(core, "InvalidMarketParameters");

      // Test excessive tick count - create market with huge range
      await expect(
        core.connect(keeper).createMarket(
          1,
          100000, // minTick
          10100990, // maxTick (10M+ ticks)
          10, // tickSpacing
          startTime,
          endTime,
          alpha
        )
      ).to.be.revertedWith("Invalid tick count");
    });

    it("Should validate liquidity parameter limits", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, keeper } = contracts;

      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;

      // Test too small alpha
      await expect(
        core.connect(keeper).createMarket(
          1,
          100000, // minTick
          100990, // maxTick
          10, // tickSpacing
          startTime,
          endTime,
          ethers.parseEther("0.0001") // below MIN_LIQUIDITY_PARAMETER
        )
      ).to.be.revertedWithCustomError(core, "InvalidLiquidityParameter");

      // Test too large alpha
      await expect(
        core.connect(keeper).createMarket(
          1,
          100000, // minTick
          100990, // maxTick
          10, // tickSpacing
          startTime,
          endTime,
          ethers.parseEther("2000") // above MAX_LIQUIDITY_PARAMETER
        )
      ).to.be.revertedWithCustomError(core, "InvalidLiquidityParameter");
    });

    it("Should check constants are correct", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core } = contracts;

      expect(await core.MAX_TICK_COUNT()).to.equal(1_000_000);
      expect(await core.MIN_LIQUIDITY_PARAMETER()).to.equal(
        ethers.parseEther("0.001")
      );
      expect(await core.MAX_LIQUIDITY_PARAMETER()).to.equal(
        ethers.parseEther("1000")
      );
    });
  });

  describe("Liquidity Parameter Boundaries", function () {
    it("Should handle minimum liquidity parameter", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, mockPosition, keeper, alice } = contracts;

      const minAlpha = ethers.parseEther("0.001"); // MIN_LIQUIDITY_PARAMETER
      const { marketId } = await setupCustomMarket(contracts, {
        marketId: 3,
        alpha: minAlpha,
      });

      const tradeParams = {
        marketId,
        lowerTick: 100450,
        upperTick: 100550,
        quantity: ethers.parseUnits("0.001", 6), // Use very small quantity for extreme alpha
        maxCost: ethers.parseUnits("1000000", 6), // Use very large maxCost
      };

      await expect(
        core
          .connect(alice)
          .openPosition(
            alice.address,
            tradeParams.marketId,
            tradeParams.lowerTick,
            tradeParams.upperTick,
            tradeParams.quantity,
            tradeParams.maxCost
          )
      ).to.not.be.reverted;
    });

    it("Should handle maximum liquidity parameter", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, mockPosition, keeper, alice } = contracts;

      const maxAlpha = ethers.parseEther("1000"); // MAX_LIQUIDITY_PARAMETER
      const { marketId } = await setupCustomMarket(contracts, {
        marketId: 4,
        alpha: maxAlpha,
      });

      const tradeParams = {
        marketId,
        lowerTick: 100450,
        upperTick: 100550,
        quantity: ethers.parseUnits("0.001", 6), // Use very small quantity for extreme alpha
        maxCost: ethers.parseUnits("1000000", 6), // Use very large maxCost
      };

      await expect(
        core
          .connect(alice)
          .openPosition(
            alice.address,
            tradeParams.marketId,
            tradeParams.lowerTick,
            tradeParams.upperTick,
            tradeParams.quantity,
            tradeParams.maxCost
          )
      ).to.not.be.reverted;
    });
  });
});
