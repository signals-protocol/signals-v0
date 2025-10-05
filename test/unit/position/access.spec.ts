import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import {
  activePositionFixture,
  activePositionMarketFixture,
  createRealTestPosition,
} from "../../helpers/fixtures/position";
import { UNIT_TAG } from "../../helpers/tags";

describe(`${UNIT_TAG} Position Access Control`, function () {
  describe("Core Authorization", function () {
    it("should expose current core address", async function () {
      const { position, core } = await loadFixture(activePositionFixture);
      expect(await position.core()).to.equal(await core.getAddress());
    });

    it("should restrict updateCore to contract owner", async function () {
      const { position, core, keeper, alice } = await loadFixture(
        activePositionFixture
      );

      const newCore = ethers.Wallet.createRandom().address;

      await expect(
        position.connect(alice).updateCore(newCore)
      ).to.be.revertedWithCustomError(position, "OwnableUnauthorizedAccount");

      await expect(
        position.connect(keeper).updateCore(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(position, "ZeroAddress");

      await position.connect(keeper).updateCore(newCore);
      expect(await position.core()).to.equal(newCore);

      // restore original core
      await position.connect(keeper).updateCore(await core.getAddress());
    });
  });

  describe("onlyCore Modifier", function () {
    it("should allow core contract to mint positions", async function () {
      const contracts = await loadFixture(activePositionMarketFixture);
      const { core, alice, marketId } = contracts;

      await expect(
        core
          .connect(alice)
          .openPosition(
            marketId,
            100100,
            100200,
            ethers.parseUnits("0.01", 6),
            ethers.parseUnits("1", 6)
          )
      ).to.not.be.reverted;
    });

    it("should revert mintPosition when called directly by non-core", async function () {
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

    it("should revert updateQuantity when called by non-core", async function () {
      const { position, alice } = await loadFixture(activePositionFixture);

      await expect(
        position.connect(alice).updateQuantity(1, ethers.parseUnits("0.02", 6))
      )
        .to.be.revertedWithCustomError(position, "UnauthorizedCaller")
        .withArgs(alice.address);
    });

    it("should revert burn when called by non-core", async function () {
      const { position, alice } = await loadFixture(activePositionFixture);

      await expect(position.connect(alice).burn(1))
        .to.be.revertedWithCustomError(position, "UnauthorizedCaller")
        .withArgs(alice.address);
    });
  });

  describe("Core Contract Interaction", function () {
    it("should allow core to increase position quantity", async function () {
      const contracts = await loadFixture(activePositionMarketFixture);
      const { position, core, alice, marketId } = contracts;

      const { positionId } = await createRealTestPosition(
        contracts,
        alice,
        marketId,
        100100,
        100200,
        ethers.parseUnits("0.01", 6)
      );

      await expect(
        core
          .connect(alice)
          .increasePosition(
            positionId,
            ethers.parseUnits("0.005", 6),
            ethers.parseUnits("1", 6)
          )
      ).to.not.be.reverted;

      const positionData = await position.getPosition(positionId);
      expect(positionData.quantity).to.equal(ethers.parseUnits("0.015", 6));
    });

    it("should allow core to decrease and burn position", async function () {
      const contracts = await loadFixture(activePositionMarketFixture);
      const { position, core, alice, marketId } = contracts;

      const { positionId } = await createRealTestPosition(
        contracts,
        alice,
        marketId,
        100100,
        100200,
        ethers.parseUnits("0.01", 6)
      );

      await expect(
        core
          .connect(alice)
          .decreasePosition(positionId, ethers.parseUnits("0.01", 6), 0)
      ).to.not.be.reverted;

      await expect(
        position.getPosition(positionId)
      ).to.be.revertedWithCustomError(position, "PositionNotFound");
    });
  });

  describe("Security Edge Cases", function () {
    it("should handle sequential position operations safely", async function () {
      const contracts = await loadFixture(activePositionMarketFixture);
      const { position, core, alice, marketId } = contracts;

      const { positionId } = await createRealTestPosition(
        contracts,
        alice,
        marketId,
        100100,
        100200,
        ethers.parseUnits("0.01", 6)
      );

      await expect(
        core
          .connect(alice)
          .increasePosition(
            positionId,
            ethers.parseUnits("0.002", 6),
            ethers.parseUnits("1", 6)
          )
      ).to.not.be.reverted;

      await expect(
        core
          .connect(alice)
          .decreasePosition(positionId, ethers.parseUnits("0.005", 6), 0)
      ).to.not.be.reverted;

      const positionData = await position.getPosition(positionId);
      expect(positionData.quantity).to.equal(ethers.parseUnits("0.007", 6));
    });

    it("should prevent zero quantity minting even when called by core", async function () {
      const { position, alice } = await loadFixture(activePositionFixture);

      await expect(
        position
          .connect(alice)
          .mintPosition(
            alice.address,
            1,
            100100,
            100200,
            0
          )
      ).to.be.revertedWithCustomError(position, "UnauthorizedCaller");
    });
  });
});
