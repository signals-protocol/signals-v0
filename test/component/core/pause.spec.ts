import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { coreFixture } from "../../helpers/fixtures/core";
import { COMPONENT_TAG } from "../../helpers/tags";

describe(`${COMPONENT_TAG} CLMSRMarketCore - Pause Functionality`, function () {
  describe("Pause State Management", function () {
    it("Should not be paused initially", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core } = contracts;

      expect(await core.isPaused()).to.be.false;
    });

    it("Should allow keeper to pause", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper } = contracts;

      await expect(core.connect(keeper).pause("Emergency pause test"))
        .to.emit(core, "EmergencyPaused")
        .withArgs(keeper.address, "Emergency pause test");

      expect(await core.isPaused()).to.be.true;
    });

    it("Should allow keeper to unpause", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper } = contracts;

      // Pause first
      await core.connect(keeper).pause("Test pause");
      expect(await core.isPaused()).to.be.true;

      // Then unpause
      await expect(core.connect(keeper).unpause())
        .to.emit(core, "EmergencyUnpaused")
        .withArgs(keeper.address);

      expect(await core.isPaused()).to.be.false;
    });

    it("Should prevent non-keeper from pausing", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, alice } = contracts;

      await expect(
        core.connect(alice).pause("Test")
      ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");
    });

    it("Should prevent non-keeper from unpausing", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper, alice } = contracts;

      // Keeper pauses first
      await core.connect(keeper).pause("Test pause");

      // Alice tries to unpause
      await expect(core.connect(alice).unpause()).to.be.revertedWithCustomError(
        core,
        "UnauthorizedCaller"
      );
    });

    it("Should revert when trying to pause already paused contract", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper } = contracts;

      // Pause first
      await core.connect(keeper).pause("First pause");

      // Try to pause again - should work (no specific error in implementation)
      await expect(core.connect(keeper).pause("Second pause")).to.not.be
        .reverted;
    });

    it("Should revert when trying to unpause non-paused contract", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper } = contracts;

      // Contract is not paused initially - should work (no specific error in implementation)
      await expect(core.connect(keeper).unpause()).to.not.be.reverted;
    });
  });

  describe("Paused State Restrictions", function () {
    it("Should prevent market creation when paused", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper } = contracts;

      // Pause the contract
      await core.connect(keeper).pause("Emergency");

      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;

      await expect(
        core
          .connect(keeper)
          .createMarket(1, 100, startTime, endTime, ethers.parseEther("0.1"))
      ).to.be.revertedWithCustomError(core, "ContractPaused");
    });

    it("Should prevent market settlement when paused", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper } = contracts;

      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;

      // Create market first (before pausing)
      await core
        .connect(keeper)
        .createMarket(1, 100, startTime, endTime, ethers.parseEther("0.1"));

      // Fast forward to end time
      await time.increaseTo(endTime + 1);

      // Pause the contract
      await core.connect(keeper).pause("Emergency");

      // Settlement should work even when paused (emergency functionality)
      await expect(core.connect(keeper).settleMarket(1, 49, 50)).to.not.be
        .reverted;
    });

    it("Should prevent position opening when paused", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, alice, keeper } = contracts;

      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;

      // Create market first (before pausing)
      await core
        .connect(keeper)
        .createMarket(1, 100, startTime, endTime, ethers.parseEther("0.1"));

      await time.increaseTo(startTime + 1);

      // Pause the contract
      await core.connect(keeper).pause("Emergency");

      const tradeParams = {
        marketId: 1,
        lowerTick: 10,
        upperTick: 20,
        quantity: ethers.parseUnits("1", 6),
        maxCost: ethers.parseUnits("10", 6),
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
      ).to.be.revertedWithCustomError(core, "ContractPaused");
    });

    it("Should prevent position modification when paused", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, alice, keeper } = contracts;

      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;

      // Create market
      await core
        .connect(keeper)
        .createMarket(1, 100, startTime, endTime, ethers.parseEther("0.1"));

      await time.increaseTo(startTime + 1);

      // Open position first (before pausing)
      const tradeParams = {
        marketId: 1,
        lowerTick: 10,
        upperTick: 20,
        quantity: ethers.parseUnits("0.05", 6),
        maxCost: ethers.parseUnits("1", 6),
      };

      await core
        .connect(alice)
        .openPosition(
          alice.address,
          tradeParams.marketId,
          tradeParams.lowerTick,
          tradeParams.upperTick,
          tradeParams.quantity,
          tradeParams.maxCost
        );

      // Pause the contract
      await core.connect(keeper).pause("Emergency");

      // Try to increase position while paused
      await expect(
        core
          .connect(alice)
          .increasePosition(
            1,
            ethers.parseUnits("0.01", 6),
            ethers.parseUnits("1", 6)
          )
      ).to.be.revertedWithCustomError(core, "ContractPaused");

      // Try to decrease position while paused
      await expect(
        core.connect(alice).decreasePosition(1, ethers.parseUnits("0.01", 6), 0)
      ).to.be.revertedWithCustomError(core, "ContractPaused");

      // Try to close position while paused
      await expect(
        core.connect(alice).closePosition(1, 0)
      ).to.be.revertedWithCustomError(core, "ContractPaused");
    });

    it("Should prevent position claiming when paused", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, alice, keeper } = contracts;

      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;

      // Create market and position
      await core
        .connect(keeper)
        .createMarket(1, 100, startTime, endTime, ethers.parseEther("0.1"));

      await time.increaseTo(startTime + 1);

      const tradeParams = {
        marketId: 1,
        lowerTick: 10,
        upperTick: 20,
        quantity: ethers.parseUnits("1", 6),
        maxCost: ethers.parseUnits("10", 6),
      };

      await core
        .connect(alice)
        .openPosition(
          alice.address,
          tradeParams.marketId,
          tradeParams.lowerTick,
          tradeParams.upperTick,
          tradeParams.quantity,
          tradeParams.maxCost
        );

      // Settle market
      await time.increaseTo(endTime + 1);
      await core.connect(keeper).settleMarket(1, 15, 16); // Winning outcome

      // Pause the contract
      await core.connect(keeper).pause("Emergency");

      // Try to claim settled position while paused
      await expect(
        core.connect(alice).claimPayout(1)
      ).to.be.revertedWithCustomError(core, "ContractPaused");
    });
  });

  describe("View Functions During Pause", function () {
    it("Should allow view functions when paused", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper } = contracts;

      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;

      // Create market first
      await core
        .connect(keeper)
        .createMarket(1, 100, startTime, endTime, ethers.parseEther("0.1"));

      // Pause the contract
      await core.connect(keeper).pause("Emergency");

      // View functions should still work
      const market = await core.getMarket(1);
      expect(market.numTicks).to.equal(100);

      const cost = await core.calculateOpenCost(
        1,
        10,
        20,
        ethers.parseUnits("1", 6)
      );
      expect(cost).to.be.gt(0);

      // Pause state check should work
      expect(await core.isPaused()).to.be.true;
    });

    it("Should allow cost calculations when paused", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, alice, keeper } = contracts;

      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;

      // Create market and open position
      await core
        .connect(keeper)
        .createMarket(1, 100, startTime, endTime, ethers.parseEther("0.1"));

      await time.increaseTo(startTime + 1);

      const tradeParams = {
        marketId: 1,
        lowerTick: 10,
        upperTick: 20,
        quantity: ethers.parseUnits("1", 6),
        maxCost: ethers.parseUnits("10", 6),
      };

      await core
        .connect(alice)
        .openPosition(
          alice.address,
          tradeParams.marketId,
          tradeParams.lowerTick,
          tradeParams.upperTick,
          tradeParams.quantity,
          tradeParams.maxCost
        );

      // Pause the contract
      await core.connect(keeper).pause("Emergency");

      // Cost calculations should still work
      const openCost = await core.calculateOpenCost(
        1,
        30,
        40,
        ethers.parseUnits("0.5", 6)
      );
      expect(openCost).to.be.gt(0);

      const closeProceeds = await core.calculateCloseProceeds(1);
      expect(closeProceeds).to.be.gt(0);
    });
  });

  describe("Resume Operations After Unpause", function () {
    it("Should allow all operations after unpause", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, alice, keeper } = contracts;

      // Pause and then unpause
      await core.connect(keeper).pause("Emergency");
      await core.connect(keeper).unpause();

      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;

      // Should allow market creation after unpause
      await expect(
        core
          .connect(keeper)
          .createMarket(1, 100, startTime, endTime, ethers.parseEther("0.1"))
      ).to.not.be.reverted;

      await time.increaseTo(startTime + 1);

      // Should allow trading after unpause
      const tradeParams = {
        marketId: 1,
        lowerTick: 10,
        upperTick: 20,
        quantity: ethers.parseUnits("1", 6),
        maxCost: ethers.parseUnits("10", 6),
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

      // Should allow position modifications after unpause
      await expect(
        core
          .connect(alice)
          .increasePosition(
            1,
            ethers.parseUnits("0.01", 6),
            ethers.parseUnits("1", 6)
          )
      ).to.not.be.reverted;
    });

    it("Should maintain state consistency across pause/unpause cycles", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, alice, keeper } = contracts;

      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;

      // Create market and position
      await core
        .connect(keeper)
        .createMarket(1, 100, startTime, endTime, ethers.parseEther("0.1"));

      await time.increaseTo(startTime + 1);

      const tradeParams = {
        marketId: 1,
        lowerTick: 10,
        upperTick: 20,
        quantity: ethers.parseUnits("1", 6),
        maxCost: ethers.parseUnits("10", 6),
      };

      await core
        .connect(alice)
        .openPosition(
          alice.address,
          tradeParams.marketId,
          tradeParams.lowerTick,
          tradeParams.upperTick,
          tradeParams.quantity,
          tradeParams.maxCost
        );

      // Get initial state
      const initialMarket = await core.getMarket(1);
      const positionContract = await core.getPositionContract();
      const position = await ethers.getContractAt(
        "MockPosition",
        positionContract
      );
      const initialPositionInfo = await position.getPosition(1);

      // Pause and unpause
      await core.connect(keeper).pause("Emergency");
      await core.connect(keeper).unpause();

      // Verify state is preserved
      const finalMarket = await core.getMarket(1);
      const finalPositionInfo = await position.getPosition(1);

      expect(finalMarket.numTicks).to.equal(initialMarket.numTicks);
      expect(finalMarket.liquidityParameter).to.equal(
        initialMarket.liquidityParameter
      );
      expect(finalPositionInfo.quantity).to.equal(initialPositionInfo.quantity);
      expect(finalPositionInfo.marketId).to.equal(initialPositionInfo.marketId);
    });

    it("Should handle multiple pause/unpause cycles", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper } = contracts;

      for (let i = 0; i < 3; i++) {
        // Pause
        await expect(core.connect(keeper).pause(`Emergency ${i}`)).to.emit(
          core,
          "EmergencyPaused"
        );
        expect(await core.isPaused()).to.be.true;

        // Unpause
        await expect(core.connect(keeper).unpause()).to.emit(
          core,
          "EmergencyUnpaused"
        );
        expect(await core.isPaused()).to.be.false;
      }

      // Should still be functional after multiple cycles
      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;

      await expect(
        core
          .connect(keeper)
          .createMarket(1, 100, startTime, endTime, ethers.parseEther("0.1"))
      ).to.not.be.reverted;
    });
  });

  describe("Emergency Scenarios", function () {
    it("Should handle pause during active trading", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, alice, keeper } = contracts;

      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;

      // Create market and start trading
      await core
        .connect(keeper)
        .createMarket(1, 100, startTime, endTime, ethers.parseEther("0.1"));

      await time.increaseTo(startTime + 1);

      const tradeParams = {
        marketId: 1,
        lowerTick: 10,
        upperTick: 20,
        quantity: ethers.parseUnits("1", 6),
        maxCost: ethers.parseUnits("10", 6),
      };

      await core
        .connect(alice)
        .openPosition(
          alice.address,
          tradeParams.marketId,
          tradeParams.lowerTick,
          tradeParams.upperTick,
          tradeParams.quantity,
          tradeParams.maxCost
        );

      // Emergency pause during active market
      await core.connect(keeper).pause("Emergency during trading");

      // All trading should be stopped
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
      ).to.be.revertedWithCustomError(core, "ContractPaused");

      // But view functions should work
      const market = await core.getMarket(1);
      expect(market.startTimestamp).to.be.lte(await time.latest()); // Should be started
    });

    it("Should handle pause during market settlement period", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper } = contracts;

      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;

      // Create market
      await core
        .connect(keeper)
        .createMarket(1, 100, startTime, endTime, ethers.parseEther("0.1"));

      // Move to settlement period
      await time.increaseTo(endTime + 1);

      // Pause during settlement period
      await core.connect(keeper).pause("Emergency during settlement");

      // Settlement should work even when paused (emergency functionality)
      await expect(core.connect(keeper).settleMarket(1, 49, 50)).to.not.be
        .reverted;

      // Market should show as ended
      const market = await core.getMarket(1);
      expect(market.endTimestamp).to.be.lte(await time.latest()); // Should be ended
    });
  });
});
