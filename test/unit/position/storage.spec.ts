import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import {
  realPositionFixture,
  realPositionMarketFixture,
  createRealTestPosition,
} from "../../helpers/fixtures/position";
import { UNIT_TAG } from "../../helpers/tags";

describe(`${UNIT_TAG} Position Storage Management`, function () {
  describe("Position Data Storage", function () {
    it("should store position data correctly", async function () {
      const contracts = await loadFixture(realPositionMarketFixture);
      const { position, alice, marketId } = contracts;

      const params = {
        lowerTick: 10,
        upperTick: 20,
        quantity: ethers.parseUnits("0.01", 6),
      };

      const { positionId } = await createRealTestPosition(
        contracts,
        alice,
        marketId,
        params.lowerTick,
        params.upperTick,
        params.quantity
      );

      const positionData = await position.getPosition(positionId);
      expect(positionData.marketId).to.equal(marketId);
      expect(positionData.lowerTick).to.equal(params.lowerTick);
      expect(positionData.upperTick).to.equal(params.upperTick);
      expect(positionData.quantity).to.equal(params.quantity);
      expect(positionData.createdAt).to.be.gt(0);
    });

    it("should handle multiple positions with different data", async function () {
      const contracts = await loadFixture(realPositionMarketFixture);
      const { position, alice, bob, marketId } = contracts;

      // Alice's position
      const aliceParams = {
        lowerTick: 10,
        upperTick: 20,
        quantity: ethers.parseUnits("0.01", 6),
      };

      const { positionId: alicePositionId } = await createRealTestPosition(
        contracts,
        alice,
        marketId,
        aliceParams.lowerTick,
        aliceParams.upperTick,
        aliceParams.quantity
      );

      // Bob's position with different parameters
      const bobParams = {
        lowerTick: 30,
        upperTick: 40,
        quantity: ethers.parseUnits("0.02", 6),
      };

      const { positionId: bobPositionId } = await createRealTestPosition(
        contracts,
        bob,
        marketId,
        bobParams.lowerTick,
        bobParams.upperTick,
        bobParams.quantity
      );

      // Verify both positions stored correctly
      const alicePosition = await position.getPosition(alicePositionId);
      const bobPosition = await position.getPosition(bobPositionId);

      expect(alicePosition.lowerTick).to.equal(aliceParams.lowerTick);
      expect(alicePosition.upperTick).to.equal(aliceParams.upperTick);
      expect(alicePosition.quantity).to.equal(aliceParams.quantity);

      expect(bobPosition.lowerTick).to.equal(bobParams.lowerTick);
      expect(bobPosition.upperTick).to.equal(bobParams.upperTick);
      expect(bobPosition.quantity).to.equal(bobParams.quantity);
    });

    it("should revert getPosition for non-existent position", async function () {
      const { position } = await loadFixture(realPositionFixture);

      await expect(position.getPosition(999)).to.be.revertedWithCustomError(
        position,
        "PositionNotFound"
      );
    });
  });

  describe("Owner Token Tracking", function () {
    it("should track owner tokens correctly with EnumerableSet", async function () {
      const contracts = await loadFixture(realPositionMarketFixture);
      const { position, alice, marketId } = contracts;

      // Initially no tokens
      let aliceTokens = await position.getPositionsByOwner(alice.address);
      expect(aliceTokens.length).to.equal(0);

      // Create first position
      const { positionId: positionId1 } = await createRealTestPosition(
        contracts,
        alice,
        marketId,
        10,
        20
      );

      aliceTokens = await position.getPositionsByOwner(alice.address);
      expect(aliceTokens.length).to.equal(1);
      expect(aliceTokens[0]).to.equal(positionId1);

      // Create second position
      const { positionId: positionId2 } = await createRealTestPosition(
        contracts,
        alice,
        marketId,
        30,
        40
      );

      aliceTokens = await position.getPositionsByOwner(alice.address);
      expect(aliceTokens.length).to.equal(2);
      expect(aliceTokens).to.include(positionId1);
      expect(aliceTokens).to.include(positionId2);
    });

    it("should update owner tracking on transfer", async function () {
      const contracts = await loadFixture(realPositionMarketFixture);
      const { position, alice, bob, marketId } = contracts;

      const { positionId } = await createRealTestPosition(
        contracts,
        alice,
        marketId
      );

      // Initial state
      let aliceTokens = await position.getPositionsByOwner(alice.address);
      let bobTokens = await position.getPositionsByOwner(bob.address);
      expect(aliceTokens.length).to.equal(1);
      expect(aliceTokens[0]).to.equal(positionId);
      expect(bobTokens.length).to.equal(0);

      // Transfer
      await position
        .connect(alice)
        .transferFrom(alice.address, bob.address, positionId);

      // Updated state
      aliceTokens = await position.getPositionsByOwner(alice.address);
      bobTokens = await position.getPositionsByOwner(bob.address);
      expect(aliceTokens.length).to.equal(0);
      expect(bobTokens.length).to.equal(1);
      expect(bobTokens[0]).to.equal(positionId);
    });

    it("should handle multiple transfers correctly", async function () {
      const contracts = await loadFixture(realPositionMarketFixture);
      const { position, alice, bob, charlie, marketId } = contracts;

      // Create two positions for alice
      const { positionId: pos1 } = await createRealTestPosition(
        contracts,
        alice,
        marketId,
        10,
        20
      );

      const { positionId: pos2 } = await createRealTestPosition(
        contracts,
        alice,
        marketId,
        30,
        40
      );

      // Transfer pos1 to bob, pos2 to charlie
      await position
        .connect(alice)
        .transferFrom(alice.address, bob.address, pos1);
      await position
        .connect(alice)
        .transferFrom(alice.address, charlie.address, pos2);

      // Verify final state
      const aliceTokens = await position.getPositionsByOwner(alice.address);
      const bobTokens = await position.getPositionsByOwner(bob.address);
      const charlieTokens = await position.getPositionsByOwner(charlie.address);

      expect(aliceTokens.length).to.equal(0);
      expect(bobTokens.length).to.equal(1);
      expect(bobTokens[0]).to.equal(pos1);
      expect(charlieTokens.length).to.equal(1);
      expect(charlieTokens[0]).to.equal(pos2);
    });
  });

  describe("Market-Specific Position Queries", function () {
    it("should filter positions by market correctly", async function () {
      const contracts = await loadFixture(realPositionFixture);
      const { position, core, keeper, alice } = contracts;

      // Create two markets
      const startTime = Math.floor(Date.now() / 1000);
      const endTime = startTime + 86400;

      await core
        .connect(keeper)
        .createMarket(1, 50, startTime, endTime, ethers.parseEther("1"));
      await core
        .connect(keeper)
        .createMarket(2, 50, startTime, endTime, ethers.parseEther("1"));

      // Create positions in different markets
      const { positionId: pos1 } = await createRealTestPosition(
        contracts,
        alice,
        1,
        10,
        20
      );

      const { positionId: pos2 } = await createRealTestPosition(
        contracts,
        alice,
        2,
        10,
        20
      );

      const { positionId: pos3 } = await createRealTestPosition(
        contracts,
        alice,
        1,
        30,
        40
      );

      // Query positions by market
      const market1Positions = await position.getUserPositionsInMarket(
        alice.address,
        1
      );
      const market2Positions = await position.getUserPositionsInMarket(
        alice.address,
        2
      );

      expect(market1Positions.length).to.equal(2);
      expect(market1Positions).to.include(pos1);
      expect(market1Positions).to.include(pos3);

      expect(market2Positions.length).to.equal(1);
      expect(market2Positions[0]).to.equal(pos2);
    });

    it("should return empty array for non-existent market", async function () {
      const { position, alice } = await loadFixture(realPositionFixture);

      const positions = await position.getUserPositionsInMarket(
        alice.address,
        999
      );
      expect(positions.length).to.equal(0);
    });

    it("should handle empty positions for user", async function () {
      const { position, alice, marketId } = await loadFixture(
        realPositionMarketFixture
      );

      const positions = await position.getUserPositionsInMarket(
        alice.address,
        marketId
      );
      expect(positions.length).to.equal(0);
    });
  });

  describe("Position ID Management", function () {
    it("should increment position IDs correctly", async function () {
      const contracts = await loadFixture(realPositionMarketFixture);
      const { position, alice, marketId } = contracts;

      const { positionId: pos1 } = await createRealTestPosition(
        contracts,
        alice,
        marketId
      );

      const { positionId: pos2 } = await createRealTestPosition(
        contracts,
        alice,
        marketId,
        20,
        30
      );

      expect(pos2).to.equal(pos1 + 1n);
      expect(await position.getNextId()).to.equal(pos2 + 1n);
    });

    it("should maintain ID sequence after burns", async function () {
      const contracts = await loadFixture(realPositionMarketFixture);
      const { position, core, router, alice, marketId } = contracts;

      const { positionId: pos1 } = await createRealTestPosition(
        contracts,
        alice,
        marketId
      );

      // Burn position by decreasing to zero
      const positionData = await position.getPosition(pos1);
      await core
        .connect(router)
        .decreasePosition(pos1, positionData.quantity, 0);

      // Create new position - should continue sequence
      const { positionId: pos2 } = await createRealTestPosition(
        contracts,
        alice,
        marketId,
        20,
        30
      );

      expect(pos2).to.equal(pos1 + 1n);
    });
  });

  describe("Data Cleanup on Burn", function () {
    it("should clean up position data on burn", async function () {
      const contracts = await loadFixture(realPositionMarketFixture);
      const { position, core, router, alice, marketId } = contracts;

      const { positionId } = await createRealTestPosition(
        contracts,
        alice,
        marketId
      );

      // Verify position exists
      const positionData = await position.getPosition(positionId);
      expect(positionData.quantity).to.be.gt(0);

      // Burn position
      await core
        .connect(router)
        .decreasePosition(positionId, positionData.quantity, 0);

      // Verify position data is cleaned up
      await expect(
        position.getPosition(positionId)
      ).to.be.revertedWithCustomError(position, "PositionNotFound");
    });

    it("should remove from owner tracking on burn", async function () {
      const contracts = await loadFixture(realPositionMarketFixture);
      const { position, core, router, alice, marketId } = contracts;

      const { positionId } = await createRealTestPosition(
        contracts,
        alice,
        marketId
      );

      // Verify position is tracked
      let aliceTokens = await position.getPositionsByOwner(alice.address);
      expect(aliceTokens.length).to.equal(1);
      expect(aliceTokens[0]).to.equal(positionId);

      // Burn position
      const positionData = await position.getPosition(positionId);
      await core
        .connect(router)
        .decreasePosition(positionId, positionData.quantity, 0);

      // Verify position is removed from tracking
      aliceTokens = await position.getPositionsByOwner(alice.address);
      expect(aliceTokens.length).to.equal(0);
    });
  });

  describe("Gas Optimization Verification", function () {
    it("should use EnumerableSet for O(1) operations", async function () {
      const contracts = await loadFixture(realPositionMarketFixture);
      const { position, alice, marketId } = contracts;

      // Create multiple positions
      const positions = [];
      for (let i = 0; i < 5; i++) {
        const { positionId } = await createRealTestPosition(
          contracts,
          alice,
          marketId,
          10 + i,
          20 + i
        );
        positions.push(positionId);
      }

      // Verify all positions are tracked
      const aliceTokens = await position.getPositionsByOwner(alice.address);
      expect(aliceTokens.length).to.equal(5);

      // Transfer middle position to test removal efficiency
      const middlePosition = positions[2];
      const { bob } = contracts;

      await position
        .connect(alice)
        .transferFrom(alice.address, bob.address, middlePosition);

      // Verify efficient removal
      const updatedAliceTokens = await position.getPositionsByOwner(
        alice.address
      );
      const bobTokens = await position.getPositionsByOwner(bob.address);

      expect(updatedAliceTokens.length).to.equal(4);
      expect(bobTokens.length).to.equal(1);
      expect(bobTokens[0]).to.equal(middlePosition);
      expect(updatedAliceTokens).to.not.include(middlePosition);
    });
  });
});
