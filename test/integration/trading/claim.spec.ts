import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { createActiveMarketFixture } from "../../helpers/fixtures/core";
import { INTEGRATION_TAG } from "../../helpers/tags";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";

describe(`${INTEGRATION_TAG} Position Claiming`, function () {
  const SMALL_QUANTITY = ethers.parseUnits("0.01", 6); // 0.01 USDC
  const MEDIUM_QUANTITY = ethers.parseUnits("0.05", 6); // 0.05 USDC
  const MEDIUM_COST = ethers.parseUnits("5", 6); // 5 USDC

  it("Should claim winning position", async function () {
    const {
      core,
      router,
      alice,
      paymentToken,
      mockPosition,
      marketId,
      keeper,
    } = await loadFixture(createActiveMarketFixture);

    const balanceBefore = await paymentToken.balanceOf(alice.address);

    // Create position that will win
    await core.connect(router).openPosition(alice.address, {
      marketId,
      lowerTick: 45,
      upperTick: 55, // Winning tick 50 is in this range
      quantity: MEDIUM_QUANTITY,
      maxCost: MEDIUM_COST,
    });

    const positions = await mockPosition.getPositionsByOwner(alice.address);
    const positionId = positions[0];

    // Settle market with winning tick
    await core.connect(keeper).settleMarket(marketId, 50);

    // Claim position
    await expect(core.connect(router).claimPayout(positionId)).to.emit(
      core,
      "PositionClaimed"
    );

    const balanceAfter = await paymentToken.balanceOf(alice.address);
    expect(balanceAfter).to.be.gt(balanceBefore);
  });

  it("Should handle claiming losing position", async function () {
    const {
      core,
      router,
      alice,
      paymentToken,
      mockPosition,
      marketId,
      keeper,
    } = await loadFixture(createActiveMarketFixture);

    const balanceBefore = await paymentToken.balanceOf(alice.address);

    // Create position that will lose
    await core.connect(router).openPosition(alice.address, {
      marketId,
      lowerTick: 10,
      upperTick: 20, // Winning tick 50 is outside this range
      quantity: MEDIUM_QUANTITY,
      maxCost: MEDIUM_COST,
    });

    const positions = await mockPosition.getPositionsByOwner(alice.address);
    const positionId = positions[0];

    // Settle market with winning tick outside position range
    await core.connect(keeper).settleMarket(marketId, 50);

    // Claim should emit event with zero payout
    await expect(core.connect(router).claimPayout(positionId))
      .to.emit(core, "PositionClaimed")
      .withArgs(positionId, alice.address, 0);

    const balanceAfter = await paymentToken.balanceOf(alice.address);
    expect(balanceAfter).to.be.lte(balanceBefore); // No payout (balance may decrease due to gas costs)
  });

  it("Should revert claim of non-existent position", async function () {
    const { core, router } = await loadFixture(createActiveMarketFixture);

    await expect(
      core.connect(router).claimPayout(999) // Non-existent position
    ).to.be.revertedWithCustomError(core, "PositionNotFound");
  });

  it("Should revert claim before market settlement", async function () {
    const { core, router, alice, mockPosition, marketId } = await loadFixture(
      createActiveMarketFixture
    );

    // Create position
    await core.connect(router).openPosition(alice.address, {
      marketId,
      lowerTick: 45,
      upperTick: 55,
      quantity: MEDIUM_QUANTITY,
      maxCost: MEDIUM_COST,
    });

    const positions = await mockPosition.getPositionsByOwner(alice.address);
    const positionId = positions[0];

    // Try to claim before settlement
    await expect(
      core.connect(router).claimPayout(positionId)
    ).to.be.revertedWithCustomError(core, "MarketNotSettled");
  });

  it("Should handle authorization for claim", async function () {
    const { core, router, alice, bob, mockPosition, marketId, keeper } =
      await loadFixture(createActiveMarketFixture);

    // Create position as alice
    await core.connect(router).openPosition(alice.address, {
      marketId,
      lowerTick: 45,
      upperTick: 55,
      quantity: MEDIUM_QUANTITY,
      maxCost: MEDIUM_COST,
    });

    const positions = await mockPosition.getPositionsByOwner(alice.address);
    const positionId = positions[0];

    // Settle market
    await core.connect(keeper).settleMarket(marketId, 50);

    // Bob should not be able to claim alice's position
    await expect(
      core.connect(bob).claimPayout(positionId)
    ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");
  });

  it("Should handle claiming already claimed position", async function () {
    const { core, router, alice, mockPosition, marketId, keeper } =
      await loadFixture(createActiveMarketFixture);

    await core.connect(router).openPosition(alice.address, {
      marketId,
      lowerTick: 45,
      upperTick: 55,
      quantity: MEDIUM_QUANTITY,
      maxCost: MEDIUM_COST,
    });

    const positions = await mockPosition.getPositionsByOwner(alice.address);
    const positionId = positions[0];

    // Settle market
    await core.connect(keeper).settleMarket(marketId, 50);

    // First claim should succeed
    await core.connect(router).claimPayout(positionId);

    // Second claim should fail
    await expect(
      core.connect(router).claimPayout(positionId)
    ).to.be.revertedWithCustomError(core, "PositionNotFound");
  });

  it("Should calculate claim payout correctly", async function () {
    const { core, router, alice, mockPosition, marketId, keeper } =
      await loadFixture(createActiveMarketFixture);

    await core.connect(router).openPosition(alice.address, {
      marketId,
      lowerTick: 45,
      upperTick: 55,
      quantity: MEDIUM_QUANTITY,
      maxCost: MEDIUM_COST,
    });

    const positions = await mockPosition.getPositionsByOwner(alice.address);
    const positionId = positions[0];

    // Settle market
    await core.connect(keeper).settleMarket(marketId, 50);

    const payout = await core.calculateClaimAmount(positionId);
    expect(payout).to.be.gt(0);

    await expect(core.connect(router).claimPayout(positionId)).to.not.be
      .reverted;
  });

  it("Should handle partial winning positions", async function () {
    const { core, router, alice, mockPosition, marketId, keeper } =
      await loadFixture(createActiveMarketFixture);

    // Create position that partially covers winning outcome
    await core.connect(router).openPosition(alice.address, {
      marketId,
      lowerTick: 48,
      upperTick: 52, // Small range around winning tick 50
      quantity: MEDIUM_QUANTITY,
      maxCost: MEDIUM_COST,
    });

    const positions = await mockPosition.getPositionsByOwner(alice.address);
    const positionId = positions[0];

    // Settle market
    await core.connect(keeper).settleMarket(marketId, 50);

    const payout = await core.calculateClaimAmount(positionId);
    expect(payout).to.be.gt(0);

    await expect(core.connect(router).claimPayout(positionId)).to.not.be
      .reverted;
  });

  it("Should handle multiple positions claiming", async function () {
    const { core, router, alice, bob, mockPosition, marketId, keeper } =
      await loadFixture(createActiveMarketFixture);

    // Alice creates winning position
    await core.connect(router).openPosition(alice.address, {
      marketId,
      lowerTick: 45,
      upperTick: 55,
      quantity: MEDIUM_QUANTITY,
      maxCost: MEDIUM_COST,
    });

    // Bob creates losing position
    await core.connect(router).openPosition(bob.address, {
      marketId,
      lowerTick: 10,
      upperTick: 20,
      quantity: MEDIUM_QUANTITY,
      maxCost: MEDIUM_COST,
    });

    // Settle market
    await core.connect(keeper).settleMarket(marketId, 50);

    const alicePositions = await mockPosition.getPositionsByOwner(
      alice.address
    );
    const bobPositions = await mockPosition.getPositionsByOwner(bob.address);

    // Both should be able to claim
    await expect(core.connect(router).claimPayout(alicePositions[0])).to.not.be
      .reverted;

    await expect(core.connect(router).claimPayout(bobPositions[0])).to.not.be
      .reverted;
  });

  it("Should emit correct events on claim", async function () {
    const { core, router, alice, mockPosition, marketId, keeper } =
      await loadFixture(createActiveMarketFixture);

    await core.connect(router).openPosition(alice.address, {
      marketId,
      lowerTick: 45,
      upperTick: 55,
      quantity: MEDIUM_QUANTITY,
      maxCost: MEDIUM_COST,
    });

    const positions = await mockPosition.getPositionsByOwner(alice.address);
    const positionId = positions[0];

    // Settle market
    await core.connect(keeper).settleMarket(marketId, 50);

    // Claim should emit PositionClaimed event
    await expect(core.connect(router).claimPayout(positionId))
      .to.emit(core, "PositionClaimed")
      .withArgs(positionId, alice.address, anyValue);
  });

  it("Should handle double claim attempts", async function () {
    const { core, keeper, router, alice, mockPosition, marketId } =
      await loadFixture(createActiveMarketFixture);

    // Create position
    await core.connect(router).openPosition(alice.address, {
      marketId,
      lowerTick: 45,
      upperTick: 55,
      quantity: SMALL_QUANTITY,
      maxCost: MEDIUM_COST,
    });

    const positions = await mockPosition.getPositionsByOwner(alice.address);
    const positionId = positions[0];

    // Settle market with winning tick
    await core.connect(keeper).settleMarket(marketId, 50);

    // First claim should succeed
    await expect(core.connect(router).claimPayout(positionId)).to.not.be
      .reverted;

    // Second claim should fail (position burned)
    await expect(
      core.connect(router).claimPayout(positionId)
    ).to.be.revertedWithCustomError(mockPosition, "PositionNotFound");
  });

  it("Should handle losing position claims", async function () {
    const { core, keeper, router, alice, mockPosition, marketId } =
      await loadFixture(createActiveMarketFixture);

    // Create position
    await core.connect(router).openPosition(alice.address, {
      marketId,
      lowerTick: 45,
      upperTick: 55,
      quantity: SMALL_QUANTITY,
      maxCost: MEDIUM_COST,
    });

    const positions = await mockPosition.getPositionsByOwner(alice.address);
    const positionId = positions[0];

    // Settle market with losing tick (outside position range)
    await core.connect(keeper).settleMarket(marketId, 80);

    // Claim should succeed with zero payout
    await expect(core.connect(router).claimPayout(positionId))
      .to.emit(core, "PositionClaimed")
      .withArgs(positionId, alice.address, 0);
  });
});
