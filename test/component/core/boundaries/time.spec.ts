import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import {
  coreFixture,
  setupCustomMarket,
  createMarketWithConfig,
  toSettlementValue,
} from "../../../helpers/fixtures/core";
import { COMPONENT_TAG } from "../../../helpers/tags";

async function createTimedMarket(
  contracts: Awaited<ReturnType<typeof coreFixture>>,
  options: {
    minTick?: number;
    maxTick?: number;
    tickSpacing?: number;
    startTime?: number;
    endTime?: number;
    settlementTime?: number;
    startOffset?: number;
    duration?: number;
    settlementOffset?: number;
    liquidity?: bigint;
  } = {}
) {
  const {
    minTick = 100000,
    maxTick = 100990,
    tickSpacing = 10,
    startOffset = 100,
    duration = 86400,
    settlementOffset = 3600,
    liquidity = ethers.parseEther("0.1"),
  } = options;

  const currentTime = Number(await time.latest());
  const startTime = options.startTime ?? currentTime + startOffset;
  const endTime = options.endTime ?? startTime + duration;
  const settlementTime = options.settlementTime ?? endTime + settlementOffset;

  const marketId = await createMarketWithConfig(contracts.core, contracts.keeper, {
    minTick,
    maxTick,
    tickSpacing,
    startTime,
    endTime,
    liquidityParameter: liquidity,
    settlementTime,
  });

  return { marketId, startTime, endTime, settlementTime };
}

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
      const { core, alice } = contracts;

      const { marketId, endTime } = await createTimedMarket(contracts, {
        startOffset: 100,
        duration: 86400,
        liquidity: ethers.parseEther("0.1"),
      });

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
      const { core, alice } = contracts;

      const { marketId, endTime } = await createTimedMarket(contracts, {
        startOffset: 100,
        duration: 86400,
        liquidity: ethers.parseEther("0.1"),
      });

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
      const { core, alice } = contracts;

      const futureStart = Number(await time.latest()) + 3600; // 1 hour from now
      const futureEnd = futureStart + 86400; // 1 day duration

      const { marketId } = await createTimedMarket(contracts, {
        startTime: futureStart,
        endTime: futureEnd,
        liquidity: ethers.parseEther("0.1"),
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
      const { core, alice } = contracts;

      const { marketId, endTime } = await createTimedMarket(contracts, {
        startOffset: 100,
        duration: 86400,
        liquidity: ethers.parseEther("0.1"),
      });

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

      // Test with very large timestamp values
      const farFuture = 2_147_483_647; // Max 32-bit timestamp
      const farFutureEnd = farFuture + 86_400;

      await expect(
        createTimedMarket(contracts, {
          startTime: farFuture,
          endTime: farFutureEnd,
          settlementTime: farFutureEnd + 3600,
          liquidity: ethers.parseEther("0.1"),
        })
      ).to.be.fulfilled;
    });
  });

  describe("Market Expiry Operations", function () {
    it("Should handle market expiry edge cases during operations", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, alice } = contracts;

      const { marketId, startTime, endTime } = await createTimedMarket(
        contracts,
        {
          startOffset: 100,
          duration: 86400,
          liquidity: ethers.parseEther("0.1"),
        }
      );

      await time.setNextBlockTimestamp(startTime + 1);

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

      const { marketId, settlementTime } = await createTimedMarket(contracts, {
        startOffset: 100,
        duration: 86400,
      });

      // Fast forward past settlement time
      await time.increaseTo(settlementTime + 1);

      // Settlement should still work after expiry
      const settlementTick = 100450;
      await expect(
        core
          .connect(keeper)
          .settleMarket(marketId, toSettlementValue(settlementTick))
      ).to.not.be.reverted;
    });
  });

  describe("Extended Time Boundaries", function () {
    it("Should handle trade at exact market start time", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, alice } = contracts;

      const { marketId, startTime } = await createTimedMarket(contracts, {
        startOffset: 100,
        duration: 86400,
      });

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
      const { core, alice } = contracts;

      const { marketId, endTime } = await createTimedMarket(contracts, {
        startOffset: 100,
        duration: 86400,
      });

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
      const { core, alice } = contracts;

      const { marketId, endTime } = await createTimedMarket(contracts, {
        startOffset: 100,
        duration: 86400,
      });

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
      const { core, alice } = contracts;

      const futureStart = Number(await time.latest()) + 3600; // 1 hour from now

      const { marketId } = await createTimedMarket(contracts, {
        startTime: futureStart,
        endTime: futureStart + 86400,
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
      const { core, alice } = contracts;

      const { marketId, endTime } = await createTimedMarket(contracts, {
        startOffset: 100,
        duration: 86400,
      });

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
      const { core, alice } = contracts;

      const { marketId, startTime, endTime } = await createTimedMarket(
        contracts,
        {
          startOffset: 100,
          duration: 86400,
          liquidity: ethers.parseEther("0.1"),
        }
      );

      await time.setNextBlockTimestamp(startTime + 1);

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
      const { core } = contracts;

      const { marketId, startTime, endTime, settlementTime } =
        await createTimedMarket(contracts, {
          startOffset: 100,
          duration: 86400,
          settlementOffset: 3600,
        });

      const market = await core.getMarket(marketId);
      expect(market.startTimestamp).to.equal(startTime);
      expect(market.endTimestamp).to.equal(endTime);
      expect(market.settlementTimestamp).to.equal(settlementTime);
    });

    it("Should reject createMarket with invalid time order", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper } = contracts;

      const currentTime = Number(await time.latest());
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;
      const invalidSettlementTime = endTime - 100;

      await expect(
        core
          .connect(keeper)
          .createMarket(
            100000,
            100990,
            10,
            startTime,
            endTime,
            invalidSettlementTime,
            ethers.parseEther("0.1")
          )
      ).to.be.revertedWithCustomError(core, "InvalidTimeRange");
    });

    it("Should enforce settlement time gate in settleMarket", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper } = contracts;

      const { marketId, settlementTime } = await createTimedMarket(contracts, {
        startOffset: 100,
        duration: 86400,
        settlementOffset: 3600,
      });

      await expect(
        core
          .connect(keeper)
          .settleMarket(marketId, toSettlementValue(100450))
      ).to.be.revertedWithCustomError(core, "SettlementTooEarly");

      await time.setNextBlockTimestamp(settlementTime);
      await expect(
        core
          .connect(keeper)
          .settleMarket(marketId, toSettlementValue(100450))
      ).to.not.be.reverted;
    });

    it("Should allow settlement after endTime when settlement equals end", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper } = contracts;

      const { marketId, endTime, settlementTime } = await createTimedMarket(
        contracts,
        {
          startOffset: 100,
          duration: 86400,
          settlementOffset: 1,
        }
      );

      await time.setNextBlockTimestamp(settlementTime);
      await expect(
        core
          .connect(keeper)
          .settleMarket(marketId, toSettlementValue(100500))
      ).to.not.be.reverted;
    });

    it("Should enforce cross-constraint in updateMarketTiming", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper } = contracts;

      const { marketId, startTime, endTime, settlementTime } =
        await createTimedMarket(contracts, {
          startOffset: 100,
          duration: 86400,
          settlementOffset: 3600,
        });

      const invalidEnd = endTime + 3600;
      const invalidSettlement = settlementTime - 100;

      await expect(
        core
          .connect(keeper)
          .updateMarketTiming(
            marketId,
            startTime,
            invalidEnd,
            invalidSettlement
          )
      ).to.be.revertedWithCustomError(core, "InvalidTimeRange");
    });

    it("Should allow updateMarketTiming with valid inputs", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper } = contracts;

      const { marketId, startTime, endTime, settlementTime } =
        await createTimedMarket(contracts, {
          startOffset: 100,
          duration: 86400,
          settlementOffset: 3600,
        });

      const newStart = startTime + 60;
      const newEnd = endTime + 120;
      const newSettlement = settlementTime + 300;

      await expect(
        core
          .connect(keeper)
          .updateMarketTiming(marketId, newStart, newEnd, newSettlement)
      ).to.not.be.reverted;

      const market = await core.getMarket(marketId);
      expect(market.startTimestamp).to.equal(newStart);
      expect(market.endTimestamp).to.equal(newEnd);
      expect(market.settlementTimestamp).to.equal(newSettlement);
    });

    it("Should prevent updateMarketTiming on settled market", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper } = contracts;

      const { marketId, settlementTime } = await createTimedMarket(contracts, {
        startOffset: 100,
        duration: 86400,
        settlementOffset: 3600,
      });

      await time.setNextBlockTimestamp(settlementTime + 1);
      await core
        .connect(keeper)
        .settleMarket(marketId, toSettlementValue(100400));

      await expect(
        core
          .connect(keeper)
          .updateMarketTiming(
            marketId,
            settlementTime,
            settlementTime + 3600,
            settlementTime + 7200
          )
      ).to.be.revertedWithCustomError(core, "MarketAlreadySettled");
    });
  });
});
