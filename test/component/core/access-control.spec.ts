import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import {
  createActiveMarketFixture,
  setupActiveMarket,
} from "../../helpers/fixtures/core";
import { COMPONENT_TAG } from "../../helpers/tags";

describe(`${COMPONENT_TAG} CLMSRMarketCore - Access Control`, function () {
  describe("Role Management", function () {
    it("Should have correct initial admin roles", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, keeper } = contracts;

      // Manager should be able to pause/unpause
      await expect(core.connect(keeper).pause("Test pause"))
        .to.emit(core, "EmergencyPaused")
        .withArgs(keeper.address, "Test pause"); // reason 파라미터 추가

      expect(await core.isPaused()).to.be.true;

      // Test unpause functionality
      await expect(core.connect(keeper).unpause())
        .to.emit(core, "EmergencyUnpaused")
        .withArgs(keeper.address);

      expect(await core.isPaused()).to.be.false;
    });

    it("Should reject unauthorized manager operations", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, alice } = contracts;

      // Non-manager should not be able to pause
      await expect(core.connect(alice).pause("Unauthorized"))
        .to.be.revertedWithCustomError(core, "UnauthorizedCaller")
        .withArgs(alice.address);
    });
  });

  describe("Trading Access", function () {
    it("Should allow public trading operations", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, keeper, alice, paymentToken } = contracts;

      // Create a test market using helper (already active)
      const { marketId } = await setupActiveMarket(contracts);

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
          .openPosition(
            alice.address,
            marketId,
            100100,
            100200,
            quantity,
            maxCost
          )
      ).to.not.be.reverted;
    });
  });

  describe("Position Contract Integration", function () {
    it("Should have correct position contract reference", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, mockPosition } = contracts;

      // Core should reference the correct position contract
      expect(await core.getPositionContract()).to.equal(
        await mockPosition.getAddress()
      );
    });
  });
});
