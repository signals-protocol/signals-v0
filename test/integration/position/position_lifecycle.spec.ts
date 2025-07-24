import { expect } from "chai";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";

import {
  coreFixture,
  createActiveMarketFixture,
  setupActiveMarket,
} from "../../helpers/fixtures/core";
import { INTEGRATION_TAG } from "../../helpers/tags";

describe(`${INTEGRATION_TAG} Position Lifecycle Integration`, function () {
  describe("Complete Position Lifecycle", function () {
    it("should handle full position lifecycle: create -> modify -> transfer -> close", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, mockPosition: position, alice, bob, charlie } = contracts;

      // 활성 마켓을 생성하고 tree를 초기화
      const marketSetup = await setupActiveMarket(contracts);
      const marketId = marketSetup.marketId;

      // Debug: 마켓 상태 확인
      const market = await core.getMarket(marketId);
      console.log("Market state:", {
        isActive: market.isActive,
        minTick: market.minTick.toString(),
        maxTick: market.maxTick.toString(),
        numTicks: market.numTicks.toString(),
        tickSpacing: market.tickSpacing.toString(),
      });

      // Phase 1: Alice creates position directly
      const positionId = await core
        .connect(alice)
        .openPosition.staticCall(
          alice.address,
          marketId,
          100450,
          100550,
          ethers.parseUnits("100", 6),
          ethers.parseUnits("10000", 6)
        );
      await core
        .connect(alice)
        .openPosition(
          alice.address,
          marketId,
          100450,
          100550,
          ethers.parseUnits("100", 6),
          ethers.parseUnits("10000", 6)
        );

      // Verify initial state
      expect(await position.ownerOf(positionId)).to.equal(alice.address);
      expect(await position.balanceOf(alice.address)).to.equal(1);

      // Phase 2: Alice increases position
      await core
        .connect(alice)
        .increasePosition(
          positionId,
          ethers.parseUnits("50", 6),
          ethers.parseUnits("5000", 6)
        );

      // Verify increased position
      const increasedPosition = await position.getPosition(positionId);
      expect(increasedPosition.quantity).to.equal(ethers.parseUnits("150", 6));

      // Phase 3: Alice decreases position
      await core
        .connect(alice)
        .decreasePosition(positionId, ethers.parseUnits("75", 6), 0);

      // Verify decreased position
      const decreasedPosition = await position.getPosition(positionId);
      expect(decreasedPosition.quantity).to.equal(ethers.parseUnits("75", 6));

      // Phase 4: Transfer to Bob
      await position
        .connect(alice)
        .transferFrom(alice.address, bob.address, positionId);

      // Verify transfer
      expect(await position.ownerOf(positionId)).to.equal(bob.address);
      expect(await position.balanceOf(alice.address)).to.equal(0);
      expect(await position.balanceOf(bob.address)).to.equal(1);

      // Phase 5: Bob closes position
      await core.connect(bob).closePosition(positionId, 0);

      // Verify position is closed
      expect(await position.balanceOf(bob.address)).to.equal(0);
    });

    it("should handle multiple positions with complex interactions", async function () {
      const { core, position, alice, bob, charlie, marketId } =
        await loadFixture(createActiveMarketFixture);

      // Alice creates multiple positions
      for (let i = 0; i < 3; i++) {
        await core
          .connect(alice)
          .openPosition(
            alice.address,
            marketId,
            100100 + i * 100,
            100200 + i * 100,
            ethers.parseUnits((i + 1).toString(), 6),
            ethers.parseUnits("1000", 6)
          );
      }

      // Bob creates overlapping positions
      for (let i = 0; i < 2; i++) {
        await core
          .connect(bob)
          .openPosition(
            bob.address,
            marketId,
            100150 + i * 100,
            100250 + i * 100,
            ethers.parseUnits((i + 2).toString(), 6),
            ethers.parseUnits("1000", 6)
          );
      }

      // Verify all positions created
      expect(await position.balanceOf(alice.address)).to.equal(3);
      expect(await position.balanceOf(bob.address)).to.equal(2);

      // Interact with positions
      await core
        .connect(alice)
        .increasePosition(
          1,
          ethers.parseUnits("0.5", 6),
          ethers.parseUnits("500", 6)
        );
      await core.connect(bob).decreasePosition(4, ethers.parseUnits("1", 6));

      // Transfer some positions
      await position
        .connect(alice)
        .transferFrom(alice.address, charlie.address, 2);

      // Final verification
      expect(await position.balanceOf(alice.address)).to.equal(2);
      expect(await position.balanceOf(bob.address)).to.equal(2);
      expect(await position.balanceOf(charlie.address)).to.equal(1);
    });

    it("should handle position lifecycle with approval mechanisms", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const {
        core,
        mockPosition: position,
        alice,
        bob,
        charlie,
        marketId,
      } = contracts;

      // Alice creates position
      const positionId = await core
        .connect(alice)
        .openPosition.staticCall(
          alice.address,
          marketId,
          100150,
          100250,
          ethers.parseUnits("100", 6),
          ethers.parseUnits("1000", 6)
        );
      await core
        .connect(alice)
        .openPosition(
          alice.address,
          marketId,
          100150,
          100250,
          ethers.parseUnits("100", 6),
          ethers.parseUnits("1000", 6)
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
        .connect(alice)
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
      await core.connect(bob).closePosition(positionId, 0);

      // Verify cleanup
      expect(await position.balanceOf(bob.address)).to.equal(0);
      await expect(
        position.getPosition(positionId)
      ).to.be.revertedWithCustomError(position, "PositionNotFound");
    });
  });

  describe("Position Lifecycle with Market Events", function () {
    it("should handle position operations during market state changes", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const {
        core,
        mockPosition: position,
        keeper,
        alice,
        bob,
        marketId,
      } = contracts;

      // Create position
      const positionId = await core
        .connect(alice)
        .openPosition.staticCall(
          alice.address,
          marketId,
          100100,
          100200,
          ethers.parseUnits("2", 6)
        );

      // Normal operations work
      await core
        .connect(alice)
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
          .connect(alice)
          .increasePosition(
            positionId,
            ethers.parseUnits("0.5", 6),
            ethers.parseUnits("5", 6)
          )
      ).to.be.revertedWithCustomError(core, "ContractPaused");

      await expect(
        core
          .connect(alice)
          .decreasePosition(positionId, ethers.parseUnits("0.5", 6), 0)
      ).to.be.revertedWithCustomError(core, "ContractPaused");

      await expect(
        core.connect(alice).closePosition(positionId, 0)
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
          .connect(alice)
          .increasePosition(
            positionId,
            ethers.parseUnits("0.5", 6),
            ethers.parseUnits("5", 6)
          )
      ).to.emit(position, "PositionUpdated");

      await expect(core.connect(alice).closePosition(positionId, 0)).to.emit(
        position,
        "PositionBurned"
      );
    });

    it("should handle position operations with market resolution", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const {
        core,
        mockPosition: position,
        keeper,
        alice,
        bob,
        marketId,
      } = contracts;

      // Create multiple positions
      const positionIds = [];
      for (let i = 0; i < 3; i++) {
        const positionId = await core
          .connect(alice)
          .openPosition.staticCall(
            alice.address,
            marketId,
            100100 + i * 50,
            100200 + i * 50,
            ethers.parseUnits("50", 6)
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
        .connect(alice)
        .increasePosition(
          positionIds[0],
          ethers.parseUnits("0.5", 6),
          ethers.parseUnits("5", 6)
        );

      await core
        .connect(alice)
        .decreasePosition(positionIds[2], ethers.parseUnits("0.3", 6), 0);

      // Close some positions
      await core.connect(alice).closePosition(positionIds[0], 0);
      await core.connect(alice).closePosition(positionIds[1], 0);

      // Final state
      expect(await position.balanceOf(alice.address)).to.equal(1);
      expect(await position.balanceOf(bob.address)).to.equal(0);

      // Last position should still exist and be manageable
      const finalData = await position.getPosition(positionIds[2]);
      expect(finalData.quantity).to.equal(ethers.parseUnits("0.7", 6));

      await core.connect(alice).closePosition(positionIds[2], 0);
      expect(await position.balanceOf(alice.address)).to.equal(0);
    });
  });

  describe("Position Lifecycle Error Recovery", function () {
    it("should handle failed operations gracefully", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, mockPosition: position, alice, bob, marketId } = contracts;

      // Create position
      const positionId = await core
        .connect(alice)
        .openPosition.staticCall(
          alice.address,
          marketId,
          100100,
          100200,
          ethers.parseUnits("1", 6)
        );

      // Try to operate on non-existent position (should fail)
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

      // Original position should be unaffected
      const positionData = await position.getPosition(positionId);
      expect(positionData.quantity).to.equal(ethers.parseUnits("1", 6));
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
          .connect(alice)
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
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, mockPosition: position, alice, marketId } = contracts;

      // Create position
      const positionId = await core
        .connect(alice)
        .openPosition.staticCall(
          alice.address,
          marketId,
          100100,
          100200,
          ethers.parseUnits("1", 6)
        );

      // Try to decrease more than available (should fail)
      await expect(
        core
          .connect(alice)
          .decreasePosition(positionId, ethers.parseUnits("2", 6), 0)
      ).to.be.reverted;

      // Position should be unchanged
      const positionData = await position.getPosition(positionId);
      expect(positionData.quantity).to.equal(ethers.parseUnits("1", 6));

      // Valid decrease should work
      await expect(
        core
          .connect(alice)
          .decreasePosition(positionId, ethers.parseUnits("0.5", 6), 0)
      ).to.emit(position, "PositionUpdated");

      // Verify final state
      const finalData = await position.getPosition(positionId);
      expect(finalData.quantity).to.equal(ethers.parseUnits("0.5", 6));
    });

    it("should handle sequential position operations", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const {
        core,
        mockPosition: position,
        alice,
        bob,
        charlie,
        marketId,
      } = contracts;

      // Create position with reasonable quantity
      const positionId = await core
        .connect(alice)
        .openPosition.staticCall(
          alice.address,
          marketId,
          100100,
          100200,
          ethers.parseUnits("5", 6)
        );

      // Sequential operations with realistic quantities
      const operations = [
        () =>
          core
            .connect(alice)
            .increasePosition(
              positionId,
              ethers.parseUnits("1", 6),
              ethers.parseUnits("5", 6)
            ),
        () =>
          core
            .connect(alice)
            .decreasePosition(positionId, ethers.parseUnits("0.5", 6), 0),
        () =>
          core
            .connect(alice)
            .increasePosition(
              positionId,
              ethers.parseUnits("2", 6),
              ethers.parseUnits("10", 6)
            ),
        () =>
          core
            .connect(alice)
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
      await core.connect(bob).closePosition(positionId, 0);
      expect(await position.balanceOf(bob.address)).to.equal(0);
    });
  });

  describe("Position Lifecycle with Complex Scenarios", function () {
    it("should handle position lifecycle with multiple markets", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, mockPosition: position, alice, bob, marketId } = contracts;

      // Note: This test assumes we can create multiple markets
      // For now, we'll use the same market but different tick ranges to simulate different "sub-markets"

      const positions = [];
      const tickRanges = [
        { lower: 100100, upper: 100200 },
        { lower: 100300, upper: 100400 },
        { lower: 100500, upper: 100600 },
      ];

      // Create positions in different tick ranges (simulating different markets)
      for (let i = 0; i < tickRanges.length; i++) {
        const positionId = await core
          .connect(alice)
          .openPosition.staticCall(
            alice.address,
            marketId,
            tickRanges[i].lower,
            tickRanges[i].upper,
            ethers.parseUnits((i + 1).toString(), 6)
          );
        positions.push(positionId);
      }

      expect(await position.balanceOf(alice.address)).to.equal(3);

      // Verify positions by market
      const marketPositions = await position.getMarketPositions(marketId);
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
        await core.connect(alice).closePosition(posId, 0);
      }

      // Verify cleanup
      expect(await position.balanceOf(alice.address)).to.equal(0);
      expect(await position.balanceOf(bob.address)).to.equal(0);

      const finalMarketPositions = await position.getMarketPositions(marketId);
      expect(finalMarketPositions.length).to.equal(0);
    });

    it("should handle position lifecycle with edge case quantities", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, mockPosition: position, alice, bob, marketId } = contracts;

      const smallPositionId = await core
        .connect(alice)
        .openPosition.staticCall(alice.address, marketId, 100100, 100200, 1);
      await core
        .connect(alice)
        .openPosition(alice.address, marketId, 100100, 100200, 1);

      let positionData = await position.getPosition(smallPositionId);
      expect(positionData.quantity).to.equal(1);

      // Increase by small amount
      await core
        .connect(alice)
        .increasePosition(smallPositionId, 1, ethers.parseUnits("1", 6));

      positionData = await position.getPosition(smallPositionId);
      expect(positionData.quantity).to.equal(2);

      // Transfer position
      await position
        .connect(alice)
        .transferFrom(alice.address, bob.address, smallPositionId);
      expect(await position.ownerOf(smallPositionId)).to.equal(bob.address);

      // Decrease to 1
      await core.connect(alice).decreasePosition(smallPositionId, 1, 0);

      positionData = await position.getPosition(smallPositionId);
      expect(positionData.quantity).to.equal(1);

      // Close position
      await core.connect(alice).closePosition(smallPositionId, 0);
      expect(await position.balanceOf(bob.address)).to.equal(0);

      // Test with larger quantities now that alpha is increased to 1 ETH
      const largePositionId = await core
        .connect(alice)
        .openPosition.staticCall(
          alice.address,
          marketId,
          100300,
          100400,
          ethers.parseUnits("10", 6)
        );
      await core
        .connect(alice)
        .openPosition(
          alice.address,
          marketId,
          100300,
          100400,
          ethers.parseUnits("10", 6)
        );

      positionData = await position.getPosition(largePositionId);
      expect(positionData.quantity).to.equal(ethers.parseUnits("10", 6));

      // Large operations with reasonable amounts
      await core
        .connect(alice)
        .increasePosition(
          largePositionId,
          ethers.parseUnits("5", 6),
          ethers.parseUnits("25", 6)
        );

      await core
        .connect(alice)
        .decreasePosition(largePositionId, ethers.parseUnits("7.5", 6), 0);

      positionData = await position.getPosition(largePositionId);
      expect(positionData.quantity).to.equal(ethers.parseUnits("7.5", 6));

      // Transfer and close
      await position
        .connect(alice)
        .transferFrom(alice.address, bob.address, largePositionId);
      await core.connect(bob).closePosition(largePositionId, 0);

      expect(await position.balanceOf(bob.address)).to.equal(0);
    });
  });
});
