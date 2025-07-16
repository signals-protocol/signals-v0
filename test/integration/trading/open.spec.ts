import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { coreFixture } from "../../helpers/fixtures/core";
import { INTEGRATION_TAG } from "../../helpers/tags";

describe(`${INTEGRATION_TAG} Position Opening`, function () {
  const SMALL_QUANTITY = ethers.parseUnits("0.01", 6); // 0.01 USDC
  const MEDIUM_QUANTITY = ethers.parseUnits("0.05", 6); // 0.05 USDC
  const LARGE_QUANTITY = ethers.parseUnits("0.1", 6); // 0.1 USDC
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

  it("Should open position successfully", async function () {
    const { core, alice, paymentToken, mockPosition, marketId } =
      await loadFixture(createActiveMarketFixture);

    const tradeParams = {
      marketId: marketId,
      lowerTick: 45,
      upperTick: 55,
      quantity: MEDIUM_QUANTITY,
      maxCost: MEDIUM_COST,
    };

    const balanceBefore = await paymentToken.balanceOf(alice.address);

    await expect(
      core
        .connect(alice)
        .openPosition(
          alice.address,
          tradeParams.marketId,
          tradeParams.lowerTick,
          tradeParams.upperTick,
          tradeParams.quantity,
          tradeParams.maxCost
        )
    ).to.emit(core, "PositionOpened");

    expect(await mockPosition.balanceOf(alice.address)).to.equal(1);

    const balanceAfter = await paymentToken.balanceOf(alice.address);
    expect(balanceAfter).to.be.lt(balanceBefore);
  });

  it("Should revert trade with insufficient max cost", async function () {
    const { core, alice, marketId } = await loadFixture(
      createActiveMarketFixture
    );

    const tradeParams = {
      marketId: marketId,
      lowerTick: 45,
      upperTick: 55,
      quantity: LARGE_QUANTITY, // Large quantity
      maxCost: ethers.parseUnits("0.01", 6), // Very small max cost (6 decimals)
    };

    await expect(
      core
        .connect(alice)
        .openPosition(
          alice.address,
          tradeParams.marketId,
          tradeParams.lowerTick,
          tradeParams.upperTick,
          tradeParams.quantity,
          tradeParams.maxCost
        )
    ).to.be.revertedWithCustomError(core, "CostExceedsMaximum");
  });

  it("Should handle invalid tick range", async function () {
    const { core, alice, marketId } = await loadFixture(
      createActiveMarketFixture
    );

    const tradeParams = {
      marketId: marketId,
      lowerTick: 55, // Upper > Lower
      upperTick: 45,
      quantity: SMALL_QUANTITY,
      maxCost: MEDIUM_COST,
    };

    await expect(
      core
        .connect(alice)
        .openPosition(
          alice.address,
          tradeParams.marketId,
          tradeParams.lowerTick,
          tradeParams.upperTick,
          tradeParams.quantity,
          tradeParams.maxCost
        )
    ).to.be.revertedWithCustomError(core, "InvalidTickRange");
  });

  it("Should handle zero quantity", async function () {
    const { core, alice, marketId } = await loadFixture(
      createActiveMarketFixture
    );

    await expect(
      core
        .connect(alice)
        .openPosition(alice.address, marketId, 45, 55, 0, MEDIUM_COST)
    ).to.be.revertedWithCustomError(core, "InvalidQuantity");
  });

  it("Should handle tick out of bounds", async function () {
    const { core, alice, marketId } = await loadFixture(
      createActiveMarketFixture
    );

    await expect(
      core
        .connect(alice)
        .openPosition(
          alice.address,
          marketId,
          45,
          TICK_COUNT,
          SMALL_QUANTITY,
          MEDIUM_COST
        )
    ).to.be.revertedWithCustomError(core, "InvalidTickRange");
  });

  it("Should handle single tick positions", async function () {
    const { core, alice, marketId } = await loadFixture(
      createActiveMarketFixture
    );

    await expect(
      core
        .connect(alice)
        .openPosition(
          alice.address,
          marketId,
          50,
          50,
          SMALL_QUANTITY,
          MEDIUM_COST
        )
    ).to.not.be.reverted;
  });

  it("Should handle boundary tick positions", async function () {
    const { core, alice, marketId } = await loadFixture(
      createActiveMarketFixture
    );

    // First tick
    await expect(
      core
        .connect(alice)
        .openPosition(
          alice.address,
          marketId,
          0,
          0,
          SMALL_QUANTITY,
          MEDIUM_COST
        )
    ).to.not.be.reverted;

    // Last tick
    await expect(
      core
        .connect(alice)
        .openPosition(
          alice.address,
          marketId,
          TICK_COUNT - 1,
          TICK_COUNT - 1,
          SMALL_QUANTITY,
          MEDIUM_COST
        )
    ).to.not.be.reverted;
  });

  // Note: Authorization test removed - Router was removed, all users can now directly access Core
  // openPosition is now public since Router authorization layer was eliminated

  it("Should handle paused contract", async function () {
    const { core, keeper, alice, marketId } = await loadFixture(
      createActiveMarketFixture
    );

    // Pause contract
    await core.connect(keeper).pause("Test pause");

    await expect(
      core
        .connect(alice)
        .openPosition(
          alice.address,
          marketId,
          45,
          55,
          MEDIUM_QUANTITY,
          MEDIUM_COST
        )
    ).to.be.revertedWithCustomError(core, "ContractPaused");
  });

  it("Should handle invalid market ID", async function () {
    const { core, alice } = await loadFixture(createActiveMarketFixture);

    await expect(
      core
        .connect(alice)
        .openPosition(alice.address, 999, 45, 55, MEDIUM_QUANTITY, MEDIUM_COST)
    ).to.be.revertedWithCustomError(core, "MarketNotFound");
  });

  it("Should test 1 wei precision slippage protection", async function () {
    const { core, alice, marketId } = await loadFixture(
      createActiveMarketFixture
    );

    // Calculate exact cost
    const exactCost = await core.calculateOpenCost(
      marketId,
      45,
      55,
      SMALL_QUANTITY
    );

    // Test with maxCost exactly 1 wei less than needed

    await expect(
      core
        .connect(alice)
        .openPosition(
          alice.address,
          marketId,
          45,
          55,
          SMALL_QUANTITY,
          exactCost - 1n
        )
    ).to.be.revertedWithCustomError(core, "CostExceedsMaximum");

    // Test with exact cost should succeed

    await expect(
      core
        .connect(alice)
        .openPosition(
          alice.address,
          marketId,
          45,
          55,
          SMALL_QUANTITY,
          exactCost
        )
    ).to.not.be.reverted;
  });

  it("Should handle large quantity trades with chunking", async function () {
    const { core, alice, marketId } = await loadFixture(
      createActiveMarketFixture
    );

    // Use a reasonable large quantity (1 USDC)
    const largeQuantity = ethers.parseUnits("1", 6); // 1 USDC
    const largeCost = ethers.parseUnits("100", 6); // 100 USDC max cost

    const tx = await core
      .connect(alice)
      .openPosition(
        alice.address,
        marketId,
        0,
        TICK_COUNT - 1,
        largeQuantity,
        largeCost
      );

    await expect(tx).to.emit(core, "PositionOpened");
  });

  it("Should handle settled market trades", async function () {
    const { core, keeper, alice, marketId } = await loadFixture(
      createActiveMarketFixture
    );

    // Settle market first
    await core.connect(keeper).settleMarket(marketId, 50);

    await expect(
      core
        .connect(alice)
        .openPosition(
          alice.address,
          marketId,
          45,
          55,
          ethers.parseUnits("0.05", 6),
          ethers.parseUnits("5", 6)
        )
    ).to.be.revertedWithCustomError(core, "MarketNotActive");
  });
});
