import { parseUnits } from "ethers";

/**
 * Safe trading limits based on mathematical constraints
 *
 * Background:
 * - MAX_EXP_INPUT_WAD ≈ 0.13 (maximum safe input for exp function)
 * - For α = 0.5, max safe quantity per chunk = α × 0.13 ≈ 0.065 ETH = 65 USDC
 * - To prevent chunk overflow, we use 30-50% of this limit for stress tests
 */

// Standard liquidity parameter used in tests
export const STANDARD_ALPHA = parseUnits("0.5", 18); // 0.5 WAD

// Helper function to calculate safe quantity for given alpha and percentage
export function qtyFor(alpha: bigint, pct = 0.3): bigint {
  // alpha × 0.13 × pct, converted to 6-decimal USDC
  const alphaNumber = Number(alpha) / 1e18; // Convert from WAD to decimal
  const maxSafeUSDC = alphaNumber * 0.13 * pct; // Calculate safe amount
  return parseUnits(maxSafeUSDC.toFixed(6), 6); // Convert to 6-decimal USDC
}

// Safe trading sizes for different strategies (30% of theoretical max)
export const SAFE_DAY_TRADE_SIZE = qtyFor(STANDARD_ALPHA, 0.3); // ~2 USDC
export const SAFE_SCALP_SIZE = qtyFor(STANDARD_ALPHA, 0.12); // ~0.8 USDC
export const SAFE_SWING_SIZE = qtyFor(STANDARD_ALPHA, 0.54); // ~3.5 USDC

// Conservative trading sizes for extreme stress tests (15% of theoretical max)
export const CONSERVATIVE_TRADE_SIZE = qtyFor(STANDARD_ALPHA, 0.15); // ~1 USDC

// Maximum safe single chunk size (90% of theoretical max)
export const MAX_SAFE_CHUNK_SIZE = qtyFor(STANDARD_ALPHA, 0.9); // ~5.85 USDC

/**
 * Calculate safe maxCost with reasonable buffer
 * @param cost Expected cost in USDC (6 decimals)
 * @param bufferMultiplier Multiplier for buffer (default 1.5x)
 * @returns Safe maxCost with buffer
 */
export function safeMaxCost(cost: bigint, bufferMultiplier = 1.5): bigint {
  const buffer = (cost * BigInt(Math.floor(bufferMultiplier * 100))) / 100n;
  return buffer;
}

/**
 * Calculate safe maxCost with fixed buffer
 * @param cost Expected cost in USDC (6 decimals)
 * @param fixedBuffer Fixed buffer amount in USDC (default 0.5 USDC)
 * @returns Safe maxCost with fixed buffer
 */
export function safeMaxCostFixed(
  cost: bigint,
  fixedBuffer = parseUnits("0.5", 6)
): bigint {
  return cost + fixedBuffer;
}
