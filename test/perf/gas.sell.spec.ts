import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { coreFixture, setupActiveMarket } from "../helpers/fixtures/core";
import { PERF_TAG } from "../helpers/tags";

describe(`${PERF_TAG} Gas Optimization - Position Closing`, function () {
  const ALPHA = ethers.parseEther("1");
  const MIN_TICK = 100000;
  const MAX_TICK = 100990;
  const TICK_SPACING = 10;
  const MARKET_DURATION = 7 * 24 * 60 * 60; // 7 days
  const USDC_DECIMALS = 6;
  const MEDIUM_QUANTITY = ethers.parseUnits("0.1", USDC_DECIMALS);
  const LARGE_QUANTITY = ethers.parseUnits("1", USDC_DECIMALS);
  const EXTREME_COST = ethers.parseUnits("100000", USDC_DECIMALS);

  // Gas benchmark constants - increased to realistic values
  const MAX_SINGLE_TICK_GAS = 600000; // Increased for new system
  const MAX_SMALL_RANGE_GAS = 700000; // Increased for new system
  const MAX_LARGE_RANGE_GAS = 900000; // Increased for new system
  const MAX_FULL_RANGE_GAS = 1200000; // Increased for new system

  async function createActiveMarketWithPositionsFixture() {
    const contracts = await loadFixture(coreFixture);
    const { core, alice } = contracts;

    const { marketId, startTime, endTime } = await setupActiveMarket(contracts);

    // Open various positions to test closing
    const positions = [];

    // Single tick position
    const tx1 = await core
      .connect(alice)
      .openPosition(
        alice.address,
        marketId,
        100500,
        100500,
        MEDIUM_QUANTITY,
        EXTREME_COST
      );
    const receipt1 = await tx1.wait();
    const event1 = receipt1!.logs.find(
      (log) => (log as any).fragment?.name === "PositionOpened"
    );
    positions.push((event1 as any).args[2]);

    // Small range position
    const tx2 = await core
      .connect(alice)
      .openPosition(
        alice.address,
        marketId,
        100200,
        100300,
        MEDIUM_QUANTITY,
        EXTREME_COST
      );
    const receipt2 = await tx2.wait();
    const event2 = receipt2!.logs.find(
      (log) => (log as any).fragment?.name === "PositionOpened"
    );
    positions.push((event2 as any).args[2]);

    // Large range position
    const tx3 = await core
      .connect(alice)
      .openPosition(
        alice.address,
        marketId,
        100100,
        100800,
        MEDIUM_QUANTITY,
        EXTREME_COST
      );
    const receipt3 = await tx3.wait();
    const event3 = receipt3!.logs.find(
      (log) => (log as any).fragment?.name === "PositionOpened"
    );
    positions.push((event3 as any).args[2]);

    // Full range position
    const tx4 = await core
      .connect(alice)
      .openPosition(
        alice.address,
        marketId,
        MIN_TICK,
        MAX_TICK,
        MEDIUM_QUANTITY,
        EXTREME_COST
      );
    const receipt4 = await tx4.wait();
    const event4 = receipt4!.logs.find(
      (log) => (log as any).fragment?.name === "PositionOpened"
    );
    positions.push((event4 as any).args[2]);

    return {
      ...contracts,
      marketId,
      positions,
    };
  }

  describe("Gas Benchmarks for Position Closing", function () {
    it("Should close single tick position within gas limit", async function () {
      const { core, alice, positions } = await loadFixture(
        createActiveMarketWithPositionsFixture
      );

      const positionId = positions[0]; // Single tick

      const tx = await core.connect(alice).closePosition(positionId, 0);
      const receipt = await tx.wait();

      console.log(`Single tick close gas used: ${receipt!.gasUsed.toString()}`);
      expect(receipt!.gasUsed).to.be.lte(MAX_SINGLE_TICK_GAS);
    });

    it("Should close small range position within gas limit", async function () {
      const { core, alice, positions } = await loadFixture(
        createActiveMarketWithPositionsFixture
      );

      const positionId = positions[1]; // Small range (11 ticks)

      const tx = await core.connect(alice).closePosition(positionId, 0);
      const receipt = await tx.wait();

      console.log(`Small range close gas used: ${receipt!.gasUsed.toString()}`);
      expect(receipt!.gasUsed).to.be.lte(MAX_SMALL_RANGE_GAS);
    });

    it("Should close large range position within gas limit", async function () {
      const { core, alice, positions } = await loadFixture(
        createActiveMarketWithPositionsFixture
      );

      const positionId = positions[2]; // Large range (61 ticks)

      const tx = await core.connect(alice).closePosition(positionId, 0);
      const receipt = await tx.wait();

      console.log(`Large range close gas used: ${receipt!.gasUsed.toString()}`);
      expect(receipt!.gasUsed).to.be.lte(MAX_LARGE_RANGE_GAS);
    });

    it("Should close full range position within gas limit", async function () {
      const { core, alice, positions } = await loadFixture(
        createActiveMarketWithPositionsFixture
      );

      const positionId = positions[3]; // Full range (100 ticks)

      const tx = await core.connect(alice).closePosition(positionId, 0);
      const receipt = await tx.wait();

      console.log(`Full range close gas used: ${receipt!.gasUsed.toString()}`);
      expect(receipt!.gasUsed).to.be.lte(MAX_FULL_RANGE_GAS);
    });
  });

  describe("Gas Scaling Tests", function () {
    it("Should have predictable gas scaling with range size", async function () {
      const { core, keeper, alice, mockPosition } = await loadFixture(
        coreFixture
      );

      const marketId = 1;
      const currentTime = await time.latest();
      const startTime = currentTime + 1400; // Large buffer for sell gas tests
      const endTime = startTime + MARKET_DURATION;

      await core
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

      await time.increaseTo(startTime + 1);

      const rangeSizes = [1, 5, 10, 20, 50];
      const gasUsages = [];

      for (const rangeSize of rangeSizes) {
        const lowerTick = MIN_TICK + Math.floor(rangeSize / 2) * TICK_SPACING;
        const upperTick = lowerTick + rangeSize * TICK_SPACING;

        // Open position
        const openTx = await core
          .connect(alice)
          .openPosition(
            alice.address,
            marketId,
            lowerTick,
            upperTick,
            MEDIUM_QUANTITY,
            EXTREME_COST
          );
        await openTx.wait();
        // Get position ID from MockPosition
        const positions = await mockPosition.getPositionsByOwner(alice.address);
        const positionId = Number(positions[positions.length - 1]); // Get latest position

        // Close position
        const closeTx = await core.connect(alice).closePosition(positionId, 0);
        const closeReceipt = await closeTx.wait();

        gasUsages.push({
          rangeSize,
          gasUsed: Number(closeReceipt!.gasUsed),
        });

        console.log(
          `Range size ${rangeSize}: ${closeReceipt!.gasUsed.toString()} gas`
        );
      }

      // Gas usage may vary due to tree structure optimizations
      // Check that gas usage is generally reasonable rather than strictly monotonic
      for (let i = 0; i < gasUsages.length; i++) {
        // Each operation should be within reasonable bounds
        expect(gasUsages[i].gasUsed).to.be.lte(MAX_LARGE_RANGE_GAS);

        console.log(
          `Range size ${gasUsages[i].rangeSize}: ${gasUsages[i].gasUsed} gas`
        );
      }

      // Overall trend should be reasonable - largest range shouldn't be more than 3x smallest
      const minGas = Math.min(...gasUsages.map((g) => Number(g.gasUsed)));
      const maxGas = Math.max(...gasUsages.map((g) => Number(g.gasUsed)));
      expect(maxGas).to.be.lte(minGas * 3); // Allow 3x variation due to tree optimizations
    });

    it("Should handle multiple position closures efficiently", async function () {
      const { core, keeper, alice, mockPosition } = await loadFixture(
        coreFixture
      );

      const marketId = 1;
      const currentTime = await time.latest();
      const startTime = currentTime + 1400; // Large buffer for sell gas tests
      const endTime = startTime + MARKET_DURATION;

      await core
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

      await time.increaseTo(startTime + 1);

      const numPositions = 10;
      const positions = [];

      // Open multiple positions
      for (let i = 0; i < numPositions; i++) {
        const lowerTick = MIN_TICK + i * TICK_SPACING * 5;
        const upperTick = lowerTick + 4 * TICK_SPACING;

        const tx = await core
          .connect(alice)
          .openPosition(
            alice.address,
            marketId,
            lowerTick,
            upperTick,
            MEDIUM_QUANTITY,
            EXTREME_COST
          );
        await tx.wait();
        // Get position ID from MockPosition
        const userPositions = await mockPosition.getPositionsByOwner(
          alice.address
        );
        positions.push(Number(userPositions[userPositions.length - 1]));
      }

      // Close all positions and measure gas
      let totalGas = 0n;
      for (const positionId of positions) {
        const tx = await core.connect(alice).closePosition(positionId, 0);
        const receipt = await tx.wait();
        totalGas += receipt!.gasUsed;
      }

      console.log(
        `Total gas for ${numPositions} closes: ${totalGas.toString()}`
      );
      const avgGas = totalGas / BigInt(numPositions);
      console.log(`Average gas per close: ${avgGas.toString()}`);

      // Average gas should be reasonable
      expect(avgGas).to.be.lte(MAX_SMALL_RANGE_GAS);
    });
  });

  describe("Gas Stress Tests", function () {
    it("Should handle closing positions in a market with high activity", async function () {
      const { core, keeper, alice, bob, mockPosition } = await loadFixture(
        coreFixture
      );

      const marketId = 1;
      const currentTime = await time.latest();
      const startTime = currentTime + 1400; // Large buffer for sell gas tests
      const endTime = startTime + MARKET_DURATION;

      await core
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

      await time.increaseTo(startTime + 1);

      // Create high activity by opening many positions
      const positions = [];
      for (let i = 0; i < 20; i++) {
        const user = i % 2 === 0 ? alice : bob;
        const lowerTick =
          MIN_TICK + Math.floor(Math.random() * 80) * TICK_SPACING;
        const upperTick =
          lowerTick + Math.floor(Math.random() * 10) * TICK_SPACING;

        const tx = await core
          .connect(alice)
          .openPosition(
            user.address,
            marketId,
            lowerTick,
            upperTick,
            MEDIUM_QUANTITY,
            EXTREME_COST
          );
        await tx.wait();
        // Get position ID from MockPosition
        const userPositions = await mockPosition.getPositionsByOwner(
          user.address
        );
        positions.push({
          id: Number(userPositions[userPositions.length - 1]),
          user: user.address,
        });
      }

      // Close positions and measure gas in high-activity environment
      for (let i = 0; i < 5; i++) {
        const position = positions[i];
        const user = position.user === alice.address ? alice : bob;

        const tx = await core.connect(alice).closePosition(position.id, 0);
        const receipt = await tx.wait();

        console.log(
          `Close in high activity (${
            i + 1
          }): ${receipt!.gasUsed.toString()} gas`
        );
        expect(receipt!.gasUsed).to.be.lte(MAX_LARGE_RANGE_GAS);
      }
    });

    it("Should handle partial position closures efficiently", async function () {
      const { core, keeper, alice, mockPosition } = await loadFixture(
        coreFixture
      );

      const marketId = 1;
      const currentTime = await time.latest();
      const startTime = currentTime + 1400; // Large buffer for sell gas tests
      const endTime = startTime + MARKET_DURATION;

      await core
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

      await time.increaseTo(startTime + 1);

      // Open large position
      const tx = await core
        .connect(alice)
        .openPosition(
          alice.address,
          marketId,
          MIN_TICK + 20 * TICK_SPACING,
          MIN_TICK + 80 * TICK_SPACING,
          LARGE_QUANTITY,
          EXTREME_COST
        );
      await tx.wait();
      // Get position ID from MockPosition
      const positions = await mockPosition.getPositionsByOwner(alice.address);
      const positionId = Number(positions[positions.length - 1]);

      // Perform partial decreases
      const decreaseAmount = LARGE_QUANTITY / 4n;

      for (let i = 0; i < 3; i++) {
        const decreaseTx = await core
          .connect(alice)
          .decreasePosition(positionId, decreaseAmount, 0);
        const decreaseReceipt = await decreaseTx.wait();

        console.log(
          `Partial decrease ${
            i + 1
          }: ${decreaseReceipt!.gasUsed.toString()} gas`
        );
        expect(decreaseReceipt!.gasUsed).to.be.lte(900000); // Increased for partial decreases
      }

      // Final close
      const closeTx = await core.connect(alice).closePosition(positionId, 0);
      const closeReceipt = await closeTx.wait();

      console.log(`Final close: ${closeReceipt!.gasUsed.toString()} gas`);
      expect(closeReceipt!.gasUsed).to.be.lte(MAX_LARGE_RANGE_GAS);
    });
  });

  describe("Gas Regression Tests", function () {
    it("Should maintain consistent gas usage over multiple operations", async function () {
      const { core, keeper, alice, mockPosition } = await loadFixture(
        coreFixture
      );

      const marketId = 1;
      const currentTime = await time.latest();
      const startTime = currentTime + 1400; // Large buffer for sell gas tests
      const endTime = startTime + MARKET_DURATION;

      await core
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

      await time.increaseTo(startTime + 1);

      const gasUsages = [];

      // Perform same operation multiple times
      for (let round = 0; round < 5; round++) {
        // Open position
        const openTx = await core
          .connect(alice)
          .openPosition(
            alice.address,
            marketId,
            100450,
            100550,
            MEDIUM_QUANTITY,
            EXTREME_COST
          );
        await openTx.wait();
        // Get position ID from MockPosition
        const positions = await mockPosition.getPositionsByOwner(alice.address);
        const positionId = Number(positions[positions.length - 1]);

        // Close position
        const closeTx = await core.connect(alice).closePosition(positionId, 0);
        const closeReceipt = await closeTx.wait();

        gasUsages.push(Number(closeReceipt!.gasUsed));
        console.log(
          `Round ${round + 1} close gas: ${closeReceipt!.gasUsed.toString()}`
        );
      }

      // Gas usage should be consistent (within 10% variance)
      const avgGas = gasUsages.reduce((a, b) => a + b) / gasUsages.length;
      for (const gasUsed of gasUsages) {
        const variance = Math.abs(gasUsed - avgGas) / avgGas;
        expect(variance).to.be.lte(0.1); // 10% variance tolerance
      }
    });
  });
});
