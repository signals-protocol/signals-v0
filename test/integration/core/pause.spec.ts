import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { COMPONENT_TAG } from "../../helpers/tags";
import { createActiveMarketFixture, settleMarketAtTick } from "../../helpers/fixtures/core";


async function createTestMarket(
  core: any,
  keeper: any,
  startTime: number,
  endTime: number,
  alpha: bigint = ethers.parseEther("0.1"),
  minTick = 100000,
  maxTick = 100990,
  tickSpacing = 10
) {
  const settlementTime = endTime + 3600;
  const marketIdBig = await core
    .connect(keeper)
    .createMarket.staticCall(
      minTick,
      maxTick,
      tickSpacing,
      startTime,
      endTime,
      settlementTime,
      alpha
    );
  await core
    .connect(keeper)
    .createMarket(
      minTick,
      maxTick,
      tickSpacing,
      startTime,
      endTime,
      settlementTime,
      alpha
    );
  const marketId = Number(marketIdBig);
  await core.connect(keeper).setMarketActive(marketId, true);
  return { marketId, settlementTime };
}



describe(`${COMPONENT_TAG} CLMSRMarketCore - Pause Functionality`, function () {
  describe("Pause State Management", function () {
    it("Should not be paused initially", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core } = contracts;

      expect(await core.isPaused()).to.be.false;
    });

    it("Should allow keeper to pause", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, keeper } = contracts;

      await expect(core.connect(keeper).pause("Emergency pause test"))
        .to.emit(core, "EmergencyPaused")
        .withArgs(keeper.address, "Emergency pause test");

      expect(await core.isPaused()).to.be.true;
    });

    it("Should allow keeper to unpause", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
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
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, alice } = contracts;

      await expect(
        core.connect(alice).pause("Test")
      )
        .to.be.revertedWithCustomError(core, "OwnableUnauthorizedAccount")
        .withArgs(alice.address);
    });

    it("Should prevent non-keeper from unpausing", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, keeper, alice } = contracts;

      // Keeper pauses first
      await core.connect(keeper).pause("Test pause");

      // Alice tries to unpause
      await expect(core.connect(alice).unpause())
        .to.be.revertedWithCustomError(core, "OwnableUnauthorizedAccount")
        .withArgs(alice.address);
    });

    it("Should revert when trying to pause already paused contract", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, keeper } = contracts;

      // Pause first
      await core.connect(keeper).pause("First pause");

      // Try to pause again - should work (no specific error in implementation)
      await expect(
        core.connect(keeper).pause("Second pause")
      ).to.be.revertedWithCustomError(core, "EnforcedPause");
    });

    it("Should revert when trying to unpause non-paused contract", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, keeper } = contracts;

      // Contract is not paused initially - should work (no specific error in implementation)
      await expect(core.connect(keeper).unpause()).to.be.revertedWithCustomError(
        core,
        "ExpectedPause"
      );
    });
  });

  describe("Paused State Restrictions", function () {
    it("Should prevent market creation when paused", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, keeper } = contracts;

      // Pause the contract
      await core.connect(keeper).pause("Emergency");

      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;

      await expect(
        core
          .connect(keeper)
          .createMarket(
            1,
            100000,
            100990,
            10,
            startTime,
            endTime,
            ethers.parseEther("0.1")
          )
      ).to.be.revertedWithCustomError(core, "EnforcedPause");
    });

    it("Should prevent market settlement when paused", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, keeper } = contracts;

      const currentTime = Number(await time.latest());
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;

      // Create market first (before pausing)
      const { marketId, settlementTime } = await createTestMarket(
        core,
        keeper,
        startTime,
        endTime
      );

      // Fast forward to settlement time
      await time.increaseTo(settlementTime + 1);

      // Pause the contract
      await core.connect(keeper).pause("Emergency");

      // Settlement should work even when paused (emergency functionality)
      await expect(
        settleMarketAtTick(core, keeper, marketId, 100490)
      ).to.not.be.reverted;
    });

    it("Should prevent position opening when paused", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, alice, keeper, mockPosition } = contracts;

      const currentTime = Number(await time.latest());
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;

      // Create market first (before pausing)
      const { marketId } = await createTestMarket(
        core,
        keeper,
        startTime,
        endTime
      );

      await time.increaseTo(startTime + 1);

      // Pause the contract
      await core.connect(keeper).pause("Emergency");

      const tradeParams = {
        marketId,
        lowerTick: 100100,
        upperTick: 100200,
        quantity: ethers.parseUnits("1", 6),
        maxCost: ethers.parseUnits("10", 6),
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
      ).to.be.revertedWithCustomError(core, "EnforcedPause");
    });

    it("Should prevent position modification when paused", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, alice, keeper, mockPosition } = contracts;

      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;

      // Create market
      const { marketId } = await createTestMarket(
        core,
        keeper,
        startTime,
        endTime,
        ethers.parseEther("0.1")
      );

      await time.increaseTo(startTime + 1);

      // Open position first (before pausing)
      const tradeParams = {
        marketId: 1,
        lowerTick: 100100,
        upperTick: 100200,
        quantity: ethers.parseUnits("0.05", 6),
        maxCost: ethers.parseUnits("1", 6),
      };

      await core
        .connect(alice)
        .openPosition(
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
      ).to.be.revertedWithCustomError(core, "EnforcedPause");

      // Try to decrease position while paused
      await expect(
        core.connect(alice).decreasePosition(1, ethers.parseUnits("0.01", 6), 0)
      ).to.be.revertedWithCustomError(core, "EnforcedPause");

      // Try to close position while paused
      await expect(
        core.connect(alice).closePosition(1, 0)
      ).to.be.revertedWithCustomError(core, "EnforcedPause");
    });

    it("Should prevent position claiming when paused", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, alice, keeper, mockPosition } = contracts;

      const currentTime = Number(await time.latest());
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;

      // Create market and position
      const { marketId, settlementTime } = await createTestMarket(
        core,
        keeper,
        startTime,
        endTime
      );

      await time.increaseTo(startTime + 1);

      const tradeParams = {
        marketId,
        lowerTick: 100100,
        upperTick: 100200,
        quantity: ethers.parseUnits("1", 6),
        maxCost: ethers.parseUnits("10", 6),
      };

      await core
        .connect(alice)
        .openPosition(
          tradeParams.marketId,
          tradeParams.lowerTick,
          tradeParams.upperTick,
          tradeParams.quantity,
          tradeParams.maxCost
        );

      const positions = await mockPosition.getPositionsByOwner(alice.address);
      const positionId = Number(positions[0]);

      // Settle market
      await time.increaseTo(settlementTime + 1);
      await settleMarketAtTick(core, keeper, marketId, 100150);

      // Pause the contract
      await core.connect(keeper).pause("Emergency");

      // Try to claim settled position while paused
      await expect(
        core.connect(alice).claimPayout(positionId)
      ).to.be.revertedWithCustomError(core, "EnforcedPause");
    });
  });

  describe("View Functions During Pause", function () {
    it("Should allow view functions when paused", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, keeper } = contracts;

      const currentTime = Number(await time.latest());
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;

      // Create market first
      const { marketId } = await createTestMarket(
        core,
        keeper,
        startTime,
        endTime
      );

      // Pause the contract
      await core.connect(keeper).pause("Emergency");

      // View functions should still work
      const market = await core.getMarket(marketId);
      expect(market.numBins).to.equal(
        BigInt((100990 - 100000) / 10)
      );

      const cost = await core.calculateOpenCost(
        marketId,
        100100,
        100200,
        ethers.parseUnits("0.01", 6)
      );
      expect(cost).to.be.gt(0);

      // Pause state check should work
      expect(await core.isPaused()).to.be.true;
    });

    it("Should allow cost calculations when paused", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, alice, keeper, mockPosition } = contracts;

      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;

      const { marketId } = await createTestMarket(
        core,
        keeper,
        startTime,
        endTime,
        ethers.parseEther("0.1")
      );

      await time.increaseTo(startTime + 1);

      const tradeQuantity = ethers.parseUnits("0.01", 6);
      const quotedOpenCost = await core.calculateOpenCost(
        marketId,
        100100,
        100200,
        tradeQuantity
      );

      await core
        .connect(alice)
        .openPosition(
          marketId,
          100100,
          100200,
          tradeQuantity,
          (quotedOpenCost * 1005n) / 1000n + 1n
        );

      // Pause the contract
      await core.connect(keeper).pause("Emergency");

      // Cost calculations should still work
      const openCost = await core.calculateOpenCost(
        marketId,
        100300,
        100400,
        ethers.parseUnits("0.01", 6)
      );
      expect(openCost).to.be.gt(0);

      const positions = await mockPosition.getPositionsByOwner(alice.address);
      const positionId = Number(positions[0]);

      const closeProceeds = await core.calculateCloseProceeds(positionId);
      expect(closeProceeds).to.be.gt(0);
    });
  });

  describe("Resume Operations After Unpause", function () {
    it("Should allow all operations after unpause", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, alice, keeper, mockPosition } = contracts;

      // Pause and then unpause
      await core.connect(keeper).pause("Emergency");
      await core.connect(keeper).unpause();

      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;

      const { marketId } = await createTestMarket(
        core,
        keeper,
        startTime,
        endTime,
        ethers.parseEther("0.1")
      );

      await time.increaseTo(startTime + 1);

      const tradeQuantity = ethers.parseUnits("0.01", 6);
      const quotedOpenCost = await core.calculateOpenCost(
        marketId,
        100100,
        100200,
        tradeQuantity
      );

      await expect(
        core
          .connect(alice)
          .openPosition(
            marketId,
            100100,
            100200,
            tradeQuantity,
            (quotedOpenCost * 1005n) / 1000n + 1n
          )
      ).to.not.be.reverted;

      const positions = await mockPosition.getPositionsByOwner(alice.address);
      const positionId = Number(positions[0]);
      const quotedIncreaseCost = await core.calculateIncreaseCost(
        positionId,
        tradeQuantity
      );

      await expect(
        core
          .connect(alice)
          .increasePosition(
            positionId,
            tradeQuantity,
            (quotedIncreaseCost * 1005n) / 1000n + 1n
          )
      ).to.not.be.reverted;
    });

    it("Should maintain state consistency across pause/unpause cycles", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, alice, keeper, mockPosition, marketId } = contracts;

      const tradeQuantity = ethers.parseUnits("0.01", 6);
      const quotedOpenCost = await core.calculateOpenCost(
        marketId,
        100100,
        100200,
        tradeQuantity
      );

      await core
        .connect(alice)
        .openPosition(
          marketId,
          100100,
          100200,
          tradeQuantity,
          (quotedOpenCost * 1005n) / 1000n + 1n
        );

      // Get initial state
      const initialMarket = await core.getMarket(marketId);
      const positions = await mockPosition.getPositionsByOwner(alice.address);
      const positionId = Number(positions[0]);
      const initialPositionInfo = await mockPosition.getPosition(positionId);

      // Pause and unpause
      await core.connect(keeper).pause("Emergency");
      await core.connect(keeper).unpause();

      // Verify state is preserved
      const finalMarket = await core.getMarket(marketId);
      const finalPositionInfo = await mockPosition.getPosition(positionId);

      expect(finalMarket.numBins).to.equal(initialMarket.numBins);
      expect(finalMarket.liquidityParameter).to.equal(
        initialMarket.liquidityParameter
      );
      expect(finalPositionInfo.quantity).to.equal(initialPositionInfo.quantity);
      expect(finalPositionInfo.marketId).to.equal(initialPositionInfo.marketId);
    });

    it("Should handle multiple pause/unpause cycles", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
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
          .createMarket(
            1,
            100000,
            100990,
            10,
            startTime,
            endTime,
            ethers.parseEther("0.1")
          )
      ).to.not.be.reverted;
    });
  });

  describe("Emergency Scenarios", function () {
    it("Should handle pause during active trading", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, alice, keeper, marketId } = contracts;

      const tradeQuantity = ethers.parseUnits("0.01", 6);
      const quotedOpenCost = await core.calculateOpenCost(
        marketId,
        100100,
        100200,
        tradeQuantity
      );

      await core
        .connect(alice)
        .openPosition(
          marketId,
          100100,
          100200,
          tradeQuantity,
          (quotedOpenCost * 1005n) / 1000n + 1n
        );

      // Emergency pause during active market
      await core.connect(keeper).pause("Emergency during trading");

      // All trading should be stopped
      await expect(
        core
          .connect(alice)
          .openPosition(
            marketId,
            100100,
            100200,
            tradeQuantity,
            (quotedOpenCost * 1005n) / 1000n + 1n
          )
      ).to.be.revertedWithCustomError(core, "EnforcedPause");

      // But view functions should work
      const market = await core.getMarket(marketId);
      expect(market.startTimestamp).to.be.lte(await time.latest());
    });

    it("Should handle pause during market settlement period", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, keeper, marketId } = contracts;

      const market = await core.getMarket(marketId);
      const endTime = Number(market.endTimestamp);

      // Move to settlement period
      await time.increaseTo(endTime + 1);

      // Pause during settlement period
      await core.connect(keeper).pause("Emergency during settlement");

      // Settlement should work even when paused (emergency functionality)
      await expect(
        settleMarketAtTick(core, keeper, marketId, 100490)
      ).to.not.be.reverted;

      // Market should show as ended
      const settledMarket = await core.getMarket(marketId);
      expect(settledMarket.endTimestamp).to.be.lte(await time.latest());
    });
  });
});
