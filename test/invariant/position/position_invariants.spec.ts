import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { ethers } from "hardhat";

import { activePositionMarketFixture } from "../../helpers/fixtures/position";
import { INVARIANT_TAG } from "../../helpers/tags";

describe(`${INVARIANT_TAG} Position Contract Invariants`, function () {
  describe("Core Invariants", function () {
    it("should maintain total supply equals sum of all user balances", async function () {
      const { core, position, alice, bob, charlie, marketId } =
        await loadFixture(activePositionMarketFixture);

      // Initial state: total supply should be 0
      expect(await position.totalSupply()).to.equal(0);
      expect(await position.balanceOf(alice.address)).to.equal(0);
      expect(await position.balanceOf(bob.address)).to.equal(0);
      expect(await position.balanceOf(charlie.address)).to.equal(0);

      const users = [alice, bob, charlie];
      const positionIds = [];

      // Create positions and verify invariant after each creation
      for (let i = 0; i < 5; i++) {
        const user = users[i % users.length];
        const params = {
          marketId,
          lowerTick: 100100 + i * 50,
          upperTick: 100200 + i * 50,
          quantity: ethers.parseUnits("0.01", 6), // Much smaller quantities
          maxCost: ethers.parseUnits("10", 6), // Reduced max cost
        };

        const positionId = await core
          .connect(alice)
          .openPosition.staticCall(
            user.address,
            params.marketId,
            params.lowerTick,
            params.upperTick,
            params.quantity,
            params.maxCost
          );
        await core
          .connect(alice)
          .openPosition(
            user.address,
            params.marketId,
            params.lowerTick,
            params.upperTick,
            params.quantity,
            params.maxCost
          );
        positionIds.push(positionId);

        // Verify invariant: totalSupply = sum of balances
        const totalSupply = await position.totalSupply();
        const aliceBalance = await position.balanceOf(alice.address);
        const bobBalance = await position.balanceOf(bob.address);
        const charlieBalance = await position.balanceOf(charlie.address);
        const sumOfBalances = aliceBalance + bobBalance + charlieBalance;

        expect(totalSupply).to.equal(sumOfBalances);
        expect(totalSupply).to.equal(i + 1);
      }

      // Transfer positions and verify invariant is maintained
      await position
        .connect(alice)
        .transferFrom(alice.address, bob.address, positionIds[0]);
      await position
        .connect(charlie)
        .transferFrom(charlie.address, alice.address, positionIds[2]);

      let totalSupply = await position.totalSupply();
      let aliceBalance = await position.balanceOf(alice.address);
      let bobBalance = await position.balanceOf(bob.address);
      let charlieBalance = await position.balanceOf(charlie.address);
      let sumOfBalances = aliceBalance + bobBalance + charlieBalance;

      expect(totalSupply).to.equal(sumOfBalances);
      expect(totalSupply).to.equal(5);

      // Close positions and verify invariant
      for (let i = 0; i < 3; i++) {
        await core.connect(alice).closePosition(positionIds[i], 0);

        totalSupply = await position.totalSupply();
        aliceBalance = await position.balanceOf(alice.address);
        bobBalance = await position.balanceOf(bob.address);
        charlieBalance = await position.balanceOf(charlie.address);
        sumOfBalances = aliceBalance + bobBalance + charlieBalance;

        expect(totalSupply).to.equal(sumOfBalances);
        expect(totalSupply).to.equal(5 - (i + 1));
      }

      // Close remaining positions
      await core.connect(alice).closePosition(positionIds[3], 0);
      await core.connect(alice).closePosition(positionIds[4], 0);

      // Final state: total supply should be 0
      expect(await position.totalSupply()).to.equal(0);
      expect(await position.balanceOf(alice.address)).to.equal(0);
      expect(await position.balanceOf(bob.address)).to.equal(0);
      expect(await position.balanceOf(charlie.address)).to.equal(0);
    });

    it("should maintain position ID uniqueness and sequential assignment", async function () {
      const { core, position, alice, bob, charlie, marketId } =
        await loadFixture(activePositionMarketFixture);

      const positionIds = new Set();
      const users = [alice, bob, charlie];

      // Create positions and verify ID uniqueness
      for (let i = 0; i < 10; i++) {
        const user = users[i % users.length];
        const params = {
          marketId,
          lowerTick: 100100 + i * 30,
          upperTick: 100200 + i * 30,
          quantity: ethers.parseUnits("0.01", 6), // Much smaller quantity
          maxCost: ethers.parseUnits("10", 6), // Reduced max cost
        };

        const expectedId = await position.getNextId();
        expect(expectedId).to.equal(i + 1);

        const positionId = await core
          .connect(alice)
          .openPosition.staticCall(
            user.address,
            params.marketId,
            params.lowerTick,
            params.upperTick,
            params.quantity,
            params.maxCost
          );
        await core
          .connect(alice)
          .openPosition(
            user.address,
            params.marketId,
            params.lowerTick,
            params.upperTick,
            params.quantity,
            params.maxCost
          );

        // Verify ID is unique
        expect(positionIds.has(positionId)).to.be.false;
        positionIds.add(positionId);

        // Verify ID is sequential
        expect(positionId).to.equal(i + 1);

        // Verify nextId is updated
        expect(await position.getNextId()).to.equal(i + 2);
      }

      // Close some positions - nextId should not change
      const nextIdBeforeClosing = await position.getNextId();
      await core.connect(alice).closePosition(1, 0);
      await core.connect(alice).closePosition(5, 0);
      await core.connect(alice).closePosition(10, 0);

      expect(await position.getNextId()).to.equal(nextIdBeforeClosing);

      // Create new positions - should continue from where we left off
      const params = {
        marketId,
        lowerTick: 100100,
        upperTick: 100200,
        quantity: ethers.parseUnits("0.01", 6), // Much smaller quantity
        maxCost: ethers.parseUnits("10", 6),
      };

      const newPositionId = await core
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

      expect(newPositionId).to.equal(11);
      expect(await position.getNextId()).to.equal(12);
    });

    it("should maintain owner tracking consistency", async function () {
      const { core, position, alice, bob, charlie, marketId } =
        await loadFixture(activePositionMarketFixture);

      const users = [alice, bob, charlie];
      const positionIds = [];

      // Create positions for different users
      for (let i = 0; i < 6; i++) {
        const user = users[i % users.length];
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
            user.address,
            params.marketId,
            params.lowerTick,
            params.upperTick,
            params.quantity,
            params.maxCost
          );
        await core
          .connect(alice)
          .openPosition(
            user.address,
            params.marketId,
            params.lowerTick,
            params.upperTick,
            params.quantity,
            params.maxCost
          );
        positionIds.push({ id: positionId, owner: user.address });

        // Verify owner tracking invariant
        const ownerPositions = await position.getPositionsByOwner(user.address);
        const userBalance = await position.balanceOf(user.address);

        expect(ownerPositions.length).to.equal(userBalance);

        // Verify all positions in the list are actually owned by the user
        for (const posId of ownerPositions) {
          expect(await position.ownerOf(posId)).to.equal(user.address);
        }
      }

      // Perform transfers and verify invariant is maintained
      const transfers = [
        { from: alice, to: bob, positionIndex: 0 },
        { from: charlie, to: alice, positionIndex: 2 },
        { from: bob, to: charlie, positionIndex: 1 },
        { from: alice, to: bob, positionIndex: 3 },
      ];

      for (const transfer of transfers) {
        const positionId = positionIds[transfer.positionIndex].id;

        await position
          .connect(transfer.from)
          .transferFrom(transfer.from.address, transfer.to.address, positionId);

        // Update our tracking
        positionIds[transfer.positionIndex].owner = transfer.to.address;

        // Verify invariant for all users
        for (const user of users) {
          const ownerPositions = await position.getPositionsByOwner(
            user.address
          );
          const userBalance = await position.balanceOf(user.address);

          expect(ownerPositions.length).to.equal(userBalance);

          // Count expected positions for this user
          const expectedPositions = positionIds.filter(
            (p) => p.owner === user.address
          );
          expect(ownerPositions.length).to.equal(expectedPositions.length);

          // Verify all positions in the list are actually owned by the user
          for (const posId of ownerPositions) {
            expect(await position.ownerOf(posId)).to.equal(user.address);
          }

          // Verify all expected positions are in the list
          for (const expectedPos of expectedPositions) {
            expect(ownerPositions).to.include(expectedPos.id);
          }
        }
      }

      // Close positions and verify invariant
      for (let i = 0; i < positionIds.length; i++) {
        await core.connect(alice).closePosition(positionIds[i].id, 0);

        // Remove from our tracking
        const closedOwner = positionIds[i].owner;
        positionIds[i].owner = ""; // Use empty string instead of null

        // Verify invariant for all users
        for (const user of users) {
          const ownerPositions = await position.getPositionsByOwner(
            user.address
          );
          const userBalance = await position.balanceOf(user.address);

          expect(ownerPositions.length).to.equal(userBalance);

          // Count expected positions for this user
          const expectedPositions = positionIds.filter(
            (p) => p.owner === user.address
          );
          expect(ownerPositions.length).to.equal(expectedPositions.length);
        }
      }

      // Final state: all users should have empty position lists
      for (const user of users) {
        const ownerPositions = await position.getPositionsByOwner(user.address);
        expect(ownerPositions.length).to.equal(0);
        expect(await position.balanceOf(user.address)).to.equal(0);
      }
    });

    it("should maintain market position tracking consistency", async function () {
      const { core, position, alice, bob, charlie, marketId } =
        await loadFixture(activePositionMarketFixture);

      const users = [alice, bob, charlie];
      const createdPositions = [];

      // Create positions and verify market tracking
      for (let i = 0; i < 8; i++) {
        const user = users[i % users.length];
        const params = {
          marketId,
          lowerTick: 100100 + i * 40,
          upperTick: 100200 + i * 40,
          quantity: ethers.parseUnits("0.01", 6), // Much smaller quantity
          maxCost: ethers.parseUnits("10", 6), // Reduced max cost
        };

        const positionId = await core
          .connect(alice)
          .openPosition.staticCall(
            user.address,
            params.marketId,
            params.lowerTick,
            params.upperTick,
            params.quantity,
            params.maxCost
          );
        await core
          .connect(alice)
          .openPosition(
            user.address,
            params.marketId,
            params.lowerTick,
            params.upperTick,
            params.quantity,
            params.maxCost
          );
        createdPositions.push(positionId);

        // Verify market tracking invariant
        const marketPositions = await position.getMarketPositions(marketId);
        expect(marketPositions.length).to.equal(i + 1);

        // Verify all created positions are in the market list
        for (const posId of createdPositions) {
          expect(marketPositions).to.include(posId);
        }

        // Verify all positions in market list actually belong to the market
        for (const posId of marketPositions) {
          const posData = await position.getPosition(posId);
          expect(posData.marketId).to.equal(marketId);
        }
      }

      // Transfer positions - market tracking should be unaffected
      await position
        .connect(alice)
        .transferFrom(alice.address, bob.address, createdPositions[0]);
      await position
        .connect(charlie)
        .transferFrom(charlie.address, alice.address, createdPositions[2]);

      let marketPositions = await position.getMarketPositions(marketId);
      expect(marketPositions.length).to.equal(createdPositions.length);

      for (const posId of createdPositions) {
        expect(marketPositions).to.include(posId);
      }

      // Close positions and verify market tracking is updated
      for (let i = 0; i < createdPositions.length; i++) {
        await core.connect(alice).closePosition(createdPositions[i], 0);

        marketPositions = await position.getMarketPositions(marketId);
        expect(marketPositions.length).to.equal(
          createdPositions.length - (i + 1)
        );

        // Verify closed position is removed from market list
        expect(marketPositions).to.not.include(createdPositions[i]);

        // Verify remaining positions are still in the list
        for (let j = i + 1; j < createdPositions.length; j++) {
          expect(marketPositions).to.include(createdPositions[j]);
        }
      }

      // Final state: market should have no positions
      const finalMarketPositions = await position.getMarketPositions(marketId);
      expect(finalMarketPositions.length).to.equal(0);
    });
  });

  describe("State Transition Invariants", function () {
    it("should maintain position data integrity during operations", async function () {
      const { core, position, alice, bob, marketId } = await loadFixture(
        activePositionMarketFixture
      );

      // Create position
      const params = {
        marketId,
        lowerTick: 100100,
        upperTick: 100200,
        quantity: ethers.parseUnits("0.01", 6), // Much smaller to avoid chunking
        maxCost: ethers.parseUnits("10", 6), // Reduced proportionally
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

      // Verify initial state
      let posData = await position.getPosition(positionId);
      expect(posData.marketId).to.equal(marketId);
      expect(posData.lowerTick).to.equal(100100);
      expect(posData.upperTick).to.equal(100200);
      expect(posData.quantity).to.equal(params.quantity);

      // Perform operations and verify invariants
      const operations: Array<{
        type: "increase" | "decrease" | "transfer";
        amount?: bigint;
        from?: any;
        to?: any;
      }> = [
        { type: "increase", amount: ethers.parseUnits("0.003", 6) },
        { type: "decrease", amount: ethers.parseUnits("0.002", 6) },
        { type: "transfer", from: alice, to: bob },
        { type: "increase", amount: ethers.parseUnits("0.005", 6) },
        { type: "decrease", amount: ethers.parseUnits("0.004", 6) },
      ];

      let expectedQuantity = params.quantity;
      let expectedOwner = alice.address;

      for (const op of operations) {
        if (op.type === "increase" && op.amount) {
          await core
            .connect(alice)
            .increasePosition(
              positionId,
              op.amount,
              ethers.parseUnits("50", 6)
            );
          expectedQuantity += op.amount;
        } else if (op.type === "decrease" && op.amount) {
          await core.connect(alice).decreasePosition(positionId, op.amount, 0);
          expectedQuantity -= op.amount;
        } else if (op.type === "transfer" && op.from && op.to) {
          await position
            .connect(op.from)
            .transferFrom(op.from.address, op.to.address, positionId);
          expectedOwner = op.to.address;
        }

        // Verify invariants after each operation
        posData = await position.getPosition(positionId);
        expect(posData.marketId).to.equal(marketId); // Market ID never changes
        expect(posData.lowerTick).to.equal(100100); // Tick range never changes
        expect(posData.upperTick).to.equal(100200); // Tick range never changes
        expect(posData.quantity).to.equal(expectedQuantity); // Quantity updated correctly
        expect(await position.ownerOf(positionId)).to.equal(expectedOwner); // Owner updated correctly
      }

      // Close position
      await core.connect(alice).closePosition(positionId, 0);

      // Verify position is completely removed
      await expect(
        position.getPosition(positionId)
      ).to.be.revertedWithCustomError(position, "PositionNotFound");
      await expect(position.ownerOf(positionId)).to.be.revertedWithCustomError(
        position,
        "ERC721NonexistentToken"
      );
    });

    it("should maintain approval state consistency", async function () {
      const { position, alice, bob, charlie, marketId } = await loadFixture(
        activePositionMarketFixture
      );

      const positionId = await createTestPosition(alice, marketId);

      // Test individual approvals
      expect(await position.getApproved(positionId)).to.equal(
        ethers.ZeroAddress
      );

      await position.connect(alice).approve(bob.address, positionId);
      expect(await position.getApproved(positionId)).to.equal(bob.address);

      // Transfer should clear approval
      await position
        .connect(bob)
        .transferFrom(alice.address, charlie.address, positionId);
      expect(await position.getApproved(positionId)).to.equal(
        ethers.ZeroAddress
      );

      // Test operator approvals
      expect(await position.isApprovedForAll(charlie.address, alice.address)).to
        .be.false;

      await position.connect(charlie).setApprovalForAll(alice.address, true);
      expect(await position.isApprovedForAll(charlie.address, alice.address)).to
        .be.true;

      // Alice can now transfer Charlie's position
      await position
        .connect(alice)
        .transferFrom(charlie.address, bob.address, positionId);
      expect(await position.ownerOf(positionId)).to.equal(bob.address);

      // Operator approval should persist after transfer
      expect(await position.isApprovedForAll(charlie.address, alice.address)).to
        .be.true;

      // Revoke operator approval
      await position.connect(charlie).setApprovalForAll(alice.address, false);
      expect(await position.isApprovedForAll(charlie.address, alice.address)).to
        .be.false;
    });

    it("should maintain quantity conservation during operations", async function () {
      const { core, position, alice, marketId } = await loadFixture(
        activePositionMarketFixture
      );

      // Create position with known quantity
      const initialQuantity = ethers.parseUnits("0.1", 6); // Reduced from 100 to 0.1 USDC
      const params = {
        marketId,
        lowerTick: 100100,
        upperTick: 100200,
        quantity: initialQuantity,
        maxCost: ethers.parseUnits("10", 6), // Reduced proportionally
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

      let currentQuantity = initialQuantity;

      // Perform a series of operations and track quantity changes
      const operations = [
        { type: "increase", amount: ethers.parseUnits("0.025", 6) }, // Reduced from 25 to 0.025
        { type: "decrease", amount: ethers.parseUnits("0.015", 6) }, // Reduced from 15 to 0.015
        { type: "increase", amount: ethers.parseUnits("0.04", 6) }, // Reduced from 40 to 0.04
        { type: "decrease", amount: ethers.parseUnits("0.03", 6) }, // Reduced from 30 to 0.03
        { type: "increase", amount: ethers.parseUnits("0.01", 6) }, // Reduced from 10 to 0.01
        { type: "decrease", amount: ethers.parseUnits("0.02", 6) }, // Reduced from 20 to 0.02
      ];

      for (const op of operations) {
        const beforeQuantity = currentQuantity;

        if (op.type === "increase") {
          await core.connect(alice).increasePosition(
            positionId,
            op.amount,
            ethers.parseUnits("10", 6) // Reduced from 100 to 10
          );
          currentQuantity += op.amount;
        } else {
          await core.connect(alice).decreasePosition(positionId, op.amount, 0);
          currentQuantity -= op.amount;
        }

        // Verify quantity change is exactly as expected
        const posData = await position.getPosition(positionId);
        expect(posData.quantity).to.equal(currentQuantity);

        // Verify the change matches the operation
        if (op.type === "increase") {
          expect(posData.quantity).to.equal(beforeQuantity + op.amount);
        } else {
          expect(posData.quantity).to.equal(beforeQuantity - op.amount);
        }
      }

      // Final quantity should be calculable from initial + all operations
      const expectedFinalQuantity =
        initialQuantity +
        ethers.parseUnits("0.025", 6) -
        ethers.parseUnits("0.015", 6) +
        ethers.parseUnits("0.04", 6) -
        ethers.parseUnits("0.03", 6) +
        ethers.parseUnits("0.01", 6) -
        ethers.parseUnits("0.02", 6);

      const finalData = await position.getPosition(positionId);
      expect(finalData.quantity).to.equal(expectedFinalQuantity);
      expect(finalData.quantity).to.equal(ethers.parseUnits("0.11", 6)); // Changed from 110 to 0.11
    });
  });

  describe("Security Invariants", function () {
    it("should maintain access control invariants", async function () {
      const { core, position, alice, bob, marketId } = await loadFixture(
        activePositionMarketFixture
      );

      const positionId = await createTestPosition(alice, marketId);

      // Only Core should be able to mint positions
      await expect(
        position
          .connect(alice)
          .mintPosition(
            alice.address,
            marketId,
            10,
            20,
            ethers.parseUnits("1", 6)
          )
      ).to.be.revertedWithCustomError(position, "UnauthorizedCaller");

      // Only Core should be able to update position quantities
      await expect(
        position
          .connect(alice)
          .setPositionQuantity(positionId, ethers.parseUnits("5", 6))
      ).to.be.revertedWithCustomError(position, "UnauthorizedCaller");

      // Only Core should be able to burn positions
      await expect(
        position.connect(alice).burnPosition(positionId)
      ).to.be.revertedWithCustomError(position, "UnauthorizedCaller");

      // Only owner or approved can transfer
      await expect(
        position
          .connect(bob)
          .transferFrom(alice.address, bob.address, positionId)
      ).to.be.revertedWithCustomError(position, "ERC721InsufficientApproval");

      // Core operations should work through Router
      await expect(
        core
          .connect(alice)
          .increasePosition(
            positionId,
            ethers.parseUnits("1", 6),
            ethers.parseUnits("10", 6)
          )
      ).to.emit(position, "PositionUpdated");

      await expect(core.connect(alice).closePosition(positionId, 0)).to.emit(
        position,
        "PositionBurned"
      );
    });

    it("should prevent unauthorized state modifications", async function () {
      const { position, alice, bob, charlie, marketId } = await loadFixture(
        activePositionMarketFixture
      );

      const positionId = await createTestPosition(alice, marketId);

      // Non-owner cannot approve on behalf of owner
      await expect(
        position.connect(bob).approve(charlie.address, positionId)
      ).to.be.revertedWithCustomError(position, "ERC721InvalidApprover");

      // Non-owner cannot set approval for all on behalf of owner
      await expect(
        position.connect(bob).setApprovalForAll(charlie.address, true)
      ).to.not.be.reverted; // This should work - Bob is setting his own approvals

      // But Bob's approval doesn't affect Alice's tokens
      expect(await position.isApprovedForAll(alice.address, charlie.address)).to
        .be.false;

      // Cannot transfer from wrong owner - Bob is not approved to transfer
      await expect(
        position
          .connect(bob)
          .transferFrom(charlie.address, bob.address, positionId)
      ).to.be.revertedWithCustomError(position, "ERC721InsufficientApproval");

      // Cannot transfer non-existent token
      await expect(
        position.connect(alice).transferFrom(alice.address, bob.address, 999)
      ).to.be.revertedWithCustomError(position, "ERC721NonexistentToken");

      // Cannot transfer to zero address
      await expect(
        position
          .connect(alice)
          .transferFrom(alice.address, ethers.ZeroAddress, positionId)
      ).to.be.revertedWithCustomError(position, "ERC721InvalidReceiver");
    });

    it("should maintain data consistency under concurrent operations", async function () {
      const { core, position, alice, bob, charlie, marketId } =
        await loadFixture(activePositionMarketFixture);

      // Create multiple positions
      const positionIds: bigint[] = [];
      for (let i = 0; i < 5; i++) {
        const params = {
          marketId,
          lowerTick: 100100 + i * 50,
          upperTick: 100200 + i * 50,
          quantity: ethers.parseUnits("0.1", 6), // Increased to 0.1 to provide more buffer
          maxCost: ethers.parseUnits("10", 6), // Increased proportionally
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

      // Simulate concurrent operations (executed sequentially but rapidly)
      const operations = [
        () =>
          core.connect(alice).increasePosition(
            positionIds[0],
            ethers.parseUnits("0.02", 6), // Increased proportionally
            ethers.parseUnits("10", 6) // Increased proportionally
          ),
        () =>
          position
            .connect(alice)
            .transferFrom(alice.address, bob.address, positionIds[1]),
        () =>
          core
            .connect(alice)
            .decreasePosition(positionIds[2], ethers.parseUnits("0.01", 6), 0), // Proportionally increased
        () => position.connect(alice).approve(charlie.address, positionIds[3]),
        () =>
          core.connect(alice).increasePosition(
            positionIds[4],
            ethers.parseUnits("0.01", 6), // Proportionally increased
            ethers.parseUnits("10", 6) // Proportionally increased
          ),
        () =>
          position
            .connect(charlie)
            .transferFrom(alice.address, charlie.address, positionIds[3]),
        () =>
          core
            .connect(alice)
            .decreasePosition(positionIds[0], ethers.parseUnits("0.01", 6), 0), // Proportionally increased
        () =>
          position
            .connect(bob)
            .transferFrom(bob.address, alice.address, positionIds[1]),
      ];

      // Execute all operations
      for (const operation of operations) {
        await operation();
      }

      // Verify all invariants are maintained
      const totalSupply = await position.totalSupply();
      const aliceBalance = await position.balanceOf(alice.address);
      const bobBalance = await position.balanceOf(bob.address);
      const charlieBalance = await position.balanceOf(charlie.address);

      expect(totalSupply).to.equal(aliceBalance + bobBalance + charlieBalance);
      expect(totalSupply).to.equal(5);

      // Verify position data integrity
      const pos0Data = await position.getPosition(positionIds[0]);
      expect(pos0Data.quantity).to.equal(ethers.parseUnits("0.11", 6)); // 0.1 + 0.02 - 0.01

      const pos2Data = await position.getPosition(positionIds[2]);
      expect(pos2Data.quantity).to.equal(ethers.parseUnits("0.09", 6)); // 0.1 - 0.01

      const pos4Data = await position.getPosition(positionIds[4]);
      expect(pos4Data.quantity).to.equal(ethers.parseUnits("0.11", 6)); // 0.1 + 0.01

      // Verify ownership
      expect(await position.ownerOf(positionIds[0])).to.equal(alice.address);
      expect(await position.ownerOf(positionIds[1])).to.equal(alice.address); // transferred back
      expect(await position.ownerOf(positionIds[2])).to.equal(alice.address);
      expect(await position.ownerOf(positionIds[3])).to.equal(charlie.address);
      expect(await position.ownerOf(positionIds[4])).to.equal(alice.address);

      // Clean up
      for (const posId of positionIds) {
        try {
          await core.connect(alice).closePosition(posId, 0);
        } catch (error: any) {
          console.log(
            `Failed to close position ${posId}:`,
            error.message || error
          );
        }
      }

      const finalSupply = await position.totalSupply();
      console.log(`Final total supply: ${finalSupply}`);
      expect(finalSupply).to.equal(0);
    });
  });

  // Helper function to create a test position
  async function createTestPosition(user: any, marketId: any) {
    const { core, alice } = await loadFixture(activePositionMarketFixture);

    const params = {
      marketId,
      lowerTick: 100100,
      upperTick: 100200,
      quantity: ethers.parseUnits("0.01", 6), // Reduced from 5 to 0.01
      maxCost: ethers.parseUnits("10", 6), // Reduced from 50 to 10
    };

    const positionId = await core
      .connect(alice)
      .openPosition.staticCall(
        user.address,
        params.marketId,
        params.lowerTick,
        params.upperTick,
        params.quantity,
        params.maxCost
      );
    await core
      .connect(alice)
      .openPosition(
        user.address,
        params.marketId,
        params.lowerTick,
        params.upperTick,
        params.quantity,
        params.maxCost
      );

    return positionId;
  }
});
