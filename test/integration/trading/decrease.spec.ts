import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { createActiveMarketFixture } from "../../helpers/fixtures/core";
import { INTEGRATION_TAG } from "../../helpers/tags";

describe(`${INTEGRATION_TAG} Position Decrease`, function () {
  const SMALL_QUANTITY = ethers.parseUnits("0.01", 6); // 0.01 USDC
  const MEDIUM_QUANTITY = ethers.parseUnits("0.05", 6); // 0.05 USDC
  const MEDIUM_COST = ethers.parseUnits("5", 6); // 5 USDC

  it("Should decrease position quantity", async function () {
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

    // Decrease position
    await expect(
      core.connect(router).decreasePosition(
        positionId,
        SMALL_QUANTITY, // Remove part
        0 // Min payout
      )
    ).to.emit(core, "PositionDecreased");

    const balanceAfter = await paymentToken.balanceOf(alice.address);
    expect(balanceAfter).to.be.gt(balanceBefore); // Received payout

    const position = await mockPosition.getPosition(positionId);
    expect(position.quantity).to.equal(MEDIUM_QUANTITY - SMALL_QUANTITY);
  });

  it("Should revert decrease of non-existent position", async function () {
    const { core, router } = await loadFixture(createActiveMarketFixture);

    await expect(
      core.connect(router).decreasePosition(
        999, // Non-existent position
        SMALL_QUANTITY,
        0
      )
    ).to.be.revertedWithCustomError(core, "PositionNotFound");
  });

  it("Should handle zero quantity decrease", async function () {
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

    await expect(
      core.connect(router).decreasePosition(positionId, 0, 0)
    ).to.be.revertedWithCustomError(core, "InvalidQuantity");
  });

  it("Should handle decrease quantity larger than position", async function () {
    const { core, router, alice, mockPosition, marketId } = await loadFixture(
      createActiveMarketFixture
    );

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

    await expect(
      core.connect(router).decreasePosition(
        positionId,
        MEDIUM_QUANTITY, // Larger than position
        0
      )
    ).to.be.revertedWithCustomError(core, "InvalidQuantity");
  });

  it("Should handle payout below minimum", async function () {
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
    const payout = await core.calculateDecreaseProceeds(
      positionId,
      SMALL_QUANTITY
    );

    await expect(
      core.connect(router).decreasePosition(
        positionId,
        SMALL_QUANTITY,
        payout + 1n // Set min payout higher than actual
      )
    ).to.be.revertedWithCustomError(core, "CostExceedsMaximum");
  });

  it("Should handle authorization for decrease", async function () {
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

    // Bob should not be able to decrease alice's position
    await expect(
      core.connect(bob).decreasePosition(positionId, SMALL_QUANTITY, 0)
    ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");
  });

  it("Should handle paused contract for decrease", async function () {
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
      core.connect(router).decreasePosition(positionId, SMALL_QUANTITY, 0)
    ).to.be.revertedWithCustomError(core, "ContractPaused");
  });

  it("Should calculate decrease payout correctly", async function () {
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

    const payout = await core.calculateDecreaseProceeds(
      positionId,
      SMALL_QUANTITY
    );
    expect(payout).to.be.gt(0);
  });

  it("Should handle small partial decreases efficiently", async function () {
    const { core, router, alice, mockPosition, marketId } = await loadFixture(
      createActiveMarketFixture
    );

    // Create position
    await core.connect(router).openPosition(alice.address, {
      marketId,
      lowerTick: 45,
      upperTick: 55,
      quantity: ethers.parseUnits("0.1", 6), // Large quantity
      maxCost: ethers.parseUnits("10", 6), // Large cost
    });

    const positions = await mockPosition.getPositionsByOwner(alice.address);
    const positionId = positions[0];

    // Small decrease
    await expect(core.connect(router).decreasePosition(positionId, 1, 0)).to.not
      .be.reverted;
  });

  it("Should handle sequential decreases", async function () {
    const { core, router, alice, mockPosition, marketId } = await loadFixture(
      createActiveMarketFixture
    );

    // Create position
    await core.connect(router).openPosition(alice.address, {
      marketId,
      lowerTick: 45,
      upperTick: 55,
      quantity: ethers.parseUnits("0.1", 6), // Large quantity
      maxCost: ethers.parseUnits("10", 6), // Large cost
    });

    const positions = await mockPosition.getPositionsByOwner(alice.address);
    const positionId = positions[0];

    // First decrease
    await core.connect(router).decreasePosition(positionId, SMALL_QUANTITY, 0);

    // Second decrease
    await expect(
      core.connect(router).decreasePosition(positionId, SMALL_QUANTITY, 0)
    ).to.not.be.reverted;

    const position = await mockPosition.getPosition(positionId);
    expect(position.quantity).to.equal(
      ethers.parseUnits("0.1", 6) - SMALL_QUANTITY - SMALL_QUANTITY
    );
  });

  it("Should handle excessive decrease quantity", async function () {
    const { core, router, alice, mockPosition, marketId } = await loadFixture(
      createActiveMarketFixture
    );

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

    const excessiveSell = SMALL_QUANTITY + 1n;

    await expect(
      core.connect(router).decreasePosition(positionId, excessiveSell, 0)
    ).to.be.revertedWithCustomError(core, "InvalidQuantity");
  });
});
