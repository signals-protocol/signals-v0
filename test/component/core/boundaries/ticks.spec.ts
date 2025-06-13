import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { coreFixture } from "../../../helpers/fixtures/core";
import { COMPONENT_TAG } from "../../../helpers/tags";

describe(`${COMPONENT_TAG} CLMSRMarketCore - Tick Boundaries`, function () {
  describe("Single Tick Trading", function () {
    it("Should allow single tick trades (lowerTick == upperTick)", async function () {
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

      const tradeParams = {
        marketId,
        lowerTick: 50,
        upperTick: 50, // Same tick
        quantity: ethers.parseUnits("0.01", 6),
        maxCost: ethers.parseUnits("1000", 6),
      };

      await expect(
        core.connect(router).openPosition(alice.address, tradeParams)
      )
        .to.emit(core, "PositionOpened")
        .withArgs(
          marketId,
          alice.address,
          1, // positionId
          50,
          50,
          ethers.parseUnits("0.01", 6),
          anyValue
        );
    });

    it("Should handle single tick at market boundaries", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, router, alice, bob, keeper } = contracts;

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

      // Test first tick
      const firstTickParams = {
        marketId,
        lowerTick: 0,
        upperTick: 0,
        quantity: ethers.parseUnits("0.01", 6),
        maxCost: ethers.parseUnits("1000", 6),
      };

      await expect(
        core.connect(router).openPosition(alice.address, firstTickParams)
      ).to.not.be.reverted;

      // Test last tick
      const lastTickParams = {
        marketId,
        lowerTick: 99,
        upperTick: 99,
        quantity: ethers.parseUnits("0.01", 6),
        maxCost: ethers.parseUnits("1000", 6),
      };

      await expect(
        core.connect(router).openPosition(bob.address, lastTickParams)
      ).to.not.be.reverted;
    });
  });

  describe("Tick Range Boundaries", function () {
    it("Should handle trades at first tick (0)", async function () {
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

      const tradeParams = {
        marketId,
        lowerTick: 0,
        upperTick: 0,
        quantity: ethers.parseUnits("0.01", 6),
        maxCost: ethers.parseUnits("1000", 6),
      };

      await expect(
        core.connect(router).openPosition(alice.address, tradeParams)
      ).to.not.be.reverted;
    });

    it("Should handle trades at last tick (99)", async function () {
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

      const tradeParams = {
        marketId,
        lowerTick: 99,
        upperTick: 99,
        quantity: ethers.parseUnits("0.01", 6),
        maxCost: ethers.parseUnits("1000", 6),
      };

      await expect(
        core.connect(router).openPosition(alice.address, tradeParams)
      ).to.not.be.reverted;
    });

    it("Should handle maximum tick range (0 to 99)", async function () {
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

      const tradeParams = {
        marketId,
        lowerTick: 0,
        upperTick: 99,
        quantity: ethers.parseUnits("0.01", 6),
        maxCost: ethers.parseUnits("1000", 6),
      };

      await expect(
        core.connect(router).openPosition(alice.address, tradeParams)
      ).to.not.be.reverted;
    });

    it("Should revert when tick exceeds market bounds", async function () {
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

      const tradeParams = {
        marketId,
        lowerTick: 0,
        upperTick: 100, // Out of bounds (market has 100 ticks: 0-99)
        quantity: ethers.parseUnits("0.01", 6),
        maxCost: ethers.parseUnits("1000", 6),
      };

      await expect(
        core.connect(router).openPosition(alice.address, tradeParams)
      ).to.be.revertedWithCustomError(core, "InvalidTickRange");
    });
  });

  describe("Edge Cases for Tick Handling", function () {
    it("Should handle boundary tick positions", async function () {
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

      // First tick
      await expect(
        core.connect(router).openPosition(alice.address, {
          marketId,
          lowerTick: 0,
          upperTick: 0,
          quantity: ethers.parseUnits("0.01", 6),
          maxCost: ethers.parseUnits("1000", 6),
        })
      ).to.not.be.reverted;

      // Last tick
      await expect(
        core.connect(router).openPosition(alice.address, {
          marketId,
          lowerTick: 99,
          upperTick: 99,
          quantity: ethers.parseUnits("0.01", 6),
          maxCost: ethers.parseUnits("1000", 6),
        })
      ).to.not.be.reverted;
    });

    it("Should handle large tick range operations efficiently", async function () {
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

      const fullRangeParams = {
        marketId,
        lowerTick: 0,
        upperTick: 99,
        quantity: ethers.parseUnits("0.05", 6),
        maxCost: ethers.parseUnits("1000", 6),
      };

      const tx = await core
        .connect(router)
        .openPosition(alice.address, fullRangeParams);
      const receipt = await tx.wait();

      // Full range should still be efficient
      expect(receipt!.gasUsed).to.be.lt(400000);
    });

    it("Should handle overlapping tick ranges", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, router, alice, bob, keeper } = contracts;

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

      // Alice: 40-60
      await core.connect(router).openPosition(alice.address, {
        marketId,
        lowerTick: 40,
        upperTick: 60,
        quantity: ethers.parseUnits("0.05", 6),
        maxCost: ethers.parseUnits("1000", 6),
      });

      // Bob: 50-70 (overlaps with Alice)
      await core.connect(router).openPosition(bob.address, {
        marketId,
        lowerTick: 50,
        upperTick: 70,
        quantity: ethers.parseUnits("0.05", 6),
        maxCost: ethers.parseUnits("1000", 6),
      });

      // Should succeed
      expect(true).to.be.true;
    });

    it("Should validate tick order (lowerTick <= upperTick)", async function () {
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

      const invalidParams = {
        marketId,
        lowerTick: 55, // Upper > Lower
        upperTick: 45,
        quantity: ethers.parseUnits("0.01", 6),
        maxCost: ethers.parseUnits("1000", 6),
      };

      await expect(
        core.connect(router).openPosition(alice.address, invalidParams)
      ).to.be.revertedWithCustomError(core, "InvalidTickRange");
    });
  });
});
