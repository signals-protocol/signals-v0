import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { createActiveMarketFixture, settleMarketUsingRange, advanceToClaimOpen } from "../../helpers/fixtures/core";
import { INTEGRATION_TAG } from "../../helpers/tags";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";

describe(`${INTEGRATION_TAG} Position Claiming`, function () {
  const SMALL_QUANTITY = ethers.parseUnits("0.01", 6); // 0.01 USDC
  const MEDIUM_QUANTITY = ethers.parseUnits("0.05", 6); // 0.05 USDC
  const MEDIUM_COST = ethers.parseUnits("5", 6); // 5 USDC

  it("Should claim winning position", async function () {
    const { core, alice, bob, paymentToken, mockPosition, marketId, keeper } =
      await loadFixture(createActiveMarketFixture);

    const balanceBefore = await paymentToken.balanceOf(alice.address);

    // Create position that will win
    await core
      .connect(alice)
      .openPosition(
        marketId,
        100450,
        100550,
        MEDIUM_QUANTITY,
        MEDIUM_COST
      );

    const positions = await mockPosition.getPositionsByOwner(alice.address);
    const positionId = positions[0];

    // Settle market with winning tick
    await settleMarketUsingRange(core, keeper, marketId, 100490, 100500);
    await advanceToClaimOpen(core, marketId);
    await advanceToClaimOpen(core, marketId);

    // Claim position
    await expect(core.connect(alice).claimPayout(positionId)).to.emit(
      core,
      "PositionClaimed"
    );

    const balanceAfter = await paymentToken.balanceOf(alice.address);
    expect(balanceAfter).to.be.gt(balanceBefore);
  });

  it("Should handle claiming losing position", async function () {
    const { core, alice, bob, paymentToken, mockPosition, marketId, keeper } =
      await loadFixture(createActiveMarketFixture);

    const balanceBefore = await paymentToken.balanceOf(alice.address);

    // Create position that will lose
    await core
      .connect(alice)
      .openPosition(
        marketId,
        100010,
        100020,
        MEDIUM_QUANTITY,
        MEDIUM_COST
      );

    const positions = await mockPosition.getPositionsByOwner(alice.address);
    const positionId = positions[0];

    // Settle market with winning tick outside position range
    await settleMarketUsingRange(core, keeper, marketId, 100490, 100500);
    await advanceToClaimOpen(core, marketId);

    // Claim should emit event with zero payout
    await expect(core.connect(alice).claimPayout(positionId))
      .to.emit(core, "PositionClaimed")
      .withArgs(positionId, alice.address, 0);

    const balanceAfter = await paymentToken.balanceOf(alice.address);
    expect(balanceAfter).to.be.lte(balanceBefore); // No payout (balance may decrease due to gas costs)
  });

  it("Should revert claim of non-existent position", async function () {
    const { core, alice, mockPosition } = await loadFixture(
      createActiveMarketFixture
    );
    await expect(
      core.connect(alice).claimPayout(999) // Non-existent position
    ).to.be.revertedWithCustomError(mockPosition, "PositionNotFound");
  });

  it("Should revert claim before market settlement", async function () {
    const { core, alice, bob, mockPosition, marketId } = await loadFixture(
      createActiveMarketFixture
    );

    // Create position
    await core
      .connect(alice)
      .openPosition(
        marketId,
        100450,
        100550,
        MEDIUM_QUANTITY,
        MEDIUM_COST
      );

    const positions = await mockPosition.getPositionsByOwner(alice.address);
    const positionId = positions[0];

    // Try to claim before settlement
    await expect(
      core.connect(alice).claimPayout(positionId)
    ).to.be.revertedWithCustomError(core, "MarketNotSettled");
  });

  it("Should handle claiming already claimed position", async function () {
    const { core, alice, bob, mockPosition, marketId, keeper } = await loadFixture(
      createActiveMarketFixture
    );

    await core
      .connect(alice)
      .openPosition(
        marketId,
        100450,
        100550,
        MEDIUM_QUANTITY,
        MEDIUM_COST
      );

    const positions = await mockPosition.getPositionsByOwner(alice.address);
    const positionId = positions[0];

    // Settle market and advance to claim window
    await settleMarketUsingRange(core, keeper, marketId, 100490, 100500);
    const market = await core.getMarket(marketId);
    const claimOpen =
      Number(
        market.settlementTimestamp === 0n
          ? market.endTimestamp
          : market.settlementTimestamp
      ) + 15 * 60;
    await time.increaseTo(claimOpen + 1);
    await advanceToClaimOpen(core, marketId);
    await time.increase(15 * 60 + 1);
    await advanceToClaimOpen(core, marketId);
    await time.increase(15 * 60 + 1);
    await advanceToClaimOpen(core, marketId);
    await advanceToClaimOpen(core, marketId);
    await advanceToClaimOpen(core, marketId);
    await advanceToClaimOpen(core, marketId);
    await advanceToClaimOpen(core, marketId);

    // First claim should succeed
    await core.connect(alice).claimPayout(positionId);

    // Second claim should fail
    await expect(
      core.connect(alice).claimPayout(positionId)
    ).to.be.revertedWithCustomError(mockPosition, "PositionNotFound");
  });

  it("Should calculate claim payout correctly", async function () {
    const { core, alice, mockPosition, marketId, keeper } = await loadFixture(
      createActiveMarketFixture
    );

    await core
      .connect(alice)
      .openPosition(
        marketId,
        100450,
        100550,
        MEDIUM_QUANTITY,
        MEDIUM_COST
      );

    const positions = await mockPosition.getPositionsByOwner(alice.address);
    const positionId = positions[0];

    // Settle market
    await settleMarketUsingRange(core, keeper, marketId, 100490, 100500);
    await advanceToClaimOpen(core, marketId);
    await time.increase(15 * 60 + 1);
    await advanceToClaimOpen(core, marketId);
    await time.increase(15 * 60 + 1);
    await advanceToClaimOpen(core, marketId);
    await advanceToClaimOpen(core, marketId);
    await advanceToClaimOpen(core, marketId);
    await advanceToClaimOpen(core, marketId);

    const payout = await core.calculateClaimAmount(positionId);
    expect(payout).to.be.gt(0);

    await expect(core.connect(alice).claimPayout(positionId)).to.not.be
      .reverted;
  });

  it("Should handle partial winning positions", async function () {
    const { core, alice, mockPosition, marketId, keeper } = await loadFixture(
      createActiveMarketFixture
    );

    // Create position that partially covers winning outcome
    await core
      .connect(alice)
      .openPosition(
        marketId,
        100480,
        100520,
        MEDIUM_QUANTITY,
        MEDIUM_COST
      );

    const positions = await mockPosition.getPositionsByOwner(alice.address);
    const positionId = positions[0];

    // Settle market
    await settleMarketUsingRange(core, keeper, marketId, 100490, 100500);
    await advanceToClaimOpen(core, marketId);

    const payout = await core.calculateClaimAmount(positionId);
    expect(payout).to.be.gt(0);

    await expect(core.connect(alice).claimPayout(positionId)).to.not.be
      .reverted;
  });

  it("Should handle multiple positions claiming", async function () {
    const { core, alice, bob, mockPosition, marketId, keeper } =
      await loadFixture(createActiveMarketFixture);

    // Alice creates winning position
    await core
      .connect(alice)
      .openPosition(
        marketId,
        100450,
        100550,
        MEDIUM_QUANTITY,
        MEDIUM_COST
      );

    // Bob creates losing position
    await core
      .connect(bob)
      .openPosition(
        marketId,
        100010,
        100020,
        MEDIUM_QUANTITY,
        MEDIUM_COST
      );

    // Settle market
    await settleMarketUsingRange(core, keeper, marketId, 100490, 100500);

    const alicePositions = await mockPosition.getPositionsByOwner(
      alice.address
    );
    const bobPositions = await mockPosition.getPositionsByOwner(bob.address);

    // Both should be able to claim
    await time.increase(3600);
    await expect(core.connect(alice).claimPayout(alicePositions[0])).to.not.be
      .reverted;

    await expect(core.connect(bob).claimPayout(bobPositions[0])).to.not.be
      .reverted;
  });

  it("Should emit correct events on claim", async function () {
    const { core, alice, mockPosition, marketId, keeper } = await loadFixture(
      createActiveMarketFixture
    );

    await core
      .connect(alice)
      .openPosition(
        marketId,
        100450,
        100550,
        MEDIUM_QUANTITY,
        MEDIUM_COST
      );

    const positions = await mockPosition.getPositionsByOwner(alice.address);
    const positionId = positions[0];

    // Settle market
    await settleMarketUsingRange(core, keeper, marketId, 100490, 100500);
    await advanceToClaimOpen(core, marketId);
    await time.increase(15 * 60 + 1);

    // Claim should emit PositionClaimed event
    await expect(core.connect(alice).claimPayout(positionId))
      .to.emit(core, "PositionClaimed")
      .withArgs(positionId, alice.address, anyValue);
  });

  it("Should handle double claim attempts", async function () {
    const { core, keeper, alice, mockPosition, marketId } = await loadFixture(
      createActiveMarketFixture
    );

    // Create position
    await core
      .connect(alice)
      .openPosition(
        marketId,
        100450,
        100550,
        SMALL_QUANTITY,
        MEDIUM_COST
      );

    const positions = await mockPosition.getPositionsByOwner(alice.address);
    const positionId = positions[0];

    // Settle market with winning tick
    await settleMarketUsingRange(core, keeper, marketId, 100490, 100500);
    await advanceToClaimOpen(core, marketId);

    // First claim should succeed
    await expect(core.connect(alice).claimPayout(positionId)).to.not.be
      .reverted;

    // Second claim should fail (position burned)
    await expect(
      core.connect(alice).claimPayout(positionId)
    ).to.be.revertedWithCustomError(mockPosition, "PositionNotFound");
  });

  it("Should handle losing position claims", async function () {
    const { core, keeper, alice, mockPosition, marketId } = await loadFixture(
      createActiveMarketFixture
    );

    // Create position
    await core
      .connect(alice)
      .openPosition(
        marketId,
        100450,
        100550,
        SMALL_QUANTITY,
        MEDIUM_COST
      );

    const positions = await mockPosition.getPositionsByOwner(alice.address);
    const positionId = positions[0];

    // Settle market with losing tick (outside position range)
    await settleMarketUsingRange(core, keeper, marketId, 100790, 100800);
    await advanceToClaimOpen(core, marketId);

    // Claim should succeed with zero payout
    await expect(core.connect(alice).claimPayout(positionId))
      .to.emit(core, "PositionClaimed")
      .withArgs(positionId, alice.address, 0);
  });
});
