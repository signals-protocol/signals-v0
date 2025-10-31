import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import {
  createActiveMarketFixture,
  coreFixture,
  createMarketWithConfig,
  setMarketActivation,
  settleMarketAtTick,
} from "../../helpers/fixtures/core";
import { INTEGRATION_TAG } from "../../helpers/tags";

describe(`${INTEGRATION_TAG} Position Opening`, function () {
  const SMALL_QUANTITY = ethers.parseUnits("0.01", 6); // 0.01 USDC
  const MEDIUM_QUANTITY = ethers.parseUnits("0.05", 6); // 0.05 USDC
  const LARGE_QUANTITY = ethers.parseUnits("0.1", 6); // 0.1 USDC
  const MEDIUM_COST = ethers.parseUnits("5", 6); // 5 USDC
  const TICK_COUNT = 100;

  it("Should reject trading before explicit activation", async function () {
    const contracts = await loadFixture(coreFixture);
    const { core, keeper, alice } = contracts;

    const currentTime = await time.latest();
    const startTime = currentTime + 500;
    const endTime = startTime + 7 * 24 * 60 * 60;
    const marketId = await createMarketWithConfig(core, keeper, {
      minTick: 100000,
      maxTick: 100990,
      tickSpacing: 10,
      startTime,
      endTime,
      liquidityParameter: ethers.parseEther("1"),
    });

    const target = startTime + 1;
    const latestTs = await time.latest();
    await time.increaseTo(target > latestTs ? target : latestTs + 1);

    const quantity = MEDIUM_QUANTITY;
    const cost = await core.calculateOpenCost(marketId, 100450, 100550, quantity);
    const maxCost = cost + ethers.parseUnits("1", 6);

    await expect(
      core
        .connect(alice)
        .openPosition(marketId, 100450, 100550, quantity, maxCost)
    ).to.be.revertedWithCustomError(core, "MarketNotActive");

    await setMarketActivation(core, keeper, marketId, true);

    await expect(
      core
        .connect(alice)
        .openPosition(marketId, 100450, 100550, quantity, maxCost)
    ).to.emit(core, "PositionOpened");
  });

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
        .openPosition(tradeParams.marketId,
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
        .openPosition(tradeParams.marketId,
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
        .openPosition(tradeParams.marketId,
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
        .openPosition(marketId, 100450, 100550, 0, MEDIUM_COST)
    ).to.be.revertedWithCustomError(core, "InvalidQuantity");
  });

  it("Should handle tick out of bounds", async function () {
    const { core, alice, marketId } = await loadFixture(
      createActiveMarketFixture
    );

    await expect(
      core.connect(alice).openPosition(marketId,
        101000, // 범위를 벗어난 틱값
        101100, // 범위를 벗어난 틱값
        SMALL_QUANTITY,
        MEDIUM_COST
      )
    ).to.be.revertedWithCustomError(core, "InvalidTick");
  });

  it("Should reject single tick positions", async function () {
    const { core, alice, marketId } = await loadFixture(
      createActiveMarketFixture
    );

    await expect(
      core.connect(alice).openPosition(marketId,
        100500, // 실제 틱값
        100500, // 동일한 틱값 (single tick)
        SMALL_QUANTITY,
        MEDIUM_COST
      )
    ).to.be.revertedWithCustomError(core, "InvalidTickRange");
  });

  it("Should handle boundary tick ranges", async function () {
    const { core, alice, marketId } = await loadFixture(
      createActiveMarketFixture
    );

    // First tick
    await expect(
      core.connect(alice).openPosition(marketId,
        100000, // 첫 번째 틱
        100010,
        SMALL_QUANTITY,
        MEDIUM_COST
      )
    ).to.not.be.reverted;

    // Last tick
    await expect(
      core.connect(alice).openPosition(marketId,
        100980, // 마지막 틱에서 최소 범위 확보
        100990,
        SMALL_QUANTITY,
        MEDIUM_COST
      )
    ).to.not.be.reverted;
  });

  it("Uses nearest rounding with min-one safeguard and keeps tree sums monotonic", async function () {
    const { core, alice, marketId } = await loadFixture(
      createActiveMarketFixture
    );

    const market = await core.getMarket(marketId);
    const minTick = market.minTick;
    const maxTick = market.maxTick;

    const quantity = 1n; // 1 micro USDC
    const lowerTick = 100450;
    const upperTick = 100550;

    const estimatedCost = await core.calculateOpenCost(
      marketId,
      lowerTick,
      upperTick,
      quantity
    );
    expect(estimatedCost).to.equal(1n);

    const totalBefore = await core.getRangeSum(marketId, minTick, maxTick);

    const maxCost = estimatedCost + 1n;
    const tx = await core
      .connect(alice)
      .openPosition(marketId, lowerTick, upperTick, quantity, maxCost);
    const receipt = await tx.wait();

    const openedLog = receipt.logs
      .map((log) => {
        try {
          return core.interface.parseLog(log);
        } catch {
          return undefined;
        }
      })
      .find((parsed) => parsed && parsed.name === "PositionOpened");

    expect(openedLog, "PositionOpened event not found").to.not.be.undefined;
    const actualCost = (openedLog!.args.cost as bigint) ?? 0n;

    expect(actualCost).to.be.gte(1n);
    const delta =
      actualCost >= estimatedCost
        ? actualCost - estimatedCost
        : estimatedCost - actualCost;
    expect(delta).to.be.lte(1n);

    const totalAfter = await core.getRangeSum(marketId, minTick, maxTick);
    expect(totalAfter).to.be.gte(totalBefore);
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
        .openPosition(marketId,
          100450,
          100550,
          MEDIUM_QUANTITY,
          MEDIUM_COST
        )
    ).to.be.revertedWithCustomError(core, "EnforcedPause");
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
        .openPosition(marketId,
          100450,
          100550,
          SMALL_QUANTITY,
          exactCost - 1n
        )
    ).to.be.revertedWithCustomError(core, "CostExceedsMaximum");

    // Test with exact cost should succeed

    await expect(
      core
        .connect(alice)
        .openPosition(marketId,
          100450,
          100550,
          SMALL_QUANTITY,
          exactCost
        )
    ).to.not.be.reverted;
  });

  it("Should handle large quantity trades with chunking", async function () {
    const { core, alice, marketId } = await loadFixture(
      createActiveMarketFixture
    );

    const largeQuantity = ethers.parseUnits("10", 6);
    const quotedCost = await core.calculateOpenCost(
      marketId,
      100000,
      100990,
      largeQuantity
    );
    const largeCost = quotedCost + ethers.parseUnits("1000", 6);

    await expect(
      core
        .connect(alice)
        .openPosition(marketId,
          100000,
          100990,
          largeQuantity,
          largeCost
        )
    ).to.emit(core, "PositionOpened");
  });

  it("Should handle settled market trades", async function () {
    const { core, keeper, alice, marketId } = await loadFixture(
      createActiveMarketFixture
    );

    // Settle market first
    await settleMarketAtTick(core, keeper, marketId, 100490);

    await expect(
      core
        .connect(alice)
        .openPosition(marketId,
          100450,
          100550,
          ethers.parseUnits("0.05", 6),
          ethers.parseUnits("5", 6)
        )
    ).to.be.revertedWithCustomError(core, "MarketNotActive");
  });
});
