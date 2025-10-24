import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";

import { activePositionMarketFixture } from "../../helpers/fixtures/position";
import { COMPONENT_TAG } from "../../helpers/tags";

describe(`${COMPONENT_TAG} Core ↔ Position Integration`, function () {
  this.timeout(120000);
  this.slow(60000);
  const POSITION_QUANTITY = ethers.parseUnits("10", 6);
  const POSITION_MAX_COST = ethers.parseUnits("1000", 6);
  const INCREASE_COST_BUFFER = ethers.parseUnits("500", 6);
  const COST_BUFFER = ethers.parseUnits("100", 6);

  async function quoteIncreaseCost(
    coreContract: any,
    positionId: bigint,
    amount: bigint
  ) {
    const quote = await coreContract.calculateIncreaseCost(positionId, amount);
    return quote + COST_BUFFER;
  }

  describe("Position Minting via Core", function () {
    it("should mint position when Core.openPosition is called", async function () {
      const { core, position, alice, marketId } = await loadFixture(
        activePositionMarketFixture
      );

      const params = {
        marketId,
        lowerTick: 100100,
        upperTick: 100200,
        quantity: POSITION_QUANTITY,
        maxCost: POSITION_MAX_COST,
      };

      // Check initial state
      expect(await position.balanceOf(alice.address)).to.equal(0);

      // Open position through Core
      const positionId = await core
        .connect(alice)
        .openPosition.staticCall(
          params.marketId,
          params.lowerTick,
          params.upperTick,
          params.quantity,
          params.maxCost
        );

      await expect(
        core
          .connect(alice)
          .openPosition(
            params.marketId,
            params.lowerTick,
            params.upperTick,
            params.quantity,
            params.maxCost
          )
      )
        .to.emit(position, "PositionMinted")
        .withArgs(
          positionId,
          alice.address,
          marketId,
          100100,
          100200,
          params.quantity
        )
        .and.to.emit(core, "PositionOpened");

      // Verify position was minted
      expect(await position.balanceOf(alice.address)).to.equal(1);
      expect(await position.ownerOf(positionId)).to.equal(alice.address);

      // Verify position data
      const positionData = await position.getPosition(positionId);
      expect(positionData.marketId).to.equal(marketId);
      expect(positionData.lowerTick).to.equal(100100);
      expect(positionData.upperTick).to.equal(100200);
      expect(positionData.quantity).to.equal(params.quantity);
    });

    it("should handle multiple position mints correctly", async function () {
      const { core, position, alice, bob, marketId } = await loadFixture(
        activePositionMarketFixture
      );

      // Alice opens first position
      await core
        .connect(alice)
        .openPosition(
          marketId,
          100100,
          100200,
          POSITION_QUANTITY,
          POSITION_MAX_COST
        );

      // Bob opens second position
      await core
        .connect(bob)
        .openPosition(
          marketId,
          100300,
          100400,
          POSITION_QUANTITY,
          POSITION_MAX_COST
        );

      // Verify balances
      expect(await position.balanceOf(alice.address)).to.equal(1);
      expect(await position.balanceOf(bob.address)).to.equal(1);

      // Verify ownership
      expect(await position.ownerOf(1)).to.equal(alice.address);
      expect(await position.ownerOf(2)).to.equal(bob.address);

      // Verify balances remain consistent
      expect(await position.balanceOf(alice.address)).to.equal(1);
      expect(await position.balanceOf(bob.address)).to.equal(1);
    });

    it("should revert position mint when Core authorization fails", async function () {
      const { position, alice, marketId } = await loadFixture(
        activePositionMarketFixture
      );

      // Try to mint directly (not through Core)
      await expect(
        position
          .connect(alice)
          .mintPosition(
            alice.address,
            marketId,
            100100,
            100200,
            ethers.parseUnits("1", 6)
          )
      ).to.be.revertedWithCustomError(position, "UnauthorizedCaller");
    });

    it("should handle position mint with edge case parameters", async function () {
      const { core, position, alice, marketId } = await loadFixture(
        activePositionMarketFixture
      );

      await expect(
        core
          .connect(alice)
          .openPosition(
            marketId,
            100500,
            100500,
            POSITION_QUANTITY,
            POSITION_MAX_COST
          )
      ).to.be.revertedWithCustomError(core, "InvalidTickRange");
    });
  });

  describe("Position Updates via Core", function () {
    it("should update position quantity when Core.increasePosition is called", async function () {
      const { core, position, alice, marketId } = await loadFixture(
        activePositionMarketFixture
      );

      // Open initial position
      const params = {
        marketId,
        lowerTick: 100100,
        upperTick: 100200,
        quantity: POSITION_QUANTITY,
        maxCost: POSITION_MAX_COST,
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

      const initialData = await position.getPosition(positionId);
      const initialQuantity = initialData.quantity;

      // Increase position
      const increaseAmount = ethers.parseUnits("5", 6);
      const increaseCost = await quoteIncreaseCost(
        core,
        positionId,
        increaseAmount
      );
      await expect(
        core
          .connect(alice)
          .increasePosition(
            positionId,
            increaseAmount,
            increaseCost
          )
      )
        .to.emit(position, "PositionUpdated")
        .withArgs(
          positionId,
          initialQuantity,
          initialQuantity + increaseAmount
        );

      // Verify updated quantity
      const updatedData = await position.getPosition(positionId);
      expect(updatedData.quantity).to.equal(initialQuantity + increaseAmount);
    });

    it("should update position quantity when Core.decreasePosition is called", async function () {
      const { core, position, alice, marketId } = await loadFixture(
        activePositionMarketFixture
      );

      // Open initial position
      const params = {
        marketId,
        lowerTick: 100100,
        upperTick: 100200,
        quantity: POSITION_QUANTITY,
        maxCost: POSITION_MAX_COST,
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

      const initialData = await position.getPosition(positionId);
      const initialQuantity = initialData.quantity;

      // Decrease position
      const decreaseAmount = ethers.parseUnits("0.5", 6);
      await expect(
        core.connect(alice).decreasePosition(positionId, decreaseAmount, 0)
      )
        .to.emit(position, "PositionUpdated")
        .withArgs(
          positionId,
          initialQuantity,
          initialQuantity - decreaseAmount
        );

      // Verify updated quantity
      const updatedData = await position.getPosition(positionId);
      expect(updatedData.quantity).to.equal(initialQuantity - decreaseAmount);
    });

    it("should revert position update when called directly", async function () {
      const { position, alice, marketId } = await loadFixture(
        activePositionMarketFixture
      );

      await expect(
        position
          .connect(alice)
          .updateQuantity(1, POSITION_QUANTITY)
      ).to.be.revertedWithCustomError(position, "UnauthorizedCaller");
    });

    it("should handle multiple sequential updates", async function () {
      const { core, position, alice, marketId } = await loadFixture(
        activePositionMarketFixture
      );

      // Open initial position
      const params = {
        marketId,
        lowerTick: 100100,
        upperTick: 100200,
        quantity: POSITION_QUANTITY,
        maxCost: POSITION_MAX_COST,
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

      let currentData = await position.getPosition(positionId);
      let currentQuantity = currentData.quantity;

      // Multiple increases and decreases
      const operations = [
        async () => {
          const amount = ethers.parseUnits("5", 6);
          const cost = await quoteIncreaseCost(core, positionId, amount);
          await core
            .connect(alice)
            .increasePosition(positionId, amount, cost);
          currentQuantity += amount;
        },
        async () => {
          const amount = ethers.parseUnits("2", 6);
          await core
            .connect(alice)
            .decreasePosition(positionId, amount, 0);
          currentQuantity -= amount;
        },
        async () => {
          const amount = ethers.parseUnits("6", 6);
          const cost = await quoteIncreaseCost(core, positionId, amount);
          await core
            .connect(alice)
            .increasePosition(positionId, amount, cost);
          currentQuantity += amount;
        },
        async () => {
          const amount = ethers.parseUnits("3", 6);
          await core
            .connect(alice)
            .decreasePosition(positionId, amount, 0);
          currentQuantity -= amount;
        },
      ];

      for (const op of operations) {
        await op();
        const updatedData = await position.getPosition(positionId);
        expect(updatedData.quantity).to.equal(currentQuantity);
      }
    });
  });

  describe("Position Burning via Core", function () {
    it("should burn position when Core.closePosition is called", async function () {
      const { core, position, alice, marketId } = await loadFixture(
        activePositionMarketFixture
      );

      // Open position
      const params = {
        marketId,
        lowerTick: 100100,
        upperTick: 100200,
        quantity: POSITION_QUANTITY,
        maxCost: POSITION_MAX_COST,
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

      // Verify position exists
      expect(await position.balanceOf(alice.address)).to.equal(1);
      expect(await position.ownerOf(positionId)).to.equal(alice.address);

      // Close position
      await expect(core.connect(alice).closePosition(positionId, 0))
        .to.emit(position, "PositionBurned")
        .withArgs(positionId, alice.address)
        .and.to.emit(core, "PositionClosed");

      // Verify position is burned
      expect(await position.balanceOf(alice.address)).to.equal(0);
      await expect(position.ownerOf(positionId)).to.be.revertedWithCustomError(
        position,
        "ERC721NonexistentToken"
      );
      await expect(
        position.getPosition(positionId)
      ).to.be.revertedWithCustomError(position, "PositionNotFound");
    });

    it("should burn position when decreased to zero", async function () {
      const { core, position, alice, marketId } = await loadFixture(
        activePositionMarketFixture
      );

      // Open position
      const params = {
        marketId,
        lowerTick: 100100,
        upperTick: 100200,
        quantity: POSITION_QUANTITY,
        maxCost: POSITION_MAX_COST,
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

      const positionData = await position.getPosition(positionId);

      // Decrease to zero (should burn)
      await expect(
        core
          .connect(alice)
          .decreasePosition(positionId, positionData.quantity, 0)
      )
        .to.emit(position, "PositionBurned")
        .withArgs(positionId, alice.address);

      // Verify position is burned
      expect(await position.balanceOf(alice.address)).to.equal(0);
      await expect(
        position.getPosition(positionId)
      ).to.be.revertedWithCustomError(position, "PositionNotFound");
    });

    it("should revert position burn when called directly", async function () {
      const { position, alice } = await loadFixture(
        activePositionMarketFixture
      );

      await expect(
        position.connect(alice).burn(1)
      ).to.be.revertedWithCustomError(position, "UnauthorizedCaller");
    });

    it("should handle burning multiple positions", async function () {
      const { core, position, alice, marketId } = await loadFixture(
        activePositionMarketFixture
      );

      // Open multiple positions
      const positions = [];
      for (let i = 0; i < 3; i++) {
        const params = {
          marketId,
          lowerTick: 100100 + i * 100,
          upperTick: 100200 + i * 100,
          quantity: POSITION_QUANTITY,
          maxCost: POSITION_MAX_COST,
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
        positions.push(positionId);
      }

      expect(await position.balanceOf(alice.address)).to.equal(3);

      // Close all positions
      for (const positionId of positions) {
        await core.connect(alice).closePosition(positionId, 0);
      }

      expect(await position.balanceOf(alice.address)).to.equal(0);

      // Verify all positions are burned
      for (const positionId of positions) {
        await expect(
          position.getPosition(positionId)
        ).to.be.revertedWithCustomError(position, "PositionNotFound");
      }
    });
  });

  describe("Position State Consistency", function () {
    it("should maintain consistent state across Core operations", async function () {
      const { core, position, alice, marketId } = await loadFixture(
        activePositionMarketFixture
      );

      // Open position
      const params = {
        marketId,
        lowerTick: 100100,
        upperTick: 100200,
        quantity: POSITION_QUANTITY,
        maxCost: POSITION_MAX_COST,
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
      let positionData = await position.getPosition(positionId);
      expect(positionData.quantity).to.equal(params.quantity);

      // Increase position
      const increaseAmount = ethers.parseUnits("2", 6);
      await core
        .connect(alice)
        .increasePosition(positionId, increaseAmount, INCREASE_COST_BUFFER);

      positionData = await position.getPosition(positionId);
      expect(positionData.quantity).to.equal(params.quantity + increaseAmount);

      // Decrease position
      const decreaseAmount = ethers.parseUnits("4", 6);
      await core
        .connect(alice)
        .decreasePosition(positionId, decreaseAmount, 0);

      positionData = await position.getPosition(positionId);
      expect(positionData.quantity).to.equal(
        params.quantity + increaseAmount - decreaseAmount
      );

      // Close position
      await core.connect(alice).closePosition(positionId, 0);

      // Verify position is completely removed
      await expect(
        position.getPosition(positionId)
      ).to.be.revertedWithCustomError(position, "PositionNotFound");
    });

    it("should handle Core operations with different users", async function () {
      const { core, position, alice, bob, charlie, marketId } =
        await loadFixture(activePositionMarketFixture);

      const users = [alice, bob, charlie];
      const positionIds = [];

      // Each user opens a position
      for (let i = 0; i < users.length; i++) {
        const params = {
          marketId,
          lowerTick: 100100 + i * 50,
          upperTick: 100200 + i * 50,
          quantity: POSITION_QUANTITY,
          maxCost: POSITION_MAX_COST,
        };

        const positionId = await core
          .connect(users[i])
          .openPosition.staticCall(
            params.marketId,
            params.lowerTick,
            params.upperTick,
            params.quantity,
            params.maxCost
          );
        await core
          .connect(users[i])
          .openPosition(
            params.marketId,
            params.lowerTick,
            params.upperTick,
            params.quantity,
            params.maxCost
          );
        positionIds.push(positionId);

        // Verify ownership
        expect(await position.ownerOf(positionId)).to.equal(users[i].address);
      }

      // Verify each user's balance
      for (let i = 0; i < users.length; i++) {
        expect(await position.balanceOf(users[i].address)).to.equal(1);
        expect(await position.ownerOf(positionIds[i])).to.equal(
          users[i].address
        );
      }

      // Alice increases her position
      const aliceIncreaseAmount = ethers.parseUnits("5", 6);
      const aliceIncreaseCost = await quoteIncreaseCost(
        core,
        positionIds[0],
        aliceIncreaseAmount
      );
      await core
        .connect(alice)
        .increasePosition(
          positionIds[0],
          aliceIncreaseAmount,
          aliceIncreaseCost
        );

      // Bob closes his position
      await core.connect(bob).closePosition(positionIds[1], 0);

      // Charlie decreases his position
      await core
        .connect(charlie)
        .decreasePosition(positionIds[2], ethers.parseUnits("2", 6), 0);

      // Verify final states
      expect(await position.balanceOf(alice.address)).to.equal(1);
      expect(await position.balanceOf(bob.address)).to.equal(0);
      expect(await position.balanceOf(charlie.address)).to.equal(1);

      const alicePosition = await position.getPosition(positionIds[0]);
      expect(alicePosition.quantity).to.equal(
        POSITION_QUANTITY + aliceIncreaseAmount
      );

      await expect(
        position.getPosition(positionIds[1])
      ).to.be.revertedWithCustomError(position, "PositionNotFound");

      const charliePosition = await position.getPosition(positionIds[2]);
      expect(charliePosition.quantity).to.equal(POSITION_QUANTITY - ethers.parseUnits("2", 6));
    });
  });

  describe("Error Handling and Edge Cases", function () {
    it("should handle Core operations on non-existent positions", async function () {
      const { core, alice } = await loadFixture(activePositionMarketFixture);

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
    });

    it("should handle position operations during market state changes", async function () {
      const { core, position, keeper, alice, marketId } = await loadFixture(
        activePositionMarketFixture
      );

      // Open position
      const params = {
        marketId,
        lowerTick: 100100,
        upperTick: 100200,
        quantity: POSITION_QUANTITY,
        maxCost: POSITION_MAX_COST,
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

      const increaseAmount = ethers.parseUnits("5", 6);
      const increaseCost = await quoteIncreaseCost(
        core,
        positionId,
        increaseAmount
      );

      // Pause the contract
      await core.connect(keeper).pause("Paused");

      // Operations should fail when paused
      await expect(
        core
          .connect(alice)
          .increasePosition(positionId, increaseAmount, increaseCost)
      ).to.be.revertedWithCustomError(core, "EnforcedPause");

      // Unpause and operations should work again
      await core.connect(keeper).unpause();

      await expect(
        core
          .connect(alice)
          .increasePosition(positionId, increaseAmount, increaseCost)
      ).to.emit(position, "PositionUpdated");
    });

    it("should maintain position integrity during sequential operations", async function () {
      const { core, position, alice, marketId } = await loadFixture(
        activePositionMarketFixture
      );

      // Open position with realistic quantity
      const params = {
        marketId,
        lowerTick: 100100,
        upperTick: 100200,
        quantity: POSITION_QUANTITY,
        maxCost: POSITION_MAX_COST,
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

      // Sequential operations with realistic quantities
      const operations = [
        async () => {
          const amount = ethers.parseUnits("5", 6);
          const cost = await quoteIncreaseCost(core, positionId, amount);
          await core
            .connect(alice)
            .increasePosition(positionId, amount, cost);
        },
        async () => {
          await core
            .connect(alice)
            .decreasePosition(positionId, ethers.parseUnits("2", 6), 0);
        },
        async () => {
          const amount = ethers.parseUnits("6", 6);
          const cost = await quoteIncreaseCost(core, positionId, amount);
          await core
            .connect(alice)
            .increasePosition(positionId, amount, cost);
        },
        async () => {
          await core
            .connect(alice)
            .decreasePosition(positionId, ethers.parseUnits("3", 6), 0);
        },
      ];

      // Execute all operations
      for (const operation of operations) {
        await operation();
      }

      // Verify final state is consistent
      const finalData = await position.getPosition(positionId);
      expect(finalData.quantity).to.equal(
        params.quantity + ethers.parseUnits("6", 6)
      );

      // Position should still be owned by Alice
      expect(await position.ownerOf(positionId)).to.equal(alice.address);
      expect(await position.balanceOf(alice.address)).to.equal(1);
    });
  });
});
