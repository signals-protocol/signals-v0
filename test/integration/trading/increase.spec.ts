import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { coreFixture } from "../../helpers/fixtures/core";
import { INTEGRATION_TAG } from "../../helpers/tags";

describe(`${INTEGRATION_TAG} Position Increase`, function () {
  const SMALL_QUANTITY = ethers.parseUnits("0.01", 6); // 0.01 USDC
  const MEDIUM_QUANTITY = ethers.parseUnits("0.05", 6); // 0.05 USDC
  const MEDIUM_COST = ethers.parseUnits("5", 6); // 5 USDC
  const TICK_COUNT = 100;

  async function createActiveMarketFixture() {
    const contracts = await loadFixture(coreFixture);
    const { core, keeper } = contracts;

    const currentTime = await time.latest();
    const startTime = currentTime + 100;
    const endTime = startTime + 7 * 24 * 60 * 60; // 7 days
    const marketId = 1;

    await core
      .connect(keeper)
      .createMarket(
        marketId,
        TICK_COUNT,
        startTime,
        endTime,
        ethers.parseEther("1")
      );
    await time.increaseTo(startTime + 1);

    return { ...contracts, marketId, startTime, endTime };
  }

  it("Should increase pos ition quantity", async function () {
    const { core, alice, paymentToken, mockPosition, marketId } =
      await loadFixture(createActiveMarketFixture);

    await core
      .connect(alice)
      .openPosition(
        alice.address,
        marketId,
        45,
        55,
        MEDIUM_QUANTITY,
        MEDIUM_COST
      );
    const positions = await mockPosition.getPositionsByOwner(alice.address);
    const positionId = positions[0];

    const balanceBefore = await paymentToken.balanceOf(alice.address);

    // Increase position
    await expect(
      core.connect(alice).increasePosition(
        positionId,
        SMALL_QUANTITY, // Add more
        MEDIUM_COST
      )
    ).to.emit(core, "PositionIncreased");

    const balanceAfter = await paymentToken.balanceOf(alice.address);
    expect(balanceAfter).to.be.lt(balanceBefore); // Paid more

    const position = await mockPosition.getPosition(positionId);
    expect(position.quantity).to.equal(MEDIUM_QUANTITY + SMALL_QUANTITY);
  });

  it("Should revert increase of non-existent position", async function () {
    const { core, alice } = await loadFixture(createActiveMarketFixture);

    await expect(
      core.connect(alice).increasePosition(
        999, // Non-existent position
        SMALL_QUANTITY,
        MEDIUM_COST
      )
    ).to.be.revertedWithCustomError(core, "PositionNotFound");
  });

  it("Should handle zero quantity increase", async function () {
    const { core, alice, mockPosition, marketId } = await loadFixture(
      createActiveMarketFixture
    );

    // Create position
    await core
      .connect(alice)
      .openPosition(
        alice.address,
        marketId,
        45,
        55,
        MEDIUM_QUANTITY,
        MEDIUM_COST
      );

    const positions = await mockPosition.getPositionsByOwner(alice.address);
    const positionId = positions[0];

    await expect(
      core.connect(alice).increasePosition(positionId, 0, 0)
    ).to.be.revertedWithCustomError(core, "InvalidQuantity");
  });

  it("Should handle insufficient max cost for increase", async function () {
    const { core, alice, mockPosition, marketId } = await loadFixture(
      createActiveMarketFixture
    );

    // Create position
    await core
      .connect(alice)
      .openPosition(
        alice.address,
        marketId,
        45,
        55,
        MEDIUM_QUANTITY,
        MEDIUM_COST
      );

    const positions = await mockPosition.getPositionsByOwner(alice.address);
    const positionId = positions[0];

    await expect(
      core.connect(alice).increasePosition(
        positionId,
        MEDIUM_QUANTITY,
        ethers.parseUnits("0.001", 6) // Very small max cost
      )
    ).to.be.revertedWithCustomError(core, "CostExceedsMaximum");
  });

  // Note: Authorization test removed - Router was removed, positions are now publicly accessible
  // Position operations are allowed from any caller since Router layer was eliminated

  it("Should handle paused contract for increase", async function () {
    const { core, keeper, alice, mockPosition, marketId } = await loadFixture(
      createActiveMarketFixture
    );

    // Create position first
    await core
      .connect(alice)
      .openPosition(
        alice.address,
        marketId,
        45,
        55,
        MEDIUM_QUANTITY,
        MEDIUM_COST
      );

    const positions = await mockPosition.getPositionsByOwner(alice.address);
    const positionId = positions[0];

    // Pause the contract
    await core.connect(keeper).pause("Testing pause");

    await expect(
      core
        .connect(alice)
        .increasePosition(positionId, SMALL_QUANTITY, MEDIUM_COST)
    ).to.be.revertedWithCustomError(core, "ContractPaused");
  });

  it("Should handle gas-efficient small adjustments", async function () {
    const { core, alice, mockPosition, marketId } = await loadFixture(
      createActiveMarketFixture
    );

    // Create position
    await core.connect(alice).openPosition(
      alice.address,
      marketId,
      45,
      55,
      ethers.parseUnits("0.1", 6), // Large quantity
      ethers.parseUnits("10", 6) // Large cost
    );

    const positions = await mockPosition.getPositionsByOwner(alice.address);
    const positionId = positions[0];

    // Small increase
    await expect(
      core.connect(alice).increasePosition(positionId, 1, MEDIUM_COST)
    ).to.not.be.reverted;
  });

  it("Should calculate increase cost correctly", async function () {
    const { core, alice, mockPosition, marketId } = await loadFixture(
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

    await core
      .connect(alice)
      .openPosition(
        alice.address,
        tradeParams.marketId,
        tradeParams.lowerTick,
        tradeParams.upperTick,
        tradeParams.quantity,
        tradeParams.maxCost
      );
    const positions = await mockPosition.getPositionsByOwner(alice.address);
    const positionId = positions[0];

    const cost = await core.calculateIncreaseCost(positionId, SMALL_QUANTITY);
    expect(cost).to.be.gt(0);
  });
});
