import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import {
  activePositionFixture,
  activePositionMarketFixture,
  createRealTestPosition,
} from "../../helpers/fixtures/position";
import { UNIT_TAG } from "../../helpers/tags";

describe(`${UNIT_TAG} Position ERC721 Standard`, function () {
  describe("ERC721 Metadata", function () {
    it("should return correct name and symbol", async function () {
      const { position } = await loadFixture(activePositionFixture);

      expect(await position.name()).to.equal("CLMSR Position");
      expect(await position.symbol()).to.equal("CLMSR-POS");
    });

    it("should return dynamic tokenURI with position metadata", async function () {
      const contracts = await loadFixture(activePositionMarketFixture);
      const { position, alice, marketId } = contracts;

      const { positionId } = await createRealTestPosition(
        contracts,
        alice,
        marketId
      );

      const tokenURI = await position.tokenURI(positionId);
      expect(tokenURI).to.include("data:application/json;base64,");

      // Decode and parse JSON
      const base64Data = tokenURI.split(",")[1];
      const jsonString = Buffer.from(base64Data, "base64").toString();
      const metadata = JSON.parse(jsonString);

      expect(metadata.name).to.include("CLMSR Position");
      expect(metadata.description).to.include("Position");
      expect(metadata.attributes).to.be.an("array");
      expect(metadata.attributes.length).to.equal(5);

      // Check specific attributes
      const marketIdAttr = metadata.attributes.find(
        (attr: any) => attr.trait_type === "Market ID"
      );
      expect(marketIdAttr.value).to.equal(marketId);
    });

    it("should revert tokenURI for non-existent token", async function () {
      const { position } = await loadFixture(activePositionFixture);

      await expect(position.tokenURI(999)).to.be.revertedWithCustomError(
        position,
        "PositionNotFound"
      );
    });
  });

  describe("ERC721 Balance and Ownership", function () {
    it("should track balances correctly", async function () {
      const contracts = await loadFixture(activePositionMarketFixture);
      const { position, alice, marketId } = contracts;

      expect(await position.balanceOf(alice.address)).to.equal(0);

      const { positionId } = await createRealTestPosition(
        contracts,
        alice,
        marketId
      );

      expect(await position.balanceOf(alice.address)).to.equal(1);

      // Create another position
      await createRealTestPosition(contracts, alice, marketId, 100200, 100300);

      expect(await position.balanceOf(alice.address)).to.equal(2);
    });

    it("should return correct owner", async function () {
      const contracts = await loadFixture(activePositionMarketFixture);
      const { position, alice, marketId } = contracts;

      const { positionId } = await createRealTestPosition(
        contracts,
        alice,
        marketId
      );

      expect(await position.ownerOf(positionId)).to.equal(alice.address);
    });

    it("should revert balanceOf for zero address", async function () {
      const { position } = await loadFixture(activePositionFixture);

      await expect(
        position.balanceOf(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(position, "ERC721InvalidOwner");
    });

    it("should revert ownerOf for non-existent token", async function () {
      const { position } = await loadFixture(activePositionFixture);

      await expect(position.ownerOf(999)).to.be.revertedWithCustomError(
        position,
        "ERC721NonexistentToken"
      );
    });
  });

  describe("ERC721 Transfers", function () {
    it("should transfer position correctly", async function () {
      const contracts = await loadFixture(activePositionMarketFixture);
      const { position, alice, bob, marketId } = contracts;

      const { positionId } = await createRealTestPosition(
        contracts,
        alice,
        marketId
      );

      // Transfer from alice to bob
      await position
        .connect(alice)
        .transferFrom(alice.address, bob.address, positionId);

      expect(await position.ownerOf(positionId)).to.equal(bob.address);
      expect(await position.balanceOf(alice.address)).to.equal(0);
      expect(await position.balanceOf(bob.address)).to.equal(1);
    });

    it("should update owner token tracking on transfer", async function () {
      const contracts = await loadFixture(activePositionMarketFixture);
      const { position, alice, bob, marketId } = contracts;

      const { positionId } = await createRealTestPosition(
        contracts,
        alice,
        marketId
      );

      // Check initial state
      let aliceTokens = await position.getPositionsByOwner(alice.address);
      let bobTokens = await position.getPositionsByOwner(bob.address);
      expect(aliceTokens.length).to.equal(1);
      expect(aliceTokens[0]).to.equal(positionId);
      expect(bobTokens.length).to.equal(0);

      // Transfer
      await position
        .connect(alice)
        .transferFrom(alice.address, bob.address, positionId);

      // Check updated state
      aliceTokens = await position.getPositionsByOwner(alice.address);
      bobTokens = await position.getPositionsByOwner(bob.address);
      expect(aliceTokens.length).to.equal(0);
      expect(bobTokens.length).to.equal(1);
      expect(bobTokens[0]).to.equal(positionId);
    });

    it("should handle safe transfers", async function () {
      const contracts = await loadFixture(activePositionMarketFixture);
      const { position, alice, bob, marketId } = contracts;

      const { positionId } = await createRealTestPosition(
        contracts,
        alice,
        marketId
      );

      // Safe transfer should work
      await position
        .connect(alice)
        ["safeTransferFrom(address,address,uint256)"](
          alice.address,
          bob.address,
          positionId
        );

      expect(await position.ownerOf(positionId)).to.equal(bob.address);
    });

    it("should revert transfer from non-owner", async function () {
      const contracts = await loadFixture(activePositionMarketFixture);
      const { position, alice, bob, charlie, marketId } = contracts;

      const { positionId } = await createRealTestPosition(
        contracts,
        alice,
        marketId
      );

      await expect(
        position
          .connect(charlie)
          .transferFrom(alice.address, bob.address, positionId)
      ).to.be.revertedWithCustomError(position, "ERC721InsufficientApproval");
    });
  });

  describe("ERC721 Approvals", function () {
    it("should approve and transfer", async function () {
      const contracts = await loadFixture(activePositionMarketFixture);
      const { position, alice, bob, charlie, marketId } = contracts;

      const { positionId } = await createRealTestPosition(
        contracts,
        alice,
        marketId
      );

      // Approve charlie to transfer
      await position.connect(alice).approve(charlie.address, positionId);
      expect(await position.getApproved(positionId)).to.equal(charlie.address);

      // Charlie transfers to bob
      await position
        .connect(charlie)
        .transferFrom(alice.address, bob.address, positionId);

      expect(await position.ownerOf(positionId)).to.equal(bob.address);
    });

    it("should set approval for all", async function () {
      const contracts = await loadFixture(activePositionMarketFixture);
      const { position, alice, bob, charlie, marketId } = contracts;

      const { positionId } = await createRealTestPosition(
        contracts,
        alice,
        marketId
      );

      // Set approval for all
      await position.connect(alice).setApprovalForAll(charlie.address, true);
      expect(await position.isApprovedForAll(alice.address, charlie.address)).to
        .be.true;

      // Charlie can now transfer
      await position
        .connect(charlie)
        .transferFrom(alice.address, bob.address, positionId);

      expect(await position.ownerOf(positionId)).to.equal(bob.address);
    });

    it("should clear approval on transfer", async function () {
      const contracts = await loadFixture(activePositionMarketFixture);
      const { position, alice, bob, charlie, marketId } = contracts;

      const { positionId } = await createRealTestPosition(
        contracts,
        alice,
        marketId
      );

      // Approve charlie
      await position.connect(alice).approve(charlie.address, positionId);
      expect(await position.getApproved(positionId)).to.equal(charlie.address);

      // Transfer clears approval
      await position
        .connect(alice)
        .transferFrom(alice.address, bob.address, positionId);

      expect(await position.getApproved(positionId)).to.equal(
        ethers.ZeroAddress
      );
    });
  });

  describe("ERC165 Support", function () {
    it("should support required interfaces", async function () {
      const { position } = await loadFixture(activePositionFixture);

      // ERC165
      expect(await position.supportsInterface("0x01ffc9a7")).to.be.true;
      // ERC721
      expect(await position.supportsInterface("0x80ac58cd")).to.be.true;
      // ERC721Metadata
      expect(await position.supportsInterface("0x5b5e139f")).to.be.true;
      // ERC721Enumerable is not supported (we use custom enumeration)
      expect(await position.supportsInterface("0x780e9d63")).to.be.false;
    });
  });
});
