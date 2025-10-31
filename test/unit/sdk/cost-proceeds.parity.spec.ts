import { expect } from "chai";
import { ethers } from "hardhat";
import Big from "big.js";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

import { CLMSRSDK } from "../../../clmsr-sdk/src/clmsr-sdk";
import {
  Market,
  MarketDistribution,
  MarketDistributionRaw,
  mapDistribution,
  Position as SDKPosition,
} from "../../../clmsr-sdk/src/types";
import * as MathUtils from "../../../clmsr-sdk/src/utils/math";
import {
  coreFixture,
  createActiveMarket,
  increaseToSafe,
} from "../../helpers/fixtures/core";

type Contracts = Awaited<ReturnType<typeof coreFixture>>;

async function snapshotDistribution(
  core: Contracts["core"],
  marketId: number,
  marketStruct: any
): Promise<MarketDistribution> {
  const minTick = Number(marketStruct.minTick);
  const maxTick = Number(marketStruct.maxTick);
  const tickSpacing = Number(marketStruct.tickSpacing);
  const numBins = Number(marketStruct.numBins);

  const binFactors: string[] = [];
  for (let i = 0; i < numBins; i++) {
    const lower = minTick + i * tickSpacing;
    const upper = lower + tickSpacing;
    const binSum = await core.getRangeSum(marketId, lower, upper);
    binFactors.push(binSum.toString());
  }

  const totalSum = await core.getRangeSum(marketId, minTick, maxTick);

  const raw: MarketDistributionRaw = {
    totalSum: totalSum.toString(),
    binFactors,
  };

  return mapDistribution(raw);
}

function toSDKMarket(marketStruct: any): Market {
  return {
    liquidityParameter: new Big(marketStruct.liquidityParameter.toString()),
    minTick: Number(marketStruct.minTick),
    maxTick: Number(marketStruct.maxTick),
    tickSpacing: Number(marketStruct.tickSpacing),
  };
}

function toMicro(amount: bigint): Big {
  return new Big(amount.toString());
}

async function latestPositionId(mockPosition: any): Promise<number> {
  return Number(await mockPosition.getNextId()) - 1;
}

function assertMicroDelta(
  label: string,
  sdkValue: Big,
  coreValue: bigint,
  tolerance: bigint = 1n
) {
  const delta = BigInt(sdkValue.toString()) - coreValue;
  expect(
    delta <= tolerance && delta >= -tolerance,
    `${label} delta ${delta.toString()} exceeds tolerance`
  ).to.equal(true);
}

describe("SDK ↔ Core cost/proceeds parity (public views)", function () {
  this.timeout(120_000);

  it("matches open cost and sell proceeds within ≤1 micro USDC using public APIs", async function () {
    const contracts = await loadFixture(coreFixture);
    const { core, keeper, alice, mockPosition } = contracts;

    const { marketId } = await createActiveMarket(contracts);

    const marketStruct = await core.getMarket(marketId);
    const sdkMarket = toSDKMarket(marketStruct);

    const initialDistribution = await snapshotDistribution(
      core,
      marketId,
      marketStruct
    );

    const sdk = new CLMSRSDK();

    const tickSpacing = sdkMarket.tickSpacing;

    const additionalCostCases = [
      { offset: 5, width: 3, quantity: 1_000_000n },   // narrow, 1 USDC
      { offset: 15, width: 8, quantity: 3_000_000n },  // mid, 3 USDC
      { offset: 30, width: 12, quantity: 12_500_000n }, // wide, 12.5 USDC
    ];

    for (const testCase of additionalCostCases) {
      const lowerTick = sdkMarket.minTick + testCase.offset * tickSpacing;
      const upperTick = lowerTick + testCase.width * tickSpacing;

      const sdkCost = sdk.calculateOpenCost(
        lowerTick,
        upperTick,
        toMicro(testCase.quantity),
        initialDistribution,
        sdkMarket
      ).cost;

      const coreCost = await core.calculateOpenCost(
        marketId,
        lowerTick,
        upperTick,
        testCase.quantity
      );

      assertMicroDelta(
        `Open cost offset=${testCase.offset},width=${testCase.width}`,
        sdkCost,
        coreCost
      );
    }

    const baseLowerTick = sdkMarket.minTick + 20 * tickSpacing;
    const baseUpperTick = baseLowerTick + 5 * tickSpacing;
    const baseQuantity = 2_500_000n; // 2.5 USDC

    const sdkOpen = sdk.calculateOpenCost(
      baseLowerTick,
      baseUpperTick,
      toMicro(baseQuantity),
      initialDistribution,
      sdkMarket
    ).cost;

    const coreOpen = await core.calculateOpenCost(
      marketId,
      baseLowerTick,
      baseUpperTick,
      baseQuantity
    );

    assertMicroDelta("Base open cost", sdkOpen, coreOpen);

    const chunkQuantity = 4_000_000n; // 4 USDC > max chunk quantity
    const sdkChunk = sdk.calculateOpenCost(
      baseLowerTick,
      baseUpperTick,
      toMicro(chunkQuantity),
      initialDistribution,
      sdkMarket
    ).cost;
    const coreChunk = await core.calculateOpenCost(
      marketId,
      baseLowerTick,
      baseUpperTick,
      chunkQuantity
    );
    assertMicroDelta("Chunked open cost", sdkChunk, coreChunk);

    const sellLowerTick = sdkMarket.minTick + 10 * tickSpacing;
    const sellUpperTick = sellLowerTick + 6 * tickSpacing;
    const positionQuantity = 6_000_000n; // 6 USDC
    const maxCost = BigInt(10_000_000_000_000n); // generous cap

    const positionTx = await core
      .connect(alice)
      .openPosition(
        marketId,
        sellLowerTick,
        sellUpperTick,
        positionQuantity,
        maxCost
      );
    await positionTx.wait();

    const positionId = await latestPositionId(mockPosition);

    await increaseToSafe((await ethers.provider.getBlock("latest"))!.timestamp + 1);

    const distributionAfterOpen = await snapshotDistribution(
      core,
      marketId,
      await core.getMarket(marketId)
    );

    const positionData = await mockPosition.getPosition(positionId);

    const sdkPosition: SDKPosition = {
      lowerTick: Number(positionData.lowerTick),
      upperTick: Number(positionData.upperTick),
      quantity: new Big(positionData.quantity.toString()),
    };

    const sellQuantity = positionQuantity / 2n;

    const sdkSell = sdk.calculateDecreaseProceeds(
      sdkPosition,
      toMicro(sellQuantity),
      distributionAfterOpen,
      sdkMarket
    ).proceeds;

    const coreSell = await core.calculateDecreaseProceeds(positionId, sellQuantity);
    assertMicroDelta("Sell proceeds", sdkSell, coreSell);

    const sdkClose = sdk.calculateCloseProceeds(
      sdkPosition,
      distributionAfterOpen,
      sdkMarket
    ).proceeds;
    const coreClose = await core.calculateCloseProceeds(positionId);
    assertMicroDelta("Close proceeds", sdkClose, coreClose);

    const additionalSellQuantities = [
      positionQuantity / 4n,
      (positionQuantity * 3n) / 4n,
    ];

    for (const qty of additionalSellQuantities) {
      const sdkSellVariant = sdk.calculateDecreaseProceeds(
        sdkPosition,
        toMicro(qty),
        distributionAfterOpen,
        sdkMarket
      ).proceeds;

      const coreSellVariant = await core.calculateDecreaseProceeds(
        positionId,
        qty
      );

      assertMicroDelta(
        `Sell proceeds qty=${qty.toString()}`,
        sdkSellVariant,
        coreSellVariant
      );
    }
  });
});
