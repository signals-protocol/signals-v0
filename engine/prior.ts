import { parseUnits } from "ethers";

export type PriorMode = "logReturn" | "priceDiff";

export interface PriorConfig {
  minTick: number;
  maxTick: number;
  tickSpacing: number;
  anchorPrice: number;
  atr: number;
  nu?: number;
  epsilon?: number;
  kappa?: number;
  mode?: PriorMode;
}

export interface PriorMetrics {
  minFactor: number;
  maxFactor: number;
  entropy: number;
  effectiveBins: number;
  maxLossCoefficient: number;
}

export interface PriorResult {
  numBins: number;
  ticks: number[];
  basePrior: number[];
  blendedPrior: number[];
  weights: number[];
  factorWad: bigint[];
  metrics: PriorMetrics;
}

const LANCZOS_COEFFS = [
  676.5203681218851,
  -1259.1392167224028,
  771.32342877765313,
  -176.61502916214059,
  12.507343278686905,
  -0.13857109526572012,
  9.9843695780195716e-6,
  1.5056327351493116e-7,
];

const LOG_SQRT_2PI = 0.9189385332046727; // 0.5 * ln(2π)
const MIN_FACTOR_WAD = parseUnits("0.01", 18);
const MAX_FACTOR_WAD = parseUnits("100", 18);

function logGamma(z: number): number {
  if (z < 0.5) {
    return (
      Math.log(Math.PI) -
      Math.log(Math.sin(Math.PI * z)) -
      logGamma(1 - z)
    );
  }

  z -= 1;
  let x = 0.99999999999980993;
  for (let i = 0; i < LANCZOS_COEFFS.length; i++) {
    x += LANCZOS_COEFFS[i] / (z + i + 1);
  }

  const t = z + LANCZOS_COEFFS.length - 0.5;
  return LOG_SQRT_2PI + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

function studentTPdf(x: number, nu: number): number {
  const halfNu = nu / 2;
  const logNumerator = logGamma((nu + 1) / 2);
  const logDenominator =
    Math.log(Math.sqrt(nu * Math.PI)) + logGamma(halfNu);
  const logTerm = -((nu + 1) / 2) * Math.log(1 + (x * x) / nu);
  return Math.exp(logNumerator - logDenominator + logTerm);
}

function assertFinite(value: number, context: string) {
  if (!Number.isFinite(value)) {
    throw new Error(`Non-finite value detected in ${context}`);
  }
}

export function generatePrior(config: PriorConfig): PriorResult {
  const {
    minTick,
    maxTick,
    tickSpacing,
    anchorPrice,
    atr,
    nu = 5,
    epsilon = 0.02,
    kappa,
    mode = "logReturn",
  } = config;

  if (tickSpacing <= 0) {
    throw new Error("tickSpacing must be positive");
  }
  if ((maxTick - minTick) % tickSpacing !== 0) {
    throw new Error("Tick range must be divisible by tickSpacing");
  }

  const numBins = (maxTick - minTick) / tickSpacing;
  if (numBins <= 0) {
    throw new Error("Derived bin count must be positive");
  }

  if (anchorPrice <= 0) {
    throw new Error("anchorPrice must be positive");
  }
  if (anchorPrice < minTick || anchorPrice >= maxTick) {
    throw new Error("anchorPrice must lie within [minTick, maxTick)");
  }
  if (atr <= 0) {
    throw new Error("atr must be positive");
  }
  if (epsilon <= 0 || epsilon >= 1) {
    throw new Error("epsilon must be between 0 and 1");
  }
  if (nu <= 2) {
    throw new Error("nu must be greater than 2 for finite variance");
  }

  const effectiveKappa = kappa ?? numBins;
  if (effectiveKappa <= 0) {
    throw new Error("kappa must be positive");
  }

  const ticks: number[] = [];
  const basePrior: number[] = [];
  let pdfSum = 0;

  const sigma =
    mode === "logReturn" ? atr / anchorPrice : atr;
  assertFinite(sigma, "sigma");

  for (let i = 0; i < numBins; i++) {
    const tickValue = minTick + i * tickSpacing;
    ticks.push(tickValue);

    let density: number;
    if (mode === "logReturn") {
      const ratio = tickValue / anchorPrice;
      assertFinite(ratio, "ratio");
      if (ratio <= 0) {
        throw new Error("tick/anchor ratio must be positive for logReturn mode");
      }
      const r = Math.log(ratio);
      assertFinite(r, "logReturn");
      const scaled = r / sigma;
      assertFinite(scaled, "scaled log return");
      density = studentTPdf(scaled, nu) / tickValue;
    } else {
      const diff = (tickValue - anchorPrice) / sigma;
      assertFinite(diff, "priceDiff scaled value");
      density = studentTPdf(diff, nu);
    }

    assertFinite(density, "density");
    if (density < 0) {
      throw new Error("Density cannot be negative");
    }

    basePrior.push(density);
    pdfSum += density;
  }

  if (pdfSum <= 0) {
    throw new Error("Prior density sum must be positive");
  }

  // Normalize base prior
  for (let i = 0; i < basePrior.length; i++) {
    basePrior[i] = basePrior[i] / pdfSum;
  }

  const uniformWeight = 1 / numBins;
  const blendedPrior: number[] = [];

  for (let i = 0; i < numBins; i++) {
    const blended =
      (1 - epsilon) * basePrior[i] + epsilon * uniformWeight;
    assertFinite(blended, "blended prior");
    blendedPrior.push(blended);
  }

  // Re-normalize to guard against rounding drift
  const blendedSum = blendedPrior.reduce((acc, v) => acc + v, 0);
  for (let i = 0; i < blendedPrior.length; i++) {
    blendedPrior[i] = blendedPrior[i] / blendedSum;
  }

  const weights: number[] = [];
  const factorWad: bigint[] = [];
  let minFactor = Number.POSITIVE_INFINITY;
  let maxFactor = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < numBins; i++) {
    const weight = blendedPrior[i] * effectiveKappa;
    assertFinite(weight, "weight");
    weights.push(weight);
    if (weight < minFactor) minFactor = weight;
    if (weight > maxFactor) maxFactor = weight;

    const asFixed = weight.toFixed(18);
    const wad = parseUnits(asFixed, 18);

    if (wad < MIN_FACTOR_WAD || wad > MAX_FACTOR_WAD) {
      throw new Error(
        `Factor out of allowed range at index ${i}: ${weight.toFixed(6)}`
      );
    }

    factorWad.push(wad);
  }

  const entropy = blendedPrior.reduce((acc, p) => {
    return p > 0 ? acc - p * Math.log(p) : acc;
  }, 0);

  const metrics: PriorMetrics = {
    minFactor,
    maxFactor,
    entropy,
    effectiveBins: Math.exp(entropy),
    maxLossCoefficient: Math.log(numBins / epsilon),
  };

  return {
    numBins,
    ticks,
    basePrior,
    blendedPrior,
    weights,
    factorWad,
    metrics,
  };
}
