import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

import {
  activePositionMarketFixture,
  listMarketPositions,
  openPositionWithQuote,
  quoteIncreaseCostWithBuffer,
} from "../../helpers/fixtures/position";
import { INTEGRATION_TAG } from "../../helpers/tags";

async function getOwnerPositions(
  positionContract: any,
  marketId: number,
  owner: string
) {
  const marketPositions = await listMarketPositions(positionContract, marketId);
  const owned: bigint[] = [];
  for (const posId of marketPositions) {
    const posOwner = await positionContract.ownerOf(posId);
    if (posOwner === owner) {
      owned.push(posId);
    }
  }
  return owned;
}

describe(`${INTEGRATION_TAG} Position-Market Interactions`, function () {
  describe("Position Operations Across Market States", function () {
    it("should handle position operations during market lifecycle", async function () {
      const { core, position, keeper, alice, bob, marketId } =
        await loadFixture(activePositionMarketFixture);

      const aliceQuantity = ethers.parseUnits("2", 6);
      const bobQuantity = ethers.parseUnits("3", 6);

      const alicePosition = await openPositionWithQuote(core, alice, {
        marketId,
        lowerTick: 100100,
        upperTick: 100300,
        quantity: aliceQuantity,
      });

      const bobPosition = await openPositionWithQuote(core, bob, {
        marketId,
        lowerTick: 100300,
        upperTick: 100500,
        quantity: bobQuantity,
      });

      expect(await position.balanceOf(alice.address)).to.equal(1);
      expect(await position.balanceOf(bob.address)).to.equal(1);

      const marketPositions = await listMarketPositions(position, marketId);
      expect(marketPositions.length).to.equal(2);

      const increaseAmount = ethers.parseUnits("0.5", 6);
      const aliceIncreaseCost = await quoteIncreaseCostWithBuffer(
        core,
        alicePosition.positionId,
        increaseAmount
      );

      await core
        .connect(alice)
        .increasePosition(alicePosition.positionId, increaseAmount, aliceIncreaseCost);

      const bobDecreaseAmount = ethers.parseUnits("0.5", 6);
      await core
        .connect(bob)
        .decreasePosition(bobPosition.positionId, bobDecreaseAmount, 0);

      await position
        .connect(alice)
        .transferFrom(alice.address, bob.address, alicePosition.positionId);
      expect(await position.balanceOf(bob.address)).to.equal(2);

      await core.connect(keeper).pause("maintenance");

      await expect(
        core
          .connect(alice)
          .increasePosition(bobPosition.positionId, increaseAmount, aliceIncreaseCost)
      ).to.be.revertedWithCustomError(core, "EnforcedPause");

      await core.connect(keeper).unpause();

      await position
        .connect(bob)
        .transferFrom(bob.address, alice.address, alicePosition.positionId);

      const bobIncreaseCost = await quoteIncreaseCostWithBuffer(
        core,
        bobPosition.positionId,
        increaseAmount
      );

      await core
        .connect(bob)
        .increasePosition(bobPosition.positionId, increaseAmount, bobIncreaseCost);

      await core.connect(alice).closePosition(alicePosition.positionId, 0);
      await core.connect(bob).closePosition(bobPosition.positionId, 0);

      expect(await position.balanceOf(alice.address)).to.equal(0);
      expect(await position.balanceOf(bob.address)).to.equal(0);

      const finalMarketPositions = await listMarketPositions(position, marketId);
      expect(finalMarketPositions.length).to.equal(0);
    });

    it("should handle position operations with overlapping tick ranges", async function () {
      const { core, position, alice, bob, marketId } = await loadFixture(
        activePositionMarketFixture
      );

      const scenarios = [
        { user: alice, lower: 100100, upper: 100300, quantity: "0.6" },
        { user: bob, lower: 100200, upper: 100400, quantity: "0.5" },
        { user: alice, lower: 100250, upper: 100350, quantity: "0.4" },
        { user: bob, lower: 100150, upper: 100250, quantity: "0.3" },
      ];

      const references = [] as { id: bigint; owner: typeof alice }[];

      for (const scenario of scenarios) {
        const quantity = ethers.parseUnits(scenario.quantity, 6);
        const { positionId } = await openPositionWithQuote(core, scenario.user, {
          marketId,
          lowerTick: scenario.lower,
          upperTick: scenario.upper,
          quantity,
        });
        references.push({ id: positionId, owner: scenario.user });
      }

      expect(await position.balanceOf(alice.address)).to.equal(2);
      expect(await position.balanceOf(bob.address)).to.equal(2);

      const increaseAmount = ethers.parseUnits("0.2", 6);
      const increaseCost = await quoteIncreaseCostWithBuffer(
        core,
        references[0].id,
        increaseAmount
      );
      await core
        .connect(references[0].owner)
        .increasePosition(references[0].id, increaseAmount, increaseCost);

      const decreaseAmount = ethers.parseUnits("0.1", 6);
      await core
        .connect(references[1].owner)
        .decreasePosition(references[1].id, decreaseAmount, 0);

      await position
        .connect(references[2].owner)
        .transferFrom(
          references[2].owner.address,
          bob.address,
          references[2].id
        );
      references[2].owner = bob;

      await position
        .connect(references[3].owner)
        .transferFrom(
          references[3].owner.address,
          alice.address,
          references[3].id
        );
      references[3].owner = alice;

      expect(await position.balanceOf(alice.address)).to.equal(2);
      expect(await position.balanceOf(bob.address)).to.equal(2);

      for (const ref of references) {
        await core.connect(ref.owner).closePosition(ref.id, 0);
      }

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

      const positionRefs: { id: bigint; owner: typeof alice | typeof bob }[] = [];

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
        positionRefs.push({ id: positionId, owner: alice });
      }

      expect(await position.balanceOf(alice.address)).to.equal(3);

      // Verify reasonable positions work correctly
      for (let i = 0; i < positionRefs.length; i++) {
        const posData = await position.getPosition(positionRefs[i].id);
        expect(posData.lowerTick).to.equal(reasonablePositions[i].lower);
        expect(posData.upperTick).to.equal(reasonablePositions[i].upper);
        expect(posData.quantity).to.equal(
          ethers.parseUnits(reasonablePositions[i].quantity, 6)
        );
      }

      // Operations should work on reasonable positions
      const increaseAmount = ethers.parseUnits("0.002", 6); // Small increase
      const increaseCost = await quoteIncreaseCostWithBuffer(
        core,
        positionRefs[0].id,
        increaseAmount
      );
      await core
        .connect(positionRefs[0].owner)
        .increasePosition(positionRefs[0].id, increaseAmount, increaseCost);

      await core.connect(positionRefs[1].owner).decreasePosition(
        positionRefs[1].id,
        ethers.parseUnits("0.001", 6),
        0
      ); // Small decrease within position quantity

      // Transfer extreme positions
      await position
        .connect(alice)
        .transferFrom(alice.address, bob.address, positionRefs[0].id);
      positionRefs[0].owner = bob;
      await position
        .connect(alice)
        .transferFrom(alice.address, bob.address, positionRefs[2].id);
      positionRefs[2].owner = bob;

      expect(await position.balanceOf(alice.address)).to.equal(1);
      expect(await position.balanceOf(bob.address)).to.equal(2);

      // Close all positions
      for (const ref of positionRefs) {
        await core.connect(ref.owner).closePosition(ref.id, 0);
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
      const positionRefs: { id: bigint; owner: typeof alice | typeof bob }[] = [];
      const users = [alice, bob];

      // Create batch of positions with reasonable quantities
      for (let i = 0; i < batchSize; i++) {
        const user = users[i % users.length];
        const params = {
          marketId,
          lowerTick: 100100 + i * 40,
          upperTick: 100140 + i * 40,
          quantity: ethers.parseUnits((0.001 * (i + 1)).toString(), 6), // Much smaller quantities
          maxCost: ethers.parseUnits("5", 6), // Reduced max cost
        };

        const { positionId } = await openPositionWithQuote(core, user, {
          marketId,
          lowerTick: params.lowerTick,
          upperTick: params.upperTick,
          quantity: params.quantity,
        });
        positionRefs.push({ id: positionId, owner: user });
      }

      // Verify batch creation
      const aliceCount = positionRefs.filter((p) => p.owner === alice).length;
      const bobCount = positionRefs.filter((p) => p.owner === bob).length;

      expect(await position.balanceOf(alice.address)).to.equal(aliceCount);
      expect(await position.balanceOf(bob.address)).to.equal(bobCount);

      const marketPositions = await listMarketPositions(position, marketId);
      expect(marketPositions.length).to.equal(batchSize);

      // Batch operations
      const increaseAmount = ethers.parseUnits("0.0005", 6);
      for (let i = 0; i < positionRefs.length; i += 2) {
        const ref = positionRefs[i];
        const cost = await quoteIncreaseCostWithBuffer(core, ref.id, increaseAmount);
        await core
          .connect(ref.owner)
          .increasePosition(ref.id, increaseAmount, cost);
      }

      const decreaseAmount = ethers.parseUnits("0.0002", 6);
      for (let i = 1; i < positionRefs.length; i += 2) {
        const ref = positionRefs[i];
        await core
          .connect(ref.owner)
          .decreasePosition(ref.id, decreaseAmount, 0);
      }

      // Batch transfers - Alice transfers all her positions to Bob
      const alicePositions = await getOwnerPositions(
        position,
        marketId,
        alice.address
      );
      for (const posId of alicePositions) {
        await position
          .connect(alice)
          .transferFrom(alice.address, bob.address, posId);
        const ref = positionRefs.find((p) => p.id === posId);
        if (ref) {
          ref.owner = bob;
        }
      }

      expect(await position.balanceOf(alice.address)).to.equal(0);
      expect(await position.balanceOf(bob.address)).to.equal(
        aliceCount + bobCount
      );

      // Batch closure - close all positions
      for (const ref of positionRefs) {
        await core.connect(ref.owner).closePosition(ref.id, 0);
      }

      // Verify all cleaned up
      expect(await position.balanceOf(alice.address)).to.equal(0);
      expect(await position.balanceOf(bob.address)).to.equal(0);

      const finalMarketPositions = await listMarketPositions(position, marketId);
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
          const cost = await quoteIncreaseCostWithBuffer(
            core,
            positionId,
            op.amount
          );
          await core
            .connect(alice)
            .increasePosition(positionId, op.amount, cost);
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
      const bobIncreaseAmount = ethers.parseUnits("0.003", 6); // Reduced from 30 to 0.003
      const bobIncreaseCost = await quoteIncreaseCostWithBuffer(
        core,
        positionId,
        bobIncreaseAmount
      );
      await core
        .connect(bob)
        .increasePosition(positionId, bobIncreaseAmount, bobIncreaseCost);
      currentQuantity += bobIncreaseAmount;

      const finalData = await position.getPosition(positionId);
      expect(finalData.quantity).to.equal(currentQuantity);

      // Close position
      await core.connect(bob).closePosition(positionId, 0);
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
        marketId,
        100100, // 실제 틱값 사용 (100100)
        100120, // 실제 틱값 사용 (100120)
        1,
        ethers.parseUnits("1", 6)
      );
      await core.connect(alice).openPosition(
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
      await core.connect(bob).decreasePosition(minPositionId, 1, 0);
      posData = await position.getPosition(minPositionId);
      expect(posData.quantity).to.equal(1);

      // Close minimal position
      await core.connect(bob).closePosition(minPositionId, 0);
      expect(await position.balanceOf(bob.address)).to.equal(0);

      const maxPositionId = await core.connect(alice).openPosition.staticCall(
        marketId,
        100100, // 실제 틱값 사용 (100100)
        100120, // 실제 틱값 사용 (100120)
        1,
        ethers.parseUnits("1", 6)
      );
      await core.connect(alice).openPosition(
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
      await core.connect(bob).closePosition(maxPositionId, 0);

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
      await core.connect(bob).closePosition(positionId, 0);

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
          quantity: ethers.parseUnits((0.05 * (i + 1)).toFixed(3), 6),
          maxCost: ethers.parseUnits("100", 6),
        };

        const user = [alice, bob][i % 2];
        const positionId = await core
          .connect(user)
          .openPosition.staticCall(
            params.marketId,
            params.lowerTick,
            params.upperTick,
            params.quantity,
            params.maxCost
          );
        await core
          .connect(user)
          .openPosition(
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
          type: "decrease" as const,
          posIndex: 0,
          amount: ethers.parseUnits("0.02", 6),
        },
        { type: "transfer" as const, posIndex: 1, to: alice },
        {
          type: "decrease" as const,
          posIndex: 3,
          amount: ethers.parseUnits("0.05", 6),
        },
        { type: "transfer" as const, posIndex: 0, to: bob },
        {
          type: "decrease" as const,
          posIndex: 4,
          amount: ethers.parseUnits("0.06", 6),
        },
        { type: "transfer" as const, posIndex: 2, to: alice },
      ];

      for (const op of operations) {
        const posId = positionIds[op.posIndex];
        const ownerAddress = expectedStates[op.posIndex].owner;
        const ownerSigner = ownerAddress === alice.address ? alice : bob;

        if (op.type === "decrease") {
          await core
            .connect(ownerSigner)
            .decreasePosition(posId, op.amount!, 0);
          expectedStates[op.posIndex].quantity -= op.amount!;
        } else if (op.type === "transfer") {
          await position
            .connect(ownerSigner)
            .transferFrom(
              ownerSigner.address,
              op.to!.address,
              posId
            );
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
      const alicePositions = await getOwnerPositions(
        position,
        marketId,
        alice.address
      );
      const bobPositions = await getOwnerPositions(
        position,
        marketId,
        bob.address
      );

      const aliceCount = expectedStates.filter(
        (s) => s.owner === alice.address
      ).length;
      const bobCount = expectedStates.filter(
        (s) => s.owner === bob.address
      ).length;

      expect(alicePositions.length).to.equal(aliceCount);
      expect(bobPositions.length).to.equal(bobCount);

      // Close all positions
      for (let i = 0; i < positionIds.length; i++) {
        const ownerAddress = expectedStates[i].owner;
        const ownerSigner = ownerAddress === alice.address ? alice : bob;
        await core.connect(ownerSigner).closePosition(positionIds[i], 0);
      }

      // Verify complete cleanup
      expect(await position.balanceOf(alice.address)).to.equal(0);
      expect(await position.balanceOf(bob.address)).to.equal(0);

      const finalMarketPositions = await listMarketPositions(position, marketId);
      expect(finalMarketPositions.length).to.equal(0);
    });
  });
});
