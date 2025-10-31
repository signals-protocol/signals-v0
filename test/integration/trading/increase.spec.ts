import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { createActiveMarketFixture } from "../../helpers/fixtures/core";
import { INTEGRATION_TAG } from "../../helpers/tags";

describe(`${INTEGRATION_TAG} Position Increase`, function () {
  const SMALL_QUANTITY = ethers.parseUnits("0.01", 6); // 0.01 USDC
  const MEDIUM_QUANTITY = ethers.parseUnits("0.05", 6); // 0.05 USDC
  const MEDIUM_COST = ethers.parseUnits("5", 6); // 5 USDC
  const COST_BUFFER = ethers.parseUnits("100", 6);

  async function quoteIncreaseCost(
    coreContract: any,
    positionId: bigint,
    amount: bigint
  ) {
    const quote = await coreContract.calculateIncreaseCost(positionId, amount);
    return quote + COST_BUFFER;
  }

  it("Should increase position quantity successfully", async function () {
    const { core, alice, paymentToken, mockPosition, marketId } =
      await loadFixture(createActiveMarketFixture);

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
    const { core, alice, mockPosition } = await loadFixture(
      createActiveMarketFixture
    );

    await expect(
      core.connect(alice).increasePosition(
        999, // Non-existent position
        SMALL_QUANTITY,
        MEDIUM_COST
      )
    ).to.be.revertedWithCustomError(mockPosition, "PositionNotFound");
  });

  it("Should handle zero quantity increase", async function () {
    const { core, alice, mockPosition, marketId } = await loadFixture(
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
        marketId,
        100450,
        100550,
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
        marketId,
        100450,
        100550,
        MEDIUM_QUANTITY,
        MEDIUM_COST
      );

    const positions = await mockPosition.getPositionsByOwner(alice.address);
    const positionId = positions[0];

    const increaseAmount = SMALL_QUANTITY;
    const increaseCost = await quoteIncreaseCost(
      core,
      positionId,
      increaseAmount
    );

    // Pause the contract
    await core.connect(keeper).pause("Testing pause");

    await expect(
      core
        .connect(alice)
        .increasePosition(positionId, increaseAmount, increaseCost)
    ).to.be.revertedWithCustomError(core, "EnforcedPause");
  });

  it("Should handle gas-efficient small adjustments", async function () {
    const { core, alice, mockPosition, marketId } = await loadFixture(
      createActiveMarketFixture
    );

    // Create position
    await core.connect(alice).openPosition(
      marketId,
      100450,
      100550,
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
      lowerTick: 100450, // 새 틱 시스템 (45번째 → 100450)
      upperTick: 100550, // 새 틱 시스템 (55번째 → 100550)
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

    const cost = await core.calculateIncreaseCost(positionId, SMALL_QUANTITY);
    expect(cost).to.be.gt(0);
  });

  it("Uses nearest rounding with min-one guard and keeps tree sums monotonic when increasing", async function () {
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

    const additionalQuantity = 1n;
    const estimatedCost = await core.calculateIncreaseCost(
      positionId,
      additionalQuantity
    );
    expect(estimatedCost).to.equal(1n);

    const totalBefore = await core.getRangeSum(marketId, minTick, maxTick);

    const maxCost = estimatedCost + 1n;
    const tx = await core
      .connect(alice)
      .increasePosition(positionId, additionalQuantity, maxCost);
    const receipt = await tx.wait();

    const increasedLog = receipt.logs
      .map((log) => {
        try {
          return core.interface.parseLog(log);
        } catch {
          return undefined;
        }
      })
      .find((parsed) => parsed && parsed.name === "PositionIncreased");

    expect(increasedLog, "PositionIncreased event not found").to.not.be
      .undefined;
    const actualCost = (increasedLog!.args.cost as bigint) ?? 0n;

    expect(actualCost).to.be.gte(1n);
    const delta =
      actualCost >= estimatedCost
        ? actualCost - estimatedCost
        : estimatedCost - actualCost;
    expect(delta).to.be.lte(1n);

    const totalAfter = await core.getRangeSum(marketId, minTick, maxTick);
    expect(totalAfter).to.be.gte(totalBefore);
  });
});
