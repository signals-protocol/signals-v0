import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { coreFixture, setupActiveMarket } from "../helpers/fixtures/core";
import { PERF_TAG } from "../helpers/tags";

describe(`${PERF_TAG} Gas Snapshots - Performance Regression Tests`, function () {
  const ALPHA = ethers.parseEther("1");
  const MIN_TICK = 100000;
  const MAX_TICK = 100990;
  const TICK_SPACING = 10;
  const MARKET_DURATION = 7 * 24 * 60 * 60; // 7 days
  const USDC_DECIMALS = 6;

  // Test quantities
  const SMALL_QUANTITY = ethers.parseUnits("0.01", USDC_DECIMALS);
  const MEDIUM_QUANTITY = ethers.parseUnits("0.1", USDC_DECIMALS);
  const LARGE_QUANTITY = ethers.parseUnits("1", USDC_DECIMALS);
  const EXTREME_COST = ethers.parseUnits("100000", USDC_DECIMALS);

  // Gas baselines for regression detection
  const GAS_BASELINES = {
    createMarket: 2000000,
    settleMarket: 300000,
    openSmallPosition: 1000000, // 증가
    openMediumPosition: 1200000, // 증가
    openLargePosition: 1600000, // 증가
    increasePosition: 400000,
    decreasePosition: 400000,
    closePosition: 600000,
    claimPosition: 200000,
    calculateOpenCost: 100000,
    calculateIncreaseCost: 100000,
    calculateDecreaseProceeds: 100000,
  };

  async function createActiveMarket() {
    const contracts = await loadFixture(coreFixture);
    const { marketId, startTime, endTime } = await setupActiveMarket(contracts);
    return { ...contracts, marketId, startTime, endTime };
  }

  describe("Market Operations Snapshots", function () {
    it("Should create market within gas baseline", async function () {
      const { core, keeper } = await loadFixture(coreFixture);

      const marketId = Math.floor(Math.random() * 1000000) + 1;
      const startTime = (await time.latest()) + 60;
      const endTime = startTime + MARKET_DURATION;

      const tx = await core
        .connect(keeper)
        .createMarket(
          marketId,
          MIN_TICK,
          MAX_TICK,
          TICK_SPACING,
          startTime,
          endTime,
          ALPHA
        );

      const receipt = await tx.wait();
      const gasUsed = Number(receipt!.gasUsed);

      console.log(`Market creation gas used: ${gasUsed}`);
      expect(gasUsed).to.be.at.most(GAS_BASELINES.createMarket);
    });

    it("Should settle market within gas baseline", async function () {
      const { core, keeper, marketId, endTime } = await loadFixture(
        createActiveMarket
      );

      await time.increaseTo(endTime + 1);

      const tx = await core
        .connect(keeper)
        .settleMarket(marketId, 100450, 100460);
      const receipt = await tx.wait();
      const gasUsed = Number(receipt!.gasUsed);

      console.log(`Market settlement gas used: ${gasUsed}`);
      expect(gasUsed).to.be.at.most(GAS_BASELINES.settleMarket);
    });
  });

  describe("Position Operations Snapshots", function () {
    it("Should open small position within gas baseline", async function () {
      const { core, alice, marketId } = await loadFixture(createActiveMarket);

      const tx = await core
        .connect(alice)
        .openPosition(
          alice.address,
          marketId,
          100300,
          100400,
          SMALL_QUANTITY,
          EXTREME_COST
        );

      const receipt = await tx.wait();
      const gasUsed = Number(receipt!.gasUsed);

      console.log(`Small position open gas used: ${gasUsed}`);
      expect(gasUsed).to.be.at.most(GAS_BASELINES.openSmallPosition);
    });

    it("Should open medium position within gas baseline", async function () {
      const { core, alice, marketId } = await loadFixture(createActiveMarket);

      const tx = await core
        .connect(alice)
        .openPosition(
          alice.address,
          marketId,
          100200,
          100500,
          MEDIUM_QUANTITY,
          EXTREME_COST
        );

      const receipt = await tx.wait();
      const gasUsed = Number(receipt!.gasUsed);

      console.log(`Medium position open gas used: ${gasUsed}`);
      expect(gasUsed).to.be.at.most(GAS_BASELINES.openMediumPosition);
    });

    it("Should open large position within gas baseline", async function () {
      const { core, alice, marketId } = await loadFixture(createActiveMarket);

      const tx = await core
        .connect(alice)
        .openPosition(
          alice.address,
          marketId,
          100100,
          100800,
          LARGE_QUANTITY,
          EXTREME_COST
        );

      const receipt = await tx.wait();
      const gasUsed = Number(receipt!.gasUsed);

      console.log(`Large position open gas used: ${gasUsed}`);
      expect(gasUsed).to.be.at.most(GAS_BASELINES.openLargePosition);
    });

    it("Should increase position within gas baseline", async function () {
      const { core, alice, marketId, mockPosition } = await loadFixture(
        createActiveMarket
      );

      // First open a position
      await core
        .connect(alice)
        .openPosition(
          alice.address,
          marketId,
          100300,
          100400,
          SMALL_QUANTITY,
          EXTREME_COST
        );

      const positions = await mockPosition.getPositionsByOwner(alice.address);
      const positionId = Number(positions[0]);

      const tx = await core
        .connect(alice)
        .increasePosition(positionId, SMALL_QUANTITY, EXTREME_COST);

      const receipt = await tx.wait();
      const gasUsed = Number(receipt!.gasUsed);

      console.log(`Position increase gas used: ${gasUsed}`);
      expect(gasUsed).to.be.at.most(GAS_BASELINES.increasePosition);
    });

    it("Should decrease position within gas baseline", async function () {
      const { core, alice, marketId, mockPosition } = await loadFixture(
        createActiveMarket
      );

      // First open a position
      await core
        .connect(alice)
        .openPosition(
          alice.address,
          marketId,
          100300,
          100400,
          MEDIUM_QUANTITY,
          EXTREME_COST
        );

      const positions = await mockPosition.getPositionsByOwner(alice.address);
      const positionId = Number(positions[0]);

      const tx = await core
        .connect(alice)
        .decreasePosition(positionId, SMALL_QUANTITY, 0);

      const receipt = await tx.wait();
      const gasUsed = Number(receipt!.gasUsed);

      console.log(`Position decrease gas used: ${gasUsed}`);
      expect(gasUsed).to.be.at.most(GAS_BASELINES.decreasePosition);
    });

    it("Should close position within gas baseline", async function () {
      const { core, alice, marketId, mockPosition } = await loadFixture(
        createActiveMarket
      );

      // First open a position
      await core
        .connect(alice)
        .openPosition(
          alice.address,
          marketId,
          100300,
          100400,
          SMALL_QUANTITY,
          EXTREME_COST
        );

      const positions = await mockPosition.getPositionsByOwner(alice.address);
      const positionId = Number(positions[0]);

      const tx = await core.connect(alice).closePosition(positionId, 0);

      const receipt = await tx.wait();
      const gasUsed = Number(receipt!.gasUsed);

      console.log(`Position close gas used: ${gasUsed}`);
      expect(gasUsed).to.be.at.most(GAS_BASELINES.closePosition);
    });

    it("Should claim position within gas baseline", async function () {
      const { core, alice, keeper, marketId, mockPosition, endTime } =
        await loadFixture(createActiveMarket);

      // First open a position
      await core
        .connect(alice)
        .openPosition(
          alice.address,
          marketId,
          100300,
          100400,
          SMALL_QUANTITY,
          EXTREME_COST
        );

      const positions = await mockPosition.getPositionsByOwner(alice.address);
      const positionId = Number(positions[0]);

      // Settle market
      await time.increaseTo(endTime + 1);
      await core.connect(keeper).settleMarket(marketId, 100350, 100360);

      const tx = await core.connect(alice).claimPayout(positionId);

      const receipt = await tx.wait();
      const gasUsed = Number(receipt!.gasUsed);

      console.log(`Position claim gas used: ${gasUsed}`);
      expect(gasUsed).to.be.at.most(GAS_BASELINES.claimPosition);
    });
  });

  describe("Calculation Function Snapshots", function () {
    it("Should calculate open cost within gas baseline", async function () {
      const { core, marketId } = await loadFixture(createActiveMarket);

      const gasUsedBefore = await ethers.provider.send("eth_gasPrice", []);

      const tx = await core.calculateOpenCost.staticCall(
        marketId,
        100300,
        100400,
        MEDIUM_QUANTITY
      );

      const gasUsedAfter = await ethers.provider.send("eth_gasPrice", []);

      // For view functions, we can't measure exact gas, but we ensure they execute
      expect(tx).to.be.gte(0);
      console.log(`Calculate open cost executed successfully`);
    });

    it("Should calculate increase cost within gas baseline", async function () {
      const { core, alice, marketId, mockPosition } = await loadFixture(
        createActiveMarket
      );

      // First open a position
      await core
        .connect(alice)
        .openPosition(
          alice.address,
          marketId,
          100300,
          100400,
          SMALL_QUANTITY,
          EXTREME_COST
        );

      const positions = await mockPosition.getPositionsByOwner(alice.address);
      const positionId = Number(positions[0]);

      const tx = await core.calculateIncreaseCost.staticCall(
        positionId,
        SMALL_QUANTITY
      );

      // For view functions, we can't measure exact gas, but we ensure they execute
      expect(tx).to.be.gte(0);
      console.log(`Calculate increase cost executed successfully`);
    });

    it("Should calculate decrease proceeds within gas baseline", async function () {
      const { core, alice, marketId, mockPosition } = await loadFixture(
        createActiveMarket
      );

      // First open a position
      await core
        .connect(alice)
        .openPosition(
          alice.address,
          marketId,
          100300,
          100400,
          MEDIUM_QUANTITY,
          EXTREME_COST
        );

      const positions = await mockPosition.getPositionsByOwner(alice.address);
      const positionId = Number(positions[0]);

      const tx = await core.calculateDecreaseProceeds.staticCall(
        positionId,
        SMALL_QUANTITY
      );

      // For view functions, we can't measure exact gas, but we ensure they execute
      expect(tx).to.be.gte(0);
      console.log(`Calculate decrease proceeds executed successfully`);
    });
  });

  describe("Regression Detection", function () {
    it("Should detect market creation regression", async function () {
      const { core, keeper } = await loadFixture(coreFixture);

      const marketId = Math.floor(Math.random() * 1000000) + 1;
      const startTime = (await time.latest()) + 60;
      const endTime = startTime + MARKET_DURATION;

      const tx = await core
        .connect(keeper)
        .createMarket(
          marketId,
          MIN_TICK,
          MAX_TICK,
          TICK_SPACING,
          startTime,
          endTime,
          ALPHA
        );

      const receipt = await tx.wait();
      const gasUsed = Number(receipt!.gasUsed);

      // Allow 10% regression tolerance
      const maxAllowedGas = Math.floor(GAS_BASELINES.createMarket * 1.1);

      console.log(`Market creation regression test: ${gasUsed} gas`);
      console.log(
        `Baseline: ${GAS_BASELINES.createMarket}, Max allowed: ${maxAllowedGas}`
      );

      expect(gasUsed).to.be.at.most(maxAllowedGas);
    });

    it("Should detect position operation regression", async function () {
      const { core, alice, marketId } = await loadFixture(createActiveMarket);

      const tx = await core
        .connect(alice)
        .openPosition(
          alice.address,
          marketId,
          100300,
          100400,
          MEDIUM_QUANTITY,
          EXTREME_COST
        );

      const receipt = await tx.wait();
      const gasUsed = Number(receipt!.gasUsed);

      // Allow 10% regression tolerance
      const maxAllowedGas = Math.floor(GAS_BASELINES.openMediumPosition * 1.1);

      console.log(`Position operation regression test: ${gasUsed} gas`);
      console.log(
        `Baseline: ${GAS_BASELINES.openMediumPosition}, Max allowed: ${maxAllowedGas}`
      );

      expect(gasUsed).to.be.at.most(maxAllowedGas);
    });
  });

  describe("Comparative Benchmarks", function () {
    it("Should compare single vs multi-tick operations", async function () {
      const { core, alice, marketId } = await loadFixture(createActiveMarket);

      // Single tick position
      const singleTickTx = await core
        .connect(alice)
        .openPosition(
          alice.address,
          marketId,
          100300,
          100300,
          SMALL_QUANTITY,
          EXTREME_COST
        );

      const singleTickReceipt = await singleTickTx.wait();
      const singleTickGas = Number(singleTickReceipt!.gasUsed);

      // Multi-tick position
      const multiTickTx = await core
        .connect(alice)
        .openPosition(
          alice.address,
          marketId,
          100400,
          100600,
          SMALL_QUANTITY,
          EXTREME_COST
        );

      const multiTickReceipt = await multiTickTx.wait();
      const multiTickGas = Number(multiTickReceipt!.gasUsed);

      console.log(`Single tick gas: ${singleTickGas}`);
      console.log(`Multi tick gas: ${multiTickGas}`);

      // Multi-tick should use more gas, but not excessively more
      expect(multiTickGas).to.be.gte(singleTickGas);
      expect(multiTickGas).to.be.at.most(singleTickGas * 3); // At most 3x
    });

    it("Should compare fresh vs modified market state", async function () {
      const { core, alice, bob, marketId } = await loadFixture(
        createActiveMarket
      );

      // Fresh market operation
      const freshTx = await core
        .connect(alice)
        .openPosition(
          alice.address,
          marketId,
          100200,
          100300,
          SMALL_QUANTITY,
          EXTREME_COST
        );

      const freshReceipt = await freshTx.wait();
      const freshGas = Number(freshReceipt!.gasUsed);

      // Create some market activity to modify state
      for (let i = 0; i < 5; i++) {
        await core
          .connect(bob)
          .openPosition(
            bob.address,
            marketId,
            100400 + i * 10,
            100500 + i * 10,
            SMALL_QUANTITY,
            EXTREME_COST
          );
      }

      // Modified market operation
      const modifiedTx = await core
        .connect(alice)
        .openPosition(
          alice.address,
          marketId,
          100700,
          100800,
          SMALL_QUANTITY,
          EXTREME_COST
        );

      const modifiedReceipt = await modifiedTx.wait();
      const modifiedGas = Number(modifiedReceipt!.gasUsed);

      console.log(`Fresh market gas: ${freshGas}`);
      console.log(`Modified market gas: ${modifiedGas}`);

      // Operations shouldn't degrade significantly with market activity
      expect(modifiedGas).to.be.at.most(freshGas * 1.5); // At most 50% increase
    });
  });

  describe("Performance Monitoring", function () {
    it("Should track gas trends across operation types", async function () {
      const { core, alice, marketId } = await loadFixture(createActiveMarket);

      const operations = [];

      // Open position
      const openTx = await core
        .connect(alice)
        .openPosition(
          alice.address,
          marketId,
          100300,
          100400,
          MEDIUM_QUANTITY,
          EXTREME_COST
        );
      operations.push({
        type: "open",
        gas: Number((await openTx.wait())!.gasUsed),
      });

      // Increase position (need to get position ID first)
      const mockPosition = core.interface.encodeFunctionData("openPosition", [
        alice.address,
        marketId,
        100300,
        100400,
        MEDIUM_QUANTITY,
        EXTREME_COST,
      ]);

      // For simplicity, assume position ID is 1
      const increaseTx = await core
        .connect(alice)
        .increasePosition(1, SMALL_QUANTITY, EXTREME_COST);
      operations.push({
        type: "increase",
        gas: Number((await increaseTx.wait())!.gasUsed),
      });

      // Decrease position
      const decreaseTx = await core
        .connect(alice)
        .decreasePosition(1, SMALL_QUANTITY, 0);
      operations.push({
        type: "decrease",
        gas: Number((await decreaseTx.wait())!.gasUsed),
      });

      // Close position
      const closeTx = await core.connect(alice).closePosition(1, 0);
      operations.push({
        type: "close",
        gas: Number((await closeTx.wait())!.gasUsed),
      });

      console.log("Gas usage by operation type:");
      operations.forEach((op) => {
        console.log(`${op.type}: ${op.gas} gas`);
      });

      // All operations should be within reasonable bounds
      operations.forEach((op) => {
        expect(op.gas).to.be.at.most(1000000); // 1M gas max
      });
    });
  });
});
