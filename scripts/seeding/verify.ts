import { ethers } from "hardhat";
import { formatUnits } from "ethers";
import { generatePrior } from "../../engine/prior";
import type { PriorResult } from "../../engine/prior";
import { getCoreProxy } from "../utils/environment";
import type { Environment } from "../types/environment";
import type { CLMSRMarketCore } from "../../typechain-types";

export interface DistributionReport {
  probabilities: number[];
  weights: number[];
  totalWeight: number;
}

export interface VerificationResult {
  rmse: number;
  mae: number;
  maxError: number;
  report: DistributionReport;
}

async function readDistribution(
  core: CLMSRMarketCore,
  marketId: bigint
): Promise<DistributionReport> {
  const market = await core.getMarket(marketId);
  const numBins = Number(market.numBins);
  if (numBins <= 0) {
    throw new Error(`Market ${marketId} has no bins`);
  }

  const minTick = Number(market.minTick);
  const tickSpacing = Number(market.tickSpacing);
  const maxTick = Number(market.maxTick);

  const totalRaw = await core.getRangeSum(marketId, minTick, maxTick);
  const totalWeight = parseFloat(formatUnits(totalRaw, 18));

  const weights: number[] = [];
  const probabilities: number[] = [];

  for (let i = 0; i < numBins; i++) {
    const lowerTick = minTick + i * tickSpacing;
    const upperTick = lowerTick + tickSpacing;
    const binRaw = await core.getRangeSum(marketId, lowerTick, upperTick);
    const binWeight = parseFloat(formatUnits(binRaw, 18));
    weights.push(binWeight);
    probabilities.push(binWeight / totalWeight);
  }

  return { probabilities, weights, totalWeight };
}

export async function verifyDistribution(
  core: CLMSRMarketCore,
  marketId: number,
  prior: PriorResult,
  tolerance = 1e-6
): Promise<VerificationResult> {
  const distribution = await readDistribution(core, BigInt(marketId));

  if (distribution.probabilities.length !== prior.blendedPrior.length) {
    throw new Error(
      `Bin length mismatch: on-chain=${distribution.probabilities.length}, prior=${prior.blendedPrior.length}`
    );
  }

  let mae = 0;
  let mse = 0;
  let maxError = 0;

  for (let i = 0; i < distribution.probabilities.length; i++) {
    const diff = distribution.probabilities[i] - prior.blendedPrior[i];
    const absDiff = Math.abs(diff);
    mae += absDiff;
    mse += diff * diff;
    if (absDiff > maxError) {
      maxError = absDiff;
    }
  }

  mae /= distribution.probabilities.length;
  mse /= distribution.probabilities.length;

  if (maxError > tolerance) {
    throw new Error(
      `Verification failed: max error ${maxError.toExponential(
        6
      )} exceeds tolerance ${tolerance}`
    );
  }

  return {
    rmse: Math.sqrt(mse),
    mae,
    maxError,
    report: distribution,
  };
}

// CLI execution
const VALID_ENVIRONMENTS: readonly Environment[] = [
  "localhost",
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

function resolveMarketId(defaultMarketId: number): number {
  const raw = process.env.MARKET_ID;
  if (!raw) return defaultMarketId;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0
    ? Math.floor(parsed)
    : defaultMarketId;
}

function resolveTolerance(defaultTolerance: number): number {
  const raw = process.env.VERIFY_TOLERANCE;
  if (!raw) return defaultTolerance;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultTolerance;
}

const CONFIG = {
  environment: resolveEnvironment("localhost"),
  marketId: resolveMarketId(1),
  market: {
    minTick: 100_000,
    maxTick: 140_000,
    tickSpacing: 100,
  },
  prior: {
    anchor: 114_640,
    atr: 3768.37 * 0.5,
    nu: 9,
    epsilon: 0.02,
    kappa: 400,
    mode: "logReturn" as const,
  },
  tolerance: resolveTolerance(1e-6),
};

async function main() {
  const { environment, marketId, market, prior: priorCfg, tolerance } = CONFIG;

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

  console.log("🔎 Verifying market", marketId, "on", environment);
  console.log("  Config bins:", prior.numBins);

  const core = await ethers.getContractAt(
    "CLMSRMarketCore",
    getCoreProxy(environment)
  );

  const verification = await verifyDistribution(
    core,
    marketId,
    prior,
    tolerance
  );

  console.log(
    `✅ Verification succeeded. RMSE=${verification.rmse.toExponential(
      6
    )}, MAE=${verification.mae.toExponential(
      6
    )}, max error=${verification.maxError.toExponential(6)}`
  );
  console.log("   Total weight:", verification.report.totalWeight.toFixed(6));
}

if (require.main === module) {
  main().catch((error) => {
    console.error("❌ verify-seeding failed:", error);
    process.exitCode = 1;
  });
}
