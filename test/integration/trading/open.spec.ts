import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { createActiveMarketFixture } from "../../helpers/fixtures/core";
import { INTEGRATION_TAG } from "../../helpers/tags";

describe(`${INTEGRATION_TAG} Position Opening`, function () {
  const SMALL_QUANTITY = ethers.parseUnits("0.01", 6); // 0.01 USDC
  const MEDIUM_QUANTITY = ethers.parseUnits("0.05", 6); // 0.05 USDC
  const LARGE_QUANTITY = ethers.parseUnits("0.1", 6); // 0.1 USDC
  const MEDIUM_COST = ethers.parseUnits("5", 6); // 5 USDC
  const TICK_COUNT = 100;

  it("Should open position successfully", async function () {
    const { core, alice, paymentToken, mockPosition, marketId } =
      await loadFixture(createActiveMarketFixture);

    const tradeParams = {
      marketId: marketId,
      lowerTick: 100450, // 새 틱 시스템 (45번째 → 100450)
      upperTick: 100550, // 새 틱 시스템 (55번째 → 100550)
      quantity: MEDIUM_QUANTITY,
      maxCost: MEDIUM_COST,
    };

    const balanceBefore = await paymentToken.balanceOf(alice.address);

    await expect(
      core
        .connect(alice)
        .openPosition(
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
      lowerTick: 100450,
      upperTick: 100550,
      quantity: LARGE_QUANTITY, // Large quantity
      maxCost: ethers.parseUnits("0.01", 6), // Very small max cost (6 decimals)
    };

    await expect(
      core
        .connect(alice)
        .openPosition(
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
      lowerTick: 100550, // Upper > Lower
      upperTick: 100450,
      quantity: SMALL_QUANTITY,
      maxCost: MEDIUM_COST,
    };

    await expect(
      core
        .connect(alice)
        .openPosition(
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
      core.connect(alice).openPosition(marketId, 100450, 100550, 0, MEDIUM_COST)
    ).to.be.revertedWithCustomError(core, "InvalidQuantity");
  });

  it("Should handle tick out of bounds", async function () {
    const { core, alice, marketId } = await loadFixture(
      createActiveMarketFixture
    );

    await expect(
      core.connect(alice).openPosition(
        marketId,
        101000, // 범위를 벗어난 틱값
        101100, // 범위를 벗어난 틱값
        SMALL_QUANTITY,
        MEDIUM_COST
      )
    ).to.be.revertedWithCustomError(core, "InvalidTick");
  });

  it("Should handle single tick positions", async function () {
    const { core, alice, marketId } = await loadFixture(
      createActiveMarketFixture
    );

    await expect(
      core.connect(alice).openPosition(
        marketId,
        100500, // 실제 틱값
        100500, // 동일한 틱값 (single tick)
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
      core.connect(alice).openPosition(
        marketId,
        100000, // 첫 번째 틱
        100000,
        SMALL_QUANTITY,
        MEDIUM_COST
      )
    ).to.not.be.reverted;

    // Last tick
    await expect(
      core.connect(alice).openPosition(
        marketId,
        100990, // 마지막 틱
        100990,
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
        .openPosition(marketId, 100450, 100550, MEDIUM_QUANTITY, MEDIUM_COST)
    ).to.be.revertedWithCustomError(core, "ContractPaused");
  });

  it("Should handle invalid market ID", async function () {
    const { core, alice } = await loadFixture(createActiveMarketFixture);

    await expect(
      core
        .connect(alice)
        .openPosition(999, 45, 55, MEDIUM_QUANTITY, MEDIUM_COST)
    ).to.be.revertedWithCustomError(core, "MarketNotFound");
  });

  it("Should test 1 wei precision slippage protection", async function () {
    const { core, alice, marketId } = await loadFixture(
      createActiveMarketFixture
    );

    // Calculate exact cost
    const exactCost = await core.calculateOpenCost(
      marketId,
      100450,
      100550,
      SMALL_QUANTITY
    );

    // Test with maxCost exactly 1 wei less than needed

    await expect(
      core
        .connect(alice)
        .openPosition(marketId, 100450, 100550, SMALL_QUANTITY, exactCost - 1n)
    ).to.be.revertedWithCustomError(core, "CostExceedsMaximum");

    // Test with exact cost should succeed

    await expect(
      core
        .connect(alice)
        .openPosition(marketId, 100450, 100550, SMALL_QUANTITY, exactCost)
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
      .openPosition(marketId, 100000, 100990, largeQuantity, largeCost);

    await expect(tx).to.emit(core, "PositionOpened");
  });

  it("Should handle settled market trades", async function () {
    const { core, keeper, alice, marketId } = await loadFixture(
      createActiveMarketFixture
    );

    // Settle market first
    await core.connect(keeper).settleMarket(marketId, 100490, 100500);

    await expect(
      core
        .connect(alice)
        .openPosition(
          marketId,
          100450,
          100550,
          ethers.parseUnits("0.05", 6),
          ethers.parseUnits("5", 6)
        )
    ).to.be.revertedWithCustomError(core, "MarketNotActive");
  });
});
