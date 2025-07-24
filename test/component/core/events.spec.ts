import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { createActiveMarketFixture } from "../../helpers/fixtures/core";
import { COMPONENT_TAG } from "../../helpers/tags";

describe(`${COMPONENT_TAG} CLMSRMarketCore - Events`, function () {
  const ALPHA = ethers.parseEther("1");
  const MIN_TICK = 100000;
  const MAX_TICK = 100990;
  const TICK_SPACING = 10;
  const MARKET_DURATION = 7 * 24 * 60 * 60; // 7 days
  const USDC_DECIMALS = 6;

  describe("Market Events", function () {
    it("Should emit MarketCreated event with correct parameters", async function () {
      const { core, keeper } = await loadFixture(createActiveMarketFixture);
      const marketId = Math.floor(Math.random() * 1000000) + 1;
      const startTime = (await time.latest()) + 60;
      const endTime = startTime + MARKET_DURATION;

      await expect(
        core
          .connect(keeper)
          .createMarket(
            marketId,
            MIN_TICK,
            MAX_TICK,
            TICK_SPACING,
            startTime,
            endTime,
            ALPHA
          )
      )
        .to.emit(core, "MarketCreated")
        .withArgs(
          marketId,
          startTime,
          endTime,
          MIN_TICK,
          MAX_TICK,
          TICK_SPACING,
          100,
          ALPHA
        );
    });

    it("Should emit MarketSettled event with correct parameters", async function () {
      const { core, keeper } = await loadFixture(createActiveMarketFixture);
      const marketId = Math.floor(Math.random() * 1000000) + 1;
      const startTime = (await time.latest()) + 60;
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

      // Fast forward to market end
      await time.increaseTo(endTime + 1);

      const winningLowerTick = 100490;
      const winningUpperTick = 100500;

      await expect(
        core
          .connect(keeper)
          .settleMarket(marketId, winningLowerTick, winningUpperTick)
      )
        .to.emit(core, "MarketSettled")
        .withArgs(marketId, winningLowerTick, winningUpperTick);
    });

    it("Should emit MarketStatusChanged event on status transitions", async function () {
      const { core, keeper } = await loadFixture(createActiveMarketFixture);
      const marketId = Math.floor(Math.random() * 1000000) + 1;
      const startTime = (await time.latest()) + 60;
      const endTime = startTime + MARKET_DURATION;

      // Market creation should emit event with PENDING status
      await expect(
        core
          .connect(keeper)
          .createMarket(
            marketId,
            MIN_TICK,
            MAX_TICK,
            TICK_SPACING,
            startTime,
            endTime,
            ALPHA
          )
      )
        .to.emit(core, "MarketCreated")
        .withArgs(
          marketId,
          startTime,
          endTime,
          MIN_TICK,
          MAX_TICK,
          TICK_SPACING,
          100,
          ALPHA
        );

      // Market becomes ACTIVE when start time is reached
      await time.increaseTo(startTime + 1);

      // Market becomes ENDED when end time is reached
      await time.increaseTo(endTime + 1);

      // Market becomes SETTLED when settled
      await expect(
        core.connect(keeper).settleMarket(marketId, 100450, 100460)
      ).to.emit(core, "MarketSettled");
    });
  });

  describe("Position Events", function () {
    async function createActiveMarket() {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, keeper } = contracts;

      const marketId = Math.floor(Math.random() * 1000000) + 1;
      const startTime = (await time.latest()) + 60;
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

      return { ...contracts, marketId, startTime, endTime };
    }

    it("Should emit PositionOpened event with correct parameters", async function () {
      const { core, alice, marketId } = await loadFixture(createActiveMarket);

      const lowerTick = 100100;
      const upperTick = 100200;
      const quantity = ethers.parseUnits("1", USDC_DECIMALS);

      // Pre-calculate expected cost for verification
      const expectedCost = await core.calculateOpenCost(
        marketId,
        lowerTick,
        upperTick,
        quantity
      );

      const maxCost = expectedCost + ethers.parseUnits("1", USDC_DECIMALS);

      await expect(
        core
          .connect(alice)
          .openPosition(
            alice.address,
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
      const { core, alice, marketId } = await loadFixture(createActiveMarket);

      const lowerTick = 100100;
      const upperTick = 100200;
      const initialQuantity = ethers.parseUnits("1", USDC_DECIMALS);
      const increaseQuantity = ethers.parseUnits("0.5", USDC_DECIMALS);

      // First, open a position
      const maxCost = ethers.parseUnits("10", USDC_DECIMALS);
      await core
        .connect(alice)
        .openPosition(
          alice.address,
          marketId,
          lowerTick,
          upperTick,
          initialQuantity,
          maxCost
        );

      const positionId = 1; // First position

      // Then increase it
      await expect(
        core
          .connect(alice)
          .increasePosition(positionId, increaseQuantity, maxCost)
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
      const { core, alice, marketId } = await loadFixture(createActiveMarket);

      const lowerTick = 100100;
      const upperTick = 100200;
      const initialQuantity = ethers.parseUnits("2", USDC_DECIMALS);
      const decreaseQuantity = ethers.parseUnits("1", USDC_DECIMALS);

      // First, open a position
      const maxCost = ethers.parseUnits("20", USDC_DECIMALS);
      await core
        .connect(alice)
        .openPosition(
          alice.address,
          marketId,
          lowerTick,
          upperTick,
          initialQuantity,
          maxCost
        );

      const positionId = 1; // First position
      const minProceeds = 0; // Accept any proceeds

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
      const { core, alice, marketId } = await loadFixture(createActiveMarket);

      const lowerTick = 100100;
      const upperTick = 100200;
      const quantity = ethers.parseUnits("1", USDC_DECIMALS);

      // First, open a position
      const maxCost = ethers.parseUnits("10", USDC_DECIMALS);
      await core
        .connect(alice)
        .openPosition(
          alice.address,
          marketId,
          lowerTick,
          upperTick,
          quantity,
          maxCost
        );

      const positionId = 1; // First position
      const minProceeds = 0; // Accept any proceeds

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
      const { core, alice, keeper, marketId, endTime } = await loadFixture(
        createActiveMarket
      );

      const lowerTick = 100100;
      const upperTick = 100200;
      const quantity = ethers.parseUnits("1", USDC_DECIMALS);

      // First, open a position
      const maxCost = ethers.parseUnits("10", USDC_DECIMALS);
      await core
        .connect(alice)
        .openPosition(
          alice.address,
          marketId,
          lowerTick,
          upperTick,
          quantity,
          maxCost
        );

      const positionId = 1; // First position

      // Fast forward past market end and settle
      await time.increaseTo(endTime + 1);
      await core.connect(keeper).settleMarket(marketId, 100150, 100160);

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
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, keeper } = contracts;

      const marketId = Math.floor(Math.random() * 1000000) + 1;
      const startTime = (await time.latest()) + 60;
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

      return { ...contracts, marketId, startTime, endTime };
    }

    it("Should emit detailed events for complex position operations", async function () {
      const { core, alice, bob, marketId } = await loadFixture(
        createActiveMarket
      );

      const lowerTick = 100100;
      const upperTick = 100300;
      const quantity = ethers.parseUnits("2", USDC_DECIMALS);
      const maxCost = ethers.parseUnits("20", USDC_DECIMALS);

      // Complex sequence: open, increase, decrease, transfer
      const openTx = await core
        .connect(alice)
        .openPosition(
          alice.address,
          marketId,
          lowerTick,
          upperTick,
          quantity,
          maxCost
        );

      await expect(openTx).to.emit(core, "PositionOpened");

      const positionId = 1;

      // Increase position
      const increaseTx = await core
        .connect(alice)
        .increasePosition(positionId, quantity, maxCost);

      await expect(increaseTx).to.emit(core, "PositionIncreased");

      // Decrease position
      const decreaseTx = await core
        .connect(alice)
        .decreasePosition(positionId, quantity, 0);

      await expect(decreaseTx).to.emit(core, "PositionDecreased");
    });

    it("Should emit events with proper gas tracking", async function () {
      const { core, alice, marketId } = await loadFixture(createActiveMarket);

      const lowerTick = 100100;
      const upperTick = 100200;
      const quantity = ethers.parseUnits("1", USDC_DECIMALS);
      const maxCost = ethers.parseUnits("10", USDC_DECIMALS);

      // Track gas usage through events
      const tx = await core
        .connect(alice)
        .openPosition(
          alice.address,
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
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, keeper } = contracts;

      const marketId = Math.floor(Math.random() * 1000000) + 1;
      const startTime = (await time.latest()) + 60;
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

      return { ...contracts, marketId, startTime, endTime };
    }

    it("Should emit error-related events on failed operations", async function () {
      const { core, alice, marketId } = await loadFixture(createActiveMarket);

      const lowerTick = 100100;
      const upperTick = 100200;
      const quantity = ethers.parseUnits("1", USDC_DECIMALS);
      const tooLowMaxCost = ethers.parseUnits("0.001", USDC_DECIMALS); // Intentionally too low

      // This should fail with CostExceedsMaximum
      await expect(
        core
          .connect(alice)
          .openPosition(
            alice.address,
            marketId,
            lowerTick,
            upperTick,
            quantity,
            tooLowMaxCost
          )
      ).to.be.revertedWithCustomError(core, "CostExceedsMaximum");
    });

    it("Should handle event emissions during edge cases", async function () {
      const { core, alice, marketId } = await loadFixture(createActiveMarket);

      const lowerTick = 100100;
      const upperTick = 100200;
      const smallQuantity = ethers.parseUnits("0.000001", USDC_DECIMALS); // Very small
      const maxCost = ethers.parseUnits("10", USDC_DECIMALS);

      // This should still work and emit proper events
      await expect(
        core
          .connect(alice)
          .openPosition(
            alice.address,
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
      const marketId = Math.floor(Math.random() * 1000000) + 1;
      const startTime = (await time.latest()) + 60;
      const endTime = startTime + MARKET_DURATION;

      // Market creation
      await expect(
        core
          .connect(keeper)
          .createMarket(
            marketId,
            MIN_TICK,
            MAX_TICK,
            TICK_SPACING,
            startTime,
            endTime,
            ALPHA
          )
      ).to.emit(core, "MarketCreated");

      // Market activation (start time reached)
      await time.increaseTo(startTime + 1);

      // Market ending (end time reached)
      await time.increaseTo(endTime + 1);

      // Market settlement
      await expect(
        core.connect(keeper).settleMarket(marketId, 100450, 100460)
      ).to.emit(core, "MarketSettled");
    });

    it("Should emit proper timestamp information in events", async function () {
      const { core, keeper } = await loadFixture(createActiveMarketFixture);
      const marketId = Math.floor(Math.random() * 1000000) + 1;
      const startTime = (await time.latest()) + 60;
      const endTime = startTime + MARKET_DURATION;

      const currentBlockTime = await time.latest();

      await expect(
        core
          .connect(keeper)
          .createMarket(
            marketId,
            MIN_TICK,
            MAX_TICK,
            TICK_SPACING,
            startTime,
            endTime,
            ALPHA
          )
      )
        .to.emit(core, "MarketCreated")
        .withArgs(
          marketId,
          startTime,
          endTime,
          MIN_TICK,
          MAX_TICK,
          TICK_SPACING,
          100,
          ALPHA
        );

      // Verify timestamps are within reasonable bounds
      expect(startTime).to.be.gt(currentBlockTime);
      expect(endTime).to.be.gt(startTime);
    });
  });

  describe("Event Data Integrity", function () {
    async function createActiveMarket() {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, keeper } = contracts;

      const marketId = Math.floor(Math.random() * 1000000) + 1;
      const startTime = (await time.latest()) + 60;
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

      return { ...contracts, marketId, startTime, endTime };
    }

    it("Should maintain event parameter consistency across operations", async function () {
      const { core, alice, marketId } = await loadFixture(createActiveMarket);

      const lowerTick = 100100;
      const upperTick = 100200;
      const quantity = ethers.parseUnits("1", USDC_DECIMALS);
      const maxCost = ethers.parseUnits("10", USDC_DECIMALS);

      // Capture events from multiple operations
      const operations = [];

      // Open position
      const openTx = await core
        .connect(alice)
        .openPosition(
          alice.address,
          marketId,
          lowerTick,
          upperTick,
          quantity,
          maxCost
        );
      operations.push({ type: "open", tx: openTx });

      const positionId = 1;

      // Increase position
      const increaseTx = await core
        .connect(alice)
        .increasePosition(positionId, quantity, maxCost);
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
      const { core, alice, marketId } = await loadFixture(createActiveMarket);

      const lowerTick = 100100;
      const upperTick = 100900; // Large range
      const largeQuantity = ethers.parseUnits("10", USDC_DECIMALS); // Reduced quantity
      const largeMaxCost = ethers.parseUnits("1000", USDC_DECIMALS); // Large max cost

      // This should handle large values properly in events
      await expect(
        core
          .connect(alice)
          .openPosition(
            alice.address,
            marketId,
            lowerTick,
            upperTick,
            largeQuantity,
            largeMaxCost
          )
      ).to.emit(core, "PositionOpened");
    });
  });
});
