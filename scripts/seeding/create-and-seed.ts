import { ethers } from "hardhat";
import {
  AbiCoder,
  formatUnits,
  keccak256,
  parseEther,
} from "ethers";
import { generatePrior } from "../../engine/prior";
import type { PriorResult } from "../../engine/prior";
import { verifyDistribution } from "./verify";
import { getCoreProxy } from "../utils/environment";
import type { Environment } from "../types/environment";

const VALID_ENVIRONMENTS: readonly Environment[] = [
  "localhost",
  "base-dev",
  "base-prod",
  "citrea-dev",
  "citrea-prod",
];

function resolveEnvironment(defaultEnv: Environment): Environment {
  const env =
    process.env.TARGET_ENV ?? process.env.ENVIRONMENT ?? process.env.ENV;
  if (env && VALID_ENVIRONMENTS.includes(env as Environment)) {
    return env as Environment;
  }
  return defaultEnv;
}

function resolveChunkSize(defaultSize: number): number {
  const raw = process.env.BATCH_CHUNK_SIZE;
  if (!raw) return defaultSize;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.floor(parsed)
    : defaultSize;
}

const NOW = Math.floor(Date.now() / 1000);
const START_BUFFER_SECONDS = 6 * 60 * 60; // start ~6 hours from now
const MARKET_DURATION_SECONDS = 36 * 60 * 60; // keep market open for ~36 hours
const SETTLEMENT_DELAY_SECONDS = 6 * 60 * 60; // settle 6 hours after close

const CONFIG = {
  environment: resolveEnvironment("localhost"),
  market: {
    minTick: 100_000,
    maxTick: 140_000,
    tickSpacing: 100,
    startTimestamp: NOW + START_BUFFER_SECONDS,
    endTimestamp: NOW + START_BUFFER_SECONDS + MARKET_DURATION_SECONDS,
    settlementTimestamp:
      NOW +
      START_BUFFER_SECONDS +
      MARKET_DURATION_SECONDS +
      SETTLEMENT_DELAY_SECONDS,
    alpha: "10000",
  },
  prior: {
    anchor: 114_640,
    atr: 3768.37 * 0.5,
    nu: 9,
    epsilon: 0.02,
    kappa: 400,
    mode: "logReturn" as const,
  },
  verification: {
    enabled: true,
    tolerance: 1e-6,
  },
  batching: {
    chunkSize: resolveChunkSize(70),
  },
};

function printPrior(prior: PriorResult) {
  const abi = AbiCoder.defaultAbiCoder();
  console.log("\n🧮 Prior Factors (index | tick | weight | factorWad)");
  prior.weights.forEach((weight, idx) => {
    const tick = CONFIG.market.minTick + idx * CONFIG.market.tickSpacing;
    const factor = prior.factorWad[idx];
    console.log(
      `${idx.toString().padStart(3, "0")} | ${tick
        .toString()
        .padStart(6, "0")} | ${weight.toFixed(12)} | ${factor.toString()}`
    );
  });
  const seedHash = keccak256(abi.encode(["uint256[]"], [prior.factorWad]));
  console.log("\n🧾 Expected seed hash:", seedHash);
}

async function main() {
  const { environment, market, prior: priorCfg, verification } = CONFIG;

  console.log("🎯 Environment:", environment);

  const prior = generatePrior({
    minTick: market.minTick,
    maxTick: market.maxTick,
    tickSpacing: market.tickSpacing,
    anchorPrice: priorCfg.anchor,
    atr: priorCfg.atr,
    nu: priorCfg.nu,
    epsilon: priorCfg.epsilon,
    kappa: priorCfg.kappa,
    mode: priorCfg.mode,
  });

  console.log("📊 Prior metrics:");
  console.log("  - Num bins:", prior.numBins);
  console.log(
    "  - Factor range:",
    prior.metrics.minFactor.toFixed(6),
    "→",
    prior.metrics.maxFactor.toFixed(6)
  );
  console.log("  - Entropy:", prior.metrics.entropy.toFixed(6));
  console.log("  - Effective bins:", prior.metrics.effectiveBins.toFixed(2));
  console.log(
    "  - Max loss coeff:",
    prior.metrics.maxLossCoefficient.toFixed(4)
  );

  printPrior(prior);

  const coreAddress = getCoreProxy(environment);
  const core = await ethers.getContractAt("CLMSRMarketCore", coreAddress);
  const owner = await core.owner();
  const signers = await ethers.getSigners();
  const ownerSigner =
    signers.find((s) => s.address.toLowerCase() === owner.toLowerCase()) ??
    signers[0];
  const coreWithOwner = core.connect(ownerSigner);

  const params = {
    minTick: market.minTick,
    maxTick: market.maxTick,
    tickSpacing: market.tickSpacing,
    startTimestamp: market.startTimestamp,
    endTimestamp: market.endTimestamp,
    settlementTimestamp: market.settlementTimestamp,
    liquidityParameter: parseEther(market.alpha),
  };

  const seedHash = keccak256(
    AbiCoder.defaultAbiCoder().encode(["uint256[]"], [prior.factorWad])
  );

  console.log("\n🧾 Seed hash:", seedHash);

  const expectedMarketId = await coreWithOwner.createMarket.staticCall(
    params.minTick,
    params.maxTick,
    params.tickSpacing,
    params.startTimestamp,
    params.endTimestamp,
    params.settlementTimestamp,
    params.liquidityParameter
  );

  const createTx = await coreWithOwner.createMarket(
    params.minTick,
    params.maxTick,
    params.tickSpacing,
    params.startTimestamp,
    params.endTimestamp,
    params.settlementTimestamp,
    params.liquidityParameter
  );
  console.log("⏳ Creating market...", createTx.hash);
  const createReceipt = await createTx.wait();
  console.log(
    "✅ Market created (gas=",
    createReceipt?.gasUsed?.toString() ?? "N/A",
    ")"
  );

  const marketId = Number(expectedMarketId);
  console.log("🆔 Market ID:", marketId);

  const totalBins = prior.factorWad.length;
  const chunkSize = CONFIG.batching.chunkSize;
  const minTickBig = BigInt(market.minTick);
  const spacingBig = BigInt(market.tickSpacing);

  for (let offset = 0; offset < totalBins; offset += chunkSize) {
    const end = Math.min(offset + chunkSize, totalBins);
    const lowers: bigint[] = [];
    const uppers: bigint[] = [];
    const factors: bigint[] = [];

    for (let i = offset; i < end; i++) {
      const lower = minTickBig + spacingBig * BigInt(i);
      lowers.push(lower);
      uppers.push(lower + spacingBig);
      factors.push(prior.factorWad[i]);
    }

    const tx = await coreWithOwner.applyRangeFactorBatch(
      marketId,
      lowers,
      uppers,
      factors,
      seedHash
    );
    console.log(
      `⏳ Applying factors [${offset}, ${end - 1}]...`,
      tx.hash
    );
    const receipt = await tx.wait();
    console.log(
      "✅ Batch applied (gas=",
      receipt?.gasUsed?.toString() ?? "N/A",
      ")"
    );

    const batchLog = receipt?.logs
      ?.map((log) => {
        try {
          return core.interface.parseLog({ topics: log.topics, data: log.data });
        } catch (err) {
          return null;
        }
      })
      .find((parsed) => parsed && parsed.name === "RangeFactorBatchApplied");

    if (batchLog) {
      console.log(
        "   Batch context:",
        `count=${batchLog.args[1]} context=${batchLog.args[2]}`
      );
    }
  }

  if (verification.enabled) {
    console.log("\n🔍 Verifying on-chain distribution...");
    const verificationResult = await verifyDistribution(
      core,
      marketId,
      prior,
      verification.tolerance
    );

    console.log(
      `  RMSE: ${verificationResult.rmse.toExponential(
        6
      )}, MAE: ${verificationResult.mae.toExponential(6)}, max error: ${verificationResult.maxError.toExponential(
        6
      )}`
    );
    console.log(
      "  Total weight:",
      verificationResult.report.totalWeight.toFixed(6)
    );
  } else {
    console.log("⚠️ Verification skipped (disabled in CONFIG).");
  }

  const autoActivate = process.env.ACTIVATE_AFTER_SEED === "true";

  if (autoActivate) {
    console.log("\n🔓 ACTIVATE_AFTER_SEED=true -> 마켓 활성화 진행...");
    const activateTx = await coreWithOwner.setMarketActive(
      BigInt(marketId),
      true
    );
    console.log("   • tx:", activateTx.hash);
    const activateReceipt = await activateTx.wait();
    console.log(
      "   ✅ 활성화 완료 (gas=",
      activateReceipt?.gasUsed?.toString() ?? "N/A",
      ")"
    );
  } else {
    console.log(
      "\n⚠️ 새 마켓은 기본적으로 비활성 상태입니다. 검증 후 아래 명령어로 개장하세요:"
    );
    console.log(
      `   COMMAND=set-market-active:${environment} MARKET_ID=${marketId} ACTIVE=true npx hardhat run scripts/dispatcher.ts --network ${environment}`
    );
  }

  console.log("\n🎉 Market creation + seeding complete!");
  console.log(
    "  Liquidity parameter (α):",
    formatUnits(params.liquidityParameter, 18)
  );
}

main().catch((error) => {
  console.error("❌ create-and-seed failed:", error);
  process.exitCode = 1;
});
