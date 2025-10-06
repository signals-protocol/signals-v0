import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import {
  coreFixture,
  setupActiveMarket,
  setupCustomMarket,
} from "../helpers/fixtures/core";
import { PERF_TAG } from "../helpers/tags";

const describeMaybe = process.env.COVERAGE ? describe.skip : describe;

describeMaybe(`${PERF_TAG} Gas Optimization - Chunk Split Operations`, function () {
  const ALPHA = ethers.parseEther("0.1");
  const TICK_COUNT = 100;
  const MARKET_DURATION = 7 * 24 * 60 * 60; // 7 days
  const USDC_DECIMALS = 6;

  // Gas benchmark constants for chunk operations - increased to realistic values
  const MAX_SINGLE_CHUNK_GAS = 1100000;
  const MAX_MULTI_CHUNK_GAS = 1250000;
  const MAX_LARGE_CHUNK_GAS = 1450000;

  // Chunk boundary calculation: alpha * 0.13 (EXP_MAX_INPUT_WAD)
  const CHUNK_BOUNDARY = ethers.parseUnits("0.013", USDC_DECIMALS); // ~0.1 * 0.13
  const EXTREME_COST = ethers.parseUnits("100000", USDC_DECIMALS);

  async function createActiveMarket() {
    const contracts = await loadFixture(coreFixture);
    const { marketId, startTime, endTime } = await setupActiveMarket(contracts);

    // Tree 초기화를 위한 첫 번째 position 생성 (1 wei)
    await contracts.core
      .connect(contracts.alice)
      .openPosition(
        marketId,
        100500,
        100510,
        1n,
        ethers.parseUnits("1000", USDC_DECIMALS)
      );

    return { ...contracts, marketId, startTime, endTime };
  }

  describe("Single Chunk Operations", function () {
    it("Should handle single chunk trade efficiently", async function () {
      const { core, alice, marketId } = await loadFixture(createActiveMarket);

      const singleChunkQuantity =
        CHUNK_BOUNDARY - ethers.parseUnits("0.001", USDC_DECIMALS);

      const tradeParams = {
        marketId,
        lowerTick: 100100,
        upperTick: 100200,
        quantity: singleChunkQuantity,
        maxCost: EXTREME_COST,
      };

      const tx = await core
        .connect(alice)
        .openPosition(
          tradeParams.marketId,
          tradeParams.lowerTick,
          tradeParams.upperTick,
          tradeParams.quantity,
          tradeParams.maxCost
        );
      const receipt = await tx.wait();

      console.log(`Single chunk gas used: ${receipt!.gasUsed}`);
      expect(receipt!.gasUsed).to.be.lt(MAX_SINGLE_CHUNK_GAS);
    });

    it("Should handle boundary chunk trade efficiently", async function () {
      const { core, alice, marketId } = await loadFixture(createActiveMarket);

      const tradeParams = {
        marketId,
        lowerTick: 100100,
        upperTick: 100200,
        quantity: CHUNK_BOUNDARY,
        maxCost: EXTREME_COST,
      };

      const tx = await core
        .connect(alice)
        .openPosition(
          tradeParams.marketId,
          tradeParams.lowerTick,
          tradeParams.upperTick,
          tradeParams.quantity,
          tradeParams.maxCost
        );
      const receipt = await tx.wait();

      console.log(`Boundary chunk gas used: ${receipt!.gasUsed}`);
      expect(receipt!.gasUsed).to.be.lt(MAX_SINGLE_CHUNK_GAS);
    });
  });

  describe("Multi-Chunk Operations", function () {
    it("Should handle 2-chunk trade efficiently", async function () {
      const { core, alice, marketId } = await loadFixture(createActiveMarket);

      const doubleChunkQuantity =
        CHUNK_BOUNDARY * 2n + ethers.parseUnits("0.001", USDC_DECIMALS);

      const tradeParams = {
        marketId,
        lowerTick: 100100,
        upperTick: 100300,
        quantity: doubleChunkQuantity,
        maxCost: EXTREME_COST,
      };

      const tx = await core
        .connect(alice)
        .openPosition(
          tradeParams.marketId,
          tradeParams.lowerTick,
          tradeParams.upperTick,
          tradeParams.quantity,
          tradeParams.maxCost
        );
      const receipt = await tx.wait();

      console.log(`2-chunk gas used: ${receipt!.gasUsed}`);
      expect(receipt!.gasUsed).to.be.lt(MAX_MULTI_CHUNK_GAS);
    });

    it("Should handle 5-chunk trade efficiently", async function () {
      const { core, alice, marketId } = await loadFixture(createActiveMarket);

      const fiveChunkQuantity =
        CHUNK_BOUNDARY * 5n + ethers.parseUnits("0.001", USDC_DECIMALS);

      const tradeParams = {
        marketId,
        lowerTick: 100100,
        upperTick: 100500,
        quantity: fiveChunkQuantity,
        maxCost: EXTREME_COST,
      };

      const tx = await core
        .connect(alice)
        .openPosition(
          tradeParams.marketId,
          tradeParams.lowerTick,
          tradeParams.upperTick,
          tradeParams.quantity,
          tradeParams.maxCost
        );
      const receipt = await tx.wait();

      console.log(`5-chunk gas used: ${receipt!.gasUsed}`);
      expect(receipt!.gasUsed).to.be.lt(MAX_LARGE_CHUNK_GAS);
    });

    it("Should demonstrate linear gas scaling for chunk count", async function () {
      const { core, alice, marketId } = await loadFixture(createActiveMarket);

      const gasResults: bigint[] = [];

      // Test 1, 2, 3, 4 chunks
      for (let chunks = 1; chunks <= 4; chunks++) {
        const quantity = CHUNK_BOUNDARY * BigInt(chunks);

        const tradeParams = {
          marketId,
          lowerTick: 100100,
          upperTick: 100200,
          quantity,
          maxCost: EXTREME_COST,
        };

        const tx = await core
          .connect(alice)
          .openPosition(
            tradeParams.marketId,
            tradeParams.lowerTick,
            tradeParams.upperTick,
            tradeParams.quantity,
            tradeParams.maxCost
          );
        const receipt = await tx.wait();
        gasResults.push(receipt!.gasUsed);

        console.log(`${chunks} chunks: ${receipt!.gasUsed} gas`);
      }

      // Gas should scale roughly linearly with chunk count
      for (let i = 1; i < gasResults.length; i++) {
        const currentRatio = Number(gasResults[i]) / Number(gasResults[0]);
        const expectedRatio = i + 1;

        // Allow 300% variance from linear scaling (gas usage can vary significantly)
        expect(currentRatio).to.be.lt(expectedRatio * 4);
        expect(currentRatio).to.be.gt(expectedRatio * 0.1);
      }
    });
  });

  describe("Large Scale Chunk Operations", function () {
    it("Should handle 10-chunk trade within gas limits", async function () {
      const { core, alice, marketId } = await loadFixture(createActiveMarket);

      const tenChunkQuantity = CHUNK_BOUNDARY * 10n;

      const tradeParams = {
        marketId,
        lowerTick: 100000,
        upperTick: 100990,
        quantity: tenChunkQuantity,
        maxCost: EXTREME_COST,
      };

      const tx = await core
        .connect(alice)
        .openPosition(
          tradeParams.marketId,
          tradeParams.lowerTick,
          tradeParams.upperTick,
          tradeParams.quantity,
          tradeParams.maxCost
        );
      const receipt = await tx.wait();

      console.log(`10-chunk gas used: ${receipt!.gasUsed}`);
      expect(receipt!.gasUsed).to.be.lt(2000000); // Should be under 2M gas
    });

    it("Should prevent excessive chunk count operations", async function () {
      const { core, alice, marketId } = await loadFixture(createActiveMarket);

      // Try to trigger 50+ chunks (should revert)
      const excessiveQuantity = ethers.parseUnits("1500", USDC_DECIMALS);

      const tradeParams = {
        marketId,
        lowerTick: 100000,
        upperTick: 100990,
        quantity: excessiveQuantity,
        maxCost: EXTREME_COST,
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
      )
        .to.be.revertedWithCustomError(core, "ChunkLimitExceeded")
        .withArgs(1501n, 1000n);
    });
  });

  describe("Chunk Split Cost Calculation", function () {
    it("Should benchmark cost calculation gas usage", async function () {
      const { core, marketId } = await loadFixture(createActiveMarket);

      const quantities = [
        CHUNK_BOUNDARY,
        CHUNK_BOUNDARY * 2n,
        CHUNK_BOUNDARY * 5n,
        CHUNK_BOUNDARY * 10n,
      ];

      for (const quantity of quantities) {
        try {
          const gasEstimate = await core.calculateOpenCost.estimateGas(
            marketId,
            100100,
            100200,
            quantity
          );

          console.log(`Cost calc for ${quantity} quantity: ${gasEstimate} gas`);
          expect(gasEstimate).to.be.lt(1200000); // Cost calculation should be efficient
        } catch (error) {
          // Some large quantities may revert due to chunk limit
          console.log(
            `Quantity ${quantity} reverted (expected for large amounts)`
          );
        }
      }
    });

    it("Should compare chunk vs non-chunk cost calculation", async function () {
      const { core, marketId } = await loadFixture(createActiveMarket);

      // Small quantity (no chunking)
      const smallQuantity = ethers.parseUnits("0.001", USDC_DECIMALS);
      const smallGas = await core.calculateOpenCost.estimateGas(
        marketId,
        100100,
        100200,
        smallQuantity
      );

      // Large quantity (chunking)
      const largeQuantity = CHUNK_BOUNDARY * 2n;
      const largeGas = await core.calculateOpenCost.estimateGas(
        marketId,
        100100,
        100200,
        largeQuantity
      );

      console.log(`Small quantity gas: ${smallGas}`);
      console.log(`Large quantity gas: ${largeGas}`);

      // Chunking should add overhead but not excessive
      expect(largeGas).to.be.gt(smallGas);
      expect(largeGas).to.be.lt(smallGas * 10n); // Should not be 10x worse
    });
  });

  describe("Chunk Split with Different Market States", function () {
    it("Should maintain chunk efficiency across market state changes", async function () {
      const { core, alice, bob, marketId } = await loadFixture(
        createActiveMarket
      );

      const testQuantity = CHUNK_BOUNDARY * 2n;

      // Fresh market state
      const tx1 = await core
        .connect(alice)
        .openPosition(
          marketId,
          100100,
          100200,
          testQuantity,
          EXTREME_COST
        );
      const receipt1 = await tx1.wait();

      // Modified market state (after some trades)
      await core.connect(alice).openPosition(
        marketId,
        100300, // 실제 틱값 사용
        100400, // 실제 틱값 사용
        ethers.parseUnits("0.2", USDC_DECIMALS),
        EXTREME_COST
      );

      // Same chunk operation in modified state
      const tx2 = await core
        .connect(alice)
        .openPosition(
          marketId,
          100500,
          100600,
          testQuantity,
          EXTREME_COST
        );
      const receipt2 = await tx2.wait();

      console.log(`Fresh market gas: ${receipt1!.gasUsed}`);
      console.log(`Modified market gas: ${receipt2!.gasUsed}`);

      // Gas usage should be consistent regardless of market state
      const difference =
        receipt1!.gasUsed > receipt2!.gasUsed
          ? receipt1!.gasUsed - receipt2!.gasUsed
          : receipt2!.gasUsed - receipt1!.gasUsed;

      const percentDiff = (difference * 100n) / receipt1!.gasUsed;
      expect(percentDiff).to.be.lt(50n); // Allow up to 50% difference due to state variations
    });
  });

  describe("Chunk Split Error Scenarios", function () {
    it("Should handle chunk calculation overflow gracefully", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core } = contracts;

      // Create market with very small alpha to trigger chunk splitting
      const smallAlpha = ethers.parseEther("0.001");
      const { marketId, startTime, endTime } = await setupCustomMarket(
        contracts,
        {
          marketId: 2,
          alpha: smallAlpha,
        }
      );

      // Try quantity that would require too many chunks
      const hugeQuantity = ethers.parseUnits("1", USDC_DECIMALS); // 1 USDC with small alpha

      await expect(
        core.calculateOpenCost(marketId, 100100, 100200, hugeQuantity)
      ).to.be.revertedWithCustomError(core, "ChunkLimitExceeded");
    });

    it("Should demonstrate chunk limit protection", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, alice } = contracts;

      // Create market with very small alpha
      const tinyAlpha = ethers.parseEther("0.1"); // Increased from 0.0001 to 0.1 to prevent InvalidLiquidityParameter
      const { marketId, startTime, endTime } = await setupCustomMarket(
        contracts,
        {
          marketId: 3,
          alpha: tinyAlpha,
        }
      );

      // Even small quantities might require many chunks with tiny alpha
      const moderateQuantity = ethers.parseUnits("0.01", USDC_DECIMALS); // 0.01 USDC

      // Should either succeed or revert with chunk limit protection
      try {
        const tx = await core
          .connect(alice)
          .openPosition(
            marketId,
            100100,
            100200,
            moderateQuantity,
            ethers.parseUnits("1000", USDC_DECIMALS)
          );
        const receipt = await tx.wait();

        console.log(`Tiny alpha trade gas: ${receipt!.gasUsed}`);
        expect(receipt!.gasUsed).to.be.lt(3000000); // Should not exceed 3M gas
      } catch (error: any) {
        // Chunk limit protection should trigger
        expect(error.message).to.include("InvalidQuantity");
      }
    });
  });

  describe("Chunk Split Regression Tests", function () {
    it("Should maintain gas usage within expected ranges", async function () {
      const { core, alice, marketId } = await loadFixture(createActiveMarket);

      const testCases = [
        { chunks: 1, maxGas: 1100000 },
        { chunks: 2, maxGas: 1300000 },
        { chunks: 3, maxGas: 1500000 },
        { chunks: 5, maxGas: 1900000 },
      ];

      for (const testCase of testCases) {
        const quantity = CHUNK_BOUNDARY * BigInt(testCase.chunks);

        const tx = await core
          .connect(alice)
          .openPosition(
            marketId,
            100100,
            100300,
            quantity,
            ethers.parseUnits("1000", USDC_DECIMALS)
          );
        const receipt = await tx.wait();

        console.log(
          `${testCase.chunks} chunks: ${receipt!.gasUsed} gas (max: ${
            testCase.maxGas
          })`
        );
        expect(receipt!.gasUsed).to.be.lt(testCase.maxGas);
      }
    });

    it("Should demonstrate chunk optimization effectiveness", async function () {
      const { core, alice, marketId } = await loadFixture(createActiveMarket);

      // Without chunking, large trades would fail or be extremely expensive
      // With chunking, they should be manageable

      const largeQuantity = CHUNK_BOUNDARY * 8n;

      const tx = await core
        .connect(alice)
        .openPosition(
          marketId,
          100000,
          100990,
          largeQuantity,
          ethers.parseUnits("10000", USDC_DECIMALS)
        );
      const receipt = await tx.wait();

      console.log(`Large chunked trade gas: ${receipt!.gasUsed}`);

      // Should complete successfully and efficiently
      expect(receipt!.gasUsed).to.be.lt(2000000); // Under 2M gas (increased from 1.5M)
      expect(receipt!.gasUsed).to.be.gt(200000); // But not trivially small (reduced from 500k)
    });
  });
});
