import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { createActiveMarketFixture } from "../helpers/fixtures/core";
import { PERF_TAG } from "../helpers/tags";

describe(`${PERF_TAG} Gas Optimization - Position Operations`, function () {
  const USDC_DECIMALS = 6;
  const LARGE_QUANTITY = ethers.parseUnits("0.1", USDC_DECIMALS);
  const MEDIUM_QUANTITY = ethers.parseUnits("0.05", USDC_DECIMALS);
  const SMALL_QUANTITY = ethers.parseUnits("0.01", USDC_DECIMALS);
  const MEDIUM_COST = ethers.parseUnits("50", USDC_DECIMALS); // 50 USDC
  const LARGE_COST = ethers.parseUnits("500", USDC_DECIMALS); // 500 USDC
  const TICK_COUNT = 100;

  describe("Basic Position Operations", function () {
    it("Should create position efficiently", async function () {
      const { core, alice, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      const tx = await core
        .connect(alice)
        .openPosition(
          alice.address,
          marketId,
          100450,
          100550,
          MEDIUM_QUANTITY,
          MEDIUM_COST
        );

      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed;

      expect(gasUsed).to.be.lt(1500000); // Reasonable gas limit
      console.log(`Position creation gas usage: ${gasUsed}`);
    });

    it("Should scale gas usage reasonably with tick range", async function () {
      const { core, alice, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      const ranges = [
        { lower: 100450, upper: 100450 }, // 1 tick
        { lower: 100400, upper: 100600 }, // 21 ticks
        { lower: 100200, upper: 100800 }, // 61 ticks
      ];

      const gasUsages = [];

      for (const range of ranges) {
        const tx = await core
          .connect(alice)
          .openPosition(
            alice.address,
            marketId,
            range.lower,
            range.upper,
            SMALL_QUANTITY,
            MEDIUM_COST
          );

        const receipt = await tx.wait();
        gasUsages.push(receipt!.gasUsed);
      }

      // Gas should increase with range size
      expect(gasUsages[1]).to.be.gt(gasUsages[0]);
      expect(gasUsages[2]).to.be.gt(gasUsages[1]);

      console.log(`Gas usage by range: ${gasUsages.map(Number).join(", ")}`);
    });
  });

  describe("Position Update Gas Benchmarks", function () {
    it("Should use reasonable gas for position increases", async function () {
      const { core, alice, mockPosition, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Create initial position
      await core
        .connect(alice)
        .openPosition(
          alice.address,
          marketId,
          100450,
          100550,
          MEDIUM_QUANTITY,
          MEDIUM_COST
        );

      const positions = await mockPosition.getPositionsByOwner(alice.address);
      const positionId = positions[0];

      const tx = await core
        .connect(alice)
        .increasePosition(positionId, SMALL_QUANTITY, MEDIUM_COST);

      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed;

      expect(gasUsed).to.be.lt(1000000); // Should be less than creation
      console.log(`Position increase gas usage: ${gasUsed}`);
    });

    it("Should use reasonable gas for position decreases", async function () {
      const { core, alice, mockPosition, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Create initial position
      await core
        .connect(alice)
        .openPosition(
          alice.address,
          marketId,
          100450,
          100550,
          LARGE_QUANTITY,
          LARGE_COST
        );

      const positions = await mockPosition.getPositionsByOwner(alice.address);
      const positionId = positions[0];

      const tx = await core
        .connect(alice)
        .decreasePosition(positionId, SMALL_QUANTITY, 0);

      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed;

      expect(gasUsed).to.be.lt(1000000);
      console.log(`Position decrease gas usage: ${gasUsed}`);
    });
  });

  describe("Position Closure Gas Benchmarks", function () {
    it("Should use reasonable gas for position closure", async function () {
      const { core, alice, mockPosition, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Create initial position
      await core
        .connect(alice)
        .openPosition(
          alice.address,
          marketId,
          100450,
          100550,
          MEDIUM_QUANTITY,
          MEDIUM_COST
        );

      const positions = await mockPosition.getPositionsByOwner(alice.address);
      const positionId = positions[0];

      const tx = await core.connect(alice).closePosition(positionId, 0);

      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed;

      expect(gasUsed).to.be.lt(1200000);
      console.log(`Position closure gas usage: ${gasUsed}`);
    });

    it("Should compare gas efficiency across different position sizes", async function () {
      const { core, alice, mockPosition, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      const quantities = [SMALL_QUANTITY, MEDIUM_QUANTITY, LARGE_QUANTITY];
      const gasUsages = [];

      for (const quantity of quantities) {
        // Create position
        await core
          .connect(alice)
          .openPosition(
            alice.address,
            marketId,
            100450,
            100550,
            quantity,
            LARGE_COST
          );

        const positions = await mockPosition.getPositionsByOwner(alice.address);
        const positionId = positions[positions.length - 1];

        // Close position and measure gas
        const tx = await core.connect(alice).closePosition(positionId, 0);

        const receipt = await tx.wait();
        gasUsages.push(receipt!.gasUsed);
      }

      // Gas usage should not vary dramatically with quantity
      const maxGas = Math.max(...gasUsages.map(Number));
      const minGas = Math.min(...gasUsages.map(Number));
      const variance = ((maxGas - minGas) / minGas) * 100;

      expect(variance).to.be.lt(200); // Less than 200% variance
      console.log(`Gas variance across quantities: ${variance.toFixed(2)}%`);
    });
  });

  describe("Batch Operations Gas Efficiency", function () {
    it("Should demonstrate gas efficiency of sequential operations", async function () {
      const { core, alice, mockPosition, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      const operations = [];

      // Create multiple positions
      for (let i = 0; i < 3; i++) {
        const tx = await core
          .connect(alice)
          .openPosition(
            alice.address,
            marketId,
            100400 + i * 50,
            100600 + i * 50,
            SMALL_QUANTITY,
            MEDIUM_COST
          );

        const receipt = await tx.wait();
        operations.push({ type: "create", gas: receipt!.gasUsed });
      }

      const positions = await mockPosition.getPositionsByOwner(alice.address);

      // Update positions
      for (const positionId of positions) {
        const tx = await core
          .connect(alice)
          .increasePosition(positionId, SMALL_QUANTITY, MEDIUM_COST);

        const receipt = await tx.wait();
        operations.push({ type: "increase", gas: receipt!.gasUsed });
      }

      // Close positions
      for (const positionId of positions) {
        const tx = await core.connect(alice).closePosition(positionId, 0);

        const receipt = await tx.wait();
        operations.push({ type: "close", gas: receipt!.gasUsed });
      }

      const totalGas = operations.reduce((sum, op) => sum + Number(op.gas), 0);
      console.log(`Total gas for batch operations: ${totalGas}`);
      console.log(
        `Average gas per operation: ${Math.round(totalGas / operations.length)}`
      );

      // Total gas should be reasonable for batch operations
      expect(totalGas).to.be.lt(15000000); // 15M gas for 9 operations
    });
  });
});
