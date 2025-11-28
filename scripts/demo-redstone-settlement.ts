import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { getSignersForDataServiceId, requestDataPackages } from "@redstone-finance/sdk";

import {
  advanceToClaimOpen,
  coreFixture,
  createMarketWithConfig,
  setMarketActivation,
  toSettlementValue,
} from "../test/helpers/fixtures/core";

const ORACLE_TAG = "CLMSR_SETTLEMENT";
const DATA_SERVICE_SYMBOL = process.env.REDSTONE_SYMBOL || "BTC"; // 기본 BTC
const WINDOW_PADDING = 30; // seconds to move past gates when using increaseTo
const DATA_SERVICE_ID =
  process.env.REDSTONE_SERVICE_ID || "redstone-primary-prod";
const TARGET_SETTLEMENT_TIME =
  process.env.SETTLEMENT_TIME !== undefined
    ? Number(process.env.SETTLEMENT_TIME)
    : Math.floor(Date.now() / 1000) - 3600; // 기본: 현재보다 1시간 전 목표
const MAX_TIME_DEVIATION_SEC =
  Number(process.env.MAX_TIME_DEVIATION_SEC) || 6 * 3600; // 기본 ±6시간 이내 샘플 허용

type OracleSample = { price: number; timestampSec: number; diff: number };

async function fetchHistoricalSample(
  symbol: string,
  targetTs: number
): Promise<OracleSample> {
  const authorizedSigners = getSignersForDataServiceId(DATA_SERVICE_ID);

  const requestBase = {
    dataServiceId: DATA_SERVICE_ID,
    dataPackagesIds: [symbol],
    uniqueSignersCount: 1,
    maxTimestampDeviationMS: MAX_TIME_DEVIATION_SEC * 1000,
    authorizedSigners,
    waitForAllGatewaysTimeMs: 1500,
  };

  let pkgs;
  try {
    pkgs = await requestDataPackages({
      ...requestBase,
      historicalTimestamp: targetTs * 1000, // ms
    });
  } catch (err) {
    console.warn(
      `historical request failed for target=${targetTs}, falling back to latest. error=${(err as Error).message}`
    );
    pkgs = await requestDataPackages(requestBase);
  }

  const list = pkgs[symbol];
  if (!list || !list.length) {
    throw new Error(
      `No RedStone package found for ${symbol} within ${MAX_TIME_DEVIATION_SEC}s of target ${targetTs}`
    );
  }

  // pick closest (packages are sorted by recency in SDK response)
  const pkg = list[0].dataPackage;
  const tsSec = Math.floor(Number(pkg.timestampMilliseconds) / 1000);
  const dp: any = pkg.dataPoints[0];
  const price =
    Number(dp?.numericDataPointArgs?.value) ??
    Number(
      dp?.value && typeof dp.value === "object" && "toString" in dp.value
        ? (dp.value as any).toString()
        : dp?.value
    );
  if (!Number.isFinite(price) || !Number.isFinite(tsSec)) {
    throw new Error(`Invalid package payload for ${symbol}`);
  }

  return { price, timestampSec: tsSec, diff: Math.abs(tsSec - targetTs) };
}

async function signSettlementPayload(
  signer: any,
  marketId: number,
  settlementValue: bigint,
  priceTimestamp: number
) {
  const hash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["string", "uint256", "int256", "uint64"],
      [ORACLE_TAG, marketId, settlementValue, priceTimestamp]
    )
  );
  return signer.signMessage(ethers.getBytes(hash));
}

async function main() {
  console.log("Setting up core + markets with RedStone price feed…");
  const { core, keeper, alice, paymentToken } = await coreFixture();
  const signerAddr = await keeper.getAddress();

  await core.connect(keeper).setSettlementOracleSigner(signerAddr);

  const nearest = await fetchHistoricalSample(
    DATA_SERVICE_SYMBOL,
    TARGET_SETTLEMENT_TIME
  );
  const now = await time.latest();
  console.log(
    `Selected RedStone sample → ts=${nearest.timestampSec}, price=${nearest.price}, diff=${nearest.diff}s, target=${TARGET_SETTLEMENT_TIME}, chainNow=${now}`
  );

  // 시장 타임라인은 submit/finalize를 맞추기 위해 현재 이후로 설정
  const startTime = now + 120; // trading opens in 2m
  const endTime = startTime + 300; // trading lasts 5m
  const settlementTime = endTime + 300; // settlement in ~10m from now

  const tick = Math.round(nearest.price); // simple integer tick based on price
  const minTick = tick - 200;
  const maxTick = tick + 200;

  // Ensure we're before start
  await increaseIfNeeded(startTime - 1);

  const marketId = await createMarketWithConfig(core, keeper, {
    minTick,
    maxTick,
    tickSpacing: 1,
    startTime,
    endTime,
    settlementTime,
    liquidityParameter: ethers.parseEther("1"),
    feePolicy: ethers.ZeroAddress,
  });
  await setMarketActivation(core, keeper, marketId, true);

  // Open a position that will be in range for the settlement tick
  const openTs = Math.min(startTime + WINDOW_PADDING, endTime - 1);
  await increaseIfNeeded(openTs);
  console.log(
    `Opening position at ts=${await time.latest()} (start=${startTime}, end=${endTime})`
  );
  const coreAddr = await core.getAddress();
  await paymentToken
    .connect(alice)
    .approve(coreAddr, ethers.parseUnits("100", 6));
  const lowerTick = tick - 10;
  const upperTick = tick + 10;
  const openPosition = core
    .connect(alice)
    .openPosition;
  const positionId = 1; // first position for this demo
  await openPosition(
    marketId,
    lowerTick,
    upperTick,
    ethers.parseUnits("1", 6),
    ethers.parseUnits("1000", 6)
  );

  // Submit settlement during [T, T+10m)
  await increaseIfNeeded(settlementTime + WINDOW_PADDING);
  const settlementValue = toSettlementValue(tick);
  const sig = await signSettlementPayload(
    keeper,
    marketId,
    settlementValue,
    nearest.timestampSec
  );
  await core
    .connect(alice)
    .submitSettlement(marketId, settlementValue, nearest.timestampSec, sig);

  // Finalize during [T+10m, T+15m)
  await increaseIfNeeded(settlementTime + 11 * 60);
  await core.connect(keeper).finalizeSettlement(marketId, false);

  // Claim after T+15
  await advanceToClaimOpen(core, marketId);
  const claimTx = await core.connect(alice).claimPayout(positionId);
  const claimReceipt = await claimTx.wait();

  console.log(
    `Settlement complete (with position). Tick=${tick}, payout tx=${claimReceipt?.hash}`
  );

  // ---- Oracle-only market (no positions) to validate flow ----
  const oracleOnlyStart = (await time.latest()) + 10;
  const oracleOnlyEnd = oracleOnlyStart + 60;
  const oracleOnlySettlement = oracleOnlyEnd + 60;
  const oracleOnlyId = await createMarketWithConfig(core, keeper, {
    minTick,
    maxTick,
    tickSpacing: 1,
    startTime: oracleOnlyStart,
    endTime: oracleOnlyEnd,
    settlementTime: oracleOnlySettlement,
    liquidityParameter: ethers.parseEther("1"),
    feePolicy: ethers.ZeroAddress,
  });
  await setMarketActivation(core, keeper, oracleOnlyId, true);
  const oracleSig = await signSettlementPayload(
    keeper,
    oracleOnlyId,
    settlementValue,
    nearest.timestampSec
  );
  await increaseIfNeeded(oracleOnlySettlement + WINDOW_PADDING);
  await core
    .connect(alice)
    .submitSettlement(
      oracleOnlyId,
      settlementValue,
      nearest.timestampSec,
      oracleSig
    );
  await increaseIfNeeded(oracleOnlySettlement + 11 * 60);
  await core.connect(keeper).finalizeSettlement(oracleOnlyId, false);
  console.log(
    `Oracle-only market settled. marketId=${oracleOnlyId}, tick=${tick}`
  );
}

async function increaseIfNeeded(targetTs: number) {
  const current = await time.latest();
  if (current >= targetTs) return;
  await time.increaseTo(targetTs);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
