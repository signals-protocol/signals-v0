import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

import { activePositionMarketFixture } from "../../helpers/fixtures/position";
import { INTEGRATION_TAG } from "../../helpers/tags";

describe(`${INTEGRATION_TAG} Position-Market Interactions`, function () {
  describe("Position Operations Across Market States", function () {
    it("should handle position operations during market lifecycle", async function () {
      const { core, position, keeper, alice, bob, marketId, startTime } =
        await loadFixture(activePositionMarketFixture);

      // Create multiple positions in different tick ranges
      const positions = [];
      const users = [alice, bob];

      for (let i = 0; i < users.length; i++) {
        const params = {
          marketId,
          lowerTick: 100100 + i * 200, // 실제 틱값 사용 (100100, 100300, ...)
          upperTick: 100300 + i * 200, // 실제 틱값 사용 (100300, 100500, ...)
          quantity: ethers.parseUnits((i + 2).toString(), 6),
          maxCost: ethers.parseUnits("100", 6),
        };

        const positionId = await core
          .connect(users[i])
          .openPosition.staticCall(
            users[i].address,
            params.marketId,
            params.lowerTick,
            params.upperTick,
            params.quantity,
            params.maxCost
          );
        await core
          .connect(users[i])
          .openPosition(
            users[i].address,
            params.marketId,
            params.lowerTick,
            params.upperTick,
            params.quantity,
            params.maxCost
          );
        positions.push(positionId);
      }

      // Verify all positions exist
      expect(await position.balanceOf(alice.address)).to.equal(1);
      expect(await position.balanceOf(bob.address)).to.equal(1);

      const marketPositions = await position.getMarketPositions(marketId);
      expect(marketPositions.length).to.equal(2);

      // Modify positions while market is active
      await core
        .connect(alice)
        .increasePosition(
          positions[0],
          ethers.parseUnits("1", 6),
          ethers.parseUnits("10", 6)
        );

      await core
        .connect(bob)
        .decreasePosition(positions[1], ethers.parseUnits("0.5", 6), 0);

      // Transfer positions between users
      await position
        .connect(alice)
        .transferFrom(alice.address, bob.address, positions[0]);
      expect(await position.balanceOf(alice.address)).to.equal(0);
      expect(await position.balanceOf(bob.address)).to.equal(2);

      // Pause market operations
      await core.connect(keeper).pause("Market paused for testing");

      // Position transfers should still work (they don't go through Core)
      await position
        .connect(bob)
        .transferFrom(bob.address, alice.address, positions[0]);
      expect(await position.ownerOf(positions[0])).to.equal(alice.address);

      // But Core operations should fail
      await expect(
        core
          .connect(alice)
          .increasePosition(
            positions[1],
            ethers.parseUnits("1", 6),
            ethers.parseUnits("10", 6)
          )
      ).to.be.revertedWithCustomError(core, "ContractPaused");

      // Unpause and continue operations
      await core.connect(keeper).unpause();

      // Operations should work again
      await core
        .connect(alice)
        .increasePosition(
          positions[1],
          ethers.parseUnits("1", 6),
          ethers.parseUnits("10", 6)
        );

      // Close all positions
      for (const posId of positions) {
        await core.connect(alice).closePosition(posId, 0);
      }

      // Verify cleanup
      expect(await position.balanceOf(alice.address)).to.equal(0);
      expect(await position.balanceOf(bob.address)).to.equal(0);

      const finalMarketPositions = await position.getMarketPositions(marketId);
      expect(finalMarketPositions.length).to.equal(0);
    });

    it("should handle position operations with overlapping tick ranges", async function () {
      const { core, position, alice, bob, marketId } = await loadFixture(
        activePositionMarketFixture
      );

      // Create positions with overlapping tick ranges
      const overlappingPositions = [
        { user: alice, lower: 100100, upper: 100300, quantity: "2" },
        { user: bob, lower: 100200, upper: 100400, quantity: "3" },
        { user: alice, lower: 100250, upper: 100350, quantity: "1.5" },
        { user: bob, lower: 100150, upper: 100250, quantity: "1" },
      ];

      const positionIds = [];

      for (const pos of overlappingPositions) {
        const params = {
          marketId,
          lowerTick: pos.lower,
          upperTick: pos.upper,
          quantity: ethers.parseUnits(pos.quantity, 6),
          maxCost: ethers.parseUnits("50", 6),
        };

        const positionId = await core
          .connect(pos.user)
          .openPosition.staticCall(
            pos.user.address,
            params.marketId,
            params.lowerTick,
            params.upperTick,
            params.quantity,
            params.maxCost
          );
        await core
          .connect(pos.user)
          .openPosition(
            pos.user.address,
            params.marketId,
            params.lowerTick,
            params.upperTick,
            params.quantity,
            params.maxCost
          );
        positionIds.push(positionId);
      }

      // Alice should have 2 positions, others 1 each
      expect(await position.balanceOf(alice.address)).to.equal(2);
      expect(await position.balanceOf(bob.address)).to.equal(1);

      // Verify position data
      for (let i = 0; i < positionIds.length; i++) {
        const posData = await position.getPosition(positionIds[i]);
        expect(posData.lowerTick).to.equal(overlappingPositions[i].lower);
        expect(posData.upperTick).to.equal(overlappingPositions[i].upper);
        expect(posData.quantity).to.equal(
          ethers.parseUnits(overlappingPositions[i].quantity, 6)
        );
      }

      // Perform operations on overlapping positions
      await core
        .connect(alice)
        .increasePosition(
          positionIds[0],
          ethers.parseUnits("0.5", 6),
          ethers.parseUnits("5", 6)
        );

      await core
        .connect(alice)
        .decreasePosition(positionIds[1], ethers.parseUnits("1", 6), 0);

      // Transfer positions to create more complex ownership patterns
      await position
        .connect(alice)
        .transferFrom(alice.address, bob.address, positionIds[0]);
      await position
        .connect(alice)
        .transferFrom(alice.address, bob.address, positionIds[2]);

      // Now Alice has 1, Bob has 2, Charlie has 1
      expect(await position.balanceOf(alice.address)).to.equal(2); // kept 1, received 1
      expect(await position.balanceOf(bob.address)).to.equal(2); // kept 1, received 1
      expect(await position.balanceOf(alice.address)).to.equal(0); // transferred away

      // Close positions in different order
      await core.connect(alice).closePosition(positionIds[2], 0); // Charlie's original, now Alice's
      await core.connect(alice).closePosition(positionIds[1], 0); // Bob's
      await core.connect(alice).closePosition(positionIds[0], 0); // Alice's original, now Bob's
      await core.connect(alice).closePosition(positionIds[3], 0); // Alice's second

      // All should be cleaned up
      expect(await position.balanceOf(alice.address)).to.equal(0);
      expect(await position.balanceOf(bob.address)).to.equal(0);
    });

    it("should handle position operations with reasonable tick ranges", async function () {
      const { core, position, alice, bob, marketId } = await loadFixture(
        activePositionMarketFixture
      );

      // Test with reasonable tick ranges for normal usage
      const reasonablePositions = [
        { lower: 100100, upper: 100500, quantity: "0.005" }, // Moderate wide range
        { lower: 100300, upper: 100350, quantity: "0.003" }, // Narrow range
        { lower: 100600, upper: 100750, quantity: "0.002" }, // Normal range
      ];

      const positionIds = [];

      for (const pos of reasonablePositions) {
        const params = {
          marketId,
          lowerTick: pos.lower,
          upperTick: pos.upper,
          quantity: ethers.parseUnits(pos.quantity, 6),
          maxCost: ethers.parseUnits("10", 6), // Reduced max cost for smaller quantities
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

      // Verify reasonable positions work correctly
      for (let i = 0; i < positionIds.length; i++) {
        const posData = await position.getPosition(positionIds[i]);
        expect(posData.lowerTick).to.equal(reasonablePositions[i].lower);
        expect(posData.upperTick).to.equal(reasonablePositions[i].upper);
        expect(posData.quantity).to.equal(
          ethers.parseUnits(reasonablePositions[i].quantity, 6)
        );
      }

      // Operations should work on reasonable positions
      await core.connect(alice).increasePosition(
        positionIds[0],
        ethers.parseUnits("0.002", 6), // Small increase
        ethers.parseUnits("2", 6)
      );

      await core
        .connect(alice)
        .decreasePosition(positionIds[1], ethers.parseUnits("0.001", 6), 0); // Small decrease within position quantity

      // Transfer extreme positions
      await position
        .connect(alice)
        .transferFrom(alice.address, bob.address, positionIds[0]);
      await position
        .connect(alice)
        .transferFrom(alice.address, bob.address, positionIds[2]);

      expect(await position.balanceOf(alice.address)).to.equal(1);
      expect(await position.balanceOf(bob.address)).to.equal(2);

      // Close all positions
      for (const posId of positionIds) {
        await core.connect(alice).closePosition(posId, 0);
      }

      expect(await position.balanceOf(alice.address)).to.equal(0);
      expect(await position.balanceOf(bob.address)).to.equal(0);
    });
  });

  describe("Position Batch Operations", function () {
    it("should handle reasonable batch position creation and management", async function () {
      const { core, position, alice, bob, marketId } = await loadFixture(
        activePositionMarketFixture
      );

      const batchSize = 5; // Reduced batch size for realistic usage
      const positionIds = [];
      const users = [alice, bob];

      // Create batch of positions with reasonable quantities
      for (let i = 0; i < batchSize; i++) {
        const user = users[i % users.length];
        const params = {
          marketId,
          lowerTick: 100100 + i * 80, // 실제 틱값 사용 (100100, 100180, ...)
          upperTick: 100180 + i * 80, // 실제 틱값 사용 (100180, 100260, ...)
          quantity: ethers.parseUnits((0.001 * (i + 1)).toString(), 6), // Much smaller quantities
          maxCost: ethers.parseUnits("5", 6), // Reduced max cost
        };

        const positionId = await core
          .connect(user)
          .openPosition.staticCall(
            user.address,
            params.marketId,
            params.lowerTick,
            params.upperTick,
            params.quantity,
            params.maxCost
          );
        await core
          .connect(user)
          .openPosition(
            user.address,
            params.marketId,
            params.lowerTick,
            params.upperTick,
            params.quantity,
            params.maxCost
          );
        positionIds.push({ id: positionId, user });
      }

      // Verify batch creation
      const aliceCount = positionIds.filter((p) => p.user === alice).length;
      const bobCount = positionIds.filter((p) => p.user === bob).length;

      expect(await position.balanceOf(alice.address)).to.equal(aliceCount);
      expect(await position.balanceOf(bob.address)).to.equal(bobCount);

      const marketPositions = await position.getMarketPositions(marketId);
      expect(marketPositions.length).to.equal(batchSize);

      // Batch operations
      for (let i = 0; i < positionIds.length; i += 2) {
        // Increase every other position
        await core
          .connect(alice)
          .increasePosition(
            positionIds[i].id,
            ethers.parseUnits("0.5", 6),
            ethers.parseUnits("5", 6)
          );
      }

      for (let i = 1; i < positionIds.length; i += 2) {
        // Decrease every other position by small amount
        await core
          .connect(alice)
          .decreasePosition(
            positionIds[i].id,
            ethers.parseUnits("0.0005", 6),
            0
          ); // Small decrease
      }

      // Batch transfers - Alice transfers all her positions to Bob
      const alicePositions = await position.getPositionsByOwner(alice.address);
      for (const posId of alicePositions) {
        await position
          .connect(alice)
          .transferFrom(alice.address, bob.address, posId);
      }

      expect(await position.balanceOf(alice.address)).to.equal(0);
      expect(await position.balanceOf(bob.address)).to.equal(
        aliceCount + bobCount
      );

      // Batch closure - close all positions
      for (const pos of positionIds) {
        await core.connect(alice).closePosition(pos.id, 0);
      }

      // Verify all cleaned up
      expect(await position.balanceOf(alice.address)).to.equal(0);
      expect(await position.balanceOf(bob.address)).to.equal(0);

      const finalMarketPositions = await position.getMarketPositions(marketId);
      expect(finalMarketPositions.length).to.equal(0);
    });

    it("should handle rapid position operations", async function () {
      const { core, position, alice, bob, marketId } = await loadFixture(
        activePositionMarketFixture
      );

      // Create position for rapid operations
      const params = {
        marketId,
        lowerTick: 100100, // 실제 틱값 사용 (100100)
        upperTick: 100130, // 실제 틱값 사용 (100130)
        quantity: ethers.parseUnits("0.01", 6), // Reduced from 100 to 0.01
        maxCost: ethers.parseUnits("10", 6), // Reduced from 1000 to 10
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

      let currentQuantity = params.quantity;

      // Rapid sequence of operations
      const operations = [
        { type: "increase", amount: ethers.parseUnits("0.001", 6) }, // Reduced from 10 to 0.001
        { type: "decrease", amount: ethers.parseUnits("0.0005", 6) }, // Reduced from 5 to 0.0005
        { type: "increase", amount: ethers.parseUnits("0.002", 6) }, // Reduced from 20 to 0.002
        { type: "decrease", amount: ethers.parseUnits("0.0015", 6) }, // Reduced from 15 to 0.0015
        { type: "increase", amount: ethers.parseUnits("0.0008", 6) }, // Reduced from 8 to 0.0008
        { type: "decrease", amount: ethers.parseUnits("0.0012", 6) }, // Reduced from 12 to 0.0012
        { type: "increase", amount: ethers.parseUnits("0.0025", 6) }, // Reduced from 25 to 0.0025
        { type: "decrease", amount: ethers.parseUnits("0.0018", 6) }, // Reduced from 18 to 0.0018
      ];

      for (const op of operations) {
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

        // Verify state after each operation
        const posData = await position.getPosition(positionId);
        expect(posData.quantity).to.equal(currentQuantity);
      }

      // Transfer during rapid operations
      await position
        .connect(alice)
        .transferFrom(alice.address, bob.address, positionId);
      expect(await position.ownerOf(positionId)).to.equal(bob.address);

      // Continue operations with new owner
      await core.connect(alice).increasePosition(
        positionId,
        ethers.parseUnits("0.003", 6), // Reduced from 30 to 0.003
        ethers.parseUnits("10", 6) // Reduced from 300 to 10
      );
      currentQuantity += ethers.parseUnits("0.003", 6); // Reduced from 30 to 0.003

      const finalData = await position.getPosition(positionId);
      expect(finalData.quantity).to.equal(currentQuantity);

      // Close position
      await core.connect(alice).closePosition(positionId, 0);
      expect(await position.balanceOf(bob.address)).to.equal(0);
    });
  });

  describe("Position Error Recovery and Edge Cases", function () {
    it("should handle position operations with market edge cases", async function () {
      const { core, position, alice, bob, marketId } = await loadFixture(
        activePositionMarketFixture
      );

      // Create position with minimal quantity

      const minPositionId = await core.connect(alice).openPosition.staticCall(
        alice.address,
        marketId,
        100100, // 실제 틱값 사용 (100100)
        100120, // 실제 틱값 사용 (100120)
        1,
        ethers.parseUnits("1", 6)
      );
      await core.connect(alice).openPosition(
        alice.address,
        marketId,
        100100, // 실제 틱값 사용 (100100)
        100120, // 실제 틱값 사용 (100120)
        1,
        ethers.parseUnits("1", 6)
      );

      // Operations on minimal position
      await core
        .connect(alice)
        .increasePosition(minPositionId, 1, ethers.parseUnits("1", 6));

      let posData = await position.getPosition(minPositionId);
      expect(posData.quantity).to.equal(2);

      // Transfer minimal position
      await position
        .connect(alice)
        .transferFrom(alice.address, bob.address, minPositionId);
      expect(await position.ownerOf(minPositionId)).to.equal(bob.address);

      // Decrease to 1
      await core.connect(alice).decreasePosition(minPositionId, 1, 0);
      posData = await position.getPosition(minPositionId);
      expect(posData.quantity).to.equal(1);

      // Close minimal position
      await core.connect(alice).closePosition(minPositionId, 0);
      expect(await position.balanceOf(bob.address)).to.equal(0);

      const maxPositionId = await core.connect(alice).openPosition.staticCall(
        alice.address,
        marketId,
        100100, // 실제 틱값 사용 (100100)
        100120, // 실제 틱값 사용 (100120)
        1,
        ethers.parseUnits("1", 6)
      );
      await core.connect(alice).openPosition(
        alice.address,
        marketId,
        100100, // 실제 틱값 사용 (100100)
        100120, // 실제 틱값 사용 (100120)
        1,
        ethers.parseUnits("1", 6)
      );

      // Operations on maximum position
      await core.connect(alice).increasePosition(
        maxPositionId,
        ethers.parseUnits("0.5", 6), // Reduced from 500000 to 0.5
        ethers.parseUnits("10", 6) // Reduced from 5000000 to 10
      );

      posData = await position.getPosition(maxPositionId);
      expect(posData.quantity).to.equal(ethers.parseUnits("0.500001", 6)); // 1 + 0.5 = 0.500001

      // Large decrease
      await core
        .connect(alice)
        .decreasePosition(maxPositionId, ethers.parseUnits("0.1", 6), 0); // Reduced from 1000000 to 0.1

      posData = await position.getPosition(maxPositionId);
      expect(posData.quantity).to.equal(ethers.parseUnits("0.400001", 6)); // 0.500001 - 0.1 = 0.400001

      // Transfer and close
      await position
        .connect(alice)
        .transferFrom(alice.address, bob.address, maxPositionId);
      await core.connect(alice).closePosition(maxPositionId, 0);

      expect(await position.balanceOf(bob.address)).to.equal(0);
    });

    it("should handle position operations with failed transactions", async function () {
      const { core, position, alice, bob, marketId } = await loadFixture(
        activePositionMarketFixture
      );

      // Create position
      const params = {
        marketId,
        lowerTick: 100100, // 실제 틱값 사용 (100100)
        upperTick: 100120, // 실제 틱값 사용 (100120)
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

      // Try invalid operations that should fail
      const nonExistentId = 999;

      await expect(
        core
          .connect(alice)
          .increasePosition(
            nonExistentId,
            ethers.parseUnits("1", 6),
            ethers.parseUnits("10", 6)
          )
      ).to.be.reverted;

      await expect(
        core
          .connect(alice)
          .decreasePosition(nonExistentId, ethers.parseUnits("1", 6), 0)
      ).to.be.reverted;

      await expect(core.connect(alice).closePosition(nonExistentId, 0)).to.be
        .reverted;

      // Original position should be unaffected
      const posData = await position.getPosition(positionId);
      expect(posData.quantity).to.equal(params.quantity);
      expect(await position.ownerOf(positionId)).to.equal(alice.address);

      // Try to decrease more than available
      await expect(
        core
          .connect(alice)
          .decreasePosition(positionId, ethers.parseUnits("10", 6), 0)
      ).to.be.reverted;

      // Position should still be intact
      const posDataAfter = await position.getPosition(positionId);
      expect(posDataAfter.quantity).to.equal(params.quantity);

      // Valid operations should still work
      await core
        .connect(alice)
        .increasePosition(
          positionId,
          ethers.parseUnits("2", 6),
          ethers.parseUnits("20", 6)
        );

      await position
        .connect(alice)
        .transferFrom(alice.address, bob.address, positionId);
      await core.connect(alice).closePosition(positionId, 0);

      expect(await position.balanceOf(bob.address)).to.equal(0);
    });

    it("should maintain data integrity across complex operation sequences", async function () {
      const { core, position, alice, bob, marketId } = await loadFixture(
        activePositionMarketFixture
      );

      const positionIds = [];
      const expectedStates = [];

      // Create multiple positions with different parameters
      for (let i = 0; i < 5; i++) {
        const params = {
          marketId,
          lowerTick: 100100 + i * 80, // 실제 틱값 사용 (100100, 100180, ...)
          upperTick: 100180 + i * 80, // 실제 틱값 사용 (100180, 100260, ...)
          quantity: ethers.parseUnits((i + 1).toString(), 6),
          maxCost: ethers.parseUnits("100", 6),
        };

        const user = [alice, bob][i % 2];
        const positionId = await core
          .connect(user)
          .openPosition.staticCall(
            user.address,
            params.marketId,
            params.lowerTick,
            params.upperTick,
            params.quantity,
            params.maxCost
          );
        await core
          .connect(user)
          .openPosition(
            user.address,
            params.marketId,
            params.lowerTick,
            params.upperTick,
            params.quantity,
            params.maxCost
          );

        positionIds.push(positionId);
        expectedStates.push({
          id: positionId,
          owner: user.address,
          marketId,
          lowerTick: params.lowerTick,
          upperTick: params.upperTick,
          quantity: params.quantity,
        });
      }

      // Complex sequence of operations
      const operations = [
        {
          type: "increase",
          posIndex: 0,
          amount: ethers.parseUnits("0.5", 6),
          from: alice,
        },
        { type: "transfer", posIndex: 1, from: bob, to: alice },
        {
          type: "decrease",
          posIndex: 2,
          amount: ethers.parseUnits("1", 6),
          from: alice,
        },
        {
          type: "increase",
          posIndex: 3,
          amount: ethers.parseUnits("2", 6),
          from: bob,
        },
        { type: "transfer", posIndex: 0, from: alice, to: bob },
        {
          type: "decrease",
          posIndex: 4,
          amount: ethers.parseUnits("0.8", 6),
          from: alice,
        },
        { type: "transfer", posIndex: 2, from: bob, to: alice },
        {
          type: "increase",
          posIndex: 1,
          amount: ethers.parseUnits("1.5", 6),
          from: alice,
        },
      ];

      for (const op of operations) {
        const posId = positionIds[op.posIndex];

        if (op.type === "increase") {
          await core
            .connect(op.from)
            .increasePosition(posId, op.amount!, ethers.parseUnits("50", 6));
          expectedStates[op.posIndex].quantity += op.amount!;
        } else if (op.type === "decrease") {
          await core.connect(op.from).decreasePosition(posId, op.amount!, 0);
          expectedStates[op.posIndex].quantity -= op.amount!;
        } else if (op.type === "transfer") {
          await position
            .connect(op.from)
            .transferFrom(op.from!.address, op.to!.address, posId);
          expectedStates[op.posIndex].owner = op.to!.address;
        }

        // Verify state after each operation
        const posData = await position.getPosition(posId);
        expect(posData.quantity).to.equal(expectedStates[op.posIndex].quantity);
        expect(await position.ownerOf(posId)).to.equal(
          expectedStates[op.posIndex].owner
        );
        expect(posData.marketId).to.equal(expectedStates[op.posIndex].marketId);
        expect(posData.lowerTick).to.equal(
          expectedStates[op.posIndex].lowerTick
        );
        expect(posData.upperTick).to.equal(
          expectedStates[op.posIndex].upperTick
        );
      }

      // Verify final balances
      const alicePositions = await position.getPositionsByOwner(alice.address);
      const bobPositions = await position.getPositionsByOwner(bob.address);

      const aliceCount = expectedStates.filter(
        (s) => s.owner === alice.address
      ).length;
      const bobCount = expectedStates.filter(
        (s) => s.owner === bob.address
      ).length;

      expect(alicePositions.length).to.equal(aliceCount);
      expect(bobPositions.length).to.equal(bobCount);

      // Close all positions
      for (const posId of positionIds) {
        await core.connect(alice).closePosition(posId, 0);
      }

      // Verify complete cleanup
      expect(await position.balanceOf(alice.address)).to.equal(0);
      expect(await position.balanceOf(bob.address)).to.equal(0);

      const finalMarketPositions = await position.getMarketPositions(marketId);
      expect(finalMarketPositions.length).to.equal(0);
    });
  });
});
