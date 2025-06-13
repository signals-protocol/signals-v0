import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { createActiveMarketFixture } from "../../helpers/fixtures/core";
import { INTEGRATION_TAG } from "../../helpers/tags";

describe(`${INTEGRATION_TAG} Position Closing`, function () {
  const SMALL_QUANTITY = ethers.parseUnits("0.01", 6); // 0.01 USDC
  const MEDIUM_QUANTITY = ethers.parseUnits("0.05", 6); // 0.05 USDC
  const MEDIUM_COST = ethers.parseUnits("5", 6); // 5 USDC
  const TICK_COUNT = 100;

  it("Should close position completely", async function () {
    const { core, router, alice, paymentToken, mockPosition, marketId } =
      await loadFixture(createActiveMarketFixture);

    // Create initial position
    const tradeParams = {
      marketId: marketId,
      lowerTick: 45,
      upperTick: 55,
      quantity: MEDIUM_QUANTITY,
      maxCost: MEDIUM_COST,
    };

    await core.connect(router).openPosition(alice.address, tradeParams);
    const positions = await mockPosition.getPositionsByOwner(alice.address);
    const positionId = positions[0];

    const balanceBefore = await paymentToken.balanceOf(alice.address);

    // Close position
    await expect(
      core.connect(router).closePosition(
        positionId,
        0 // Min payout
      )
    ).to.emit(core, "PositionClosed");

    const balanceAfter = await paymentToken.balanceOf(alice.address);
    expect(balanceAfter).to.be.gt(balanceBefore); // Received payout

    // Position should be burned/deleted
    await expect(
      mockPosition.getPosition(positionId)
    ).to.be.revertedWithCustomError(core, "PositionNotFound");
  });

  it("Should revert close of non-existent position", async function () {
    const { core, router } = await loadFixture(createActiveMarketFixture);

    await expect(
      core.connect(router).closePosition(
        999, // Non-existent position
        0
      )
    ).to.be.revertedWithCustomError(core, "PositionNotFound");
  });

  it("Should handle payout below minimum for close", async function () {
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

    // Calculate payout to set unrealistic minimum
    const payout = await core.calculateCloseProceeds(positionId);

    await expect(
      core.connect(router).closePosition(
        positionId,
        payout + 1n // Set min payout higher than actual
      )
    ).to.be.revertedWithCustomError(core, "CostExceedsMaximum");
  });

  it("Should handle authorization for close", async function () {
    const { core, router, alice, bob, mockPosition, marketId } =
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

    // Bob should not be able to close alice's position
    await expect(
      core.connect(bob).closePosition(positionId, 0)
    ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");
  });

  it("Should handle paused contract for close", async function () {
    const { core, keeper, router, alice, mockPosition, marketId } =
      await loadFixture(createActiveMarketFixture);

    // Create position first
    await core.connect(router).openPosition(alice.address, {
      marketId,
      lowerTick: 45,
      upperTick: 55,
      quantity: MEDIUM_QUANTITY,
      maxCost: MEDIUM_COST,
    });

    const positions = await mockPosition.getPositionsByOwner(alice.address);
    const positionId = positions[0];

    // Pause the contract
    await core.connect(keeper).pause("Testing pause");

    await expect(
      core.connect(router).closePosition(positionId, 0)
    ).to.be.revertedWithCustomError(core, "ContractPaused");
  });

  it("Should calculate close payout correctly", async function () {
    const { core, router, alice, mockPosition, marketId } = await loadFixture(
      createActiveMarketFixture
    );

    // Create position first
    const tradeParams = {
      marketId: marketId,
      lowerTick: 45,
      upperTick: 55,
      quantity: MEDIUM_QUANTITY,
      maxCost: MEDIUM_COST,
    };

    await core.connect(router).openPosition(alice.address, tradeParams);
    const positions = await mockPosition.getPositionsByOwner(alice.address);
    const positionId = positions[0];

    const payout = await core.calculateCloseProceeds(positionId);
    expect(payout).to.be.gt(0);
  });

  it("Should handle closing small positions efficiently", async function () {
    const { core, router, alice, mockPosition, marketId } = await loadFixture(
      createActiveMarketFixture
    );

    // Create small position
    await core.connect(router).openPosition(alice.address, {
      marketId,
      lowerTick: 45,
      upperTick: 55,
      quantity: 1, // 1 wei
      maxCost: MEDIUM_COST,
    });

    const positions = await mockPosition.getPositionsByOwner(alice.address);
    const positionId = positions[0];

    // Close small position
    await expect(core.connect(router).closePosition(positionId, 0)).to.not.be
      .reverted;
  });

  it("Should handle closing large positions", async function () {
    const { core, router, alice, mockPosition, marketId } = await loadFixture(
      createActiveMarketFixture
    );

    // Create large position
    await core.connect(router).openPosition(alice.address, {
      marketId,
      lowerTick: 0,
      upperTick: TICK_COUNT - 1, // Full range
      quantity: ethers.parseUnits("1", 6), // 1 USDC
      maxCost: ethers.parseUnits("100", 6), // 100 USDC max cost
    });

    const positions = await mockPosition.getPositionsByOwner(alice.address);
    const positionId = positions[0];

    // Close large position
    await expect(core.connect(router).closePosition(positionId, 0)).to.not.be
      .reverted;
  });

  it("Should emit correct events on close", async function () {
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

    // Close should emit PositionClosed event
    await expect(core.connect(router).closePosition(positionId, 0))
      .to.emit(core, "PositionClosed")
      .withArgs(positionId, alice.address, anyValue);
  });

  it("Should remove position from owner's list", async function () {
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

    const positionsBefore = await mockPosition.getPositionsByOwner(
      alice.address
    );
    expect(positionsBefore.length).to.equal(1);

    const positionId = positionsBefore[0];

    // Close position
    await core.connect(router).closePosition(positionId, 0);

    // Position should be removed from owner's list
    const positionsAfter = await mockPosition.getPositionsByOwner(
      alice.address
    );
    expect(positionsAfter.length).to.equal(0);
  });

  it("Should handle close with exact payout expectation", async function () {
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

    // Calculate exact payout
    const exactPayout = await core.calculateCloseProceeds(positionId);

    // Close with exact minimum should succeed
    await expect(core.connect(router).closePosition(positionId, exactPayout)).to
      .not.be.reverted;
  });
});

// Helper for event testing
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
