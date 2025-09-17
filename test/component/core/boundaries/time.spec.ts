import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { coreFixture, setupCustomMarket } from "../../../helpers/fixtures/core";
import { COMPONENT_TAG } from "../../../helpers/tags";

describe(`${COMPONENT_TAG} CLMSRMarketCore - Time Boundaries`, function () {
  describe("Trade Timing Validation", function () {
    it("Should handle trade at exact market start time", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, alice } = contracts;

      const { marketId } = await setupCustomMarket(contracts, {
        marketId: 1,
        alpha: ethers.parseEther("0.1"),
      });

      const tradeParams = {
        marketId,
        lowerTick: 100100,
        upperTick: 100200,
        quantity: ethers.parseUnits("0.01", 6),
        maxCost: ethers.parseUnits("1000", 6),
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

    it("Should handle trade 1 second before market end", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, alice, keeper } = contracts;

      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;
      const marketId = Math.floor(Math.random() * 1000000) + 1;

      await core.connect(keeper).createMarket(
        marketId,
        100000, // minTick
        100990, // maxTick
        10, // tickSpacing
        startTime,
        endTime,
        ethers.parseEther("0.1")
      );

      // Move to 1 second before end
      await time.setNextBlockTimestamp(endTime - 1);

      const tradeParams = {
        marketId,
        lowerTick: 100100,
        upperTick: 100200,
        quantity: ethers.parseUnits("0.01", 6),
        maxCost: ethers.parseUnits("1000", 6),
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

    it("Should deactivate market when trading after end time", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, alice, keeper } = contracts;

      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;
      const marketId = Math.floor(Math.random() * 1000000) + 1;

      await core.connect(keeper).createMarket(
        marketId,
        100000, // minTick
        100990, // maxTick
        10, // tickSpacing
        startTime,
        endTime,
        ethers.parseEther("0.1")
      );

      // Move past end time
      await time.setNextBlockTimestamp(endTime + 1);

      const tradeParams = {
        marketId,
        lowerTick: 100100,
        upperTick: 100200,
        quantity: ethers.parseUnits("0.01", 6),
        maxCost: ethers.parseUnits("1000", 6),
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
      ).to.be.revertedWithCustomError(core, "MarketExpired");
    });

    it("Should prevent trading before market start", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper, alice } = contracts;

      const futureStart = (await time.latest()) + 3600; // 1 hour from now
      const futureEnd = futureStart + 86400; // 1 day duration
      const marketId = Math.floor(Math.random() * 1000000) + 1;

      await core.connect(keeper).createMarket(
        marketId,
        100000, // minTick
        100990, // maxTick
        10, // tickSpacing
        futureStart,
        futureEnd,
        ethers.parseEther("0.1")
      );

      const tradeParams = {
        marketId,
        lowerTick: 100100,
        upperTick: 100200,
        quantity: ethers.parseUnits("0.01", 6),
        maxCost: ethers.parseUnits("1000", 6),
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
      ).to.be.revertedWithCustomError(core, "MarketNotStarted");
    });
  });

  describe("Block Timestamp Edge Cases", function () {
    it("Should handle block timestamp jumps correctly", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, alice, keeper } = contracts;

      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;
      const marketId = Math.floor(Math.random() * 1000000) + 1;

      await core.connect(keeper).createMarket(
        marketId,
        100000, // minTick
        100990, // maxTick
        10, // tickSpacing
        startTime,
        endTime,
        ethers.parseEther("0.1")
      );

      // Jump to near end time
      await time.setNextBlockTimestamp(endTime - 10);

      const tradeParams = {
        marketId,
        lowerTick: 100100,
        upperTick: 100200,
        quantity: ethers.parseUnits("0.01", 6),
        maxCost: ethers.parseUnits("1000", 6),
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

      // Jump past end time
      await time.setNextBlockTimestamp(endTime + 1);

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
      ).to.be.revertedWithCustomError(core, "MarketExpired");
    });

    it("Should handle extreme timestamp values", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper } = contracts;

      // Test with very large timestamp values
      const farFuture = 2147483647; // Max 32-bit timestamp
      const farFutureEnd = farFuture + 86400;
      const marketId = Math.floor(Math.random() * 1000000) + 1;

      await expect(
        core.connect(keeper).createMarket(
          marketId,
          100000, // minTick
          100990, // maxTick
          10, // tickSpacing
          farFuture,
          farFutureEnd,
          ethers.parseEther("0.1")
        )
      ).to.not.be.reverted;
    });
  });

  describe("Market Expiry Operations", function () {
    it("Should handle market expiry edge cases during operations", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper, alice } = contracts;

      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;
      const marketId = Math.floor(Math.random() * 1000000) + 1;

      await core.connect(keeper).createMarket(
        marketId,
        100000, // minTick
        100990, // maxTick
        10, // tickSpacing
        startTime,
        endTime,
        ethers.parseEther("0.1")
      );

      await time.increaseTo(startTime + 1);

      // Open position before expiry
      const openParams = {
        marketId,
        lowerTick: 100100,
        upperTick: 100200,
        quantity: ethers.parseUnits("0.05", 6),
        maxCost: ethers.parseUnits("1000", 6),
      };

      await core
        .connect(alice)
        .openPosition(
          alice.address,
          openParams.marketId,
          openParams.lowerTick,
          openParams.upperTick,
          openParams.quantity,
          openParams.maxCost
        );
      const positionId = 1n;

      // Move to exactly 1 second after expiry
      await time.setNextBlockTimestamp(endTime + 1);

      // All operations should fail after expiry
      await expect(
        core
          .connect(alice)
          .increasePosition(
            positionId,
            ethers.parseUnits("0.01", 6),
            ethers.parseUnits("1000", 6)
          )
      ).to.be.revertedWithCustomError(core, "MarketExpired");

      await expect(
        core
          .connect(alice)
          .decreasePosition(positionId, ethers.parseUnits("0.01", 6), 0)
      ).to.be.revertedWithCustomError(core, "MarketExpired");

      await expect(
        core.connect(alice).closePosition(positionId, 0)
      ).to.be.revertedWithCustomError(core, "MarketExpired");
    });

    it("Should allow settlement after expiry", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper } = contracts;

      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;
      const marketId = Math.floor(Math.random() * 1000000) + 1;

      await core.connect(keeper).createMarket(
        marketId,
        100000, // minTick
        100990, // maxTick
        10, // tickSpacing
        startTime,
        endTime,
        ethers.parseEther("0.1")
      );

      // Fast forward past market end time
      await time.increaseTo(endTime + 1);

      // Settlement should still work after expiry
      await expect(core.connect(keeper).settleMarket(marketId, 49, 50)).to.not
        .be.reverted;
    });
  });

  describe("Extended Time Boundaries", function () {
    it("Should handle trade at exact market start time", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, alice, keeper } = contracts;

      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;
      const marketId = Math.floor(Math.random() * 1000000) + 1;

      await core.connect(keeper).createMarket(
        marketId,
        100000, // minTick
        100990, // maxTick
        10, // tickSpacing
        startTime,
        endTime,
        ethers.parseEther("0.1")
      );

      // Move to exact start time
      await time.setNextBlockTimestamp(startTime);

      const tradeParams = {
        marketId,
        lowerTick: 100100,
        upperTick: 100200,
        quantity: ethers.parseUnits("0.01", 6),
        maxCost: ethers.parseUnits("1000", 6),
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

    it("Should handle trade 1 second before market end", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, alice, keeper } = contracts;

      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;
      const marketId = Math.floor(Math.random() * 1000000) + 1;

      await core.connect(keeper).createMarket(
        marketId,
        100000, // minTick
        100990, // maxTick
        10, // tickSpacing
        startTime,
        endTime,
        ethers.parseEther("0.1")
      );

      // Move to 1 second before end
      await time.setNextBlockTimestamp(endTime - 1);

      const tradeParams = {
        marketId,
        lowerTick: 100100,
        upperTick: 100200,
        quantity: ethers.parseUnits("0.01", 6),
        maxCost: ethers.parseUnits("1000", 6),
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

    it("Should deactivate market when trading after end time", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, alice, keeper } = contracts;

      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;
      const marketId = Math.floor(Math.random() * 1000000) + 1;

      await core.connect(keeper).createMarket(
        marketId,
        100000, // minTick
        100990, // maxTick
        10, // tickSpacing
        startTime,
        endTime,
        ethers.parseEther("0.1")
      );

      // Move past end time
      await time.setNextBlockTimestamp(endTime + 1);

      const tradeParams = {
        marketId,
        lowerTick: 100100,
        upperTick: 100200,
        quantity: ethers.parseUnits("0.01", 6),
        maxCost: ethers.parseUnits("1000", 6),
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
      ).to.be.revertedWithCustomError(core, "MarketExpired");
    });

    it("Should prevent trading before market start", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper, alice } = contracts;

      const futureStart = (await time.latest()) + 3600; // 1 hour from now
      const futureEnd = futureStart + 86400; // 1 day duration
      const marketId = Math.floor(Math.random() * 1000000) + 1;

      await core
        .connect(keeper)
        .createMarket(
          2,
          100000,
          100990,
          10,
          futureStart,
          futureEnd,
          ethers.parseEther("0.1")
        );

      const tradeParams = {
        marketId: 2,
        lowerTick: 100100,
        upperTick: 100200,
        quantity: ethers.parseUnits("0.01", 6),
        maxCost: ethers.parseUnits("1000", 6),
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
      ).to.be.revertedWithCustomError(core, "MarketNotStarted");
    });

    it("Should handle block timestamp jumps correctly", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, alice, keeper } = contracts;

      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;
      const marketId = Math.floor(Math.random() * 1000000) + 1;

      await core.connect(keeper).createMarket(
        marketId,
        100000, // minTick
        100990, // maxTick
        10, // tickSpacing
        startTime,
        endTime,
        ethers.parseEther("0.1")
      );

      // Jump to near end time
      await time.setNextBlockTimestamp(endTime - 10);

      const tradeParams = {
        marketId,
        lowerTick: 100100,
        upperTick: 100200,
        quantity: ethers.parseUnits("0.01", 6),
        maxCost: ethers.parseUnits("1000", 6),
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

      // Jump past end time
      await time.setNextBlockTimestamp(endTime + 1);

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
      ).to.be.revertedWithCustomError(core, "MarketExpired");
    });

    it("Should handle extreme timestamp values", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper } = contracts;

      // Test with very large timestamp values
      const farFuture = 2147483647; // Max 32-bit timestamp
      const farFutureEnd = farFuture + 86400;
      const marketId = Math.floor(Math.random() * 1000000) + 1;

      await expect(
        core.connect(keeper).createMarket(
          5,
          100000, // minTick
          100990, // maxTick
          10, // tickSpacing
          farFuture,
          farFutureEnd,
          ethers.parseEther("0.1")
        )
      ).to.not.be.reverted;
    });

    it("Should handle market expiry edge cases during operations", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, alice, keeper } = contracts;

      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;
      const marketId = Math.floor(Math.random() * 1000000) + 1;

      await core.connect(keeper).createMarket(
        marketId,
        100000, // minTick
        100990, // maxTick
        10, // tickSpacing
        startTime,
        endTime,
        ethers.parseEther("0.1")
      );

      await time.increaseTo(startTime + 1);

      // Open position before expiry
      const openParams = {
        marketId,
        lowerTick: 100100,
        upperTick: 100200,
        quantity: ethers.parseUnits("0.05", 6),
        maxCost: ethers.parseUnits("1000", 6),
      };

      await core
        .connect(alice)
        .openPosition(
          alice.address,
          openParams.marketId,
          openParams.lowerTick,
          openParams.upperTick,
          openParams.quantity,
          openParams.maxCost
        );
      const positionId = 1n;

      // Move to exactly 1 second after expiry
      await time.setNextBlockTimestamp(endTime + 1);

      // All operations should fail after expiry
      await expect(
        core
          .connect(alice)
          .increasePosition(
            positionId,
            ethers.parseUnits("0.01", 6),
            ethers.parseUnits("1000", 6)
          )
      ).to.be.revertedWithCustomError(core, "MarketExpired");

      await expect(
        core
          .connect(alice)
          .decreasePosition(positionId, ethers.parseUnits("0.01", 6), 0)
      ).to.be.revertedWithCustomError(core, "MarketExpired");

      await expect(
        core.connect(alice).closePosition(positionId, 0)
      ).to.be.revertedWithCustomError(core, "MarketExpired");
    });
  });

  describe("Settlement Timestamp Features", function () {
    it("Should create market with settlement timestamp using createMarket", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper } = contracts;

      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400; // 1 day later
      const settlementTime = endTime + 3600; // 1 hour after end
      const marketId = Math.floor(Math.random() * 1000000) + 1;

      await expect(
        core.connect(keeper).createMarket(
          100000, // minTick
          100990, // maxTick
          10, // tickSpacing
          startTime,
          endTime,
          settlementTime,
          ethers.parseEther("0.1")
        )
      ).to.not.be.reverted;

      const market = await core.getMarket(marketId);
      expect(market.startTimestamp).to.equal(startTime);
      expect(market.endTimestamp).to.equal(endTime);
      expect(market.settlementTimestamp).to.equal(settlementTime);
    });

    it("Should reject createMarket with invalid time order", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper } = contracts;

      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;
      const invalidSettlementTime = endTime - 100; // Before end time - invalid!

      await expect(
        core.connect(keeper).createMarket(
          100000, // minTick
          100990, // maxTick
          10, // tickSpacing
          startTime,
          endTime,
          invalidSettlementTime,
          ethers.parseEther("0.1")
        )
      ).to.be.revertedWithCustomError(core, "InvalidTimeRange");
    });

    it("Should update settlement timestamp correctly", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper } = contracts;

      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;
      const marketId = Math.floor(Math.random() * 1000000) + 1;

      // Create market with legacy method (no settlement timestamp)
      await core.connect(keeper).createMarket(
        100000, // minTick
        100990, // maxTick
        10, // tickSpacing
        startTime,
        endTime,
        ethers.parseEther("0.1")
      );

      const newSettlementTime = endTime + 3600; // 1 hour after end

      await expect(
        core
          .connect(keeper)
          .updateSettlementTimestamp(marketId, newSettlementTime)
      ).to.not.be.reverted;

      const market = await core.getMarket(marketId);
      expect(market.settlementTimestamp).to.equal(newSettlementTime);
    });

    it("Should reject updateSettlementTimestamp with invalid time", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper } = contracts;

      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;
      const marketId = Math.floor(Math.random() * 1000000) + 1;

      await core.connect(keeper).createMarket(
        100000, // minTick
        100990, // maxTick
        10, // tickSpacing
        startTime,
        endTime,
        ethers.parseEther("0.1")
      );

      const invalidSettlementTime = endTime - 100; // Before end time

      await expect(
        core
          .connect(keeper)
          .updateSettlementTimestamp(marketId, invalidSettlementTime)
      ).to.be.revertedWithCustomError(core, "InvalidTimeRange");
    });

    it("Should enforce settlement time gate in settleMarket", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper } = contracts;

      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;
      const settlementTime = endTime + 3600; // 1 hour after end
      const marketId = Math.floor(Math.random() * 1000000) + 1;

      await core.connect(keeper).createMarket(
        100000, // minTick
        100990, // maxTick
        10, // tickSpacing
        startTime,
        endTime,
        settlementTime,
        ethers.parseEther("0.1")
      );

      // Try to settle before settlement time (but after end time)
      await time.setNextBlockTimestamp(endTime + 1800); // 30 minutes after end, but before settlement

      await expect(
        core.connect(keeper).settleMarket(marketId, 100000 * 1000000) // 100000 with 6 decimals
      ).to.be.revertedWithCustomError(core, "SettlementTooEarly");

      // Settlement should work at or after settlement time
      await time.setNextBlockTimestamp(settlementTime + 1);

      await expect(
        core.connect(keeper).settleMarket(marketId, 100000 * 1000000)
      ).to.not.be.reverted;
    });

    it("Should allow settlement after endTime for legacy markets (no settlementTimestamp)", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper } = contracts;

      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;
      const marketId = Math.floor(Math.random() * 1000000) + 1;

      // Create legacy market (no settlement timestamp)
      await core.connect(keeper).createMarket(
        100000, // minTick
        100990, // maxTick
        10, // tickSpacing
        startTime,
        endTime,
        ethers.parseEther("0.1")
      );

      // Move just after end time
      await time.setNextBlockTimestamp(endTime + 1);

      // Should work because settlementTimestamp is 0, so it falls back to endTimestamp
      await expect(
        core.connect(keeper).settleMarket(marketId, 100000 * 1000000)
      ).to.not.be.reverted;
    });

    it("Should enforce cross-constraint in updateMarketTiming when settlementTimestamp exists", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper } = contracts;

      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;
      const settlementTime = endTime + 3600;
      const marketId = Math.floor(Math.random() * 1000000) + 1;

      await core.connect(keeper).createMarket(
        100000, // minTick
        100990, // maxTick
        10, // tickSpacing
        startTime,
        endTime,
        settlementTime,
        ethers.parseEther("0.1")
      );

      const newStartTime = startTime + 1800; // 30 minutes later
      const invalidNewEndTime = settlementTime + 100; // After settlement time - invalid!

      await expect(
        core
          .connect(keeper)
          .updateMarketTiming(marketId, newStartTime, invalidNewEndTime)
      ).to.be.revertedWithCustomError(core, "InvalidTimeRange");

      // Valid update: new end time before settlement time
      const validNewEndTime = settlementTime - 100;

      await expect(
        core
          .connect(keeper)
          .updateMarketTiming(marketId, newStartTime, validNewEndTime)
      ).to.not.be.reverted;
    });

    it("Should allow updateMarketTiming without cross-constraint for legacy markets", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper } = contracts;

      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;
      const marketId = Math.floor(Math.random() * 1000000) + 1;

      // Legacy market (no settlement timestamp)
      await core.connect(keeper).createMarket(
        100000, // minTick
        100990, // maxTick
        10, // tickSpacing
        startTime,
        endTime,
        ethers.parseEther("0.1")
      );

      const newStartTime = startTime + 1800;
      const newEndTime = endTime + 3600; // Extend end time

      // Should work because there's no settlement timestamp constraint
      await expect(
        core
          .connect(keeper)
          .updateMarketTiming(marketId, newStartTime, newEndTime)
      ).to.not.be.reverted;
    });

    it("Should prevent updateSettlementTimestamp on settled market", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper } = contracts;

      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;
      const settlementTime = endTime + 3600;
      const marketId = Math.floor(Math.random() * 1000000) + 1;

      await core.connect(keeper).createMarket(
        100000, // minTick
        100990, // maxTick
        10, // tickSpacing
        startTime,
        endTime,
        settlementTime,
        ethers.parseEther("0.1")
      );

      // Settle the market
      await time.setNextBlockTimestamp(settlementTime + 1);
      await core.connect(keeper).settleMarket(marketId, 100000 * 1000000);

      // Try to update settlement timestamp after settlement
      await expect(
        core
          .connect(keeper)
          .updateSettlementTimestamp(marketId, settlementTime + 3600)
      ).to.be.revertedWithCustomError(core, "MarketAlreadySettled");
    });
  });
});
