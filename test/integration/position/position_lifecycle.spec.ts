import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";

import { createActiveMarketFixture } from "../../helpers/fixtures/core";
import {
  listMarketPositions,
  openPositionWithQuote,
  quoteIncreaseCostWithBuffer,
} from "../../helpers/fixtures/position";
import { INTEGRATION_TAG } from "../../helpers/tags";

const parse6 = (value: string) => ethers.parseUnits(value, 6);

async function openWithQuote(
  core: any,
  signer: any,
  params: {
    marketId: number;
    lowerTick: number;
    upperTick: number;
    quantity: bigint;
    bufferBps?: bigint;
    maxCost?: bigint;
  }
) {
  const { positionId } = await openPositionWithQuote(core, signer, params);
  return positionId;
}

async function increaseWithQuote(
  core: any,
  signer: any,
  positionId: bigint,
  amount: bigint,
  bufferBps: bigint = 1000n
) {
  const maxCost = await quoteIncreaseCostWithBuffer(
    core,
    positionId,
    amount,
    bufferBps
  );
  await core.connect(signer).increasePosition(positionId, amount, maxCost);
}

describe(`${INTEGRATION_TAG} Position Lifecycle Integration`, function () {
  describe("Complete Position Lifecycle", function () {
    it("should handle full position lifecycle: create -> modify -> transfer -> close", async function () {
      const { core, mockPosition: position, alice, bob, marketId } =
        await loadFixture(createActiveMarketFixture);

      const positionId = await openWithQuote(core, alice, {
        marketId,
        lowerTick: 100450,
        upperTick: 100550,
        quantity: parse6("20"),
      });

      expect(await position.ownerOf(positionId)).to.equal(alice.address);
      expect(await position.balanceOf(alice.address)).to.equal(1n);

      await increaseWithQuote(core, alice, positionId, parse6("8"));

      await core
        .connect(alice)
        .decreasePosition(positionId, parse6("12"), 0);

      const updatedPosition = await position.getPosition(positionId);
      expect(updatedPosition.quantity).to.equal(parse6("16"));

      await position
        .connect(alice)
        .transferFrom(alice.address, bob.address, positionId);

      expect(await position.ownerOf(positionId)).to.equal(bob.address);
      expect(await position.balanceOf(alice.address)).to.equal(0n);
      expect(await position.balanceOf(bob.address)).to.equal(1n);

      await core.connect(bob).closePosition(positionId, 0);

      expect(await position.balanceOf(bob.address)).to.equal(0n);
    });

    it("should handle multiple positions with complex interactions", async function () {
      const { core, mockPosition: position, alice, bob, charlie, marketId } =
        await loadFixture(createActiveMarketFixture);

      const aliceRanges = [
        { lower: 100100, upper: 100200, quantity: "20" },
        { lower: 100200, upper: 100300, quantity: "25" },
        { lower: 100300, upper: 100400, quantity: "30" },
      ];

      const bobRanges = [
        { lower: 100150, upper: 100250, quantity: "18" },
        { lower: 100250, upper: 100350, quantity: "22" },
      ];

      const alicePositionIds: bigint[] = [];
      for (const entry of aliceRanges) {
        const positionId = await openWithQuote(core, alice, {
          marketId,
          lowerTick: entry.lower,
          upperTick: entry.upper,
          quantity: parse6(entry.quantity),
        });
        alicePositionIds.push(positionId);
      }

      const bobPositionIds: bigint[] = [];
      for (const entry of bobRanges) {
        const positionId = await openWithQuote(core, bob, {
          marketId,
          lowerTick: entry.lower,
          upperTick: entry.upper,
          quantity: parse6(entry.quantity),
        });
        bobPositionIds.push(positionId);
      }

      expect(await position.balanceOf(alice.address)).to.equal(3n);
      expect(await position.balanceOf(bob.address)).to.equal(2n);

      await increaseWithQuote(core, alice, alicePositionIds[0], parse6("5"));
      await core
        .connect(bob)
        .decreasePosition(bobPositionIds[1], parse6("6"), 0);

      await position
        .connect(alice)
        .transferFrom(alice.address, charlie.address, alicePositionIds[1]);

      expect(await position.balanceOf(alice.address)).to.equal(2n);
      expect(await position.balanceOf(bob.address)).to.equal(2n);
      expect(await position.balanceOf(charlie.address)).to.equal(1n);
    });

    it("should handle position lifecycle with approval mechanisms", async function () {
      const { core, mockPosition: position, alice, bob, charlie, marketId } =
        await loadFixture(createActiveMarketFixture);

      const positionId = await openWithQuote(core, alice, {
        marketId,
        lowerTick: 100150,
        upperTick: 100250,
        quantity: parse6("24"),
      });

      await expect(position.connect(alice).approve(bob.address, positionId))
        .to.emit(position, "Approval")
        .withArgs(alice.address, bob.address, positionId);

      await expect(
        position
          .connect(bob)
          .transferFrom(alice.address, charlie.address, positionId)
      )
        .to.emit(position, "Transfer")
        .withArgs(alice.address, charlie.address, positionId);

      await expect(
        position.connect(charlie).setApprovalForAll(alice.address, true)
      )
        .to.emit(position, "ApprovalForAll")
        .withArgs(charlie.address, alice.address, true);

      const increaseAmount = parse6("6");
      const increaseCost = await quoteIncreaseCostWithBuffer(
        core,
        positionId,
        increaseAmount
      );

      await expect(
        core
          .connect(charlie)
          .increasePosition(positionId, increaseAmount, increaseCost)
      ).to.emit(position, "PositionUpdated");

      await position
        .connect(alice)
        .transferFrom(charlie.address, bob.address, positionId);
      expect(await position.ownerOf(positionId)).to.equal(bob.address);

      await core.connect(bob).closePosition(positionId, 0);
      expect(await position.balanceOf(bob.address)).to.equal(0n);
    });
  });

  describe("Position Lifecycle with Market Events", function () {
    it("should handle position operations during market state changes", async function () {
      const { core, mockPosition: position, keeper, alice, bob, marketId } =
        await loadFixture(createActiveMarketFixture);

      const positionId = await openWithQuote(core, alice, {
        marketId,
        lowerTick: 100100,
        upperTick: 100200,
        quantity: parse6("15"),
      });

      await increaseWithQuote(core, alice, positionId, parse6("5"));

      await core.connect(keeper).pause("maintenance");

      const pausedCost = await quoteIncreaseCostWithBuffer(
        core,
        positionId,
        parse6("5")
      );

      await expect(
        core
          .connect(alice)
          .increasePosition(positionId, parse6("5"), pausedCost)
      ).to.be.revertedWithCustomError(core, "EnforcedPause");

      await expect(
        core
          .connect(alice)
          .decreasePosition(positionId, parse6("6"), 0)
      ).to.be.revertedWithCustomError(core, "EnforcedPause");

      await expect(
        core.connect(alice).closePosition(positionId, 0)
      ).to.be.revertedWithCustomError(core, "EnforcedPause");

      await expect(
        position
          .connect(alice)
          .transferFrom(alice.address, bob.address, positionId)
      )
        .to.emit(position, "Transfer")
        .withArgs(alice.address, bob.address, positionId);

      await core.connect(keeper).unpause();

      const resumedCost = await quoteIncreaseCostWithBuffer(
        core,
        positionId,
        parse6("4")
      );
      await core
        .connect(bob)
        .increasePosition(positionId, parse6("4"), resumedCost);

      await expect(core.connect(bob).closePosition(positionId, 0)).to.emit(
        position,
        "PositionBurned"
      );
    });

    it("should handle position operations with market resolution", async function () {
      const { core, mockPosition: position, keeper, alice, bob, marketId } =
        await loadFixture(createActiveMarketFixture);

      const positionIds: bigint[] = [];
      for (let i = 0; i < 3; i++) {
        const positionId = await openWithQuote(core, alice, {
          marketId,
          lowerTick: 100100 + i * 50,
          upperTick: 100200 + i * 50,
          quantity: parse6("18"),
        });
        positionIds.push(positionId);
      }

      await position
        .connect(alice)
        .transferFrom(alice.address, bob.address, positionIds[1]);

      expect(await position.balanceOf(alice.address)).to.equal(2n);
      expect(await position.balanceOf(bob.address)).to.equal(1n);

      await increaseWithQuote(core, alice, positionIds[0], parse6("6"));
      await core
        .connect(alice)
        .decreasePosition(positionIds[2], parse6("5"), 0);

      await core.connect(alice).closePosition(positionIds[0], 0);
      await core.connect(bob).closePosition(positionIds[1], 0);

      expect(await position.balanceOf(alice.address)).to.equal(1n);
      expect(await position.balanceOf(bob.address)).to.equal(0n);

      const finalPosition = await position.getPosition(positionIds[2]);
      expect(finalPosition.quantity).to.equal(parse6("13"));

      await core.connect(alice).closePosition(positionIds[2], 0);
      expect(await position.balanceOf(alice.address)).to.equal(0n);
    });
  });

  describe("Position Lifecycle Error Recovery", function () {
    it("should handle failed operations gracefully", async function () {
      const { core, mockPosition: position, alice, bob, marketId } =
        await loadFixture(createActiveMarketFixture);

      const positionId = await openWithQuote(core, alice, {
        marketId,
        lowerTick: 100100,
        upperTick: 100200,
        quantity: parse6("12"),
      });

      const nonExistentId = 999n;
      const bogusCost = await quoteIncreaseCostWithBuffer(
        core,
        positionId,
        parse6("6")
      );

      await expect(
        core
          .connect(alice)
          .increasePosition(nonExistentId, parse6("6"), bogusCost)
      ).to.be.reverted;

      const positionData = await position.getPosition(positionId);
      expect(positionData.quantity).to.equal(parse6("12"));
      expect(await position.ownerOf(positionId)).to.equal(alice.address);

      await expect(
        position
          .connect(bob)
          .transferFrom(alice.address, bob.address, positionId)
      ).to.be.revertedWithCustomError(position, "ERC721InsufficientApproval");

      const increaseCost = await quoteIncreaseCostWithBuffer(
        core,
        positionId,
        parse6("6")
      );
      await expect(
        core
          .connect(alice)
          .increasePosition(positionId, parse6("6"), increaseCost)
      ).to.emit(position, "PositionUpdated");

      await expect(
        position
          .connect(alice)
          .transferFrom(alice.address, bob.address, positionId)
      ).to.emit(position, "Transfer");

      expect(await position.ownerOf(positionId)).to.equal(bob.address);
    });

    it("should handle position operations with insufficient funds gracefully", async function () {
      const { core, mockPosition: position, alice, marketId } =
        await loadFixture(createActiveMarketFixture);

      const positionId = await openWithQuote(core, alice, {
        marketId,
        lowerTick: 100100,
        upperTick: 100200,
        quantity: parse6("12"),
      });

      await expect(
        core
          .connect(alice)
          .decreasePosition(positionId, parse6("20"), 0)
      ).to.be.reverted;

      const positionData = await position.getPosition(positionId);
      expect(positionData.quantity).to.equal(parse6("12"));

      await expect(
        core
          .connect(alice)
          .decreasePosition(positionId, parse6("6"), 0)
      ).to.emit(position, "PositionUpdated");

      const finalState = await position.getPosition(positionId);
      expect(finalState.quantity).to.equal(parse6("6"));
    });

    it("should handle sequential position operations", async function () {
      const { core, mockPosition: position, alice, bob, charlie, marketId } =
        await loadFixture(createActiveMarketFixture);

      const positionId = await openWithQuote(core, alice, {
        marketId,
        lowerTick: 100100,
        upperTick: 100200,
        quantity: parse6("20"),
      });

      const operations: Array<() => Promise<void>> = [
        async () => {
          const cost = await quoteIncreaseCostWithBuffer(
            core,
            positionId,
            parse6("5")
          );
          await core
            .connect(alice)
            .increasePosition(positionId, parse6("5"), cost);
        },
        async () => {
          await core
            .connect(alice)
            .decreasePosition(positionId, parse6("4"), 0);
        },
        async () => {
          const cost = await quoteIncreaseCostWithBuffer(
            core,
            positionId,
            parse6("8")
          );
          await core
            .connect(alice)
            .increasePosition(positionId, parse6("8"), cost);
        },
        async () => {
          await position
            .connect(alice)
            .transferFrom(alice.address, bob.address, positionId);
        },
        async () => {
          const cost = await quoteIncreaseCostWithBuffer(
            core,
            positionId,
            parse6("6")
          );
          await core
            .connect(bob)
            .increasePosition(positionId, parse6("6"), cost);
        },
        async () => {
          await position
            .connect(bob)
            .transferFrom(bob.address, charlie.address, positionId);
        },
        async () => {
          const cost = await quoteIncreaseCostWithBuffer(
            core,
            positionId,
            parse6("4")
          );
          await core
            .connect(charlie)
            .increasePosition(positionId, parse6("4"), cost);
        },
        async () => {
          await core
            .connect(charlie)
            .decreasePosition(positionId, parse6("9"), 0);
        },
      ];

      for (const operation of operations) {
        await operation();
      }

      const finalPosition = await position.getPosition(positionId);
      expect(finalPosition.quantity).to.equal(parse6("30"));

      await position
        .connect(charlie)
        .transferFrom(charlie.address, bob.address, positionId);
      expect(await position.ownerOf(positionId)).to.equal(bob.address);

      await core.connect(bob).closePosition(positionId, 0);
      expect(await position.balanceOf(bob.address)).to.equal(0n);
    });
  });

  describe("Position Lifecycle with Complex Scenarios", function () {
    it("should handle position lifecycle with multiple markets", async function () {
      const { core, mockPosition: position, alice, bob, marketId } =
        await loadFixture(createActiveMarketFixture);

      const tickRanges = [
        { lower: 100100, upper: 100200, quantity: "18" },
        { lower: 100300, upper: 100400, quantity: "28" },
        { lower: 100500, upper: 100600, quantity: "35" },
      ];

      const positionIds: bigint[] = [];
      for (const range of tickRanges) {
        const positionId = await openWithQuote(core, alice, {
          marketId,
          lowerTick: range.lower,
          upperTick: range.upper,
          quantity: parse6(range.quantity),
        });
        positionIds.push(positionId);
      }

      expect(await position.balanceOf(alice.address)).to.equal(3n);

      const marketPositions = await listMarketPositions(position, marketId);
      expect(marketPositions.length).to.equal(3);
      for (const id of positionIds) {
        expect(marketPositions).to.include(id);
      }

      await position
        .connect(alice)
        .transferFrom(alice.address, bob.address, positionIds[0]);
      await position
        .connect(alice)
        .transferFrom(alice.address, bob.address, positionIds[2]);

      expect(await position.balanceOf(alice.address)).to.equal(1n);
      expect(await position.balanceOf(bob.address)).to.equal(2n);

      const alicePositions = await position.getPositionsByOwner(alice.address);
      const bobPositions = await position.getPositionsByOwner(bob.address);

      expect(alicePositions.length).to.equal(1);
      expect(alicePositions[0]).to.equal(positionIds[1]);

      expect(bobPositions.length).to.equal(2);
      expect(bobPositions).to.include(positionIds[0]);
      expect(bobPositions).to.include(positionIds[2]);

      await core.connect(alice).closePosition(positionIds[1], 0);
      await core.connect(bob).closePosition(positionIds[0], 0);
      await core.connect(bob).closePosition(positionIds[2], 0);

      expect(await position.balanceOf(alice.address)).to.equal(0n);
      expect(await position.balanceOf(bob.address)).to.equal(0n);

      const finalMarketPositions = await listMarketPositions(position, marketId);
      expect(finalMarketPositions.length).to.equal(0);
    });

    it("should handle position lifecycle with edge case quantities", async function () {
      const { core, mockPosition: position, alice, bob, marketId } =
        await loadFixture(createActiveMarketFixture);

      const smallPositionId = await openWithQuote(core, alice, {
        marketId,
        lowerTick: 100100,
        upperTick: 100200,
        quantity: 1n,
      });

      expect((await position.getPosition(smallPositionId)).quantity).to.equal(1n);

      await increaseWithQuote(core, alice, smallPositionId, 1n, 2000n);
      expect((await position.getPosition(smallPositionId)).quantity).to.equal(2n);

      await position
        .connect(alice)
        .transferFrom(alice.address, bob.address, smallPositionId);
      expect(await position.ownerOf(smallPositionId)).to.equal(bob.address);

      await core.connect(bob).decreasePosition(smallPositionId, 1n, 0);
      expect((await position.getPosition(smallPositionId)).quantity).to.equal(1n);

      await core.connect(bob).closePosition(smallPositionId, 0);
      expect(await position.balanceOf(bob.address)).to.equal(0n);

      const largePositionId = await openWithQuote(core, alice, {
        marketId,
        lowerTick: 100300,
        upperTick: 100400,
        quantity: parse6("10"),
      });

      await increaseWithQuote(core, alice, largePositionId, parse6("5"));
      await core
        .connect(alice)
        .decreasePosition(largePositionId, parse6("7.5"), 0);

      expect((await position.getPosition(largePositionId)).quantity).to.equal(
        parse6("7.5")
      );

      await position
        .connect(alice)
        .transferFrom(alice.address, bob.address, largePositionId);
      await core.connect(bob).closePosition(largePositionId, 0);

      expect(await position.balanceOf(bob.address)).to.equal(0n);
    });
  });
});
