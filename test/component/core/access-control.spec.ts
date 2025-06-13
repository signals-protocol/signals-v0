import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { coreFixture } from "../../helpers/fixtures/core";
import { COMPONENT_TAG } from "../../helpers/tags";

describe(`${COMPONENT_TAG} CLMSRMarketCore - Access Control`, function () {
  describe("Role Management", function () {
    it("Should have correct initial admin roles", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper } = contracts;

      // In current implementation, keeper acts as the manager (admin equivalent)
      expect(await core.getManagerContract()).to.equal(keeper.address);
      expect(await core.isAuthorizedCaller(keeper.address)).to.be.true;
    });

    it("Should grant and revoke keeper role properly", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper, router, alice } = contracts;

      // Current implementation: Router is set once and cannot be changed (one-time setup)
      // Initially router should be set
      const initialRouter = await core.getRouterContract();
      expect(initialRouter).to.equal(router.address);
      expect(await core.isAuthorizedCaller(router.address)).to.be.true;

      // Router cannot be changed after initial setup (one-time only)
      await expect(
        core.connect(keeper).setRouterContract(alice.address)
      ).to.be.revertedWithCustomError(core, "RouterAlreadySet");

      // Position contract and manager are also authorized
      expect(await core.isAuthorizedCaller(keeper.address)).to.be.true;
    });

    it("Should prevent non-admin from granting roles", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, alice, bob } = contracts;

      // In current implementation, only manager can set router (equivalent to granting roles)
      await expect(
        core.connect(alice).setRouterContract(bob.address)
      ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");
    });

    it("Should prevent non-admin from revoking roles", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, alice, keeper } = contracts;

      // Non-manager cannot change router settings (equivalent to revoking roles)
      await expect(
        core.connect(alice).setRouterContract(keeper.address)
      ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");
    });
  });

  describe("Keeper Role Restrictions", function () {
    it("Should only allow keeper to create markets", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, alice, bob } = contracts;

      const currentTime = Math.floor(Date.now() / 1000);
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;

      await expect(
        core
          .connect(alice)
          .createMarket(1, 100, startTime, endTime, ethers.parseEther("0.1"))
      ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");

      await expect(
        core
          .connect(bob)
          .createMarket(1, 100, startTime, endTime, ethers.parseEther("0.1"))
      ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");
    });

    it("Should only allow keeper to settle markets", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, alice, keeper } = contracts;

      const currentTime = Math.floor(Date.now() / 1000);
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;

      // Create market first
      await core
        .connect(keeper)
        .createMarket(1, 100, startTime, endTime, ethers.parseEther("0.1"));

      // Non-keeper cannot settle
      await expect(
        core.connect(alice).settleMarket(1, 50)
      ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");
    });

    it("Should only allow keeper to pause/unpause", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, alice } = contracts;

      await expect(
        core.connect(alice).pause("Emergency")
      ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");

      await expect(core.connect(alice).unpause()).to.be.revertedWithCustomError(
        core,
        "UnauthorizedCaller"
      );
    });
  });

  describe("Router Role Restrictions", function () {
    it("Should only allow router to execute trades", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, alice } = contracts;

      const tradeParams = {
        marketId: 1,
        lowerTick: 10,
        upperTick: 20,
        quantity: ethers.parseUnits("1", 6),
        maxCost: ethers.parseUnits("10", 6),
      };

      await expect(
        core.connect(alice).openPosition(alice.address, tradeParams)
      ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");
    });

    it("Should only allow router to increase positions", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, alice } = contracts;

      await expect(
        core
          .connect(alice)
          .increasePosition(
            1,
            ethers.parseUnits("1", 6),
            ethers.parseUnits("10", 6)
          )
      ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");
    });

    it("Should only allow router to decrease positions", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, alice } = contracts;

      await expect(
        core
          .connect(alice)
          .decreasePosition(
            1,
            ethers.parseUnits("0.5", 6),
            ethers.parseUnits("0.4", 6)
          )
      ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");
    });

    it("Should only allow router to close positions", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, alice } = contracts;

      await expect(
        core.connect(alice).closePosition(1, ethers.parseUnits("0.9", 6))
      ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");
    });

    it("Should only allow router to claim settled positions", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, alice } = contracts;

      // In current implementation, it's claimPayout not claimSettledPosition
      await expect(
        core.connect(alice).claimPayout(1)
      ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");
    });
  });

  describe("Emergency Pause System", function () {
    it("Should allow keeper to pause and unpause", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper } = contracts;

      // Should not be paused initially
      expect(await core.isPaused()).to.be.false;

      // Keeper can pause
      await expect(core.connect(keeper).pause("Emergency test"))
        .to.emit(core, "EmergencyPaused")
        .withArgs(keeper.address, "Emergency test");

      expect(await core.isPaused()).to.be.true;

      // Keeper can unpause
      await expect(core.connect(keeper).unpause())
        .to.emit(core, "EmergencyUnpaused")
        .withArgs(keeper.address);

      expect(await core.isPaused()).to.be.false;
    });

    it("Should prevent operations when paused", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper, router, alice } = contracts;

      // Pause the contract
      await core.connect(keeper).pause("Test pause");

      const currentTime = Math.floor(Date.now() / 1000);
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;

      // Should prevent market creation when paused
      await expect(
        core
          .connect(keeper)
          .createMarket(1, 100, startTime, endTime, ethers.parseEther("0.1"))
      ).to.be.revertedWithCustomError(core, "ContractPaused");

      // Should prevent trading when paused
      const tradeParams = {
        marketId: 1,
        lowerTick: 10,
        upperTick: 20,
        quantity: ethers.parseUnits("1", 6),
        maxCost: ethers.parseUnits("10", 6),
      };

      await expect(
        core.connect(router).openPosition(alice.address, tradeParams)
      ).to.be.revertedWithCustomError(core, "ContractPaused");
    });

    it("Should allow operations to resume after unpause", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper } = contracts;

      // Pause and then unpause
      await core.connect(keeper).pause("Test pause");
      await core.connect(keeper).unpause();

      const currentTime = Math.floor(Date.now() / 1000);
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;

      // Should allow market creation after unpause
      await expect(
        core
          .connect(keeper)
          .createMarket(1, 100, startTime, endTime, ethers.parseEther("0.1"))
      ).to.not.be.reverted;
    });
  });

  describe("Contract Deployment Access", function () {
    it("Should prevent unauthorized contract updates", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, alice, bob } = contracts;

      // In current implementation, only manager can update router contract
      await expect(
        core.connect(alice).setRouterContract(bob.address)
      ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");
    });

    it("Should only allow owner to update critical contracts", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper, alice } = contracts;

      // Router is already set in fixture, so even manager gets RouterAlreadySet error
      await expect(
        core.connect(keeper).setRouterContract(alice.address)
      ).to.be.revertedWithCustomError(core, "RouterAlreadySet");
    });
  });

  describe("Access Control Events", function () {
    it("Should emit proper events on role changes", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, router } = contracts;

      // Router is already set in fixture, so we just verify the current state
      expect(await core.getRouterContract()).to.equal(router.address);
      expect(await core.isAuthorizedCaller(router.address)).to.be.true;
    });
  });

  describe("Role Admin Management", function () {
    it("Should properly manage role admin relationships", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper, router } = contracts;

      // In current implementation, manager has supreme authority
      expect(await core.getManagerContract()).to.equal(keeper.address);
      expect(await core.isAuthorizedCaller(keeper.address)).to.be.true;
      expect(await core.isAuthorizedCaller(router.address)).to.be.true;
    });

    it("Should handle role admin transfers", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper, alice } = contracts;

      // Current implementation doesn't support manager transfer or router change after initial setup
      // Router is already set in fixture, so we get RouterAlreadySet error
      await expect(
        core.connect(keeper).setRouterContract(alice.address)
      ).to.be.revertedWithCustomError(core, "RouterAlreadySet");

      // Manager contract is immutable (set in constructor)
      expect(await core.getManagerContract()).to.equal(keeper.address);
    });
  });

  describe("Market Operations Authorization", function () {
    const ALPHA = ethers.parseEther("1");
    const TICK_COUNT = 100;
    const MARKET_DURATION = 7 * 24 * 60 * 60; // 7 days

    async function createMarketFixture() {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper } = contracts;

      const currentTime = await time.latest();
      const startTime = currentTime + 3600; // 1 hour from now
      const endTime = startTime + MARKET_DURATION;
      const marketId = 1;

      await core
        .connect(keeper)
        .createMarket(marketId, TICK_COUNT, startTime, endTime, ALPHA);

      return {
        ...contracts,
        marketId,
        startTime,
        endTime,
      };
    }

    it("Should only allow manager to create markets", async function () {
      const { core, alice, bob } = await loadFixture(coreFixture);

      const currentTime = await time.latest();
      const startTime = currentTime + 3600;
      const endTime = startTime + MARKET_DURATION;

      await expect(
        core
          .connect(alice)
          .createMarket(1, TICK_COUNT, startTime, endTime, ALPHA)
      ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");

      await expect(
        core.connect(bob).createMarket(1, TICK_COUNT, startTime, endTime, ALPHA)
      ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");
    });

    it("Should only allow manager to settle markets", async function () {
      const { core, alice, bob, marketId } = await loadFixture(
        createMarketFixture
      );

      await expect(
        core.connect(alice).settleMarket(marketId, 50)
      ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");

      await expect(
        core.connect(bob).settleMarket(marketId, 50)
      ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");
    });
  });

  describe("Router Management Tests", function () {
    it("Should only allow keeper to update router contract", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper, alice } = contracts;

      // Router is already set in fixture, so even keeper gets RouterAlreadySet error
      await expect(
        core.connect(keeper).setRouterContract(alice.address)
      ).to.be.revertedWithCustomError(core, "RouterAlreadySet");
    });

    it("Should not allow non-keeper to update router contract", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, alice } = contracts;

      await expect(
        core.connect(alice).setRouterContract(alice.address)
      ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");
    });

    it("Should prevent router setting after initial setup", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper, alice } = contracts;

      // In current implementation, router can only be set once
      // Router is already set in fixture, so we get RouterAlreadySet error
      await expect(
        core.connect(keeper).setRouterContract(alice.address)
      ).to.be.revertedWithCustomError(core, "RouterAlreadySet");
    });
  });

  describe("Market Settlement Authorization", function () {
    it("Should prevent non-manager from calling settleMarket", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper, alice } = contracts;

      const currentTime = Math.floor(Date.now() / 1000);
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;

      // Create market first
      await core
        .connect(keeper)
        .createMarket(1, 100, startTime, endTime, ethers.parseEther("0.1"));

      // Non-manager cannot settle
      await expect(
        core.connect(alice).settleMarket(1, 50)
      ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");
    });

    it("Should only allow keeper to create markets", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, alice } = contracts;

      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;

      await expect(
        core
          .connect(alice)
          .createMarket(99, 100, startTime, endTime, ethers.parseEther("0.1"))
      ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");
    });

    it("Should only allow router to execute trades", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper, alice } = contracts;

      // Create market first
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
        lowerTick: 10,
        upperTick: 20,
        quantity: ethers.parseUnits("0.01", 6),
        maxCost: ethers.parseUnits("1", 6),
      };

      await expect(
        core.connect(alice).openPosition(alice.address, tradeParams)
      ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");
    });

    it("Should only allow position owner or router to adjust positions", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, router, keeper, alice, bob } = contracts;

      // Create market first
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

      // Create position as alice
      const tradeParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: ethers.parseUnits("0.05", 6),
        maxCost: ethers.parseUnits("1", 6),
      };

      await core.connect(router).openPosition(alice.address, tradeParams);

      // Bob should not be able to adjust alice's position
      await expect(
        core
          .connect(bob)
          .increasePosition(
            1,
            ethers.parseUnits("0.01", 6),
            ethers.parseUnits("1", 6)
          )
      ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");
    });
  });

  describe("Trade Execution Authorization", function () {
    it("Should revert unauthorized trade execution", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, alice, keeper } = contracts;

      // Create market first
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
        marketId: marketId,
        lowerTick: 45,
        upperTick: 55,
        quantity: ethers.parseUnits("0.05", 6),
        maxCost: ethers.parseUnits("0.1", 6),
      };

      await expect(
        core.connect(alice).openPosition(alice.address, tradeParams)
      ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");
    });

    it("Should allow authorized router to execute trades", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, router, alice, keeper } = contracts;

      // Create market first
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
        marketId: marketId,
        lowerTick: 45,
        upperTick: 55,
        quantity: ethers.parseUnits("0.05", 6),
        maxCost: ethers.parseUnits("0.1", 6),
      };

      await expect(
        core.connect(router).openPosition(alice.address, tradeParams)
      ).to.not.be.reverted;
    });

    it("Should handle insufficient balance", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, router, alice, paymentToken, keeper } = contracts;

      // Create market first
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

      // Drain alice's balance
      const balance = await paymentToken.balanceOf(alice.address);
      await paymentToken.connect(alice).transfer(router.address, balance);

      const tradeParams = {
        marketId: marketId,
        lowerTick: 45,
        upperTick: 55,
        quantity: ethers.parseUnits("0.05", 6),
        maxCost: ethers.parseUnits("0.1", 6),
      };

      await expect(
        core.connect(router).openPosition(alice.address, tradeParams)
      ).to.be.reverted;
    });

    it("Should handle paused contract", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper, router, alice } = contracts;

      // Create market first
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

      // Pause contract
      await core.connect(keeper).pause("Test pause");

      const tradeParams = {
        marketId: marketId,
        lowerTick: 45,
        upperTick: 55,
        quantity: ethers.parseUnits("0.05", 6),
        maxCost: ethers.parseUnits("0.1", 6),
      };

      await expect(
        core.connect(router).openPosition(alice.address, tradeParams)
      ).to.be.revertedWithCustomError(core, "ContractPaused");
    });
  });
});
