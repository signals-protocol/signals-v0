import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { coreFixture } from "../../../helpers/fixtures/core";
import { COMPONENT_TAG } from "../../../helpers/tags";

describe(`${COMPONENT_TAG} CLMSRMarketCore - Time Boundaries`, function () {
  describe("Trade Timing Validation", function () {
    it("Should handle trade at exact market start time", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, router, alice, keeper } = contracts;

      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;
      const marketId = 1;

      await core
        .connect(keeper)
        .createMarket(
          marketId,
          100,
          startTime,
          endTime,
          ethers.parseEther("0.1")
        );

      // Move to exact start time
      await time.setNextBlockTimestamp(startTime);

      const tradeParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: ethers.parseUnits("0.01", 6),
        maxCost: ethers.parseUnits("1000", 6),
      };

      await expect(
        core.connect(router).openPosition(alice.address, tradeParams)
      ).to.not.be.reverted;
    });

    it("Should handle trade 1 second before market end", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, router, alice, keeper } = contracts;

      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;
      const marketId = 1;

      await core
        .connect(keeper)
        .createMarket(
          marketId,
          100,
          startTime,
          endTime,
          ethers.parseEther("0.1")
        );

      // Move to 1 second before end
      await time.setNextBlockTimestamp(endTime - 1);

      const tradeParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: ethers.parseUnits("0.01", 6),
        maxCost: ethers.parseUnits("1000", 6),
      };

      await expect(
        core.connect(router).openPosition(alice.address, tradeParams)
      ).to.not.be.reverted;
    });

    it("Should deactivate market when trading after end time", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, router, alice, keeper } = contracts;

      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;
      const marketId = 1;

      await core
        .connect(keeper)
        .createMarket(
          marketId,
          100,
          startTime,
          endTime,
          ethers.parseEther("0.1")
        );

      // Move past end time
      await time.setNextBlockTimestamp(endTime + 1);

      const tradeParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: ethers.parseUnits("0.01", 6),
        maxCost: ethers.parseUnits("1000", 6),
      };

      await expect(
        core.connect(router).openPosition(alice.address, tradeParams)
      ).to.be.revertedWithCustomError(core, "MarketExpired");
    });

    it("Should prevent trading before market start", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper, router, alice } = contracts;

      const futureStart = (await time.latest()) + 3600; // 1 hour from now
      const futureEnd = futureStart + 86400; // 1 day duration
      const marketId = 2;

      await core
        .connect(keeper)
        .createMarket(
          marketId,
          100,
          futureStart,
          futureEnd,
          ethers.parseEther("0.1")
        );

      const tradeParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: ethers.parseUnits("0.01", 6),
        maxCost: ethers.parseUnits("1000", 6),
      };

      await expect(
        core.connect(router).openPosition(alice.address, tradeParams)
      ).to.be.revertedWithCustomError(core, "MarketNotStarted");
    });
  });

  describe("Block Timestamp Edge Cases", function () {
    it("Should handle block timestamp jumps correctly", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, router, alice, keeper } = contracts;

      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;
      const marketId = 1;

      await core
        .connect(keeper)
        .createMarket(
          marketId,
          100,
          startTime,
          endTime,
          ethers.parseEther("0.1")
        );

      // Jump to near end time
      await time.setNextBlockTimestamp(endTime - 10);

      const tradeParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: ethers.parseUnits("0.01", 6),
        maxCost: ethers.parseUnits("1000", 6),
      };

      await expect(
        core.connect(router).openPosition(alice.address, tradeParams)
      ).to.not.be.reverted;

      // Jump past end time
      await time.setNextBlockTimestamp(endTime + 1);

      await expect(
        core.connect(router).openPosition(alice.address, tradeParams)
      ).to.be.revertedWithCustomError(core, "MarketExpired");
    });

    it("Should handle extreme timestamp values", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper } = contracts;

      // Test with very large timestamp values
      const farFuture = 2147483647; // Max 32-bit timestamp
      const farFutureEnd = farFuture + 86400;
      const marketId = 5;

      await expect(
        core
          .connect(keeper)
          .createMarket(
            marketId,
            100,
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
      const { core, keeper, router, alice } = contracts;

      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;
      const marketId = 1;

      await core
        .connect(keeper)
        .createMarket(
          marketId,
          100,
          startTime,
          endTime,
          ethers.parseEther("0.1")
        );

      await time.increaseTo(startTime + 1);

      // Open position before expiry
      const openParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: ethers.parseUnits("0.05", 6),
        maxCost: ethers.parseUnits("1000", 6),
      };

      await core.connect(router).openPosition(alice.address, openParams);
      const positionId = 1n;

      // Move to exactly 1 second after expiry
      await time.setNextBlockTimestamp(endTime + 1);

      // All operations should fail after expiry
      await expect(
        core
          .connect(router)
          .increasePosition(
            positionId,
            ethers.parseUnits("0.01", 6),
            ethers.parseUnits("1000", 6)
          )
      ).to.be.revertedWithCustomError(core, "MarketExpired");

      await expect(
        core
          .connect(router)
          .decreasePosition(positionId, ethers.parseUnits("0.01", 6), 0)
      ).to.be.revertedWithCustomError(core, "MarketExpired");

      await expect(
        core.connect(router).closePosition(positionId, 0)
      ).to.be.revertedWithCustomError(core, "MarketExpired");
    });

    it("Should allow settlement after expiry", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper } = contracts;

      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;
      const marketId = 1;

      await core
        .connect(keeper)
        .createMarket(
          marketId,
          100,
          startTime,
          endTime,
          ethers.parseEther("0.1")
        );

      // Fast forward past market end time
      await time.increaseTo(endTime + 1);

      // Settlement should still work after expiry
      await expect(core.connect(keeper).settleMarket(marketId, 50)).to.not.be
        .reverted;
    });
  });

  describe("Extended Time Boundaries", function () {
    it("Should handle trade at exact market start time", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, router, alice, keeper } = contracts;

      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;
      const marketId = 1;

      await core
        .connect(keeper)
        .createMarket(
          marketId,
          100,
          startTime,
          endTime,
          ethers.parseEther("0.1")
        );

      // Move to exact start time
      await time.setNextBlockTimestamp(startTime);

      const tradeParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: ethers.parseUnits("0.01", 6),
        maxCost: ethers.parseUnits("1000", 6),
      };

      await expect(
        core.connect(router).openPosition(alice.address, tradeParams)
      ).to.not.be.reverted;
    });

    it("Should handle trade 1 second before market end", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, router, alice, keeper } = contracts;

      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;
      const marketId = 1;

      await core
        .connect(keeper)
        .createMarket(
          marketId,
          100,
          startTime,
          endTime,
          ethers.parseEther("0.1")
        );

      // Move to 1 second before end
      await time.setNextBlockTimestamp(endTime - 1);

      const tradeParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: ethers.parseUnits("0.01", 6),
        maxCost: ethers.parseUnits("1000", 6),
      };

      await expect(
        core.connect(router).openPosition(alice.address, tradeParams)
      ).to.not.be.reverted;
    });

    it("Should deactivate market when trading after end time", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, router, alice, keeper } = contracts;

      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;
      const marketId = 1;

      await core
        .connect(keeper)
        .createMarket(
          marketId,
          100,
          startTime,
          endTime,
          ethers.parseEther("0.1")
        );

      // Move past end time
      await time.setNextBlockTimestamp(endTime + 1);

      const tradeParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: ethers.parseUnits("0.01", 6),
        maxCost: ethers.parseUnits("1000", 6),
      };

      await expect(
        core.connect(router).openPosition(alice.address, tradeParams)
      ).to.be.revertedWithCustomError(core, "MarketExpired");
    });

    it("Should prevent trading before market start", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper, router, alice } = contracts;

      const futureStart = (await time.latest()) + 3600; // 1 hour from now
      const futureEnd = futureStart + 86400; // 1 day duration

      await core
        .connect(keeper)
        .createMarket(2, 100, futureStart, futureEnd, ethers.parseEther("0.1"));

      const tradeParams = {
        marketId: 2,
        lowerTick: 10,
        upperTick: 20,
        quantity: ethers.parseUnits("0.01", 6),
        maxCost: ethers.parseUnits("1000", 6),
      };

      await expect(
        core.connect(router).openPosition(alice.address, tradeParams)
      ).to.be.revertedWithCustomError(core, "MarketNotStarted");
    });

    it("Should handle block timestamp jumps correctly", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, router, alice, keeper } = contracts;

      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;
      const marketId = 1;

      await core
        .connect(keeper)
        .createMarket(
          marketId,
          100,
          startTime,
          endTime,
          ethers.parseEther("0.1")
        );

      // Jump to near end time
      await time.setNextBlockTimestamp(endTime - 10);

      const tradeParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: ethers.parseUnits("0.01", 6),
        maxCost: ethers.parseUnits("1000", 6),
      };

      await expect(
        core.connect(router).openPosition(alice.address, tradeParams)
      ).to.not.be.reverted;

      // Jump past end time
      await time.setNextBlockTimestamp(endTime + 1);

      await expect(
        core.connect(router).openPosition(alice.address, tradeParams)
      ).to.be.revertedWithCustomError(core, "MarketExpired");
    });

    it("Should handle extreme timestamp values", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper } = contracts;

      // Test with very large timestamp values
      const farFuture = 2147483647; // Max 32-bit timestamp
      const farFutureEnd = farFuture + 86400;

      await expect(
        core
          .connect(keeper)
          .createMarket(
            5,
            100,
            farFuture,
            farFutureEnd,
            ethers.parseEther("0.1")
          )
      ).to.not.be.reverted;
    });

    it("Should handle market expiry edge cases during operations", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, router, alice, keeper } = contracts;

      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;
      const marketId = 1;

      await core
        .connect(keeper)
        .createMarket(
          marketId,
          100,
          startTime,
          endTime,
          ethers.parseEther("0.1")
        );

      await time.increaseTo(startTime + 1);

      // Open position before expiry
      const openParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: ethers.parseUnits("0.05", 6),
        maxCost: ethers.parseUnits("1000", 6),
      };

      await core.connect(router).openPosition(alice.address, openParams);
      const positionId = 1n;

      // Move to exactly 1 second after expiry
      await time.setNextBlockTimestamp(endTime + 1);

      // All operations should fail after expiry
      await expect(
        core
          .connect(router)
          .increasePosition(
            positionId,
            ethers.parseUnits("0.01", 6),
            ethers.parseUnits("1000", 6)
          )
      ).to.be.revertedWithCustomError(core, "MarketExpired");

      await expect(
        core
          .connect(router)
          .decreasePosition(positionId, ethers.parseUnits("0.01", 6), 0)
      ).to.be.revertedWithCustomError(core, "MarketExpired");

      await expect(
        core.connect(router).closePosition(positionId, 0)
      ).to.be.revertedWithCustomError(core, "MarketExpired");
    });
  });
});
