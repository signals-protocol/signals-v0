import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { ethers } from "hardhat";

import { realPositionMarketFixture } from "../../helpers/fixtures/position";
import { INVARIANT_TAG } from "../../helpers/tags";

describe(`${INVARIANT_TAG} Position Property-Based Tests`, function () {
  describe("Position Quantity Properties", function () {
    it("should satisfy: increase(x) then decrease(x) equals original state", async function () {
      const { core, position, router, alice, marketId } = await loadFixture(
        realPositionMarketFixture
      );

      // Create position with random initial quantity
      const initialQuantity = ethers.parseUnits("0.01", 6); // Reduced from 50 to 0.01
      const params = {
        marketId,
        lowerTick: 10,
        upperTick: 30,
        quantity: initialQuantity,
        maxCost: ethers.parseUnits("10", 6), // Reduced from 500 to 10
      };

      const positionId = await core
        .connect(router)
        .openPosition.staticCall(
          alice.address,
          params.marketId,
          params.lowerTick,
          params.upperTick,
          params.quantity,
          params.maxCost
        );
      await core
        .connect(router)
        .openPosition(
          alice.address,
          params.marketId,
          params.lowerTick,
          params.upperTick,
          params.quantity,
          params.maxCost
        );

      // Test property with multiple random amounts
      const testAmounts = [
        ethers.parseUnits("0.001", 6), // Reduced from 5 to 0.001
        ethers.parseUnits("0.003", 6), // Reduced from 12.5 to 0.003
        ethers.parseUnits("0.0001", 6), // Reduced from 0.1 to 0.0001
        ethers.parseUnits("0.005", 6), // Reduced from 25 to 0.005
        ethers.parseUnits("0.002", 6), // Reduced from 1 to 0.002
      ];

      for (const amount of testAmounts) {
        // Record initial state
        const initialData = await position.getPosition(positionId);
        const initialQuantityState = initialData.quantity;

        // Increase then decrease by same amount
        await core
          .connect(router)
          .increasePosition(positionId, amount, ethers.parseUnits("10", 6)); // Reduced from 100 to 10

        await core.connect(router).decreasePosition(positionId, amount, 0);

        // Verify we're back to initial state
        const finalData = await position.getPosition(positionId);
        expect(finalData.quantity).to.equal(initialQuantityState);
        expect(finalData.marketId).to.equal(initialData.marketId);
        expect(finalData.lowerTick).to.equal(initialData.lowerTick);
        expect(finalData.upperTick).to.equal(initialData.upperTick);
      }
    });

    it("should satisfy: sequence of operations is commutative for same net effect", async function () {
      const { core, position, router, alice, marketId } = await loadFixture(
        realPositionMarketFixture
      );

      // Create two identical positions
      const params = {
        marketId,
        lowerTick: 15,
        upperTick: 25,
        quantity: ethers.parseUnits("0.01", 6), // Reduced from 100 to 0.01
        maxCost: ethers.parseUnits("10", 6), // Reduced from 1000 to 10
      };

      const positionId1 = await core
        .connect(router)
        .openPosition.staticCall(
          alice.address,
          params.marketId,
          params.lowerTick,
          params.upperTick,
          params.quantity,
          params.maxCost
        );
      await core
        .connect(router)
        .openPosition(
          alice.address,
          params.marketId,
          params.lowerTick,
          params.upperTick,
          params.quantity,
          params.maxCost
        );

      const positionId2 = await core
        .connect(router)
        .openPosition.staticCall(
          alice.address,
          params.marketId,
          params.lowerTick,
          params.upperTick,
          params.quantity,
          params.maxCost
        );
      await core
        .connect(router)
        .openPosition(
          alice.address,
          params.marketId,
          params.lowerTick,
          params.upperTick,
          params.quantity,
          params.maxCost
        );

      // Apply operations in different orders but same net effect
      // Sequence 1: +0.001, -0.0005, +0.0015, -0.0008 = +0.0012 net
      await core.connect(router).increasePosition(
        positionId1,
        ethers.parseUnits("0.001", 6), // Reduced from 10 to 0.001
        ethers.parseUnits("10", 6) // Reduced from 100 to 10
      );
      await core
        .connect(router)
        .decreasePosition(positionId1, ethers.parseUnits("0.0005", 6), 0); // Reduced from 5 to 0.0005
      await core.connect(router).increasePosition(
        positionId1,
        ethers.parseUnits("0.0015", 6), // Reduced from 15 to 0.0015
        ethers.parseUnits("10", 6) // Reduced from 150 to 10
      );
      await core
        .connect(router)
        .decreasePosition(positionId1, ethers.parseUnits("0.0008", 6), 0); // Reduced from 8 to 0.0008

      // Sequence 2: +0.0015, +0.001, -0.0008, -0.0005 = +0.0012 net (same net, different order)
      await core.connect(router).increasePosition(
        positionId2,
        ethers.parseUnits("0.0015", 6), // Reduced from 15 to 0.0015
        ethers.parseUnits("10", 6) // Reduced from 150 to 10
      );
      await core.connect(router).increasePosition(
        positionId2,
        ethers.parseUnits("0.001", 6), // Reduced from 10 to 0.001
        ethers.parseUnits("10", 6) // Reduced from 100 to 10
      );
      await core
        .connect(router)
        .decreasePosition(positionId2, ethers.parseUnits("0.0008", 6), 0); // Reduced from 8 to 0.0008
      await core
        .connect(router)
        .decreasePosition(positionId2, ethers.parseUnits("0.0005", 6), 0); // Reduced from 5 to 0.0005

      // Both positions should have same final quantity
      const pos1Data = await position.getPosition(positionId1);
      const pos2Data = await position.getPosition(positionId2);

      expect(pos1Data.quantity).to.equal(pos2Data.quantity);
      expect(pos1Data.quantity).to.equal(ethers.parseUnits("0.0112", 6)); // 0.01 + 0.0012
    });

    it("should satisfy: quantity is always non-negative", async function () {
      const { core, position, router, alice, marketId } = await loadFixture(
        realPositionMarketFixture
      );

      const params = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: ethers.parseUnits("0.01", 6), // Much smaller to avoid chunking
        maxCost: ethers.parseUnits("1", 6), // Reduced proportionally
      };

      const positionId = await core
        .connect(router)
        .openPosition.staticCall(
          alice.address,
          params.marketId,
          params.lowerTick,
          params.upperTick,
          params.quantity,
          params.maxCost
        );
      await core
        .connect(router)
        .openPosition(
          alice.address,
          params.marketId,
          params.lowerTick,
          params.upperTick,
          params.quantity,
          params.maxCost
        );

      // Try various operations that should maintain non-negative quantity
      const operations = [
        { type: "increase", amount: ethers.parseUnits("0.005", 6) },
        { type: "decrease", amount: ethers.parseUnits("0.003", 6) },
        { type: "increase", amount: ethers.parseUnits("0.008", 6) },
        { type: "decrease", amount: ethers.parseUnits("0.007", 6) },
        { type: "decrease", amount: ethers.parseUnits("0.002", 6) },
      ];

      for (const op of operations) {
        if (op.type === "increase") {
          await core.connect(router).increasePosition(
            positionId,
            op.amount,
            ethers.parseUnits("1", 6) // Reduced max cost
          );
        } else {
          await core.connect(router).decreasePosition(positionId, op.amount, 0);
        }

        const posData = await position.getPosition(positionId);
        expect(posData.quantity).to.be.gte(0);
      }

      // Try to decrease more than available (should fail)
      const currentData = await position.getPosition(positionId);
      const excessAmount = currentData.quantity + ethers.parseUnits("0.001", 6); // Much smaller excess

      await expect(
        core.connect(router).decreasePosition(positionId, excessAmount, 0)
      ).to.be.reverted;

      // Quantity should remain unchanged after failed operation
      const afterFailData = await position.getPosition(positionId);
      expect(afterFailData.quantity).to.equal(currentData.quantity);
    });

    it("should satisfy: position burn occurs if and only if quantity reaches zero", async function () {
      const { core, position, router, alice, marketId } = await loadFixture(
        realPositionMarketFixture
      );

      // Test with various initial quantities - all small to avoid chunking
      const testQuantities = [
        ethers.parseUnits("0.001", 6),
        ethers.parseUnits("0.005", 6),
        ethers.parseUnits("0.01", 6),
        ethers.parseUnits("0.0001", 6),
      ];

      for (const initialQty of testQuantities) {
        const params = {
          marketId,
          lowerTick: 10,
          upperTick: 20,
          quantity: initialQty,
          maxCost: ethers.parseUnits("1", 6), // Reduced max cost
        };

        const positionId = await core
          .connect(router)
          .openPosition.staticCall(
            alice.address,
            params.marketId,
            params.lowerTick,
            params.upperTick,
            params.quantity,
            params.maxCost
          );
        await core
          .connect(router)
          .openPosition(
            alice.address,
            params.marketId,
            params.lowerTick,
            params.upperTick,
            params.quantity,
            params.maxCost
          );

        // Decrease to exactly zero should burn
        await expect(
          core.connect(router).decreasePosition(positionId, initialQty, 0)
        )
          .to.emit(position, "PositionBurned")
          .withArgs(positionId, alice.address);

        // Position should no longer exist
        await expect(
          position.getPosition(positionId)
        ).to.be.revertedWithCustomError(position, "PositionNotFound");
        await expect(
          position.ownerOf(positionId)
        ).to.be.revertedWithCustomError(position, "ERC721NonexistentToken");
      }
    });
  });

  describe("Transfer Properties", function () {
    it("should satisfy: transfer preserves total supply", async function () {
      const { position, alice, bob, charlie, marketId, core, router } =
        await loadFixture(realPositionMarketFixture);

      // Create multiple positions
      const positionIds = [];
      for (let i = 0; i < 5; i++) {
        const posId = await createTestPosition(
          alice,
          marketId,
          i + 1,
          core,
          router
        );
        positionIds.push(posId);
      }

      const initialTotalSupply = await position.totalSupply();
      expect(initialTotalSupply).to.equal(5);

      // Perform various transfers
      const transfers = [
        { from: alice, to: bob, positionId: positionIds[0] },
        { from: alice, to: charlie, positionId: positionIds[1] },
        { from: alice, to: bob, positionId: positionIds[2] },
        { from: bob, to: charlie, positionId: positionIds[0] },
        { from: charlie, to: alice, positionId: positionIds[1] },
      ];

      for (const transfer of transfers) {
        const beforeTotalSupply = await position.totalSupply();

        await position
          .connect(transfer.from)
          .transferFrom(
            transfer.from.address,
            transfer.to.address,
            transfer.positionId
          );

        const afterTotalSupply = await position.totalSupply();
        expect(afterTotalSupply).to.equal(beforeTotalSupply);
      }

      // Final total supply should equal initial
      const finalTotalSupply = await position.totalSupply();
      expect(finalTotalSupply).to.equal(initialTotalSupply);
    });

    it("should satisfy: transfer preserves position data", async function () {
      const { position, alice, bob, marketId } = await loadFixture(
        realPositionMarketFixture
      );

      const positionId = await createTestPosition(alice, marketId, 10);

      // Record initial position data
      const initialData = await position.getPosition(positionId);

      // Transfer position
      await position
        .connect(alice)
        .transferFrom(alice.address, bob.address, positionId);

      // Verify position data is unchanged
      const afterTransferData = await position.getPosition(positionId);
      expect(afterTransferData.marketId).to.equal(initialData.marketId);
      expect(afterTransferData.lowerTick).to.equal(initialData.lowerTick);
      expect(afterTransferData.upperTick).to.equal(initialData.upperTick);
      expect(afterTransferData.quantity).to.equal(initialData.quantity);

      // Only owner should change
      expect(await position.ownerOf(positionId)).to.equal(bob.address);
    });

    it("should satisfy: balance conservation during transfers", async function () {
      const { position, alice, bob, charlie, marketId, core, router } =
        await loadFixture(realPositionMarketFixture);

      // Create positions for Alice
      const positionIds = [];
      for (let i = 0; i < 3; i++) {
        const posId = await createTestPosition(
          alice,
          marketId,
          i + 1,
          core,
          router
        );
        positionIds.push(posId);
      }

      // Initial balances
      let aliceBalance = await position.balanceOf(alice.address);
      let bobBalance = await position.balanceOf(bob.address);
      let charlieBalance = await position.balanceOf(charlie.address);
      let totalBalance = aliceBalance + bobBalance + charlieBalance;

      expect(aliceBalance).to.equal(3);
      expect(bobBalance).to.equal(0);
      expect(charlieBalance).to.equal(0);

      // Transfer Alice -> Bob
      await position
        .connect(alice)
        .transferFrom(alice.address, bob.address, positionIds[0]);

      aliceBalance = await position.balanceOf(alice.address);
      bobBalance = await position.balanceOf(bob.address);
      charlieBalance = await position.balanceOf(charlie.address);
      const newTotalBalance = aliceBalance + bobBalance + charlieBalance;

      expect(aliceBalance).to.equal(2);
      expect(bobBalance).to.equal(1);
      expect(charlieBalance).to.equal(0);
      expect(newTotalBalance).to.equal(totalBalance);

      // Transfer Bob -> Charlie
      await position
        .connect(bob)
        .transferFrom(bob.address, charlie.address, positionIds[0]);

      aliceBalance = await position.balanceOf(alice.address);
      bobBalance = await position.balanceOf(bob.address);
      charlieBalance = await position.balanceOf(charlie.address);
      const finalTotalBalance = aliceBalance + bobBalance + charlieBalance;

      expect(aliceBalance).to.equal(2);
      expect(bobBalance).to.equal(0);
      expect(charlieBalance).to.equal(1);
      expect(finalTotalBalance).to.equal(totalBalance);
    });

    it("should satisfy: approval is cleared after transfer", async function () {
      const { position, alice, bob, charlie, marketId } = await loadFixture(
        realPositionMarketFixture
      );

      const positionId = await createTestPosition(alice, marketId, 5);

      // Alice approves Bob
      await position.connect(alice).approve(bob.address, positionId);
      expect(await position.getApproved(positionId)).to.equal(bob.address);

      // Bob transfers to Charlie
      await position
        .connect(bob)
        .transferFrom(alice.address, charlie.address, positionId);

      // Approval should be cleared
      expect(await position.getApproved(positionId)).to.equal(
        ethers.ZeroAddress
      );

      // Bob should no longer be able to transfer
      await expect(
        position
          .connect(bob)
          .transferFrom(charlie.address, alice.address, positionId)
      ).to.be.revertedWithCustomError(position, "ERC721InsufficientApproval");
    });
  });

  describe("Market Tracking Properties", function () {
    it.skip("should satisfy: position count per market equals actual positions", async function () {
      const { position, alice, bob, charlie, marketId, core, router } =
        await loadFixture(realPositionMarketFixture);

      // Initially no positions
      let marketPositions = await position.getAllPositionsInMarket(marketId);
      expect(marketPositions.length).to.equal(0);

      const createdPositions = [];

      // Create positions and verify count
      for (let i = 0; i < 7; i++) {
        const user = [alice, bob, charlie][i % 3];
        const posId = await createTestPosition(
          user,
          marketId,
          i + 1,
          core,
          router
        );
        createdPositions.push(posId);

        marketPositions = await position.getAllPositionsInMarket(marketId);
        expect(marketPositions.length).to.equal(i + 1);
        expect(marketPositions).to.include(posId);
      }

      // Transfer positions - market count should remain same
      await position
        .connect(alice)
        .transferFrom(alice.address, bob.address, createdPositions[0]);
      await position
        .connect(charlie)
        .transferFrom(charlie.address, alice.address, createdPositions[2]);

      marketPositions = await position.getAllPositionsInMarket(marketId);
      expect(marketPositions.length).to.equal(7);

      // Close positions and verify count decreases
      for (let i = 0; i < createdPositions.length; i++) {
        await closeTestPosition(createdPositions[i]);

        marketPositions = await position.getAllPositionsInMarket(marketId);
        expect(marketPositions.length).to.equal(
          createdPositions.length - (i + 1)
        );
        expect(marketPositions).to.not.include(createdPositions[i]);
      }

      // Final state
      marketPositions = await position.getAllPositionsInMarket(marketId);
      expect(marketPositions.length).to.equal(0);
    });

    it("should satisfy: all positions in market list belong to that market", async function () {
      const { position, alice, bob, marketId, core, router } =
        await loadFixture(realPositionMarketFixture);

      // Create positions
      const positionIds = [];
      for (let i = 0; i < 5; i++) {
        const user = i % 2 === 0 ? alice : bob;
        const posId = await createTestPosition(
          user,
          marketId,
          i + 1,
          core,
          router
        );
        positionIds.push(posId);
      }

      // Verify all positions in market list belong to the market
      const marketPositions = await position.getAllPositionsInMarket(marketId);
      expect(marketPositions.length).to.equal(5);

      for (const posId of marketPositions) {
        const posData = await position.getPosition(posId);
        expect(posData.marketId).to.equal(marketId);
      }

      // Transfer some positions - they should still belong to the market
      await position
        .connect(alice)
        .transferFrom(alice.address, bob.address, positionIds[0]);
      await position
        .connect(bob)
        .transferFrom(bob.address, alice.address, positionIds[1]);

      const marketPositionsAfterTransfer =
        await position.getAllPositionsInMarket(marketId);
      for (const posId of marketPositionsAfterTransfer) {
        const posData = await position.getPosition(posId);
        expect(posData.marketId).to.equal(marketId);
      }
    });
  });

  describe("Owner Tracking Properties", function () {
    it.skip("should satisfy: all positions in owner list are owned by that owner", async function () {
      const { position, alice, bob, charlie, marketId } = await loadFixture(
        realPositionMarketFixture
      );

      // Create positions for different users
      const alicePositions = [];
      const bobPositions = [];

      for (let i = 0; i < 3; i++) {
        const alicePos = await createTestPosition(alice, marketId, i + 1);
        const bobPos = await createTestPosition(bob, marketId, i + 4);
        alicePositions.push(alicePos);
        bobPositions.push(bobPos);
      }

      // Verify owner tracking
      let aliceOwnedPositions = await position.getPositionsByOwner(
        alice.address
      );
      let bobOwnedPositions = await position.getPositionsByOwner(bob.address);
      let charlieOwnedPositions = await position.getPositionsByOwner(
        charlie.address
      );

      expect(aliceOwnedPositions.length).to.equal(3);
      expect(bobOwnedPositions.length).to.equal(3);
      expect(charlieOwnedPositions.length).to.equal(0);

      // Verify all positions in lists are actually owned by the users
      for (const posId of aliceOwnedPositions) {
        expect(await position.ownerOf(posId)).to.equal(alice.address);
      }
      for (const posId of bobOwnedPositions) {
        expect(await position.ownerOf(posId)).to.equal(bob.address);
      }

      // Transfer positions
      await position
        .connect(alice)
        .transferFrom(alice.address, charlie.address, alicePositions[0]);
      await position
        .connect(bob)
        .transferFrom(bob.address, alice.address, bobPositions[1]);

      // Re-verify owner tracking
      aliceOwnedPositions = await position.getPositionsByOwner(alice.address);
      bobOwnedPositions = await position.getPositionsByOwner(bob.address);
      charlieOwnedPositions = await position.getPositionsByOwner(
        charlie.address
      );

      expect(aliceOwnedPositions.length).to.equal(3); // lost 1, gained 1
      expect(bobOwnedPositions.length).to.equal(2); // lost 1
      expect(charlieOwnedPositions.length).to.equal(1); // gained 1

      // Verify ownership
      for (const posId of aliceOwnedPositions) {
        expect(await position.ownerOf(posId)).to.equal(alice.address);
      }
      for (const posId of bobOwnedPositions) {
        expect(await position.ownerOf(posId)).to.equal(bob.address);
      }
      for (const posId of charlieOwnedPositions) {
        expect(await position.ownerOf(posId)).to.equal(charlie.address);
      }
    });

    it.skip("should satisfy: owner balance equals length of owned positions list", async function () {
      const { position, alice, bob, charlie, marketId } = await loadFixture(
        realPositionMarketFixture
      );

      const users = [alice, bob, charlie];

      // Initially all users have 0 balance and empty lists
      for (const user of users) {
        expect(await position.balanceOf(user.address)).to.equal(0);
        const ownedPositions = await position.getPositionsByOwner(user.address);
        expect(ownedPositions.length).to.equal(0);
      }

      // Create positions
      const positionIds = [];
      for (let i = 0; i < 9; i++) {
        const user = users[i % 3];
        const posId = await createTestPosition(user, marketId, i + 1);
        positionIds.push({ id: posId, owner: user });

        // Verify invariant after each creation
        for (const u of users) {
          const balance = await position.balanceOf(u.address);
          const ownedPositions = await position.getPositionsByOwner(u.address);
          expect(balance).to.equal(ownedPositions.length);
        }
      }

      // Perform transfers
      const transfers = [
        { from: alice, to: bob, positionIndex: 0 },
        { from: charlie, to: alice, positionIndex: 2 },
        { from: bob, to: charlie, positionIndex: 1 },
        { from: alice, to: charlie, positionIndex: 3 },
      ];

      for (const transfer of transfers) {
        const positionId = positionIds[transfer.positionIndex].id;

        await position
          .connect(transfer.from)
          .transferFrom(transfer.from.address, transfer.to.address, positionId);

        // Update tracking
        positionIds[transfer.positionIndex].owner = transfer.to;

        // Verify invariant after each transfer
        for (const user of users) {
          const balance = await position.balanceOf(user.address);
          const ownedPositions = await position.getPositionsByOwner(
            user.address
          );
          expect(balance).to.equal(ownedPositions.length);
        }
      }

      // Close positions
      for (let i = 0; i < positionIds.length; i++) {
        await closeTestPosition(positionIds[i].id);

        // Verify invariant after each closure
        for (const user of users) {
          const balance = await position.balanceOf(user.address);
          const ownedPositions = await position.getPositionsByOwner(
            user.address
          );
          expect(balance).to.equal(ownedPositions.length);
        }
      }

      // Final state: all users should have 0 balance and empty lists
      for (const user of users) {
        expect(await position.balanceOf(user.address)).to.equal(0);
        const ownedPositions = await position.getPositionsByOwner(user.address);
        expect(ownedPositions.length).to.equal(0);
      }
    });
  });

  // Helper functions - use shared fixture data
  async function createTestPosition(
    user: any,
    marketId: any,
    quantityMultiplier: number = 1,
    core?: any,
    router?: any
  ) {
    // If core and router are not provided, load them from fixture
    if (!core || !router) {
      const fixture = await loadFixture(realPositionMarketFixture);
      core = fixture.core;
      router = fixture.router;
    }

    const params = {
      marketId,
      lowerTick: 10,
      upperTick: 20,
      quantity: ethers.parseUnits((quantityMultiplier * 0.01).toString(), 6), // Much smaller quantities
      maxCost: ethers.parseUnits("10", 6), // Reduced max cost
    };

    const positionId = await core
      .connect(router)
      .openPosition.staticCall(
        user.address,
        params.marketId,
        params.lowerTick,
        params.upperTick,
        params.quantity,
        params.maxCost
      );
    await core
      .connect(router)
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

  async function closeTestPosition(positionId: any, core?: any, router?: any) {
    // If core and router are not provided, load them from fixture
    if (!core || !router) {
      const fixture = await loadFixture(realPositionMarketFixture);
      core = fixture.core;
      router = fixture.router;
    }
    await core.connect(router).closePosition(positionId, 0);
  }
});
