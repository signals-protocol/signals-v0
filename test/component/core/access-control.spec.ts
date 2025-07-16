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

      // Manager contract address should be set correctly
      expect(await core.getManagerContract()).to.equal(keeper.address);
    });

    it("Should allow manager operations", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper } = contracts;

      // Manager should be able to pause/unpause
      expect(await core.getManagerContract()).to.equal(keeper.address);

      // Test pause functionality
      await expect(core.connect(keeper).pause("Test pause"))
        .to.emit(core, "EmergencyPaused")
        .withArgs(keeper.address, "Test pause");

      expect(await core.isPaused()).to.be.true;

      // Test unpause functionality
      await expect(core.connect(keeper).unpause())
        .to.emit(core, "EmergencyUnpaused")
        .withArgs(keeper.address);

      expect(await core.isPaused()).to.be.false;
    });

    it("Should reject unauthorized manager operations", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, alice } = contracts;

      // Non-manager should not be able to pause
      await expect(core.connect(alice).pause("Unauthorized"))
        .to.be.revertedWithCustomError(core, "UnauthorizedCaller")
        .withArgs(alice.address);
    });
  });

  describe("Trading Access", function () {
    it("Should allow public trading operations", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper, alice, paymentToken } = contracts;

      // Create a test market
      const marketId = 1;
      const numTicks = 100;
      const startTime = (await time.latest()) + 100;
      const endTime = startTime + 3600; // 1 hour
      const liquidityParam = ethers.parseEther("1"); // 1 ETH

      await core
        .connect(keeper)
        .createMarket(marketId, numTicks, startTime, endTime, liquidityParam);

      // Fast forward to market start
      await time.increaseTo(startTime + 1);

      // Approve tokens for alice
      await paymentToken
        .connect(alice)
        .approve(await core.getAddress(), ethers.parseUnits("1000", 6));

      // Alice should be able to open position directly (no authorization needed)
      const quantity = 100;
      const maxCost = ethers.parseUnits("10", 6); // 10 USDC

      await expect(
        core
          .connect(alice)
          .openPosition(alice.address, marketId, 10, 20, quantity, maxCost)
      ).to.not.be.reverted;
    });
  });

  describe("Position Contract Integration", function () {
    it("Should have correct position contract reference", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, mockPosition } = contracts;

      // Core should reference the correct position contract
      expect(await core.getPositionContract()).to.equal(
        await mockPosition.getAddress()
      );
    });
  });
});
