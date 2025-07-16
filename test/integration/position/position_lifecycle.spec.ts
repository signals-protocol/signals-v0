import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { ethers } from "hardhat";

import { realPositionMarketFixture } from "../../helpers/fixtures/position";
import { INTEGRATION_TAG } from "../../helpers/tags";

describe(`${INTEGRATION_TAG} Position Lifecycle Integration`, function () {
  describe("Complete Position Lifecycle", function () {
    it("should handle full position lifecycle: create -> modify -> transfer -> close", async function () {
      const { core, position, router, alice, bob, charlie, marketId } =
        await loadFixture(realPositionMarketFixture);

      // Phase 1: Alice creates position
      const initialParams = {
        marketId,
        lowerTick: 10,
        upperTick: 30,
        quantity: ethers.parseUnits("5", 6),
        maxCost: ethers.parseUnits("50", 6),
      };

      const positionId = await core
        .connect(router)
        .openPosition.staticCall(
          alice.address,
          initialParams.marketId,
          initialParams.lowerTick,
          initialParams.upperTick,
          initialParams.quantity,
          initialParams.maxCost
        );

      await expect(
        core
          .connect(router)
          .openPosition(
            alice.address,
            initialParams.marketId,
            initialParams.lowerTick,
            initialParams.upperTick,
            initialParams.quantity,
            initialParams.maxCost
          )
      )
        .to.emit(position, "PositionMinted")
        .withArgs(
          positionId,
          alice.address,
          marketId,
          10,
          30,
          initialParams.quantity
        );

      // Verify initial state
      expect(await position.ownerOf(positionId)).to.equal(alice.address);
      expect(await position.balanceOf(alice.address)).to.equal(1);

      let positionData = await position.getPosition(positionId);
      expect(positionData.quantity).to.equal(initialParams.quantity);
      expect(positionData.marketId).to.equal(marketId);

      // Phase 2: Alice modifies position (increase)
      const increaseAmount = ethers.parseUnits("2", 6);
      await expect(
        core
          .connect(router)
          .increasePosition(
            positionId,
            increaseAmount,
            ethers.parseUnits("20", 6)
          )
      )
        .to.emit(position, "PositionUpdated")
        .withArgs(
          positionId,
          initialParams.quantity,
          initialParams.quantity + increaseAmount
        );

      positionData = await position.getPosition(positionId);
      expect(positionData.quantity).to.equal(ethers.parseUnits("7", 6));

      // Phase 3: Alice modifies position (decrease)
      const decreaseAmount = ethers.parseUnits("1.5", 6);
      await expect(
        core.connect(router).decreasePosition(positionId, decreaseAmount, 0)
      )
        .to.emit(position, "PositionUpdated")
        .withArgs(
          positionId,
          ethers.parseUnits("7", 6),
          ethers.parseUnits("5.5", 6)
        );

      positionData = await position.getPosition(positionId);
      expect(positionData.quantity).to.equal(ethers.parseUnits("5.5", 6));

      // Phase 4: Alice transfers position to Bob
      await expect(
        position
          .connect(alice)
          .transferFrom(alice.address, bob.address, positionId)
      )
        .to.emit(position, "Transfer")
        .withArgs(alice.address, bob.address, positionId);

      expect(await position.ownerOf(positionId)).to.equal(bob.address);
      expect(await position.balanceOf(alice.address)).to.equal(0);
      expect(await position.balanceOf(bob.address)).to.equal(1);

      // Phase 5: Bob modifies the position
      await expect(
        core
          .connect(router)
          .increasePosition(
            positionId,
            ethers.parseUnits("1", 6),
            ethers.parseUnits("10", 6)
          )
      ).to.emit(position, "PositionUpdated");

      positionData = await position.getPosition(positionId);
      expect(positionData.quantity).to.equal(ethers.parseUnits("6.5", 6));

      // Phase 6: Bob transfers to Charlie
      await position
        .connect(bob)
        .transferFrom(bob.address, charlie.address, positionId);
      expect(await position.ownerOf(positionId)).to.equal(charlie.address);

      // Phase 7: Charlie closes the position
      await expect(core.connect(router).closePosition(positionId, 0))
        .to.emit(position, "PositionBurned")
        .withArgs(positionId, charlie.address);

      // Verify position is completely removed
      expect(await position.balanceOf(charlie.address)).to.equal(0);
      await expect(position.ownerOf(positionId)).to.be.revertedWithCustomError(
        position,
        "ERC721NonexistentToken"
      );
      await expect(
        position.getPosition(positionId)
      ).to.be.revertedWithCustomError(position, "PositionNotFound");

      // Verify all users have zero balance
      expect(await position.balanceOf(alice.address)).to.equal(0);
      expect(await position.balanceOf(bob.address)).to.equal(0);
      expect(await position.balanceOf(charlie.address)).to.equal(0);
    });

    it("should handle multiple positions with complex interactions", async function () {
      const { core, position, router, alice, bob, charlie, marketId } =
        await loadFixture(realPositionMarketFixture);

      const positionIds = [];
      const users = [alice, bob, charlie];

      // Create multiple positions for different users
      for (let i = 0; i < 3; i++) {
        const params = {
          marketId,
          lowerTick: 10 + i * 10,
          upperTick: 30 + i * 10,
          quantity: ethers.parseUnits((i + 1).toString(), 6),
          maxCost: ethers.parseUnits("50", 6),
        };

        const positionId = await core
          .connect(router)
          .openPosition.staticCall(
            users[i].address,
            params.marketId,
            params.lowerTick,
            params.upperTick,
            params.quantity,
            params.maxCost
          );
        await core
          .connect(router)
          .openPosition(
            users[i].address,
            params.marketId,
            params.lowerTick,
            params.upperTick,
            params.quantity,
            params.maxCost
          );
        positionIds.push(positionId);
      }

      // Verify initial state
      for (let i = 0; i < users.length; i++) {
        expect(await position.balanceOf(users[i].address)).to.equal(1);
        expect(await position.ownerOf(positionIds[i])).to.equal(
          users[i].address
        );
      }

      // Complex interaction sequence
      // 1. Alice increases her position
      await core
        .connect(router)
        .increasePosition(
          positionIds[0],
          ethers.parseUnits("0.5", 6),
          ethers.parseUnits("5", 6)
        );

      // 2. Bob transfers his position to Alice
      await position
        .connect(bob)
        .transferFrom(bob.address, alice.address, positionIds[1]);

      // 3. Alice now has 2 positions
      expect(await position.balanceOf(alice.address)).to.equal(2);
      expect(await position.balanceOf(bob.address)).to.equal(0);

      const alicePositions = await position.getPositionsByOwner(alice.address);
      expect(alicePositions.length).to.equal(2);
      expect(alicePositions).to.include(positionIds[0]);
      expect(alicePositions).to.include(positionIds[1]);

      // 4. Charlie decreases his position
      await core
        .connect(router)
        .decreasePosition(positionIds[2], ethers.parseUnits("1", 6), 0);

      // 5. Alice closes one of her positions
      await core.connect(router).closePosition(positionIds[0], 0);

      // 6. Alice transfers her remaining position to Charlie
      await position
        .connect(alice)
        .transferFrom(alice.address, charlie.address, positionIds[1]);

      // Final state verification
      expect(await position.balanceOf(alice.address)).to.equal(0);
      expect(await position.balanceOf(bob.address)).to.equal(0);
      expect(await position.balanceOf(charlie.address)).to.equal(2); // His original + transferred

      const charliePositions = await position.getPositionsByOwner(
        charlie.address
      );
      expect(charliePositions.length).to.equal(2);
      expect(charliePositions).to.include(positionIds[1]);
      expect(charliePositions).to.include(positionIds[2]);

      // 7. Charlie closes all remaining positions
      await core.connect(router).closePosition(positionIds[1], 0);
      await core.connect(router).closePosition(positionIds[2], 0);

      // All positions should be burned
      expect(await position.balanceOf(charlie.address)).to.equal(0);
      for (const id of positionIds) {
        await expect(position.getPosition(id)).to.be.revertedWithCustomError(
          position,
          "PositionNotFound"
        );
      }
    });

    it("should handle position lifecycle with approval mechanisms", async function () {
      const { core, position, router, alice, bob, charlie, marketId } =
        await loadFixture(realPositionMarketFixture);

      // Alice creates position
      const params = {
        marketId,
        lowerTick: 15,
        upperTick: 25,
        quantity: ethers.parseUnits("3", 6),
        maxCost: ethers.parseUnits("30", 6),
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

      // Alice approves Bob for this specific position
      await expect(position.connect(alice).approve(bob.address, positionId))
        .to.emit(position, "Approval")
        .withArgs(alice.address, bob.address, positionId);

      // Bob transfers Alice's position to Charlie
      await expect(
        position
          .connect(bob)
          .transferFrom(alice.address, charlie.address, positionId)
      )
        .to.emit(position, "Transfer")
        .withArgs(alice.address, charlie.address, positionId);

      expect(await position.ownerOf(positionId)).to.equal(charlie.address);

      // Charlie sets Alice as operator for all tokens
      await expect(
        position.connect(charlie).setApprovalForAll(alice.address, true)
      )
        .to.emit(position, "ApprovalForAll")
        .withArgs(charlie.address, alice.address, true);

      // Alice can now manage Charlie's position
      await core
        .connect(router)
        .increasePosition(
          positionId,
          ethers.parseUnits("1", 6),
          ethers.parseUnits("10", 6)
        );

      // Alice transfers Charlie's position to Bob
      await position
        .connect(alice)
        .transferFrom(charlie.address, bob.address, positionId);
      expect(await position.ownerOf(positionId)).to.equal(bob.address);

      // Bob closes the position
      await core.connect(router).closePosition(positionId, 0);

      // Verify cleanup
      expect(await position.balanceOf(bob.address)).to.equal(0);
      await expect(
        position.getPosition(positionId)
      ).to.be.revertedWithCustomError(position, "PositionNotFound");
    });
  });

  describe("Position Lifecycle with Market Events", function () {
    it("should handle position operations during market state changes", async function () {
      const { core, position, router, keeper, alice, bob, marketId } =
        await loadFixture(realPositionMarketFixture);

      // Create position
      const params = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: ethers.parseUnits("2", 6),
        maxCost: ethers.parseUnits("20", 6),
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

      // Normal operations work
      await core
        .connect(router)
        .increasePosition(
          positionId,
          ethers.parseUnits("1", 6),
          ethers.parseUnits("10", 6)
        );

      // Pause the contract
      await core.connect(keeper).pause("Testing pause");

      // Position operations should fail when paused
      await expect(
        core
          .connect(router)
          .increasePosition(
            positionId,
            ethers.parseUnits("0.5", 6),
            ethers.parseUnits("5", 6)
          )
      ).to.be.revertedWithCustomError(core, "ContractPaused");

      await expect(
        core
          .connect(router)
          .decreasePosition(positionId, ethers.parseUnits("0.5", 6), 0)
      ).to.be.revertedWithCustomError(core, "ContractPaused");

      await expect(
        core.connect(router).closePosition(positionId, 0)
      ).to.be.revertedWithCustomError(core, "ContractPaused");

      // But transfers should still work (they don't go through Core)
      await expect(
        position
          .connect(alice)
          .transferFrom(alice.address, bob.address, positionId)
      )
        .to.emit(position, "Transfer")
        .withArgs(alice.address, bob.address, positionId);

      expect(await position.ownerOf(positionId)).to.equal(bob.address);

      // Unpause
      await core.connect(keeper).unpause();

      // Operations should work again
      await expect(
        core
          .connect(router)
          .increasePosition(
            positionId,
            ethers.parseUnits("0.5", 6),
            ethers.parseUnits("5", 6)
          )
      ).to.emit(position, "PositionUpdated");

      await expect(core.connect(router).closePosition(positionId, 0)).to.emit(
        position,
        "PositionBurned"
      );
    });

    it("should handle position operations with market resolution", async function () {
      const { core, position, router, keeper, alice, bob, marketId } =
        await loadFixture(realPositionMarketFixture);

      // Create multiple positions
      const positionIds = [];
      for (let i = 0; i < 3; i++) {
        const params = {
          marketId,
          lowerTick: 10 + i * 5,
          upperTick: 20 + i * 5,
          quantity: ethers.parseUnits("1", 6),
          maxCost: ethers.parseUnits("10", 6),
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
        positionIds.push(positionId);
      }

      expect(await position.balanceOf(alice.address)).to.equal(3);

      // Transfer one position to Bob
      await position
        .connect(alice)
        .transferFrom(alice.address, bob.address, positionIds[1]);

      // Verify state before resolution
      expect(await position.balanceOf(alice.address)).to.equal(2);
      expect(await position.balanceOf(bob.address)).to.equal(1);

      // Positions should still be manageable
      await core
        .connect(router)
        .increasePosition(
          positionIds[0],
          ethers.parseUnits("0.5", 6),
          ethers.parseUnits("5", 6)
        );

      await core
        .connect(router)
        .decreasePosition(positionIds[2], ethers.parseUnits("0.3", 6), 0);

      // Close some positions
      await core.connect(router).closePosition(positionIds[0], 0);
      await core.connect(router).closePosition(positionIds[1], 0);

      // Final state
      expect(await position.balanceOf(alice.address)).to.equal(1);
      expect(await position.balanceOf(bob.address)).to.equal(0);

      // Last position should still exist and be manageable
      const finalData = await position.getPosition(positionIds[2]);
      expect(finalData.quantity).to.equal(ethers.parseUnits("0.7", 6));

      await core.connect(router).closePosition(positionIds[2], 0);
      expect(await position.balanceOf(alice.address)).to.equal(0);
    });
  });

  describe("Position Lifecycle Error Recovery", function () {
    it("should handle failed operations gracefully", async function () {
      const { core, position, router, alice, bob, marketId } =
        await loadFixture(realPositionMarketFixture);

      // Create position
      const params = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: ethers.parseUnits("1", 6),
        maxCost: ethers.parseUnits("10", 6),
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

      // Try to operate on non-existent position (should fail)
      const nonExistentId = 999;
      await expect(
        core
          .connect(router)
          .increasePosition(
            nonExistentId,
            ethers.parseUnits("1", 6),
            ethers.parseUnits("10", 6)
          )
      ).to.be.reverted;

      // Original position should be unaffected
      const positionData = await position.getPosition(positionId);
      expect(positionData.quantity).to.equal(params.quantity);
      expect(await position.ownerOf(positionId)).to.equal(alice.address);

      // Try unauthorized transfer (should fail)
      await expect(
        position
          .connect(bob)
          .transferFrom(alice.address, bob.address, positionId)
      ).to.be.revertedWithCustomError(position, "ERC721InsufficientApproval");

      // Position should still be owned by Alice
      expect(await position.ownerOf(positionId)).to.equal(alice.address);

      // Valid operations should still work
      await expect(
        core
          .connect(router)
          .increasePosition(
            positionId,
            ethers.parseUnits("0.5", 6),
            ethers.parseUnits("5", 6)
          )
      ).to.emit(position, "PositionUpdated");

      await expect(
        position
          .connect(alice)
          .transferFrom(alice.address, bob.address, positionId)
      ).to.emit(position, "Transfer");

      expect(await position.ownerOf(positionId)).to.equal(bob.address);
    });

    it("should handle position operations with insufficient funds gracefully", async function () {
      const { core, position, router, alice, marketId } = await loadFixture(
        realPositionMarketFixture
      );

      // Create position
      const params = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: ethers.parseUnits("1", 6),
        maxCost: ethers.parseUnits("10", 6),
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

      // Try to decrease more than available (should fail)
      await expect(
        core
          .connect(router)
          .decreasePosition(positionId, ethers.parseUnits("2", 6), 0)
      ).to.be.reverted;

      // Position should be unchanged
      const positionData = await position.getPosition(positionId);
      expect(positionData.quantity).to.equal(params.quantity);

      // Valid decrease should work
      await expect(
        core
          .connect(router)
          .decreasePosition(positionId, ethers.parseUnits("0.5", 6), 0)
      ).to.emit(position, "PositionUpdated");

      // Verify final state
      const finalData = await position.getPosition(positionId);
      expect(finalData.quantity).to.equal(ethers.parseUnits("0.5", 6));
    });

    it("should handle sequential position operations", async function () {
      const { core, position, router, alice, bob, charlie, marketId } =
        await loadFixture(realPositionMarketFixture);

      // Create position with reasonable quantity
      const params = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: ethers.parseUnits("5", 6), // Reasonable quantity with larger alpha
        maxCost: ethers.parseUnits("25", 6), // Reasonable max cost
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

      // Sequential operations with realistic quantities
      const operations = [
        () =>
          core
            .connect(router)
            .increasePosition(
              positionId,
              ethers.parseUnits("1", 6),
              ethers.parseUnits("5", 6)
            ),
        () =>
          core
            .connect(router)
            .decreasePosition(positionId, ethers.parseUnits("0.5", 6), 0),
        () =>
          core
            .connect(router)
            .increasePosition(
              positionId,
              ethers.parseUnits("2", 6),
              ethers.parseUnits("10", 6)
            ),
        () =>
          core
            .connect(router)
            .decreasePosition(positionId, ethers.parseUnits("1.5", 6), 0),
      ];

      // Execute operations sequentially
      for (const operation of operations) {
        await operation();
      }

      // Verify final state is consistent
      const finalData = await position.getPosition(positionId);
      expect(finalData.quantity).to.equal(ethers.parseUnits("6", 6)); // 5 + 1 - 0.5 + 2 - 1.5

      // Position should still be transferable
      await position
        .connect(alice)
        .transferFrom(alice.address, bob.address, positionId);
      expect(await position.ownerOf(positionId)).to.equal(bob.address);

      // And closeable
      await core.connect(router).closePosition(positionId, 0);
      expect(await position.balanceOf(bob.address)).to.equal(0);
    });
  });

  describe("Position Lifecycle with Complex Scenarios", function () {
    it("should handle position lifecycle with multiple markets", async function () {
      const { core, position, router, alice, bob, marketId } =
        await loadFixture(realPositionMarketFixture);

      // Note: This test assumes we can create multiple markets
      // For now, we'll use the same market but different tick ranges to simulate different "sub-markets"

      const positions = [];
      const tickRanges = [
        { lower: 10, upper: 20 },
        { lower: 30, upper: 40 },
        { lower: 50, upper: 60 },
      ];

      // Create positions in different tick ranges (simulating different markets)
      for (let i = 0; i < tickRanges.length; i++) {
        const params = {
          marketId,
          lowerTick: tickRanges[i].lower,
          upperTick: tickRanges[i].upper,
          quantity: ethers.parseUnits((i + 1).toString(), 6),
          maxCost: ethers.parseUnits("50", 6),
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
        positions.push(positionId);
      }

      expect(await position.balanceOf(alice.address)).to.equal(3);

      // Verify positions by market
      const marketPositions = await position.getAllPositionsInMarket(marketId);
      expect(marketPositions.length).to.equal(3);
      for (const posId of positions) {
        expect(marketPositions).to.include(posId);
      }

      // Transfer some positions to Bob
      await position
        .connect(alice)
        .transferFrom(alice.address, bob.address, positions[0]);
      await position
        .connect(alice)
        .transferFrom(alice.address, bob.address, positions[2]);

      expect(await position.balanceOf(alice.address)).to.equal(1);
      expect(await position.balanceOf(bob.address)).to.equal(2);

      // Verify position tracking
      const alicePositions = await position.getPositionsByOwner(alice.address);
      const bobPositions = await position.getPositionsByOwner(bob.address);

      expect(alicePositions.length).to.equal(1);
      expect(alicePositions[0]).to.equal(positions[1]);

      expect(bobPositions.length).to.equal(2);
      expect(bobPositions).to.include(positions[0]);
      expect(bobPositions).to.include(positions[2]);

      // Close all positions
      for (const posId of positions) {
        await core.connect(router).closePosition(posId, 0);
      }

      // Verify cleanup
      expect(await position.balanceOf(alice.address)).to.equal(0);
      expect(await position.balanceOf(bob.address)).to.equal(0);

      const finalMarketPositions = await position.getAllPositionsInMarket(
        marketId
      );
      expect(finalMarketPositions.length).to.equal(0);
    });

    it("should handle position lifecycle with edge case quantities", async function () {
      const { core, position, router, alice, bob, marketId } =
        await loadFixture(realPositionMarketFixture);

      const smallPositionId = await core
        .connect(router)
        .openPosition.staticCall(
          alice.address,
          marketId,
          10,
          20,
          1,
          ethers.parseUnits("1", 6)
        );
      await core
        .connect(router)
        .openPosition(
          alice.address,
          marketId,
          10,
          20,
          1,
          ethers.parseUnits("1", 6)
        );

      let positionData = await position.getPosition(smallPositionId);
      expect(positionData.quantity).to.equal(1);

      // Increase by small amount
      await core
        .connect(router)
        .increasePosition(smallPositionId, 1, ethers.parseUnits("1", 6));

      positionData = await position.getPosition(smallPositionId);
      expect(positionData.quantity).to.equal(2);

      // Transfer position
      await position
        .connect(alice)
        .transferFrom(alice.address, bob.address, smallPositionId);
      expect(await position.ownerOf(smallPositionId)).to.equal(bob.address);

      // Decrease to 1
      await core.connect(router).decreasePosition(smallPositionId, 1, 0);

      positionData = await position.getPosition(smallPositionId);
      expect(positionData.quantity).to.equal(1);

      // Close position
      await core.connect(router).closePosition(smallPositionId, 0);
      expect(await position.balanceOf(bob.address)).to.equal(0);

      // Test with larger quantities now that alpha is increased to 1 ETH
      const largePositionId = await core
        .connect(router)
        .openPosition.staticCall(
          alice.address,
          marketId,
          30,
          40,
          ethers.parseUnits("10", 6), // 10 USDC - reasonable with larger alpha
          ethers.parseUnits("50", 6)
        );
      await core
        .connect(router)
        .openPosition(
          alice.address,
          marketId,
          30,
          40,
          ethers.parseUnits("10", 6),
          ethers.parseUnits("50", 6)
        );

      positionData = await position.getPosition(largePositionId);
      expect(positionData.quantity).to.equal(ethers.parseUnits("10", 6));

      // Large operations with reasonable amounts
      await core
        .connect(router)
        .increasePosition(
          largePositionId,
          ethers.parseUnits("5", 6),
          ethers.parseUnits("25", 6)
        );

      await core
        .connect(router)
        .decreasePosition(largePositionId, ethers.parseUnits("7.5", 6), 0);

      positionData = await position.getPosition(largePositionId);
      expect(positionData.quantity).to.equal(ethers.parseUnits("7.5", 6));

      // Transfer and close
      await position
        .connect(alice)
        .transferFrom(alice.address, bob.address, largePositionId);
      await core.connect(router).closePosition(largePositionId, 0);

      expect(await position.balanceOf(bob.address)).to.equal(0);
    });
  });
});
