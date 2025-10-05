import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { coreFixture, setupCustomMarket, settleMarketAtTick } from "../../helpers/fixtures/core";
import { E2E_TAG } from "../../helpers/tags";

const USDC_DECIMALS = 6;
const SCALE_DIFF = 1_000_000_000_000n; // 1e12 for 6 -> 18 decimal conversions
const COST_BUFFER_BPS = 2_000n; // 20% buffer
const BPS_DENOMINATOR = 10_000n;
const LOW_ALPHA = ethers.parseEther("0.05"); // Very thin liquidity (~$15 depth)

const MARKET_MIN_TICK = 100000;
const TICK_SPACING = 10;
const NARROW_RANGE = {
  lower: MARKET_MIN_TICK + 20,
  upper: MARKET_MIN_TICK + 40,
};
const WIDE_RANGE = {
  lower: MARKET_MIN_TICK + 10,
  upper: MARKET_MIN_TICK + 90,
};
const SETTLEMENT_TICK = MARKET_MIN_TICK + 10;

const applyBuffer = (amount: bigint, buffer: bigint = COST_BUFFER_BPS) =>
  ((amount * (BPS_DENOMINATOR + buffer)) / BPS_DENOMINATOR) + 1n;

async function createLowLiquidityMarket() {
  const contracts = await loadFixture(coreFixture);
  const { marketId } = await setupCustomMarket(contracts, {
    alpha: LOW_ALPHA,
  });

  return {
    ...contracts,
    marketId,
  };
}

describe(`${E2E_TAG} Low Liquidity Market Scenarios`, function () {
  this.timeout(120_000);

  describe("Trading behaviour under thin depth", function () {
    it("exhibits superlinear price impact as size increases", async function () {
      const { core, marketId, alice } = await loadFixture(createLowLiquidityMarket);

      const lowerTick = NARROW_RANGE.lower;
      const upperTick = NARROW_RANGE.upper;
      const smallQty = ethers.parseUnits("0.1", USDC_DECIMALS);
      const mediumQty = ethers.parseUnits("0.5", USDC_DECIMALS);
      const largeQty = ethers.parseUnits("1", USDC_DECIMALS);

      const smallCost = await core.calculateOpenCost(
        marketId,
        lowerTick,
        upperTick,
        smallQty
      );
      const mediumCost = await core.calculateOpenCost(
        marketId,
        lowerTick,
        upperTick,
        mediumQty
      );
      const largeCost = await core.calculateOpenCost(
        marketId,
        lowerTick,
        upperTick,
        largeQty
      );

      // Average price should increase with trade size (slippage)
      expect(mediumCost * smallQty).to.be.gt(smallCost * mediumQty);
      expect(largeCost * mediumQty).to.be.gt(mediumCost * largeQty);

      await core
        .connect(alice)
        .openPosition(
          marketId,
          lowerTick,
          upperTick,
          mediumQty,
          applyBuffer(mediumCost)
        );
    });

    it("rejects jumbo orders via chunk limit guardrails", async function () {
      const { core, marketId, alice } = await loadFixture(createLowLiquidityMarket);

      const lowerTick = WIDE_RANGE.lower;
      const upperTick = WIDE_RANGE.upper;
      const extremeQuantity = ethers.parseUnits("50000000", USDC_DECIMALS); // $50m notional

      const chunkSize = LOW_ALPHA - 1n; // alpha*wMul(1) - 1 in wad units
      const quantityWad = extremeQuantity * SCALE_DIFF;
      const requiredChunks = (quantityWad + chunkSize - 1n) / chunkSize;

      await expect(
        core
          .connect(alice)
          .openPosition(
            marketId,
            lowerTick,
            upperTick,
            extremeQuantity,
            ethers.MaxUint256
          )
      )
        .to.be.revertedWithCustomError(core, "ChunkLimitExceeded")
        .withArgs(requiredChunks, 1000n);
    });

    it("protects traders when maxCost is underestimated", async function () {
      const { core, marketId, alice } = await loadFixture(createLowLiquidityMarket);

      const lowerTick = NARROW_RANGE.lower;
      const upperTick = NARROW_RANGE.upper;
      const quantity = ethers.parseUnits("0.5", USDC_DECIMALS);

      const quotedCost = await core.calculateOpenCost(
        marketId,
        lowerTick,
        upperTick,
        quantity
      );

      const underQuotedMaxCost = quotedCost - quotedCost / 5n; // 20% shortfall

      await expect(
        core
          .connect(alice)
          .openPosition(
            marketId,
            lowerTick,
            upperTick,
            quantity,
            underQuotedMaxCost
          )
      ).to.be.revertedWithCustomError(core, "CostExceedsMaximum");
    });
  });

  describe("Lifecycle resilience", function () {
    it("settles markets and allows claims despite thin liquidity", async function () {
      const { core, mockPosition, keeper, alice, bob, marketId } =
        await loadFixture(createLowLiquidityMarket);

      const lowerTick = WIDE_RANGE.lower;
      const upperTick = WIDE_RANGE.upper;

      const aliceQty = ethers.parseUnits("0.2", USDC_DECIMALS);
      const bobQty = ethers.parseUnits("0.3", USDC_DECIMALS);

      const aliceCost = await core.calculateOpenCost(
        marketId,
        lowerTick,
        upperTick,
        aliceQty
      );
      const bobCost = await core.calculateOpenCost(
        marketId,
        lowerTick,
        upperTick,
        bobQty
      );

      const aliceTx = await core
        .connect(alice)
        .openPosition(
          marketId,
          lowerTick,
          upperTick,
          aliceQty,
          applyBuffer(aliceCost, 5_000n) // 50% buffer for stability
        );
      await aliceTx.wait();

      const bobTx = await core
        .connect(bob)
        .openPosition(
          marketId,
          lowerTick + 20,
          upperTick - 20,
          bobQty,
          applyBuffer(bobCost, 5_000n)
        );
      await bobTx.wait();

      const alicePositions = await mockPosition.getPositionsByOwner(alice.address);
      expect(alicePositions.length).to.be.gte(1);
      const alicePositionId = alicePositions[0];

      await time.increase(7 * 24 * 60 * 60 + 3600);
      await settleMarketAtTick(core, keeper, marketId, SETTLEMENT_TICK);

      const market = await core.getMarket(marketId);
      expect(market.settled).to.be.true;

      const previewPayout = await core
        .connect(alice)
        .claimPayout.staticCall(alicePositionId);
      expect(previewPayout).to.be.gte(0n);

      await expect(
        core.connect(alice).claimPayout(alicePositionId)
      ).to.emit(core, "PositionClaimed");

      expect(await mockPosition.exists(alicePositionId)).to.be.false;

      const bobPositions = await mockPosition.getPositionsByOwner(bob.address);
      for (const positionId of bobPositions) {
        expect(await mockPosition.exists(positionId)).to.be.true;
      }
    });
  });
});
