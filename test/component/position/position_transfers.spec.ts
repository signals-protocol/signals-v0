import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";

import {
  activePositionMarketFixture,
  createRealTestPosition,
} from "../../helpers/fixtures/position";
import { COMPONENT_TAG } from "../../helpers/tags";

describe(`${COMPONENT_TAG} Position NFT Transfers`, function () {
  describe("Position Transfer Mechanics", function () {
    it("should transfer position NFT between users", async function () {
      const contracts = await loadFixture(activePositionMarketFixture);
      const { position, alice, bob, marketId } = contracts;

      const { positionId } = await createRealTestPosition(
        contracts,
        alice,
        marketId
      );

      // Verify initial ownership
      expect(await position.ownerOf(positionId)).to.equal(alice.address);
      expect(await position.balanceOf(alice.address)).to.equal(1);
      expect(await position.balanceOf(bob.address)).to.equal(0);

      // Transfer position
      await expect(
        position
          .connect(alice)
          .transferFrom(alice.address, bob.address, positionId)
      )
        .to.emit(position, "Transfer")
        .withArgs(alice.address, bob.address, positionId);

      // Verify transfer
      expect(await position.ownerOf(positionId)).to.equal(bob.address);
      expect(await position.balanceOf(alice.address)).to.equal(0);
      expect(await position.balanceOf(bob.address)).to.equal(1);

      // Verify position tracking updates
      const alicePositions = await position.getPositionsByOwner(alice.address);
      const bobPositions = await position.getPositionsByOwner(bob.address);

      expect(alicePositions.length).to.equal(0);
      expect(bobPositions.length).to.equal(1);
      expect(bobPositions[0]).to.equal(positionId);
    });

    it("should handle safeTransferFrom correctly", async function () {
      const contracts = await loadFixture(activePositionMarketFixture);
      const { position, alice, bob, marketId } = contracts;

      const { positionId } = await createRealTestPosition(
        contracts,
        alice,
        marketId
      );

      // Safe transfer
      await expect(
        position
          .connect(alice)
          ["safeTransferFrom(address,address,uint256)"](
            alice.address,
            bob.address,
            positionId
          )
      )
        .to.emit(position, "Transfer")
        .withArgs(alice.address, bob.address, positionId);

      expect(await position.ownerOf(positionId)).to.equal(bob.address);
    });

    it("should handle safeTransferFrom with data", async function () {
      const contracts = await loadFixture(activePositionMarketFixture);
      const { position, alice, bob, marketId } = contracts;

      const { positionId } = await createRealTestPosition(
        contracts,
        alice,
        marketId
      );
      const data = ethers.toUtf8Bytes("test data");

      // Safe transfer with data
      await expect(
        position
          .connect(alice)
          ["safeTransferFrom(address,address,uint256,bytes)"](
            alice.address,
            bob.address,
            positionId,
            data
          )
      )
        .to.emit(position, "Transfer")
        .withArgs(alice.address, bob.address, positionId);

      expect(await position.ownerOf(positionId)).to.equal(bob.address);
    });

    it("should update position tracking correctly on multiple transfers", async function () {
      const contracts = await loadFixture(activePositionMarketFixture);
      const { position, alice, bob, charlie, marketId } = contracts;

      const { positionId } = await createRealTestPosition(
        contracts,
        alice,
        marketId
      );

      // Alice -> Bob
      await position
        .connect(alice)
        .transferFrom(alice.address, bob.address, positionId);

      let alicePositions = await position.getPositionsByOwner(alice.address);
      let bobPositions = await position.getPositionsByOwner(bob.address);
      let charliePositions = await position.getPositionsByOwner(
        charlie.address
      );

      expect(alicePositions.length).to.equal(0);
      expect(bobPositions.length).to.equal(1);
      expect(charliePositions.length).to.equal(0);

      // Bob -> Charlie
      await position
        .connect(bob)
        .transferFrom(bob.address, charlie.address, positionId);

      alicePositions = await position.getPositionsByOwner(alice.address);
      bobPositions = await position.getPositionsByOwner(bob.address);
      charliePositions = await position.getPositionsByOwner(charlie.address);

      expect(alicePositions.length).to.equal(0);
      expect(bobPositions.length).to.equal(0);
      expect(charliePositions.length).to.equal(1);
      expect(charliePositions[0]).to.equal(positionId);

      // Charlie -> Alice (back to original)
      await position
        .connect(charlie)
        .transferFrom(charlie.address, alice.address, positionId);

      alicePositions = await position.getPositionsByOwner(alice.address);
      bobPositions = await position.getPositionsByOwner(bob.address);
      charliePositions = await position.getPositionsByOwner(charlie.address);

      expect(alicePositions.length).to.equal(1);
      expect(alicePositions[0]).to.equal(positionId);
      expect(bobPositions.length).to.equal(0);
      expect(charliePositions.length).to.equal(0);
    });

    it("should handle transfers of multiple positions", async function () {
      const { core, position, alice, bob, marketId } = await loadFixture(
        activePositionMarketFixture
      );

      // Create multiple positions for Alice
      const positionIds = [];
      for (let i = 0; i < 3; i++) {
        const params = {
          marketId,
          lowerTick: 100100 + i * 50,
          upperTick: 100200 + i * 50,
          quantity: ethers.parseUnits("1", 6),
          maxCost: ethers.parseUnits("10", 6),
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
        positionIds.push(positionId);
      }

      expect(await position.balanceOf(alice.address)).to.equal(3);
      expect(await position.balanceOf(bob.address)).to.equal(0);

      // Transfer first two positions to Bob
      await position
        .connect(alice)
        .transferFrom(alice.address, bob.address, positionIds[0]);
      await position
        .connect(alice)
        .transferFrom(alice.address, bob.address, positionIds[1]);

      // Verify balances
      expect(await position.balanceOf(alice.address)).to.equal(1);
      expect(await position.balanceOf(bob.address)).to.equal(2);

      // Verify position tracking
      const alicePositions = await position.getPositionsByOwner(alice.address);
      const bobPositions = await position.getPositionsByOwner(bob.address);

      expect(alicePositions.length).to.equal(1);
      expect(alicePositions[0]).to.equal(positionIds[2]);

      expect(bobPositions.length).to.equal(2);
      expect(bobPositions).to.include(positionIds[0]);
      expect(bobPositions).to.include(positionIds[1]);
    });
  });

  describe("Transfer Authorization", function () {
    it("should allow approved address to transfer position", async function () {
      const contracts = await loadFixture(activePositionMarketFixture);
      const { position, alice, bob, charlie, marketId } = contracts;

      const { positionId } = await createRealTestPosition(
        contracts,
        alice,
        marketId
      );

      // Alice approves Bob to transfer her position
      await expect(position.connect(alice).approve(bob.address, positionId))
        .to.emit(position, "Approval")
        .withArgs(alice.address, bob.address, positionId);

      expect(await position.getApproved(positionId)).to.equal(bob.address);

      // Bob transfers Alice's position to Charlie
      await expect(
        position
          .connect(bob)
          .transferFrom(alice.address, charlie.address, positionId)
      )
        .to.emit(position, "Transfer")
        .withArgs(alice.address, charlie.address, positionId);

      expect(await position.ownerOf(positionId)).to.equal(charlie.address);
      expect(await position.getApproved(positionId)).to.equal(
        ethers.ZeroAddress
      );
    });

    it("should allow operator to transfer all positions", async function () {
      const contracts = await loadFixture(activePositionMarketFixture);
      const { position, alice, bob, charlie, marketId } = contracts;

      const { positionId: positionId1 } = await createRealTestPosition(
        contracts,
        alice,
        marketId
      );
      const { positionId: positionId2 } = await createRealTestPosition(
        contracts,
        alice,
        marketId
      );

      // Alice sets Bob as operator for all her tokens
      await expect(position.connect(alice).setApprovalForAll(bob.address, true))
        .to.emit(position, "ApprovalForAll")
        .withArgs(alice.address, bob.address, true);

      expect(await position.isApprovedForAll(alice.address, bob.address)).to.be
        .true;

      // Bob can transfer both positions
      await position
        .connect(bob)
        .transferFrom(alice.address, charlie.address, positionId1);
      await position
        .connect(bob)
        .transferFrom(alice.address, charlie.address, positionId2);

      expect(await position.ownerOf(positionId1)).to.equal(charlie.address);
      expect(await position.ownerOf(positionId2)).to.equal(charlie.address);
      expect(await position.balanceOf(alice.address)).to.equal(0);
      expect(await position.balanceOf(charlie.address)).to.equal(2);
    });

    it("should revoke approval after transfer", async function () {
      const contracts = await loadFixture(activePositionMarketFixture);
      const { position, alice, bob, charlie, marketId } = contracts;

      const { positionId } = await createRealTestPosition(
        contracts,
        alice,
        marketId
      );

      // Approve and transfer
      await position.connect(alice).approve(bob.address, positionId);
      await position
        .connect(bob)
        .transferFrom(alice.address, charlie.address, positionId);

      // Approval should be cleared
      expect(await position.getApproved(positionId)).to.equal(
        ethers.ZeroAddress
      );
    });

    it("should prevent unauthorized transfers", async function () {
      const contracts = await loadFixture(activePositionMarketFixture);
      const { position, alice, bob, charlie, marketId } = contracts;

      const { positionId } = await createRealTestPosition(
        contracts,
        alice,
        marketId
      );

      // Bob tries to transfer Alice's position without approval
      await expect(
        position
          .connect(bob)
          .transferFrom(alice.address, charlie.address, positionId)
      ).to.be.revertedWithCustomError(position, "ERC721InsufficientApproval");

      // Charlie tries to transfer Alice's position without approval
      await expect(
        position
          .connect(charlie)
          .transferFrom(alice.address, bob.address, positionId)
      ).to.be.revertedWithCustomError(position, "ERC721InsufficientApproval");
    });

    it("should handle approval revocation", async function () {
      const contracts = await loadFixture(activePositionMarketFixture);
      const { position, alice, bob, charlie, marketId } = contracts;

      const { positionId } = await createRealTestPosition(
        contracts,
        alice,
        marketId
      );

      // Approve Bob
      await position.connect(alice).approve(bob.address, positionId);
      expect(await position.getApproved(positionId)).to.equal(bob.address);

      // Revoke approval by approving zero address
      await position.connect(alice).approve(ethers.ZeroAddress, positionId);
      expect(await position.getApproved(positionId)).to.equal(
        ethers.ZeroAddress
      );

      // Bob can no longer transfer
      await expect(
        position
          .connect(bob)
          .transferFrom(alice.address, charlie.address, positionId)
      ).to.be.revertedWithCustomError(position, "ERC721InsufficientApproval");
    });

    it("should handle operator revocation", async function () {
      const contracts = await loadFixture(activePositionMarketFixture);
      const { position, alice, bob, charlie, marketId } = contracts;

      const { positionId } = await createRealTestPosition(
        contracts,
        alice,
        marketId
      );

      // Set Bob as operator
      await position.connect(alice).setApprovalForAll(bob.address, true);
      expect(await position.isApprovedForAll(alice.address, bob.address)).to.be
        .true;

      // Revoke operator status
      await position.connect(alice).setApprovalForAll(bob.address, false);
      expect(await position.isApprovedForAll(alice.address, bob.address)).to.be
        .false;

      // Bob can no longer transfer
      await expect(
        position
          .connect(bob)
          .transferFrom(alice.address, charlie.address, positionId)
      ).to.be.revertedWithCustomError(position, "ERC721InsufficientApproval");
    });
  });

  describe("Transfer Edge Cases", function () {
    it("should prevent transfer to zero address", async function () {
      const contracts = await loadFixture(activePositionMarketFixture);
      const { position, alice, marketId } = contracts;

      const { positionId } = await createRealTestPosition(
        contracts,
        alice,
        marketId
      );

      await expect(
        position
          .connect(alice)
          .transferFrom(alice.address, ethers.ZeroAddress, positionId)
      ).to.be.revertedWithCustomError(position, "ERC721InvalidReceiver");
    });

    it("should prevent transfer of non-existent token", async function () {
      const contracts = await loadFixture(activePositionMarketFixture);
      const { position, alice, bob, marketId } = contracts;

      const nonExistentId = 999;

      await expect(
        position
          .connect(alice)
          .transferFrom(alice.address, bob.address, nonExistentId)
      ).to.be.revertedWithCustomError(position, "ERC721NonexistentToken");
    });

    it("should prevent transfer from wrong owner", async function () {
      const contracts = await loadFixture(activePositionMarketFixture);
      const { position, alice, bob, charlie, marketId } = contracts;

      const { positionId } = await createRealTestPosition(
        contracts,
        alice,
        marketId
      );

      // Bob tries to transfer from Charlie (who doesn't own the token)
      // This should fail with ERC721InsufficientApproval because Bob is not approved
      await expect(
        position
          .connect(bob)
          .transferFrom(charlie.address, bob.address, positionId)
      ).to.be.revertedWithCustomError(position, "ERC721InsufficientApproval");
    });

    it("should handle self-transfer", async function () {
      const contracts = await loadFixture(activePositionMarketFixture);
      const { position, alice, marketId } = contracts;

      const { positionId } = await createRealTestPosition(
        contracts,
        alice,
        marketId
      );

      // Self-transfer should work but be a no-op
      await expect(
        position
          .connect(alice)
          .transferFrom(alice.address, alice.address, positionId)
      )
        .to.emit(position, "Transfer")
        .withArgs(alice.address, alice.address, positionId);

      expect(await position.ownerOf(positionId)).to.equal(alice.address);
      expect(await position.balanceOf(alice.address)).to.equal(1);
    });

    it("should handle rapid transfers", async function () {
      const contracts = await loadFixture(activePositionMarketFixture);
      const { position, alice, bob, charlie, marketId } = contracts;

      const { positionId } = await createRealTestPosition(
        contracts,
        alice,
        marketId
      );

      // Rapid back-and-forth transfers
      await position
        .connect(alice)
        .transferFrom(alice.address, bob.address, positionId);
      await position
        .connect(bob)
        .transferFrom(bob.address, charlie.address, positionId);
      await position
        .connect(charlie)
        .transferFrom(charlie.address, alice.address, positionId);
      await position
        .connect(alice)
        .transferFrom(alice.address, bob.address, positionId);

      expect(await position.ownerOf(positionId)).to.equal(bob.address);
      expect(await position.balanceOf(alice.address)).to.equal(0);
      expect(await position.balanceOf(bob.address)).to.equal(1);
      expect(await position.balanceOf(charlie.address)).to.equal(0);

      // Verify position tracking is correct
      const bobPositions = await position.getPositionsByOwner(bob.address);
      expect(bobPositions.length).to.equal(1);
      expect(bobPositions[0]).to.equal(positionId);
    });
  });

  describe("Transfer Impact on Position Operations", function () {
    it("should allow new owner to manage transferred position", async function () {
      const { core, position, alice, bob, marketId } = await loadFixture(
        activePositionMarketFixture
      );

      // Alice opens position
      const params = {
        marketId,
        lowerTick: 100100,
        upperTick: 100200,
        quantity: ethers.parseUnits("2", 6),
        maxCost: ethers.parseUnits("20", 6),
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

      // Transfer to Bob
      await position
        .connect(alice)
        .transferFrom(alice.address, bob.address, positionId);

      // Bob should be able to manage the position
      await expect(
        core
          .connect(alice)
          .increasePosition(
            positionId,
            ethers.parseUnits("1", 6),
            ethers.parseUnits("10", 6)
          )
      ).to.emit(position, "PositionUpdated");

      await expect(
        core
          .connect(alice)
          .decreasePosition(positionId, ethers.parseUnits("0.5", 6), 0)
      ).to.emit(position, "PositionUpdated");

      await expect(core.connect(alice).closePosition(positionId, 0)).to.emit(
        position,
        "PositionBurned"
      );

      // Position should be burned and Bob's balance should be 0
      expect(await position.balanceOf(bob.address)).to.equal(0);
    });

    it("should prevent original owner from managing transferred position", async function () {
      const { core, position, alice, bob, marketId } = await loadFixture(
        activePositionMarketFixture
      );

      // Alice opens position
      const params = {
        marketId,
        lowerTick: 100100,
        upperTick: 100200,
        quantity: ethers.parseUnits("2", 6),
        maxCost: ethers.parseUnits("20", 6),
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

      // Transfer to Bob
      await position
        .connect(alice)
        .transferFrom(alice.address, bob.address, positionId);

      // Alice should no longer be able to approve transfers
      await expect(
        position.connect(alice).approve(alice.address, positionId)
      ).to.be.revertedWithCustomError(position, "ERC721InvalidApprover");

      // Alice should not be able to transfer it back
      await expect(
        position
          .connect(alice)
          .transferFrom(bob.address, alice.address, positionId)
      ).to.be.revertedWithCustomError(position, "ERC721InsufficientApproval");
    });

    it("should handle position transfer during active operations", async function () {
      const { core, position, alice, bob, marketId } = await loadFixture(
        activePositionMarketFixture
      );

      // Alice opens position
      const params = {
        marketId,
        lowerTick: 100100,
        upperTick: 100200,
        quantity: ethers.parseUnits("5", 6),
        maxCost: ethers.parseUnits("50", 6),
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

      // Increase position
      await core
        .connect(alice)
        .increasePosition(
          positionId,
          ethers.parseUnits("2", 6),
          ethers.parseUnits("20", 6)
        );

      let positionData = await position.getPosition(positionId);
      expect(positionData.quantity).to.equal(ethers.parseUnits("7", 6));

      // Transfer to Bob
      await position
        .connect(alice)
        .transferFrom(alice.address, bob.address, positionId);

      // Position data should remain the same
      positionData = await position.getPosition(positionId);
      expect(positionData.quantity).to.equal(ethers.parseUnits("7", 6));
      expect(positionData.marketId).to.equal(marketId);
      expect(positionData.lowerTick).to.equal(100100);
      expect(positionData.upperTick).to.equal(100200);

      // Bob can continue operations
      await core
        .connect(alice)
        .decreasePosition(positionId, ethers.parseUnits("3", 6), 0);

      positionData = await position.getPosition(positionId);
      expect(positionData.quantity).to.equal(ethers.parseUnits("4", 6));
    });
  });
});
