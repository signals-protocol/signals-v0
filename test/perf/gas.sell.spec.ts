import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { coreFixture, setupActiveMarket } from "../helpers/fixtures/core";
import { PERF_TAG } from "../helpers/tags";

const describeMaybe = process.env.COVERAGE ? describe.skip : describe;

describeMaybe(`${PERF_TAG} Gas Optimization - Position Closing`, function () {
  const MIN_TICK = 100000;
  const MAX_TICK = 100990;
  const TICK_SPACING = 10;
  const USDC_DECIMALS = 6;
  const MEDIUM_QUANTITY = ethers.parseUnits("0.1", USDC_DECIMALS);
  const LARGE_QUANTITY = ethers.parseUnits("0.4", USDC_DECIMALS);
  const EXTREME_COST = ethers.parseUnits("100000", USDC_DECIMALS);

  const MAX_NARROW_RANGE_GAS = 800000;
  const MAX_SMALL_RANGE_GAS = 950000;
  const MAX_LARGE_RANGE_GAS = 1300000;
  const MAX_FULL_RANGE_GAS = 1600000;

  async function createActiveMarketWithPositionsFixture() {
    const contracts = await coreFixture();
    const marketSetup = await setupActiveMarket(contracts);
    const { core, alice, mockPosition } = contracts;
    const { marketId } = marketSetup;

    const positions: number[] = [];

    const openAndTrack = async (lowerTick: number, upperTick: number) => {
      const tx = await core
        .connect(alice)
        .openPosition(marketId, lowerTick, upperTick, MEDIUM_QUANTITY, EXTREME_COST);
      await tx.wait();
      const ownerPositions = await mockPosition.getPositionsByOwner(alice.address);
      positions.push(Number(ownerPositions[ownerPositions.length - 1]));
    };

    await openAndTrack(100500, 100510); // Narrow range
    await openAndTrack(100200, 100300); // Small range
    await openAndTrack(100100, 100800); // Large range
    await openAndTrack(MIN_TICK, MAX_TICK); // Full range

    return {
      ...contracts,
      ...marketSetup,
      positions,
    };
  }

  async function createSellGasMarketFixture() {
    const contracts = await coreFixture();
    const marketSetup = await setupActiveMarket(contracts);
    return {
      ...contracts,
      ...marketSetup,
    };
  }

  describe("Gas Benchmarks for Position Closing", function () {
    it("Should close narrow range position within gas limit", async function () {
      const { core, alice, positions } = await loadFixture(
        createActiveMarketWithPositionsFixture
      );

      const positionId = positions[0];
      const tx = await core.connect(alice).closePosition(positionId, 0);
      const receipt = await tx.wait();

      console.log(`Narrow range close gas used: ${receipt!.gasUsed.toString()}`);
      expect(receipt!.gasUsed).to.be.lte(MAX_NARROW_RANGE_GAS);
    });

    it("Should close small range position within gas limit", async function () {
      const { core, alice, positions } = await loadFixture(
        createActiveMarketWithPositionsFixture
      );

      const positionId = positions[1];
      const tx = await core.connect(alice).closePosition(positionId, 0);
      const receipt = await tx.wait();

      console.log(`Small range close gas used: ${receipt!.gasUsed.toString()}`);
      expect(receipt!.gasUsed).to.be.lte(MAX_SMALL_RANGE_GAS);
    });

    it("Should close large range position within gas limit", async function () {
      const { core, alice, positions } = await loadFixture(
        createActiveMarketWithPositionsFixture
      );

      const positionId = positions[2];
      const tx = await core.connect(alice).closePosition(positionId, 0);
      const receipt = await tx.wait();

      console.log(`Large range close gas used: ${receipt!.gasUsed.toString()}`);
      expect(receipt!.gasUsed).to.be.lte(MAX_LARGE_RANGE_GAS);
    });

    it("Should close full range position within gas limit", async function () {
      const { core, alice, positions } = await loadFixture(
        createActiveMarketWithPositionsFixture
      );

      const positionId = positions[3];
      const tx = await core.connect(alice).closePosition(positionId, 0);
      const receipt = await tx.wait();

      console.log(`Full range close gas used: ${receipt!.gasUsed.toString()}`);
      expect(receipt!.gasUsed).to.be.lte(MAX_FULL_RANGE_GAS);
    });
  });

  describe("Gas Scaling Tests", function () {
    it("Should have predictable gas scaling with range size", async function () {
      const { core, alice, mockPosition, marketId } = await loadFixture(
        createSellGasMarketFixture
      );

      const rangeSizes = [1, 5, 10, 20, 50];
      const gasUsages: Array<{ rangeSize: number; gasUsed: number }> = [];

      for (const rangeSize of rangeSizes) {
        const lowerTick = MIN_TICK + Math.floor(rangeSize / 2) * TICK_SPACING;
        const upperTick = lowerTick + rangeSize * TICK_SPACING;

        const openTx = await core
          .connect(alice)
          .openPosition(
            marketId,
            lowerTick,
            upperTick,
            MEDIUM_QUANTITY,
            EXTREME_COST
          );
        await openTx.wait();

        const ownerPositions = await mockPosition.getPositionsByOwner(alice.address);
        const positionId = Number(ownerPositions[ownerPositions.length - 1]);

        const closeTx = await core.connect(alice).closePosition(positionId, 0);
        const closeReceipt = await closeTx.wait();

        gasUsages.push({ rangeSize, gasUsed: Number(closeReceipt!.gasUsed) });
        console.log(`Range size ${rangeSize}: ${closeReceipt!.gasUsed.toString()} gas`);
      }

      for (const usage of gasUsages) {
        expect(usage.gasUsed).to.be.lte(MAX_LARGE_RANGE_GAS);
      }

      const gasValues = gasUsages.map((item) => item.gasUsed);
      const minGas = Math.min(...gasValues);
      const maxGas = Math.max(...gasValues);
      expect(maxGas).to.be.lte(minGas * 3);
    });

    it("Should handle multiple position closures efficiently", async function () {
      const { core, alice, mockPosition, marketId } = await loadFixture(
        createSellGasMarketFixture
      );

      const numPositions = 10;
      const positionIds: number[] = [];

      for (let i = 0; i < numPositions; i++) {
        const lowerTick = MIN_TICK + i * TICK_SPACING * 5;
        const upperTick = lowerTick + 4 * TICK_SPACING;

        const tx = await core
          .connect(alice)
          .openPosition(
            marketId,
            lowerTick,
            upperTick,
            MEDIUM_QUANTITY,
            EXTREME_COST
          );
        await tx.wait();

        const ownerPositions = await mockPosition.getPositionsByOwner(alice.address);
        positionIds.push(Number(ownerPositions[ownerPositions.length - 1]));
      }

      let totalGas = 0n;
      for (const positionId of positionIds) {
        const closeTx = await core.connect(alice).closePosition(positionId, 0);
        const closeReceipt = await closeTx.wait();
        totalGas += closeReceipt!.gasUsed;
      }

      console.log(`Total gas for ${numPositions} closes: ${totalGas.toString()}`);
      const averageGas = totalGas / BigInt(numPositions);
      console.log(`Average gas per close: ${averageGas.toString()}`);
      expect(averageGas).to.be.lte(BigInt(MAX_SMALL_RANGE_GAS));
    });
  });

  describe("Gas Stress Tests", function () {
    it("Should handle closing positions in a market with high activity", async function () {
      const { core, alice, bob, mockPosition, marketId } = await loadFixture(
        createSellGasMarketFixture
      );

      const positions: Array<{ id: number; owner: string }> = [];

      for (let i = 0; i < 20; i++) {
        const signer = i % 2 === 0 ? alice : bob;
        const lowerTick = MIN_TICK + ((i * 7) % 80) * TICK_SPACING;
        const upperTick = Math.min(
          lowerTick + (5 + (i % 5)) * TICK_SPACING,
          MAX_TICK
        );

        const tx = await core
          .connect(signer)
          .openPosition(
            marketId,
            lowerTick,
            upperTick,
            MEDIUM_QUANTITY,
            EXTREME_COST
          );
        await tx.wait();

        const ownerPositions = await mockPosition.getPositionsByOwner(
          signer.address
        );
        positions.push({
          id: Number(ownerPositions[ownerPositions.length - 1]),
          owner: signer.address,
        });
      }

      for (let i = 0; i < 5; i++) {
        const { id, owner } = positions[i];
        const signer = owner === alice.address ? alice : bob;
        const closeTx = await core.connect(signer).closePosition(id, 0);
        const closeReceipt = await closeTx.wait();

        console.log(
          `High activity close ${i + 1}: ${closeReceipt!.gasUsed.toString()} gas`
        );
        expect(closeReceipt!.gasUsed).to.be.lte(MAX_LARGE_RANGE_GAS);
      }
    });

    it("Should handle partial position closures efficiently", async function () {
      const { core, alice, mockPosition, marketId } = await loadFixture(
        createSellGasMarketFixture
      );

      const tx = await core
        .connect(alice)
        .openPosition(
          marketId,
          MIN_TICK + 20 * TICK_SPACING,
          MIN_TICK + 80 * TICK_SPACING,
          LARGE_QUANTITY,
          EXTREME_COST
        );
      await tx.wait();

      const ownerPositions = await mockPosition.getPositionsByOwner(alice.address);
      const positionId = Number(ownerPositions[ownerPositions.length - 1]);

      const decreaseAmount = LARGE_QUANTITY / 4n;
      for (let i = 0; i < 3; i++) {
        const decreaseTx = await core
          .connect(alice)
          .decreasePosition(positionId, decreaseAmount, 0);
        const decreaseReceipt = await decreaseTx.wait();

        console.log(
          `Partial decrease ${i + 1}: ${decreaseReceipt!.gasUsed.toString()} gas`
        );
        expect(decreaseReceipt!.gasUsed).to.be.lte(900000);
      }

      const closeTx = await core.connect(alice).closePosition(positionId, 0);
      const closeReceipt = await closeTx.wait();

      console.log(`Final close: ${closeReceipt!.gasUsed.toString()} gas`);
      expect(closeReceipt!.gasUsed).to.be.lte(MAX_LARGE_RANGE_GAS);
    });
  });

  describe("Gas Regression Tests", function () {
    it("Should maintain consistent gas usage over multiple operations", async function () {
      const { core, alice, mockPosition, marketId } = await loadFixture(
        createSellGasMarketFixture
      );

      const gasSamples: number[] = [];

      for (let round = 0; round < 5; round++) {
        const openTx = await core
          .connect(alice)
          .openPosition(
            marketId,
            100450,
            100550,
            MEDIUM_QUANTITY,
            EXTREME_COST
          );
        await openTx.wait();

        const ownerPositions = await mockPosition.getPositionsByOwner(alice.address);
        const positionId = Number(ownerPositions[ownerPositions.length - 1]);

        const closeTx = await core.connect(alice).closePosition(positionId, 0);
        const closeReceipt = await closeTx.wait();

        const gasUsedNumber = Number(closeReceipt!.gasUsed);
        gasSamples.push(gasUsedNumber);
        console.log(`Round ${round + 1} close gas: ${gasUsedNumber}`);
      }

      const average =
        gasSamples.reduce((acc, value) => acc + value, 0) / gasSamples.length;

      for (const gasUsed of gasSamples) {
        const variance = Math.abs(gasUsed - average) / average;
        expect(variance).to.be.lte(0.1);
      }
    });
  });
});
