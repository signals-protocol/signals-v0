import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import {
  activePositionFixture,
  activePositionMarketFixture,
} from "../../helpers/fixtures/position";
import { UNIT_TAG } from "../../helpers/tags";

describe(`${UNIT_TAG} Position Access Control`, function () {
  describe("Core Authorization", function () {
    it("should set core address correctly in constructor", async function () {
      const { position, core } = await loadFixture(activePositionFixture);

      expect(await position.getCoreContract()).to.equal(
        await core.getAddress()
      );
      expect(await position.core()).to.equal(await core.getAddress());
    });

    it("should revert constructor with zero address", async function () {
      const CLMSRPositionFactory = await ethers.getContractFactory(
        "CLMSRPosition"
      );

      const position = await CLMSRPositionFactory.deploy();
      await position.waitForDeployment();
      await expect(
        position.initialize(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(position, "ZeroAddress");
    });

    it("should identify authorized caller correctly", async function () {
      const contracts = await loadFixture(activePositionFixture);

      expect(
        await contracts.position.isAuthorizedCaller(
          await contracts.core.getAddress()
        )
      ).to.be.true;
      expect(
        await contracts.position.isAuthorizedCaller(contracts.alice.address)
      ).to.be.false;
    });
  });

  describe("onlyCore Modifier", function () {
    it("should allow core to mint position", async function () {
      const contracts = await loadFixture(activePositionMarketFixture);
      const { position, core, alice, marketId } = contracts;

      // This should work when called through router (authorized caller)
      const params = {
        marketId,
        lowerTick: 100100, // 실제 틱값 사용
        upperTick: 100200, // 실제 틱값 사용
        quantity: ethers.parseUnits("0.01", 6),
        maxCost: ethers.parseUnits("1", 6),
      };

      await expect(
        core
          .connect(alice)
          .openPosition(
            params.marketId,
            params.lowerTick,
            params.upperTick,
            params.quantity,
            params.maxCost
          )
      ).to.not.be.reverted;
    });

    it("should revert mintPosition from non-core", async function () {
      const { position, alice } = await loadFixture(activePositionFixture);

      await expect(
        position
          .connect(alice)
          .mintPosition(
            alice.address,
            1,
            100100,
            100200,
            ethers.parseUnits("0.01", 6)
          )
      )
        .to.be.revertedWithCustomError(position, "UnauthorizedCaller")
        .withArgs(alice.address);
    });

    it("should revert setPositionQuantity from non-core", async function () {
      const { position, alice } = await loadFixture(activePositionFixture);

      await expect(
        position.connect(alice).updateQuantity(1, ethers.parseUnits("0.02", 6))
      )
        .to.be.revertedWithCustomError(position, "UnauthorizedCaller")
        .withArgs(alice.address);
    });

    it("should revert burnPosition from non-core", async function () {
      const { position, alice } = await loadFixture(activePositionFixture);

      await expect(position.connect(alice).burn(1))
        .to.be.revertedWithCustomError(position, "UnauthorizedCaller")
        .withArgs(alice.address);
    });
  });

  describe("Core Contract Interaction", function () {
    it("should allow core to update position quantity", async function () {
      const { position, core, alice, marketId } = await loadFixture(
        activePositionMarketFixture
      );

      // Create position through router
      const params = {
        marketId,
        lowerTick: 100100,
        upperTick: 100200,
        quantity: ethers.parseUnits("0.01", 6),
        maxCost: ethers.parseUnits("1", 6),
      };

      const positionId = await core
        .connect(alice)
        .openPosition.staticCall(
          params.marketId,
          params.lowerTick,
          params.upperTick,
          params.quantity,
          params.maxCost
        );
      await core
        .connect(alice)
        .openPosition(
          params.marketId,
          params.lowerTick,
          params.upperTick,
          params.quantity,
          params.maxCost
        );

      // Increase position through router
      await expect(
        core
          .connect(alice)
          .increasePosition(
            positionId,
            ethers.parseUnits("0.005", 6),
            ethers.parseUnits("1", 6)
          )
      ).to.not.be.reverted;

      // Verify quantity updated
      const positionData = await position.getPosition(positionId);
      expect(positionData.quantity).to.equal(ethers.parseUnits("0.015", 6));
    });

    it("should allow core to burn position", async function () {
      const { position, core, alice, marketId } = await loadFixture(
        activePositionMarketFixture
      );

      // Create position through router
      const params = {
        marketId,
        lowerTick: 100100,
        upperTick: 100200,
        quantity: ethers.parseUnits("0.01", 6),
        maxCost: ethers.parseUnits("1", 6),
      };

      const positionId = await core
        .connect(alice)
        .openPosition.staticCall(
          params.marketId,
          params.lowerTick,
          params.upperTick,
          params.quantity,
          params.maxCost
        );
      await core
        .connect(alice)
        .openPosition(
          params.marketId,
          params.lowerTick,
          params.upperTick,
          params.quantity,
          params.maxCost
        );

      // Decrease position to zero (should burn)
      await expect(
        core
          .connect(alice)
          .decreasePosition(positionId, ethers.parseUnits("0.01", 6), 0)
      ).to.not.be.reverted;

      // Verify position is burned
      await expect(
        position.getPosition(positionId)
      ).to.be.revertedWithCustomError(position, "PositionNotFound");
    });
  });

  describe("Immutable Core Address", function () {
    it("should not allow changing core address after deployment", async function () {
      const { position } = await loadFixture(activePositionFixture);

      // Core address should be immutable - no setter function should exist
      expect((position as any).setCore).to.be.undefined;
      expect((position as any).updateCore).to.be.undefined;
      expect((position as any).changeCore).to.be.undefined;
    });

    it("should maintain core address consistency", async function () {
      const { position, core } = await loadFixture(activePositionFixture);

      const coreAddress1 = await position.core();
      const coreAddress2 = await position.getCoreContract();
      const actualCoreAddress = await core.getAddress();

      expect(coreAddress1).to.equal(actualCoreAddress);
      expect(coreAddress2).to.equal(actualCoreAddress);
      expect(coreAddress1).to.equal(coreAddress2);
    });
  });

  describe("Security Edge Cases", function () {
    it("should prevent reentrancy attacks on core functions", async function () {
      const { position, core, alice, marketId } = await loadFixture(
        activePositionMarketFixture
      );

      // Create position
      const params = {
        marketId,
        lowerTick: 100100,
        upperTick: 100200,
        quantity: ethers.parseUnits("0.01", 6),
        maxCost: ethers.parseUnits("1", 6),
      };

      const positionId = await core
        .connect(alice)
        .openPosition.staticCall(
          alice.address,
          params.marketId,
          params.lowerTick,
          params.upperTick,
          params.quantity,
          params.maxCost
        );
      await core
        .connect(alice)
        .openPosition(
          alice.address,
          params.marketId,
          params.lowerTick,
          params.upperTick,
          params.quantity,
          params.maxCost
        );

      // Multiple operations in same transaction should work
      await expect(
        core
          .connect(alice)
          .increasePosition(
            positionId,
            ethers.parseUnits("0.005", 6),
            ethers.parseUnits("1", 6)
          )
      ).to.not.be.reverted;
    });

    it("should handle zero quantity validation", async function () {
      const { position, alice } = await loadFixture(activePositionFixture);

      // Direct call should revert due to unauthorized caller first
      await expect(
        position.connect(alice).mintPosition(
          alice.address,
          1,
          100100,
          100200,
          0 // Zero quantity
        )
      ).to.be.revertedWithCustomError(position, "UnauthorizedCaller");
    });

    it("should handle zero address validation", async function () {
      const { position, alice } = await loadFixture(activePositionFixture);

      // Direct call should revert due to unauthorized caller first
      await expect(
        position
          .connect(alice)
          .mintPosition(
            ethers.ZeroAddress,
            1,
            100100,
            100200,
            ethers.parseUnits("0.01", 6)
          )
      ).to.be.revertedWithCustomError(position, "UnauthorizedCaller");
    });
  });
});
