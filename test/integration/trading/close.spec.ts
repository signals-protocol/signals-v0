import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { createActiveMarketFixture, settleMarketUsingRange, advanceToClaimOpen } from "../../helpers/fixtures/core";
import { INTEGRATION_TAG } from "../../helpers/tags";

describe(`${INTEGRATION_TAG} Position Closing`, function () {
  const SMALL_QUANTITY = ethers.parseUnits("0.01", 6); // 0.01 USDC
  const MEDIUM_QUANTITY = ethers.parseUnits("0.05", 6); // 0.05 USDC
  const MEDIUM_COST = ethers.parseUnits("5", 6); // 5 USDC
  const TICK_COUNT = 100;

  it("Should close position completely", async function () {
    const { core, alice, paymentToken, mockPosition, marketId } =
      await loadFixture(createActiveMarketFixture);

    // Create initial position
    const tradeParams = {
      marketId: marketId,
      lowerTick: 100450,
      upperTick: 100550,
      quantity: MEDIUM_QUANTITY,
      maxCost: MEDIUM_COST,
    };

    await core
      .connect(alice)
      .openPosition(
        tradeParams.marketId,
        tradeParams.lowerTick,
        tradeParams.upperTick,
        tradeParams.quantity,
        tradeParams.maxCost
      );
    const positions = await mockPosition.getPositionsByOwner(alice.address);
    const positionId = positions[0];

    const balanceBefore = await paymentToken.balanceOf(alice.address);

    // Close position
    await expect(
      core.connect(alice).closePosition(
        positionId,
        0 // Min payout
      )
    ).to.emit(core, "PositionClosed");

    const balanceAfter = await paymentToken.balanceOf(alice.address);
    expect(balanceAfter).to.be.gt(balanceBefore); // Received payout

    // Position should be burned/deleted
    await expect(
      mockPosition.getPosition(positionId)
    ).to.be.revertedWithCustomError(mockPosition, "PositionNotFound");
  });

  it("Should handle multiple position closures", async function () {
    const { core, alice, bob, paymentToken, mockPosition, marketId } =
      await loadFixture(createActiveMarketFixture);

    // Create multiple positions
    const positions = [];
    const users = [alice, bob];

    for (const user of users) {
      await core
        .connect(user)
        .openPosition(
          marketId,
          100040,
          100060,
          SMALL_QUANTITY,
          MEDIUM_COST
        );
      const userPositions = await mockPosition.getPositionsByOwner(
        user.address
      );
      positions.push(userPositions[userPositions.length - 1]);
    }

    // Close all positions
    for (let i = 0; i < positions.length; i++) {
      const user = users[i];
      const positionId = positions[i];
      const balanceBefore = await paymentToken.balanceOf(user.address);

      await expect(core.connect(user).closePosition(positionId, 0)).to.emit(
        core,
        "PositionClosed"
      );

      const balanceAfter = await paymentToken.balanceOf(user.address);
      expect(balanceAfter).to.be.gte(balanceBefore); // Received payout (could be 0)
    }

    // All positions should be cleaned up
    for (const user of users) {
      const userPositions = await mockPosition.getPositionsByOwner(
        user.address
      );
      expect(userPositions.length).to.equal(0);
    }
  });

  it("Should handle position closure with settled market", async function () {
    const { core, alice, paymentToken, mockPosition, marketId, keeper } =
      await loadFixture(createActiveMarketFixture);

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

    // Move to market end and settle
    const market = await core.getMarket(marketId);
    await time.increaseTo(Number(market.endTimestamp) + 1);
    await settleMarketUsingRange(core, keeper, marketId, 100490, 100500); // Settle using midpoint tick
    await advanceToClaimOpen(core, marketId);

    const balanceBefore = await paymentToken.balanceOf(alice.address);

    // Claim position after settlement (not close)
    await expect(core.connect(alice).claimPayout(positionId)).to.emit(
      core,
      "PositionClaimed"
    );

    const balanceAfter = await paymentToken.balanceOf(alice.address);
    expect(balanceAfter).to.be.gt(balanceBefore); // Should receive settlement payout
  });

  it("Should handle edge case: close position with minimal payout", async function () {
    const { core, alice, paymentToken, mockPosition, marketId } =
      await loadFixture(createActiveMarketFixture);

    // Create very small position
    await core.connect(alice).openPosition(
      marketId,
      100850,
      100950,
      1, // Very small quantity
      ethers.parseUnits("1", 6)
    );
    const positions = await mockPosition.getPositionsByOwner(alice.address);
    const positionId = positions[0];

    const balanceBefore = await paymentToken.balanceOf(alice.address);

    // Close position
    await expect(core.connect(alice).closePosition(positionId, 0)).to.emit(
      core,
      "PositionClosed"
    );

    const balanceAfter = await paymentToken.balanceOf(alice.address);
    expect(balanceAfter).to.be.gte(balanceBefore); // At least no loss
  });

  it("Should revert on invalid position closure", async function () {
    const { core, alice, mockPosition } = await loadFixture(
      createActiveMarketFixture
    );

    // Try to close non-existent position
    await expect(
      core.connect(alice).closePosition(999, 0)
    ).to.be.revertedWithCustomError(mockPosition, "PositionNotFound");
  });

  it("Should handle position closure with minimum payout requirement", async function () {
    const { core, alice, paymentToken, mockPosition, marketId } =
      await loadFixture(createActiveMarketFixture);

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

    // Try to close with unreasonably high minimum payout
    const highMinPayout = ethers.parseUnits("1000", 6);
    await expect(
      core.connect(alice).closePosition(positionId, highMinPayout)
    ).to.be.revertedWithCustomError(core, "ProceedsBelowMinimum");
  });

  it("Should handle partial closure through decrease", async function () {
    const { core, alice, paymentToken, mockPosition, marketId } =
      await loadFixture(createActiveMarketFixture);

    // Create larger position
    const quantity = ethers.parseUnits("0.1", 6);
    await core
      .connect(alice)
      .openPosition(
        marketId,
        100450,
        100550,
        quantity,
        ethers.parseUnits("50", 6)
      );
    const positions = await mockPosition.getPositionsByOwner(alice.address);
    const positionId = positions[0];

    const balanceBefore = await paymentToken.balanceOf(alice.address);

    // Partially close position (decrease by half)
    const decreaseAmount = quantity / 2n;
    await expect(
      core.connect(alice).decreasePosition(positionId, decreaseAmount, 0)
    ).to.emit(core, "PositionDecreased");

    const balanceAfter = await paymentToken.balanceOf(alice.address);
    expect(balanceAfter).to.be.gt(balanceBefore);

    // Position should still exist with reduced quantity
    const positionData = await mockPosition.getPosition(positionId);
   expect(positionData.quantity).to.be.lt(quantity);
   expect(positionData.quantity).to.be.gt(0);
  });

  it("Uses nearest rounding for close proceeds and keeps tree sums non-increasing", async function () {
    const { core, alice, mockPosition, marketId } = await loadFixture(
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

    const market = await core.getMarket(marketId);
    const minTick = market.minTick;
    const maxTick = market.maxTick;

    const estimatedProceeds = await core.calculateCloseProceeds(positionId);
    const totalBefore = await core.getRangeSum(marketId, minTick, maxTick);

    const tx = await core.connect(alice).closePosition(positionId, 0);
    const receipt = await tx.wait();

    const closedLog = receipt.logs
      .map((log) => {
        try {
          return core.interface.parseLog(log);
        } catch {
          return undefined;
        }
      })
      .find((parsed) => parsed && parsed.name === "PositionClosed");

    expect(closedLog, "PositionClosed event not found").to.not.be.undefined;
    const actualProceeds = (closedLog!.args.proceeds as bigint) ?? 0n;

    const delta =
      actualProceeds >= estimatedProceeds
        ? actualProceeds - estimatedProceeds
        : estimatedProceeds - actualProceeds;
    expect(delta).to.be.lte(1n);

    const totalAfter = await core.getRangeSum(marketId, minTick, maxTick);
    expect(totalAfter).to.be.lte(totalBefore);
  });
});
