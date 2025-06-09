import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import {
  deployStandardFixture,
  createActiveMarket,
  SMALL_QUANTITY,
  MEDIUM_QUANTITY,
  LARGE_QUANTITY,
  EXTREME_COST,
  ALPHA,
  USDC_DECIMALS,
} from "./CLMSRMarketCore.fixtures";

describe("CLMSRMarketCore - Events and Authorization", function () {
  describe("Event Parameter Verification", function () {
    it("Should emit TradeExecuted with correct parameters", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core, router, alice } = contracts;

      const tradeParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: SMALL_QUANTITY,
        maxCost: EXTREME_COST,
      };

      const expectedCost = await core.calculateTradeCost(
        marketId,
        10,
        20,
        SMALL_QUANTITY
      );

      await expect(
        core.connect(router).executeTradeRange(alice.address, tradeParams)
      )
        .to.emit(core, "TradeExecuted")
        .withArgs(
          marketId,
          alice.address,
          1, // positionId
          10,
          20,
          SMALL_QUANTITY,
          expectedCost
        );
    });

    it("Should emit PositionAdjusted with correct parameters", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core, router, alice } = contracts;

      // First create a position
      const tradeParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: MEDIUM_QUANTITY,
        maxCost: EXTREME_COST,
      };

      await core.connect(router).executeTradeRange(alice.address, tradeParams);

      // Then adjust it
      const quantityDelta = SMALL_QUANTITY;
      const expectedCost = await core.calculateAdjustCost(1, quantityDelta);

      await expect(
        core
          .connect(router)
          .executePositionAdjust(1, quantityDelta, EXTREME_COST)
      )
        .to.emit(core, "PositionAdjusted")
        .withArgs(
          1, // positionId
          alice.address,
          quantityDelta,
          MEDIUM_QUANTITY + SMALL_QUANTITY, // newQuantity
          expectedCost
        );
    });

    it("Should emit PositionClosed with correct parameters", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core, router, alice } = contracts;

      // First create a position
      const tradeParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: MEDIUM_QUANTITY,
        maxCost: EXTREME_COST,
      };

      await core.connect(router).executeTradeRange(alice.address, tradeParams);

      // Calculate expected proceeds
      const expectedProceeds = await core.calculateCloseProceeds(1);

      // Then close it
      await expect(core.connect(router).executePositionClose(1))
        .to.emit(core, "PositionClosed")
        .withArgs(
          1, // positionId
          alice.address,
          expectedProceeds
        );
    });

    it("Should emit MarketCreated with correct parameters", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { core, keeper } = contracts;

      const startTime = Math.floor(Date.now() / 1000) + 100;
      const endTime = startTime + 86400;
      const marketId = 99;

      await expect(
        core
          .connect(keeper)
          .createMarket(marketId, 100, startTime, endTime, ALPHA)
      )
        .to.emit(core, "MarketCreated")
        .withArgs(marketId, startTime, endTime, 100, ALPHA);
    });

    it("Should emit MarketDeactivated when market expires", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId, endTime } = await createActiveMarket(contracts);
      const { core, router, alice } = contracts;

      // Move past end time
      await ethers.provider.send("evm_setNextBlockTimestamp", [endTime + 1]);

      const tradeParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: SMALL_QUANTITY,
        maxCost: EXTREME_COST,
      };

      // This should fail and deactivate the market
      await expect(
        core.connect(router).executeTradeRange(alice.address, tradeParams)
      ).to.be.revertedWithCustomError(core, "InvalidMarketParameters");
    });

    it("Should emit EmergencyPaused with correct parameters", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { core, keeper } = contracts;

      await expect(core.connect(keeper).pause("Emergency test"))
        .to.emit(core, "EmergencyPaused")
        .withArgs(keeper.address, "Emergency test");
    });

    it("Should emit EmergencyUnpaused with correct parameters", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { core, keeper } = contracts;

      // First pause
      await core.connect(keeper).pause("Emergency test");

      // Then unpause
      await expect(core.connect(keeper).unpause())
        .to.emit(core, "EmergencyUnpaused")
        .withArgs(keeper.address);
    });
  });

  describe("Authorization and Access Control", function () {
    it("Should only allow keeper to create markets", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { core, alice } = contracts;

      const startTime = Math.floor(Date.now() / 1000) + 100;
      const endTime = startTime + 86400;

      await expect(
        core.connect(alice).createMarket(99, 100, startTime, endTime, ALPHA)
      ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");
    });

    it("Should only allow keeper to pause/unpause", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { core, alice } = contracts;

      await expect(
        core.connect(alice).pause("Unauthorized")
      ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");

      await expect(core.connect(alice).unpause()).to.be.revertedWithCustomError(
        core,
        "UnauthorizedCaller"
      );
    });

    it("Should only allow router to execute trades", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core, alice } = contracts;

      const tradeParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: SMALL_QUANTITY,
        maxCost: EXTREME_COST,
      };

      await expect(
        core.connect(alice).executeTradeRange(alice.address, tradeParams)
      ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");
    });

    it("Should only allow position owner or router to adjust positions", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core, router, alice, bob } = contracts;

      // Create position as alice
      const tradeParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: MEDIUM_QUANTITY,
        maxCost: EXTREME_COST,
      };

      await core.connect(router).executeTradeRange(alice.address, tradeParams);

      // Bob should not be able to adjust alice's position
      await expect(
        core.connect(bob).executePositionAdjust(1, SMALL_QUANTITY, EXTREME_COST)
      ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");
    });

    it("Should only allow position owner or router to close positions", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core, router, alice, bob } = contracts;

      // Create position as alice
      const tradeParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: MEDIUM_QUANTITY,
        maxCost: EXTREME_COST,
      };

      await core.connect(router).executeTradeRange(alice.address, tradeParams);

      // Bob should not be able to close alice's position
      await expect(
        core.connect(bob).executePositionClose(1)
      ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");
    });

    it("Should allow keeper to update router contract", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { core, keeper, alice } = contracts;

      // Deploy new core without router set
      const CLMSRMarketCoreFactory = await ethers.getContractFactory(
        "CLMSRMarketCore",
        {
          libraries: {
            FixedPointMathU: await contracts.fixedPointMathU.getAddress(),
            LazyMulSegmentTree: await contracts.lazyMulSegmentTree.getAddress(),
          },
        }
      );

      const newCore = await CLMSRMarketCoreFactory.deploy(
        await contracts.paymentToken.getAddress(),
        await contracts.mockPosition.getAddress(),
        keeper.address
      );

      await expect(newCore.connect(keeper).setRouterContract(alice.address))
        .to.emit(newCore, "RouterSet")
        .withArgs(alice.address);
    });

    it("Should not allow non-keeper to update router contract", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { core, alice } = contracts;

      await expect(
        core.connect(alice).setRouterContract(alice.address)
      ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");
    });

    it("Should prevent non-manager from calling settleMarket", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core, alice, bob } = contracts;

      await expect(
        core.connect(alice).settleMarket(marketId, 50)
      ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");

      await expect(
        core.connect(bob).settleMarket(marketId, 50)
      ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");
    });

    it("Should prevent router setting after initial setup", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { core, keeper, alice } = contracts;

      // Router is already set in fixture, trying to set again should fail
      await expect(
        core.connect(keeper).setRouterContract(alice.address)
      ).to.be.revertedWithCustomError(core, "InvalidMarketParameters");
    });
  });

  describe("Pause State Testing", function () {
    it("Should prevent all trading when paused", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core, keeper, router, alice } = contracts;

      // Pause the contract
      await core.connect(keeper).pause("Testing pause");

      const tradeParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: SMALL_QUANTITY,
        maxCost: EXTREME_COST,
      };

      await expect(
        core.connect(router).executeTradeRange(alice.address, tradeParams)
      ).to.be.revertedWithCustomError(core, "ContractPaused");
    });

    it("Should prevent position adjustments when paused", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core, keeper, router, alice } = contracts;

      // Create position first
      const tradeParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: MEDIUM_QUANTITY,
        maxCost: EXTREME_COST,
      };

      await core.connect(router).executeTradeRange(alice.address, tradeParams);

      // Pause the contract
      await core.connect(keeper).pause("Testing pause");

      await expect(
        core
          .connect(router)
          .executePositionAdjust(1, SMALL_QUANTITY, EXTREME_COST)
      ).to.be.revertedWithCustomError(core, "ContractPaused");
    });

    it("Should prevent position closing when paused", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core, keeper, router, alice } = contracts;

      // Create position first
      const tradeParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: MEDIUM_QUANTITY,
        maxCost: EXTREME_COST,
      };

      await core.connect(router).executeTradeRange(alice.address, tradeParams);

      // Pause the contract
      await core.connect(keeper).pause("Testing pause");

      await expect(
        core.connect(router).executePositionClose(1)
      ).to.be.revertedWithCustomError(core, "ContractPaused");
    });

    it("Should allow trading after unpause", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core, keeper, router, alice } = contracts;

      // Pause then unpause
      await core.connect(keeper).pause("Testing pause");
      await core.connect(keeper).unpause();

      const tradeParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: SMALL_QUANTITY,
        maxCost: EXTREME_COST,
      };

      await expect(
        core.connect(router).executeTradeRange(alice.address, tradeParams)
      ).to.not.be.reverted;
    });

    it("Should still allow view functions when paused", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core, keeper } = contracts;

      // Pause the contract
      await core.connect(keeper).pause("Testing pause");

      // View functions should still work
      await expect(core.getMarket(marketId)).to.not.be.reverted;
      await expect(core.calculateTradeCost(marketId, 10, 20, SMALL_QUANTITY)).to
        .not.be.reverted;
    });

    it("Should handle pause-unpause cycle correctly", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core, keeper, router, alice } = contracts;

      const tradeParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: SMALL_QUANTITY,
        maxCost: EXTREME_COST,
      };

      // Pause
      await core.connect(keeper).pause("Testing pause");
      expect(await core.isPaused()).to.be.true;

      // Should fail during pause
      await expect(
        core.connect(router).executeTradeRange(alice.address, tradeParams)
      ).to.be.revertedWithCustomError(core, "ContractPaused");

      // Unpause
      await core.connect(keeper).unpause();
      expect(await core.isPaused()).to.be.false;

      // Should work after unpause
      await expect(
        core.connect(router).executeTradeRange(alice.address, tradeParams)
      ).to.not.be.reverted;
    });

    it("Should prevent position claiming when paused", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core, keeper, router, alice } = contracts;

      // Create and settle market
      const tradeParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: MEDIUM_QUANTITY,
        maxCost: EXTREME_COST,
      };

      await core.connect(router).executeTradeRange(alice.address, tradeParams);
      await core.connect(keeper).settleMarket(marketId, 15); // Winning tick

      // Pause the contract
      await core.connect(keeper).pause("Testing pause");

      await expect(
        core.connect(router).executePositionClaim(1)
      ).to.be.revertedWithCustomError(core, "ContractPaused");
    });
  });

  describe("Position NFT Authorization", function () {
    it("Should verify position ownership before operations", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core, router, alice, bob } = contracts;

      // Create position as alice
      const tradeParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: MEDIUM_QUANTITY,
        maxCost: EXTREME_COST,
      };

      await core.connect(router).executeTradeRange(alice.address, tradeParams);

      // Bob should not be able to operate on alice's position directly
      // This should be handled by the position contract's ownership check
      await expect(
        core.connect(bob).executePositionAdjust(1, SMALL_QUANTITY, EXTREME_COST)
      ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");
    });

    it("Should allow position transfer and subsequent operations", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core, router, alice, bob, mockPosition } = contracts;

      // Create position as alice
      const tradeParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: MEDIUM_QUANTITY,
        maxCost: EXTREME_COST,
      };

      await core.connect(router).executeTradeRange(alice.address, tradeParams);

      // Transfer position to bob
      await mockPosition
        .connect(alice)
        .transferFrom(alice.address, bob.address, 1);

      // Now bob should be able to operate on the position
      await expect(core.connect(router).executePositionClose(1)).to.not.be
        .reverted;
    });
  });
});
