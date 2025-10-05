import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { ethers } from "hardhat";

import { positionMarketFixture } from "../../helpers/fixtures/position";
import { INVARIANT_TAG } from "../../helpers/tags";

async function listMarketPositions(position: any, marketId: number) {
  const length = Number(await position.getMarketTokenLength(marketId));
  const tokens: number[] = [];
  for (let i = 0; i < length; i++) {
    const tokenId = await position.getMarketTokenAt(marketId, i);
    if (tokenId !== 0n) {
      tokens.push(Number(tokenId));
    }
  }
  return tokens;
}

async function listOwnerPositions(position: any, owner: string) {
  const tokens = await position.getPositionsByOwner(owner);
  return tokens.map((id: bigint) => Number(id));
}

const HIGH_COST = ethers.parseUnits("100000", 6);

describe(`${INVARIANT_TAG} Position Contract Invariants`, function () {
  describe("Core Invariants", function () {
    it("should maintain total supply equals sum of all user balances", async function () {
      const { core, position, alice, bob, charlie, marketId } =
        await loadFixture(positionMarketFixture);

      const owners = [alice, bob, charlie];
      type OwnerRecord = { id: number; owner: typeof alice | null };
      const records: OwnerRecord[] = [];

      const getBalances = async () => ({
        alice: await position.balanceOf(alice.address),
        bob: await position.balanceOf(bob.address),
        charlie: await position.balanceOf(charlie.address),
      });

      const assertSupplyMatchesBalances = async () => {
        const totalSupply = await position.totalSupply();
        const { alice: balAlice, bob: balBob, charlie: balCharlie } =
          await getBalances();
        expect(totalSupply).to.equal(balAlice + balBob + balCharlie);
        return totalSupply;
      };

      expect(await position.totalSupply()).to.equal(0n);
      await assertSupplyMatchesBalances();

      for (let i = 0; i < 5; i++) {
        const owner = owners[i % owners.length];
        const params = {
          marketId,
          lowerTick: 100100 + i * 50,
          upperTick: 100200 + i * 50,
          quantity: ethers.parseUnits("0.01", 6),
          maxCost: HIGH_COST,
        };

        const positionIdBig = await core
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

        const positionId = Number(positionIdBig);
        if (owner.address !== alice.address) {
          await position
            .connect(alice)
            .transferFrom(alice.address, owner.address, positionId);
        }

        records.push({ id: positionId, owner });
        const totalSupply = await assertSupplyMatchesBalances();
        expect(Number(totalSupply)).to.equal(i + 1);
      }

      const move = async (index: number, to: typeof alice) => {
        const record = records[index];
        if (!record.owner) {
          throw new Error("Position already closed");
        }
        await position
          .connect(record.owner)
          .transferFrom(record.owner.address, to.address, record.id);
        record.owner = to;
      };

      await move(0, bob);
      await move(2, alice);

      let totalSupply = await assertSupplyMatchesBalances();
      expect(Number(totalSupply)).to.equal(records.length);

      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        if (!record.owner) continue;

        await core.connect(record.owner).closePosition(record.id, 0);
        record.owner = null;

        totalSupply = await assertSupplyMatchesBalances();
        expect(Number(totalSupply)).to.equal(records.length - (i + 1));
      }

      const finalBalances = await getBalances();
      expect(finalBalances.alice).to.equal(0n);
      expect(finalBalances.bob).to.equal(0n);
      expect(finalBalances.charlie).to.equal(0n);
      expect(await position.totalSupply()).to.equal(0n);
    });

    it("should maintain position ID uniqueness and sequential assignment", async function () {
      const { core, position, alice, bob, charlie, marketId } =
        await loadFixture(positionMarketFixture);

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
          maxCost: HIGH_COST, // Sufficient max cost for current pricing
        };

        const expectedId = await position.getNextId();
        expect(expectedId).to.equal(i + 1);

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
        maxCost: HIGH_COST,
      };

      const newPositionId = await core
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

      expect(newPositionId).to.equal(11);
      expect(await position.getNextId()).to.equal(12);
    });

    it("should maintain owner tracking consistency", async function () {
      const { core, position, alice, bob, charlie, marketId } =
        await loadFixture(positionMarketFixture);

      const users = [alice, bob, charlie];
      type OwnerRecord = { id: number; owner: typeof alice | null };
      const positionRecords: OwnerRecord[] = [];

      // Create positions for different users
      for (let i = 0; i < 6; i++) {
        const user = users[i % users.length];
        const params = {
          marketId,
          lowerTick: 100100 + i * 50,
          upperTick: 100200 + i * 50,
          quantity: ethers.parseUnits("0.02", 6),
          maxCost: HIGH_COST,
        };

        const positionIdBig = await core
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
        const positionId = Number(positionIdBig);
        if (user.address !== alice.address) {
          await position
            .connect(alice)
            .transferFrom(alice.address, user.address, positionId);
        }
        positionRecords.push({ id: positionId, owner: user });

        // Verify owner tracking invariant
        const ownerPositions = await listOwnerPositions(position, user.address);
        const userBalance = await position.balanceOf(user.address);

        expect(ownerPositions.length).to.equal(userBalance);

        // Verify all positions in the list are actually owned by the user
        for (const posId of ownerPositions) {
          expect(await position.ownerOf(posId)).to.equal(user.address);
        }
      }

      // Perform transfers and verify invariant is maintained
      const transfers = [
        { to: bob, index: 0 },
        { to: alice, index: 2 },
        { to: charlie, index: 1 },
        { to: bob, index: 3 },
      ];

      for (const transfer of transfers) {
        const record = positionRecords[transfer.index];
        if (!record.owner) {
          continue;
        }
        await position
          .connect(record.owner)
          .transferFrom(record.owner.address, transfer.to.address, record.id);

        record.owner = transfer.to;

        // Verify invariant for all users
        for (const user of users) {
          const ownerPositions = await listOwnerPositions(position, user.address);
          const userBalance = await position.balanceOf(user.address);

          expect(ownerPositions.length).to.equal(userBalance);

          // Count expected positions for this user
          const expectedPositions = positionRecords.filter(
            (p) => p.owner && p.owner.address === user.address
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
      for (const record of positionRecords) {
        if (!record.owner) {
          continue;
        }

        await core.connect(record.owner).closePosition(record.id, 0);
        record.owner = null;

        // Verify invariant for all users
        for (const user of users) {
          const ownerPositions = await listOwnerPositions(position, user.address);
          const userBalance = await position.balanceOf(user.address);

          expect(ownerPositions.length).to.equal(userBalance);

          // Count expected positions for this user
          const expectedPositions = positionRecords.filter(
            (p) => p.owner && p.owner.address === user.address
          );
          expect(ownerPositions.length).to.equal(expectedPositions.length);
        }
      }

      // Final state: all users should have empty position lists
      for (const user of users) {
        const ownerPositions = await listOwnerPositions(position, user.address);
        expect(ownerPositions.length).to.equal(0);
        expect(await position.balanceOf(user.address)).to.equal(0n);
      }
    });

    it("should maintain market position tracking consistency", async function () {
      const { core, position, alice, bob, charlie, marketId } =
        await loadFixture(positionMarketFixture);

      const actors = [alice, bob, charlie];
      type MarketRecord = { id: number; owner: typeof alice | null };
      const records: MarketRecord[] = [];

      for (let i = 0; i < 8; i++) {
        const owner = actors[i % actors.length];
        const params = {
          marketId,
          lowerTick: 100100 + i * 40,
          upperTick: 100200 + i * 40,
          quantity: ethers.parseUnits("0.01", 6),
          maxCost: HIGH_COST,
        };

        const positionIdBig = await core
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
        const positionId = Number(positionIdBig);
        if (owner.address !== alice.address) {
          await position
            .connect(alice)
            .transferFrom(alice.address, owner.address, positionId);
        }
        records.push({ id: positionId, owner });

        const marketPositions = await listMarketPositions(position, marketId);
        expect(marketPositions.length).to.equal(i + 1);
        for (const record of records) {
          expect(marketPositions).to.include(record.id);
        }
        for (const posId of marketPositions) {
          const posData = await position.getPosition(posId);
          expect(posData.marketId).to.equal(marketId);
        }
      }

      const move = async (index: number, to: typeof alice) => {
        const record = records[index];
        if (!record.owner) return;
        await position
          .connect(record.owner)
          .transferFrom(record.owner.address, to.address, record.id);
        record.owner = to;
      };

      await move(0, bob);
      await move(2, alice);

      let marketPositions = await listMarketPositions(position, marketId);
      expect(marketPositions.length).to.equal(records.length);
      for (const record of records) {
        expect(marketPositions).to.include(record.id);
      }

      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        if (record.owner) {
          await core.connect(record.owner).closePosition(record.id, 0);
          record.owner = null;
        }

        marketPositions = await listMarketPositions(position, marketId);
        expect(marketPositions.length).to.equal(records.length - (i + 1));
        expect(marketPositions).to.not.include(records[i].id);

        for (let j = i + 1; j < records.length; j++) {
          expect(marketPositions).to.include(records[j].id);
        }
      }

      const finalMarketPositions = await listMarketPositions(position, marketId);
      expect(finalMarketPositions.length).to.equal(0);
    });

    it("should maintain position data integrity during operations", async function () {
      const { core, position, alice, bob, charlie, marketId } = await loadFixture(
        positionMarketFixture
      );

      // Create position
      const params = {
        marketId,
        lowerTick: 100100,
        upperTick: 100200,
        quantity: ethers.parseUnits("0.01", 6), // Much smaller to avoid chunking
        maxCost: HIGH_COST, // Sufficient max cost for current pricing
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
      const signerByAddress: Record<string, any> = {
        [alice.address]: alice,
        [bob.address]: bob,
        [charlie.address]: charlie,
      };

      for (const op of operations) {
        const ownerSigner = signerByAddress[expectedOwner];
        if (op.type === "increase" && op.amount) {
          await core
            .connect(ownerSigner)
            .increasePosition(positionId, op.amount, HIGH_COST);
          expectedQuantity += op.amount;
        } else if (op.type === "decrease" && op.amount) {
          await core
            .connect(ownerSigner)
            .decreasePosition(positionId, op.amount, 0);
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

      // Close position with the current owner
      const finalOwnerSigner = signerByAddress[expectedOwner];
      expect(finalOwnerSigner, "missing signer for final owner").to.exist;
      await core.connect(finalOwnerSigner).closePosition(positionId, 0);

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
        positionMarketFixture
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
        positionMarketFixture
      );

      // Create position with known quantity
      const initialQuantity = ethers.parseUnits("0.1", 6); // Reduced from 100 to 0.1 USDC
      const params = {
        marketId,
        lowerTick: 100100,
        upperTick: 100200,
        quantity: initialQuantity,
        maxCost: HIGH_COST, // Sufficient max cost for current pricing
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
          await core
            .connect(alice)
            .increasePosition(positionId, op.amount, HIGH_COST);
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
        positionMarketFixture
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
            ethers.parseUnits("0.01", 6),
            HIGH_COST
          )
      ).to.emit(position, "PositionUpdated");

      await expect(core.connect(alice).closePosition(positionId, 0)).to.emit(
        position,
        "PositionBurned"
      );
    });

    it("should prevent unauthorized state modifications", async function () {
      const { position, alice, bob, charlie, marketId } = await loadFixture(
        positionMarketFixture
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
        await loadFixture(positionMarketFixture);

      // Create multiple positions
      const positionIds: bigint[] = [];
      for (let i = 0; i < 5; i++) {
        const params = {
          marketId,
          lowerTick: 100100 + i * 50,
          upperTick: 100200 + i * 50,
          quantity: ethers.parseUnits("0.1", 6), // Increased to 0.1 to provide more buffer
          maxCost: HIGH_COST, // Increased proportionally
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
        positionIds.push(positionId);
      }

      // Simulate concurrent operations (executed sequentially but rapidly)
      const operations = [
        () =>
          core.connect(alice).increasePosition(
            positionIds[0],
            ethers.parseUnits("0.02", 6), // Increased proportionally
            HIGH_COST // Increased proportionally
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
            HIGH_COST // Proportionally increased
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
      const signerByAddress: Record<string, any> = {
        [alice.address]: alice,
        [bob.address]: bob,
        [charlie.address]: charlie,
      };

      for (const posId of positionIds) {
        const ownerAddress = await position.ownerOf(posId);
        const ownerSigner = signerByAddress[ownerAddress];
        expect(ownerSigner, `missing signer for ${ownerAddress}`).to.exist;
        await core.connect(ownerSigner).closePosition(posId, 0);
      }

      expect(await position.totalSupply()).to.equal(0n);
    });
  });

  // Helper function to create a test position
  async function createTestPosition(user: any, marketId: any) {
    const { core, alice } = await loadFixture(positionMarketFixture);

    const params = {
      marketId,
      lowerTick: 100100,
      upperTick: 100200,
      quantity: ethers.parseUnits("0.01", 6), // Reduced from 5 to 0.01
      maxCost: HIGH_COST, // Sufficient max cost for current pricing
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

    return positionId;
  }
});
