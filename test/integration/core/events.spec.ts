import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import {
  createActiveMarketFixture,
  settleMarketAtTick,
  increaseToSafe,
  advanceToClaimOpen,
} from "../../helpers/fixtures/core";
import { COMPONENT_TAG } from "../../helpers/tags";

describe(`${COMPONENT_TAG} CLMSRMarketCore - Events`, function () {
  const ALPHA = ethers.parseEther("1");
  const MIN_TICK = 100000;
  const MAX_TICK = 100990;
  const TICK_SPACING = 10;
  const MARKET_DURATION = 7 * 24 * 60 * 60; // 7 days
  const USDC_DECIMALS = 6;
  const SMALL_QUANTITY = ethers.parseUnits("0.01", USDC_DECIMALS);
  const INCREASE_QUANTITY = ethers.parseUnits("0.005", USDC_DECIMALS);
  const BPS_DENOMINATOR = 10_000n;
  const DEFAULT_BUFFER_BPS = 500n;

  const applyBuffer = (amount: bigint, buffer: bigint = DEFAULT_BUFFER_BPS) =>
    ((amount * (BPS_DENOMINATOR + buffer)) / BPS_DENOMINATOR) + 1n;

  async function setupSettledBatchFixture() {
    const contracts = await loadFixture(createActiveMarketFixture);
    const { core, keeper, alice, bob, charlie, marketId, mockPosition } =
      contracts;

    const ranges = [
      { signer: alice, lower: 100100, upper: 100200 },
      { signer: bob, lower: 100110, upper: 100210 },
      { signer: charlie, lower: 100120, upper: 100220 },
    ];

    const minted: bigint[] = [];
    for (const { signer, lower, upper } of ranges) {
      const quotedCost = await core.calculateOpenCost(
        marketId,
        lower,
        upper,
        SMALL_QUANTITY
      );
      const maxCost = applyBuffer(quotedCost);
      await core
        .connect(signer)
        .openPosition(
          marketId,
          lower,
          upper,
          SMALL_QUANTITY,
          maxCost
        );
      const owned = await mockPosition.getPositionsByOwner(signer.address);
      minted.push(owned[owned.length - 1]);
    }

    // Create a burned hole in market token list
    const bobId = minted[1];
    await core.connect(bob).closePosition(bobId, 0);

    await time.increase(MARKET_DURATION + 3600);
    await settleMarketAtTick(core, keeper, marketId, 100150);

    const listLength = await mockPosition.getMarketTokenLength(marketId);

    return {
      ...contracts,
      aliceId: minted[0],
      charlieId: minted[2],
      listLength,
    };
  }

  describe("Market Events", function () {
    it("Should emit MarketCreated event with correct parameters", async function () {
      const { core, keeper } = await loadFixture(createActiveMarketFixture);
      const currentTime = await time.latest();
      const startTime = currentTime + 60;
      const endTime = startTime + MARKET_DURATION;
      const settlementTime = endTime + 3600;

      const expectedId = await core.connect(keeper).createMarket.staticCall(
        MIN_TICK,
        MAX_TICK,
        TICK_SPACING,
        startTime,
        endTime,
        settlementTime,
        ALPHA,
        ethers.ZeroAddress
      );

      const numBins = BigInt((MAX_TICK - MIN_TICK) / TICK_SPACING);

      const tx = core
        .connect(keeper)
        .createMarket(
          MIN_TICK,
          MAX_TICK,
          TICK_SPACING,
          startTime,
          endTime,
          settlementTime,
          ALPHA,
          ethers.ZeroAddress
        );

      await expect(tx)
        .to.emit(core, "MarketCreated")
        .withArgs(
          expectedId,
          BigInt(startTime),
          BigInt(endTime),
          BigInt(MIN_TICK),
          BigInt(MAX_TICK),
          BigInt(TICK_SPACING),
          numBins,
          ALPHA
        );

      await expect(tx)
        .to.emit(core, "MarketActivationUpdated")
        .withArgs(expectedId, false);
    });

    it("Should emit MarketSettled event with correct parameters", async function () {
      const { core, keeper } = await loadFixture(createActiveMarketFixture);
      const currentTime = await time.latest();
      const startTime = currentTime + 60;
      const endTime = startTime + MARKET_DURATION;
      const settlementTime = endTime + 3600;

      const expectedId = await core.connect(keeper).createMarket.staticCall(
        MIN_TICK,
        MAX_TICK,
        TICK_SPACING,
        startTime,
        endTime,
        settlementTime,
        ALPHA,
        ethers.ZeroAddress
      );

      await core
        .connect(keeper)
        .createMarket(
          MIN_TICK,
          MAX_TICK,
          TICK_SPACING,
          startTime,
          endTime,
          settlementTime,
          ALPHA,
          ethers.ZeroAddress
        );

      await increaseToSafe(startTime + 1);

      const settlementTick = 100490;

      await expect(
        settleMarketAtTick(core, keeper, Number(expectedId), settlementTick)
      )
        .to.emit(core, "MarketSettled")
        .withArgs(expectedId, BigInt(settlementTick));
    });

    it("Should emit MarketSettled when status transitions to settled", async function () {
      const { core, keeper } = await loadFixture(createActiveMarketFixture);
      const currentTime = await time.latest();
      const startTime = currentTime + 60;
      const endTime = startTime + MARKET_DURATION;
      const settlementTime = endTime + 3600;

      const expectedId = await core.connect(keeper).createMarket.staticCall(
        MIN_TICK,
        MAX_TICK,
        TICK_SPACING,
        startTime,
        endTime,
        settlementTime,
        ALPHA,
        ethers.ZeroAddress
      );

      await core
        .connect(keeper)
        .createMarket(
          MIN_TICK,
          MAX_TICK,
          TICK_SPACING,
          startTime,
          endTime,
          settlementTime,
          ALPHA,
          ethers.ZeroAddress
        );

      await increaseToSafe(endTime + 1);

      await expect(
        settleMarketAtTick(core, keeper, Number(expectedId), 100450)
      ).to.emit(core, "MarketSettled");
    });
  });

  describe("Position Events", function () {
    async function createActiveMarket() {
      return await loadFixture(createActiveMarketFixture);
    }

    it("Should emit PositionOpened event with correct parameters", async function () {
      const { core, alice, marketId, mockPosition } = await loadFixture(createActiveMarket);

      const lowerTick = 100100;
      const upperTick = 100200;
      const quantity = SMALL_QUANTITY;

      // Pre-calculate expected cost for verification
      const expectedCost = await core.calculateOpenCost(
        marketId,
        lowerTick,
        upperTick,
        quantity
      );

      const maxCost = expectedCost + ethers.parseUnits("0.01", USDC_DECIMALS);

      await expect(
        core
          .connect(alice)
          .openPosition(
            marketId,
            lowerTick,
            upperTick,
            quantity,
            maxCost
          )
      )
        .to.emit(core, "PositionOpened")
        .withArgs(
          (positionId: any) => positionId >= 1, // Position ID should be >= 1
          alice.address, // owner
          marketId, // marketId
          lowerTick, // lowerTick
          upperTick, // upperTick
          quantity, // quantity
          (actualCost: any) => actualCost <= maxCost // cost should be <= maxCost
        );
    });

    it("Should emit PositionIncreased event with correct parameters", async function () {
      const { core, alice, marketId, mockPosition } = await loadFixture(createActiveMarket);

      const lowerTick = 100100;
      const upperTick = 100200;
      const initialQuantity = SMALL_QUANTITY;
      const increaseQuantity = INCREASE_QUANTITY;

      // First, open a position
      const initialCost = await core.calculateOpenCost(
        marketId,
        lowerTick,
        upperTick,
        initialQuantity
      );
      const initialMaxCost = initialCost + ethers.parseUnits("0.01", USDC_DECIMALS);
      await core
        .connect(alice)
        .openPosition(
          marketId,
          lowerTick,
          upperTick,
          initialQuantity,
          initialMaxCost
        );

      const positions = await mockPosition.getPositionsByOwner(alice.address);
      const positionId = Number(positions[0]);

      const increaseCost = await core.calculateIncreaseCost(
        positionId,
        increaseQuantity
      );
      const increaseMaxCost = increaseCost + ethers.parseUnits("0.01", USDC_DECIMALS);

      // Then increase it
      await expect(
        core
          .connect(alice)
          .increasePosition(positionId, increaseQuantity, increaseMaxCost)
      )
        .to.emit(core, "PositionIncreased")
        .withArgs(
          positionId, // positionId
          alice.address, // user
          increaseQuantity, // quantityAdded
          (newTotalQuantity: any) => newTotalQuantity > increaseQuantity, // newTotalQuantity
          (cost: any) => cost > 0 // cost should be positive
        );
    });

    it("Should emit PositionDecreased event with correct parameters", async function () {
      const { core, alice, marketId, mockPosition } = await loadFixture(createActiveMarket);

      const lowerTick = 100100;
      const upperTick = 100200;
      const initialQuantity = SMALL_QUANTITY * 2n;
      const decreaseQuantity = INCREASE_QUANTITY;

      // First, open a position
      const initialCost = await core.calculateOpenCost(
        marketId,
        lowerTick,
        upperTick,
        initialQuantity
      );
      const initialMaxCost = initialCost + ethers.parseUnits("0.01", USDC_DECIMALS);
      await core
        .connect(alice)
        .openPosition(
          marketId,
          lowerTick,
          upperTick,
          initialQuantity,
          initialMaxCost
        );

      const positions = await mockPosition.getPositionsByOwner(alice.address);
      const positionId = Number(positions[0]);

      const expectedProceeds = await core.calculateDecreaseProceeds(
        positionId,
        decreaseQuantity
      );
      const minProceeds = expectedProceeds > 0n ? expectedProceeds - 1n : 0n;

      // Then decrease it
      await expect(
        core
          .connect(alice)
          .decreasePosition(positionId, decreaseQuantity, minProceeds)
      )
        .to.emit(core, "PositionDecreased")
        .withArgs(
          positionId, // positionId
          alice.address, // user
          decreaseQuantity, // quantityRemoved
          (newTotalQuantity: any) => newTotalQuantity >= 0, // newTotalQuantity
          (proceeds: any) => proceeds >= 0 // proceeds should be non-negative
        );
    });

    it("Should emit PositionClosed event with correct parameters", async function () {
      const { core, alice, marketId, mockPosition } = await loadFixture(createActiveMarket);

      const lowerTick = 100100;
      const upperTick = 100200;
      const quantity = SMALL_QUANTITY;

      // First, open a position
      const initialCost = await core.calculateOpenCost(
        marketId,
        lowerTick,
        upperTick,
        quantity
      );
      const maxCost = initialCost + ethers.parseUnits("0.01", USDC_DECIMALS);
      await core
        .connect(alice)
        .openPosition(
          marketId,
          lowerTick,
          upperTick,
          quantity,
          maxCost
        );

      const positions = await mockPosition.getPositionsByOwner(alice.address);
      const positionId = Number(positions[0]);
      const closeProceeds = await core.calculateCloseProceeds(positionId);
      const minProceeds = closeProceeds > 0n ? closeProceeds - 1n : 0n;

      // Then close it
      await expect(core.connect(alice).closePosition(positionId, minProceeds))
        .to.emit(core, "PositionClosed")
        .withArgs(
          positionId, // positionId
          alice.address, // user
          (proceeds: any) => proceeds >= 0 // finalProceeds should be non-negative
        );
    });

    it("Should emit PositionClaimed event with correct parameters", async function () {
      const { core, alice, keeper, marketId, endTime, mockPosition } =
        await loadFixture(createActiveMarket);

      const lowerTick = 100100;
      const upperTick = 100200;
      const quantity = SMALL_QUANTITY;

      // First, open a position
      const maxCost =
        (await core.calculateOpenCost(marketId, lowerTick, upperTick, quantity)) +
        ethers.parseUnits("0.01", USDC_DECIMALS);
      await core
        .connect(alice)
        .openPosition(
          marketId,
          lowerTick,
          upperTick,
          quantity,
          maxCost
        );

      const positions = await mockPosition.getPositionsByOwner(alice.address);
      const positionId = Number(positions[0]);

      // Fast forward past market end and settle
      await increaseToSafe(endTime + 1);
      await settleMarketAtTick(core, keeper, marketId, 100150);
      await advanceToClaimOpen(core, marketId);

      // Claim the position
      await expect(core.connect(alice).claimPayout(positionId))
        .to.emit(core, "PositionClaimed")
        .withArgs(
          positionId, // positionId
          alice.address, // user
          (payout: any) => payout >= 0 // payout should be non-negative
        );
    });
  });

  describe("Trading Events with Detailed Parameters", function () {
    async function createActiveMarket() {
      return await loadFixture(createActiveMarketFixture);
    }

    it("Should emit detailed events for complex position operations", async function () {
      const { core, alice, bob, marketId, mockPosition } = await loadFixture(
        createActiveMarket
      );

      const lowerTick = 100100;
      const upperTick = 100300;
      const quantity = ethers.parseUnits("0.01", USDC_DECIMALS);
      const quotedCost = await core.calculateOpenCost(
        marketId,
        lowerTick,
        upperTick,
        quantity
      );
      const maxCost = (quotedCost * 1005n) / 1000n + 1n;

      // Complex sequence: open, increase, decrease, transfer
      const openTx = await core
        .connect(alice)
        .openPosition(
          marketId,
          lowerTick,
          upperTick,
          quantity,
          maxCost
        );

      await expect(openTx).to.emit(core, "PositionOpened");

      const positions = await mockPosition.getPositionsByOwner(alice.address);
      const positionId = Number(positions[0]);

      // Increase position
      const increaseCost = await core.calculateIncreaseCost(positionId, quantity);
      const increaseMaxCost = (increaseCost * 1005n) / 1000n + 1n;

      const increaseTx = await core
        .connect(alice)
        .increasePosition(positionId, quantity, increaseMaxCost);

      await expect(increaseTx).to.emit(core, "PositionIncreased");

      // Decrease position
      const decreaseTx = await core
        .connect(alice)
        .decreasePosition(positionId, quantity, 0);

      await expect(decreaseTx).to.emit(core, "PositionDecreased");
    });

    it("Should emit events with proper gas tracking", async function () {
      const { core, alice, marketId, mockPosition } = await loadFixture(createActiveMarket);

      const lowerTick = 100100;
      const upperTick = 100200;
      const quantity = ethers.parseUnits("0.005", USDC_DECIMALS);
      const quotedCost = await core.calculateOpenCost(
        marketId,
        lowerTick,
        upperTick,
        quantity
      );
      const maxCost = (quotedCost * 1005n) / 1000n + 1n;

      // Track gas usage through events
      const tx = await core
        .connect(alice)
        .openPosition(
          marketId,
          lowerTick,
          upperTick,
          quantity,
          maxCost
        );

      const receipt = await tx.wait();
      expect(receipt!.gasUsed).to.be.gt(0);

      // Verify event was emitted with correct gas context
      await expect(tx).to.emit(core, "PositionOpened");
    });
  });

  describe("Error Events", function () {
    async function createActiveMarket() {
      return createActiveMarketFixture();
    }

    it("Should emit error-related events on failed operations", async function () {
      const { core, alice, marketId, mockPosition } = await loadFixture(createActiveMarket);

      const lowerTick = 100100;
      const upperTick = 100200;
      const quantity = ethers.parseUnits("0.01", USDC_DECIMALS);
      const quotedCost = await core.calculateOpenCost(
        marketId,
        lowerTick,
        upperTick,
        quantity
      );
      const tooLowMaxCost = quotedCost - 1n;

      // This should fail with CostExceedsMaximum
      await expect(
        core
          .connect(alice)
          .openPosition(
            marketId,
            lowerTick,
            upperTick,
            quantity,
            tooLowMaxCost
          )
      )
        .to.be.revertedWithCustomError(core, "CostExceedsMaximum")
        .withArgs(quotedCost, tooLowMaxCost);
    });

    it("Should handle event emissions during edge cases", async function () {
      const { core, alice, marketId, mockPosition } = await loadFixture(createActiveMarket);

      const lowerTick = 100100;
      const upperTick = 100200;
      const smallQuantity = ethers.parseUnits("0.000001", USDC_DECIMALS); // Very small
      const quotedCost = await core.calculateOpenCost(
        marketId,
        lowerTick,
        upperTick,
        smallQuantity
      );
      const maxCost = (quotedCost * 1010n) / 1000n + 1n;

      // This should still work and emit proper events
      await expect(
        core
          .connect(alice)
          .openPosition(
            marketId,
            lowerTick,
            upperTick,
            smallQuantity,
            maxCost
          )
      ).to.emit(core, "PositionOpened");
    });
  });

  describe("Market State Events", function () {
    it("Should emit events during market lifecycle transitions", async function () {
      const { core, keeper } = await loadFixture(createActiveMarketFixture);
      const startTime = (await time.latest()) + 60;
      const endTime = startTime + MARKET_DURATION;
      const settlementTime = endTime + 3600;

      const marketId = await core.connect(keeper).createMarket.staticCall(
        MIN_TICK,
        MAX_TICK,
        TICK_SPACING,
        startTime,
        endTime,
        settlementTime,
        ALPHA,
        ethers.ZeroAddress
      );

      // Market creation
      const createTx = core
        .connect(keeper)
        .createMarket(
          MIN_TICK,
          MAX_TICK,
          TICK_SPACING,
          startTime,
          endTime,
          settlementTime,
          ALPHA,
          ethers.ZeroAddress
        );

      await expect(createTx)
        .to.emit(core, "MarketCreated")
        .withArgs(
          marketId,
          BigInt(startTime),
          BigInt(endTime),
          BigInt(MIN_TICK),
          BigInt(MAX_TICK),
          BigInt(TICK_SPACING),
          BigInt((MAX_TICK - MIN_TICK) / TICK_SPACING),
          ALPHA
        );

      await expect(createTx)
        .to.emit(core, "MarketActivationUpdated")
        .withArgs(marketId, false);

      // Market activation (start time reached)
      await increaseToSafe(startTime + 1);

      // Market ending (end time reached)
      await increaseToSafe(endTime + 1);

      // Market settlement
      await expect(
        settleMarketAtTick(core, keeper, Number(marketId), 100450)
      ).to.emit(core, "MarketSettled");
    });

    it("Should emit proper timestamp information in events", async function () {
      const { core, keeper } = await loadFixture(createActiveMarketFixture);
      const startTime = (await time.latest()) + 60;
      const endTime = startTime + MARKET_DURATION;
      const settlementTime = endTime + 3600;

      const currentBlockTime = await time.latest();

      const marketId = await core.connect(keeper).createMarket.staticCall(
        MIN_TICK,
        MAX_TICK,
        TICK_SPACING,
        startTime,
        endTime,
        settlementTime,
        ALPHA
      );

      const createTx = core
        .connect(keeper)
        .createMarket(
          MIN_TICK,
          MAX_TICK,
          TICK_SPACING,
          startTime,
          endTime,
          settlementTime,
          ALPHA
        );

      await expect(createTx)
        .to.emit(core, "MarketCreated")
        .withArgs(
          marketId,
          BigInt(startTime),
          BigInt(endTime),
          BigInt(MIN_TICK),
          BigInt(MAX_TICK),
          BigInt(TICK_SPACING),
          BigInt((MAX_TICK - MIN_TICK) / TICK_SPACING),
          ALPHA
        );

      await expect(createTx)
        .to.emit(core, "MarketActivationUpdated")
        .withArgs(marketId, false);

      // Verify timestamps are within reasonable bounds
      expect(startTime).to.be.gt(currentBlockTime);
      expect(endTime).to.be.gt(startTime);
    });
  });

  describe("Event Data Integrity", function () {
    async function createActiveMarket() {
      return createActiveMarketFixture();
    }

    it("Should maintain event parameter consistency across operations", async function () {
      const { core, alice, marketId, mockPosition } = await loadFixture(createActiveMarket);

      const lowerTick = 100100;
      const upperTick = 100200;
      const quantity = ethers.parseUnits("0.01", USDC_DECIMALS);
      const quotedOpenCost = await core.calculateOpenCost(
        marketId,
        lowerTick,
        upperTick,
        quantity
      );
      const maxCost = (quotedOpenCost * 1005n) / 1000n + 1n;

      // Capture events from multiple operations
      const operations = [];

      // Open position
      const openTx = await core
        .connect(alice)
        .openPosition(
          marketId,
          lowerTick,
          upperTick,
          quantity,
          maxCost
        );
      operations.push({ type: "open", tx: openTx });

      const positions = await mockPosition.getPositionsByOwner(alice.address);
      const positionId = Number(positions[0]);

      // Increase position
      const quotedIncreaseCost = await core.calculateIncreaseCost(
        positionId,
        quantity
      );
      const increaseMaxCost = (quotedIncreaseCost * 1005n) / 1000n + 1n;

      const increaseTx = await core
        .connect(alice)
        .increasePosition(positionId, quantity, increaseMaxCost);
      operations.push({ type: "increase", tx: increaseTx });

      // Decrease position
      const decreaseTx = await core
        .connect(alice)
        .decreasePosition(positionId, quantity, 0);
      operations.push({ type: "decrease", tx: decreaseTx });

      // Verify all operations emitted their respective events
      await expect(operations[0].tx).to.emit(core, "PositionOpened");
      await expect(operations[1].tx).to.emit(core, "PositionIncreased");
      await expect(operations[2].tx).to.emit(core, "PositionDecreased");
    });

    it("Should handle large numeric values in events", async function () {
      const { core, alice, marketId, mockPosition } = await loadFixture(createActiveMarket);

      const lowerTick = 100100;
      const upperTick = 100900; // Large range
      const largeQuantity = ethers.parseUnits("0.05", USDC_DECIMALS); // Keep within stable range
      const quotedLargeCost = await core.calculateOpenCost(
        marketId,
        lowerTick,
        upperTick,
        largeQuantity
      );
      const largeMaxCost = (quotedLargeCost * 1005n) / 1000n + 1n;

      // This should handle large values properly in events
      await expect(
        core
          .connect(alice)
          .openPosition(
            marketId,
            lowerTick,
            upperTick,
            largeQuantity,
            largeMaxCost
          )
      ).to.emit(core, "PositionOpened");
    });
  });

  describe("Settlement Batch Emission", function () {
    it("Should revert when limit is zero", async function () {
      const { core, keeper, alice, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      const lowerTick = 100100;
      const upperTick = 100200;
      const quotedCost = await core.calculateOpenCost(
        marketId,
        lowerTick,
        upperTick,
        SMALL_QUANTITY
      );
      await core
        .connect(alice)
        .openPosition(
          marketId,
          lowerTick,
          upperTick,
          SMALL_QUANTITY,
          applyBuffer(quotedCost)
        );

      await time.increase(MARKET_DURATION + 3600);
      await settleMarketAtTick(core, keeper, marketId, 100140);

      await expect(
        core.connect(keeper).emitPositionSettledBatch(marketId, 0)
      ).to.be.revertedWithCustomError(core, "ZeroLimit");
    });

    it("Should revert when market is not settled", async function () {
      const { core, keeper, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      await expect(
        core.connect(keeper).emitPositionSettledBatch(marketId, 1)
      )
        .to.be.revertedWithCustomError(core, "MarketNotSettled")
        .withArgs(marketId);
    });

    it("Should resume cursor across batches and skip burned holes", async function () {
      const {
        core,
        keeper,
        marketId,
        alice,
        charlie,
        aliceId,
        charlieId,
        listLength,
      } = await loadFixture(setupSettledBatchFixture);

      const firstBatch = core
        .connect(keeper)
        .emitPositionSettledBatch(marketId, 1);
      await expect(firstBatch)
        .to.emit(core, "PositionSettled")
        .withArgs(
          aliceId,
          alice.address,
          (payout: bigint) => payout >= 0n,
          (isWin: boolean) => typeof isWin === "boolean"
        );
      await expect(firstBatch)
        .to.emit(core, "PositionEventsProgress")
        .withArgs(BigInt(marketId), 0, 0, false);

      const secondBatch = core
        .connect(keeper)
        .emitPositionSettledBatch(marketId, 1);
      await expect(secondBatch).to.not.emit(core, "PositionSettled");
      await expect(secondBatch)
        .to.emit(core, "PositionEventsProgress")
        .withArgs(BigInt(marketId), 1, 1, false);

      const thirdBatch = core
        .connect(keeper)
        .emitPositionSettledBatch(marketId, 1);
      await expect(thirdBatch)
        .to.emit(core, "PositionSettled")
        .withArgs(
          charlieId,
          charlie.address,
          (payout: bigint) => payout >= 0n,
          (isWin: boolean) => typeof isWin === "boolean"
        );
      await expect(thirdBatch)
        .to.emit(core, "PositionEventsProgress")
        .withArgs(BigInt(marketId), 2, 2, true);

      const market = await core.getMarket(marketId);
      expect(market.positionEventsEmitted).to.be.true;
      expect(Number(market.positionEventsCursor)).to.equal(Number(listLength));

      await expect(
        core.connect(keeper).emitPositionSettledBatch(marketId, 5)
      ).to.not.emit(core, "PositionSettled");
    });
  });

  describe("Market Reopen Flow", function () {
    it("Should revert reopen before settlement", async function () {
      const { core, keeper, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      await expect(core.connect(keeper).reopenMarket(marketId))
        .to.be.revertedWithCustomError(core, "MarketNotSettled")
        .withArgs(marketId);
    });

    it("Should reset settlement state and enable new trades", async function () {
      const { core, keeper, alice, marketId } = await loadFixture(
        setupSettledBatchFixture
      );

      await expect(core.connect(keeper).reopenMarket(marketId))
        .to.emit(core, "MarketReopened")
        .withArgs(marketId);

      const market = await core.getMarket(marketId);
      expect(market.settled).to.be.false;
      expect(market.isActive).to.be.true;
      expect(Number(market.positionEventsCursor)).to.equal(0);
      expect(market.positionEventsEmitted).to.be.false;

      const current = await time.latest();
      const newStart = Number(current) + 500;
      const newEnd = newStart + MARKET_DURATION;
      const newSettlement = newEnd + 3600;

      await core
        .connect(keeper)
        .updateMarketTiming(marketId, newStart, newEnd, newSettlement);

      await increaseToSafe(newStart + 1);

      const lowerTick = 100200;
      const upperTick = 100260;
      const quotedCost = await core.calculateOpenCost(
        marketId,
        lowerTick,
        upperTick,
        SMALL_QUANTITY
      );

      await expect(
        core
          .connect(alice)
          .openPosition(
            marketId,
            lowerTick,
            upperTick,
            SMALL_QUANTITY,
            applyBuffer(quotedCost)
          )
      ).to.emit(core, "PositionOpened");
    });
  });
});
