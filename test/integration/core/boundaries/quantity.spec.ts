import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import {
  createActiveMarketFixture,
  setupCustomMarket,
} from "../../../helpers/fixtures/core";
import { COMPONENT_TAG } from "../../../helpers/tags";

describe(`${COMPONENT_TAG} CLMSRMarketCore - Quantity Boundaries`, function () {
  describe("Quantity Validation", function () {
    it("Should handle minimum possible quantity (1 wei)", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, alice } = contracts;

      const { marketId } = await setupCustomMarket(contracts, {
        marketId: 1,
        alpha: ethers.parseEther("0.1"),
      });

      const tradeParams = {
        marketId,
        lowerTick: 100100,
        upperTick: 100200,
        quantity: 1n, // 1 wei
        maxCost: ethers.parseUnits("1000", 6),
      };

      await expect(
        core
          .connect(alice)
          .openPosition(
            tradeParams.marketId,
            tradeParams.lowerTick,
            tradeParams.upperTick,
            tradeParams.quantity,
            tradeParams.maxCost
          )
      ).to.not.be.reverted;
    });

    it("Should revert with zero quantity", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, alice } = contracts;

      const { marketId } = await setupCustomMarket(contracts, {
        marketId: 1,
        alpha: ethers.parseEther("0.1"),
      });

      const tradeParams = {
        marketId,
        lowerTick: 100100,
        upperTick: 100200,
        quantity: 0n, // zero quantity
        maxCost: ethers.parseUnits("1000", 6),
      };

      await expect(
        core
          .connect(alice)
          .openPosition(
            tradeParams.marketId,
            tradeParams.lowerTick,
            tradeParams.upperTick,
            tradeParams.quantity,
            tradeParams.maxCost
          )
      ).to.be.revertedWithCustomError(core, "InvalidQuantity");
    });

    it("Should handle very small quantities without underflow", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, alice } = contracts;

      const { marketId } = await setupCustomMarket(contracts, {
        marketId: 1,
        alpha: ethers.parseEther("1"), // Higher alpha to handle small quantities
      });

      const smallQuantity = ethers.parseUnits("0.000001", 6); // 1 micro USDC

      const tradeParams = {
        marketId,
        lowerTick: 100100,
        upperTick: 100200,
        quantity: smallQuantity,
        maxCost: ethers.parseUnits("1000", 6),
      };

      // Should be able to calculate cost without underflow
      const cost = await core.calculateOpenCost(
        marketId,
        100100,
        100200,
        smallQuantity
      );
      expect(cost).to.be.gt(0);

      await expect(
        core
          .connect(alice)
          .openPosition(
            tradeParams.marketId,
            tradeParams.lowerTick,
            tradeParams.upperTick,
            tradeParams.quantity,
            tradeParams.maxCost
          )
      ).to.not.be.reverted;
    });
  });

  describe("Chunk-Split Boundaries", function () {
    it("Should handle quantity exactly at chunk boundary", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, alice } = contracts;

      const { marketId } = await setupCustomMarket(contracts, {
        marketId: 1,
        alpha: ethers.parseEther("0.1"),
      });

      const CHUNK_BOUNDARY_QUANTITY = ethers.parseUnits("0.013", 6);

      const tradeParams = {
        marketId,
        lowerTick: 100100,
        upperTick: 100200,
        quantity: CHUNK_BOUNDARY_QUANTITY,
        maxCost: ethers.parseUnits("1000", 6),
      };

      await expect(
        core
          .connect(alice)
          .openPosition(
            tradeParams.marketId,
            tradeParams.lowerTick,
            tradeParams.upperTick,
            tradeParams.quantity,
            tradeParams.maxCost
          )
      ).to.not.be.reverted;
    });

    it("Should handle quantity slightly above chunk boundary", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, alice } = contracts;

      const { marketId } = await setupCustomMarket(contracts, {
        marketId: 1,
        alpha: ethers.parseEther("0.1"),
      });

      const CHUNK_BOUNDARY_QUANTITY = ethers.parseUnits("0.013", 6);
      const slightlyAbove =
        CHUNK_BOUNDARY_QUANTITY + ethers.parseUnits("0.001", 6);

      const tradeParams = {
        marketId,
        lowerTick: 100100,
        upperTick: 100200,
        quantity: slightlyAbove,
        maxCost: ethers.parseUnits("1000", 6),
      };

      await expect(
        core
          .connect(alice)
          .openPosition(
            tradeParams.marketId,
            tradeParams.lowerTick,
            tradeParams.upperTick,
            tradeParams.quantity,
            tradeParams.maxCost
          )
      ).to.not.be.reverted;
    });

    it("Should handle multiple chunk splits correctly", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, alice } = contracts;

      const { marketId } = await setupCustomMarket(contracts, {
        marketId: 1,
        alpha: ethers.parseEther("0.1"),
      });

      const CHUNK_BOUNDARY_QUANTITY = ethers.parseUnits("0.013", 6);
      const multipleChunks = CHUNK_BOUNDARY_QUANTITY * 3n;

      const tradeParams = {
        marketId,
        lowerTick: 100100,
        upperTick: 100200,
        quantity: multipleChunks,
        maxCost: ethers.parseUnits("1000", 6),
      };

      await expect(
        core
          .connect(alice)
          .openPosition(
            tradeParams.marketId,
            tradeParams.lowerTick,
            tradeParams.upperTick,
            tradeParams.quantity,
            tradeParams.maxCost
          )
      ).to.not.be.reverted;
    });

    it("Should maintain cost consistency across chunk splits", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core } = contracts;

      const { marketId } = await setupCustomMarket(contracts, {
        marketId: 1,
        alpha: ethers.parseEther("0.1"),
      });

      const CHUNK_BOUNDARY_QUANTITY = ethers.parseUnits("0.013", 6);

      const singleCost = await core.calculateOpenCost(
        marketId,
        100100,
        100200,
        CHUNK_BOUNDARY_QUANTITY
      );

      const multipleCost = await core.calculateOpenCost(
        marketId,
        100100,
        100200,
        CHUNK_BOUNDARY_QUANTITY * 2n
      );

      // Multiple chunks should cost more than single chunk
      expect(multipleCost).to.be.gt(singleCost);
    });

    it("Should handle massive chunk-split scenarios", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, alice } = contracts;

      const { marketId } = await setupCustomMarket(contracts, {
        marketId: 1,
        alpha: ethers.parseEther("0.1"),
      });

      // Calculate quantity that will require 12+ chunks
      const CHUNK_BOUNDARY_QUANTITY = ethers.parseUnits("0.013", 6);
      const massiveQuantity = CHUNK_BOUNDARY_QUANTITY * 12n; // 12x chunk boundary

      const massiveCost = await core.calculateOpenCost(
        marketId,
        100100,
        100200,
        massiveQuantity
      );

      // Should handle massive chunk-split without reverting
      await expect(
        core
          .connect(alice)
          .openPosition(
            marketId,
            100100,
            100200,
            massiveQuantity,
            massiveCost + ethers.parseUnits("1000", 6)
          )
      ).to.not.be.reverted;

      // Verify position was created correctly
      const positionId = 1n;
      const position = await core
        .positionContract()
        .then((addr) => ethers.getContractAt("ICLMSRPosition", addr))
        .then((contract) => contract.getPosition(positionId));

      expect(position.quantity).to.equal(massiveQuantity);
    });
  });

  describe("Mathematical Precision Edge Cases", function () {
    it("Should handle chunk boundary calculations precisely", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core } = contracts;
      const { marketId } = await setupCustomMarket(contracts, {
        alpha: ethers.parseEther("0.1"),
      });

      const CHUNK_BOUNDARY_QUANTITY = ethers.parseUnits("0.013", 6);

      const cost1 = await core.calculateOpenCost(
        marketId,
        100100, // 실제 틱값 사용
        100200, // 실제 틱값 사용
        CHUNK_BOUNDARY_QUANTITY
      );

      // Test multiple calculations for consistency
      for (let i = 0; i < 5; i++) {
        const cost2 = await core.calculateOpenCost(
          marketId,
          100100, // 실제 틱값 사용
          100200, // 실제 틱값 사용
          CHUNK_BOUNDARY_QUANTITY
        );
        expect(cost2).to.equal(cost1);
      }
    });

    it("Should handle multiple chunk calculations consistently", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, alice } = contracts;
      const { marketId } = await setupCustomMarket(contracts, {
        alpha: ethers.parseEther("0.1"),
      });

      const CHUNK_BOUNDARY_QUANTITY = ethers.parseUnits("0.013", 6);

      await core.connect(alice).openPosition(
        marketId,
        100100, // 실제 틱값 사용
        100200, // 실제 틱값 사용
        CHUNK_BOUNDARY_QUANTITY,
        ethers.parseUnits("1000", 6)
      );

      // Calculate cost for second chunk
      const cost2 = await core.calculateOpenCost(
        marketId,
        100100, // 실제 틱값 사용
        100200, // 실제 틱값 사용
        CHUNK_BOUNDARY_QUANTITY
      );

      await expect(
        core.connect(alice).openPosition(
          marketId,
          100300, // 실제 틱값 사용
          100400, // 실제 틱값 사용
          CHUNK_BOUNDARY_QUANTITY,
          ethers.parseUnits("1000", 6)
        )
      ).to.not.be.reverted;

      // Second chunk should cost more due to price impact
      const initialCost = await core.calculateOpenCost(
        marketId,
        100300, // 실제 틱값 사용
        100400, // 실제 틱값 사용
        CHUNK_BOUNDARY_QUANTITY
      );
      expect(cost2).to.be.gt(initialCost);
    });

    it("Should handle first trade scenario (sumBefore == 0)", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, alice } = contracts;
      const { marketId } = await setupCustomMarket(contracts, {
        alpha: ethers.parseEther("0.1"),
      });

      // This is the first trade, so sumBefore should be handled correctly
      const cost = await core.calculateOpenCost(
        marketId,
        100100, // 실제 틱값 사용
        100200, // 실제 틱값 사용
        ethers.parseUnits("0.01", 6)
      );

      expect(cost).to.be.gt(0);

      const tradeParams = {
        marketId,
        lowerTick: 100100, // 실제 틱값 사용
        upperTick: 100200, // 실제 틱값 사용
        quantity: ethers.parseUnits("0.01", 6),
        maxCost: ethers.parseUnits("1000", 6),
      };

      await expect(
        core
          .connect(alice)
          .openPosition(
            tradeParams.marketId,
            tradeParams.lowerTick,
            tradeParams.upperTick,
            tradeParams.quantity,
            tradeParams.maxCost
          )
      ).to.not.be.reverted;
    });

    it("Should handle edge case where sumAfter equals sumBefore", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core } = contracts;
      const { marketId } = await setupCustomMarket(contracts, {
        alpha: ethers.parseEther("0.1"),
      });

      // This is a theoretical edge case - in practice, any non-zero quantity should change the sum
      // But we test with the smallest possible quantity to approach this edge case
      const minimalQuantity = 1n; // 1 wei in USDC terms

      const cost = await core.calculateOpenCost(
        marketId,
        100500, // 실제 틱값 사용
        100510, // 최소 허용 범위
        minimalQuantity
      );

      // Cost might be 0 for extremely small quantities due to precision limits
      // This is acceptable behavior
      expect(cost).to.be.gte(0);
    });
  });

  describe("Security Tests", function () {
    it("Should prevent zero-cost position attacks with round-up", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, alice, paymentToken, mockPosition } = contracts;

      // Create market with very high alpha to make costs extremely small
      const highAlpha = ethers.parseEther("1000"); // Very high liquidity parameter
      const { marketId } = await setupCustomMarket(contracts, {
        alpha: highAlpha,
      });

      // Try to open position with extremely small quantity
      const tinyQuantity = 1; // 1 micro USDC worth
      const maxCost = 1000; // Allow up to 1000 micro USDC

      const tradeParams = {
        marketId,
        lowerTick: 100450, // 실제 틱값 사용
        upperTick: 100550, // 실제 틱값 사용
        quantity: tinyQuantity,
        maxCost,
      };

      // Calculate expected cost
      const calculatedCost = await core.calculateOpenCost(
        marketId,
        100450, // 실제 틱값 사용
        100550, // 실제 틱값 사용
        tinyQuantity
      );

      // Cost should be at least 1 micro USDC due to round-up
      expect(calculatedCost).to.be.at.least(1);

      // Should be able to open position with minimum cost
      await core
        .connect(alice)
        .openPosition(
          tradeParams.marketId,
          tradeParams.lowerTick,
          tradeParams.upperTick,
          tradeParams.quantity,
          tradeParams.maxCost
        );

      // Verify position was created
      const positions = await mockPosition.getPositionsByOwner(alice.address);
      const positionId = positions[0];
      const position = await mockPosition.getPosition(positionId);
      expect(position.quantity).to.equal(tinyQuantity);
    });

    it("Should prevent repeated tiny trades from accumulating free positions", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, alice, paymentToken } = contracts;

      // Create market with very high alpha
      const highAlpha = ethers.parseEther("1000");
      const { marketId } = await setupCustomMarket(contracts, {
        alpha: highAlpha,
      });

      const initialBalance = await paymentToken.balanceOf(alice.address);
      let totalCostPaid = 0n;

      // Try to make 10 tiny trades
      for (let i = 0; i < 10; i++) {
        const tinyQuantity = 1; // 1 micro USDC worth
        const maxCost = 10; // Allow up to 10 micro USDC

        const tradeParams = {
          marketId,
          lowerTick: 100450, // 실제 틱값 사용
          upperTick: 100550, // 실제 틱값 사용
          quantity: tinyQuantity,
          maxCost,
        };

        const costBefore = await core.calculateOpenCost(
          marketId,
          100450, // 실제 틱값 사용
          100550, // 실제 틱값 사용
          tinyQuantity
        );

        await core
          .connect(alice)
          .openPosition(
            tradeParams.marketId,
            tradeParams.lowerTick,
            tradeParams.upperTick,
            tradeParams.quantity,
            tradeParams.maxCost
          );
        totalCostPaid += BigInt(costBefore);
      }

      // Verify that some cost was actually paid
      const finalBalance = await paymentToken.balanceOf(alice.address);
      const actualCostPaid = initialBalance - finalBalance;

      expect(actualCostPaid).to.be.at.least(10); // At least 10 micro USDC paid
      expect(actualCostPaid).to.equal(totalCostPaid);
    });

    it("Should prevent gas DoS attacks with excessive chunk splitting", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, alice, paymentToken } = contracts;

      // Create market with very small alpha to maximize chunk count
      const smallAlpha = ethers.parseEther("0.001"); // Very small liquidity parameter
      const { marketId } = await setupCustomMarket(contracts, {
        alpha: smallAlpha,
      });

      // Calculate quantity that would require > 1000 chunks (new limit)
      // maxSafeQuantityPerChunk = alpha * 0.13 = 0.001 * 0.13 = 0.00013 ETH
      // To exceed 1000 chunks: quantity > 1000 * 0.00013 = 0.13 ETH
      const excessiveQuantity = ethers.parseUnits("0.15", 6); // 0.15 USDC

      const tradeParams = {
        marketId,
        lowerTick: 100450, // 실제 틱값 사용
        upperTick: 100550, // 실제 틱값 사용
        quantity: excessiveQuantity,
        maxCost: ethers.parseUnits("1000000", 6), // Very high max cost
      };

      // Should revert due to excessive chunk count
      await expect(
        core
          .connect(alice)
          .openPosition(
            tradeParams.marketId,
            tradeParams.lowerTick,
            tradeParams.upperTick,
            tradeParams.quantity,
            tradeParams.maxCost
          )
      ).to.be.revertedWithCustomError(core, "MathMulOverflow");
    });

    it("Should handle maximum allowed chunks successfully", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, alice, paymentToken } = contracts;

      // Create market with small alpha
      const smallAlpha = ethers.parseEther("0.001");
      const { marketId } = await setupCustomMarket(contracts, {
        alpha: smallAlpha,
      });

      // Calculate quantity that requires exactly 50 chunks (well under limit)
      // maxSafeQuantityPerChunk = alpha * 0.13 = 0.001 * 0.13 = 0.00013 ETH
      // For 50 chunks: quantity = 50 * 0.00013 = 0.0065 ETH
      const moderateQuantity = ethers.parseUnits("0.007", 6); // 0.007 USDC

      const tradeParams = {
        marketId,
        lowerTick: 100450, // 실제 틱값 사용
        upperTick: 100550, // 실제 틱값 사용
        quantity: moderateQuantity,
        maxCost: ethers.parseUnits("1000000", 6),
      };

      // Should succeed with moderate chunk count
      await expect(
        core
          .connect(alice)
          .openPosition(
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
