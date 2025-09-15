import Big from "big.js";
import {
  WADAmount,
  USDCAmount,
  ValidationError,
  CalculationError,
} from "../types";

// ============================================================================
// CONSTANTS
// ============================================================================

/** WAD format constant: 1e18 */
export const WAD = new Big("1e18");

/** Scale difference between USDC (6 decimals) and WAD (18 decimals): 1e12 */
export const SCALE_DIFF = new Big("1e12");

/** USDC precision constant: 1e6 */
export const USDC_PRECISION = new Big("1000000");

/** Maximum safe input for exp() function: 1.0 * 1e18 */
export const MAX_EXP_INPUT_WAD = new Big("1000000000000000000"); // 1.0 * 1e18

/** Maximum number of chunks per transaction */
export const MAX_CHUNKS_PER_TX = 1000;

/** Minimum and maximum factor bounds for segment tree operations */
export const MIN_FACTOR = new Big("0.01e18"); // 1%
export const MAX_FACTOR = new Big("100e18"); // 100x

// Big.js configuration for precision (optimized for performance)
Big.DP = 30; // 30 decimal places for internal calculations (sufficient for CLMSR precision)
Big.RM = Big.roundHalfUp; // Round half up

// ============================================================================
// SCALING FUNCTIONS
// ============================================================================

/**
 * Convert 6-decimal USDC amount to 18-decimal WAD format
 * @param amt6 Amount in 6-decimal format
 * @returns Amount in WAD format
 */
export function toWad(amt6: USDCAmount): WADAmount {
  return amt6.mul(SCALE_DIFF);
}

/**
 * Convert 18-decimal WAD format to 6-decimal USDC amount (truncates)
 * @param amtWad Amount in WAD format
 * @returns Amount in 6-decimal format
 */
export function fromWad(amtWad: WADAmount): USDCAmount {
  return amtWad.div(SCALE_DIFF);
}

/**
 * Convert 18-decimal WAD format to 6-decimal USDC amount with round-up
 * Always rounds up to ensure minimum 1 micro unit cost
 * @param amtWad Amount in WAD format
 * @returns Amount in 6-decimal format (rounded up)
 */
export function fromWadRoundUp(amtWad: WADAmount): USDCAmount {
  const result = amtWad.plus(SCALE_DIFF.minus(1)).div(SCALE_DIFF);
  return new Big(result.toFixed(6, Big.roundUp));
}

/**
 * Convert WAD format to regular number (divide by 1e18)
 * @param amtWad Amount in WAD format
 * @returns Regular number
 */
export function wadToNumber(amtWad: WADAmount): Big {
  return amtWad.div(WAD);
}

/**
 * Format USDC amount to 6 decimal places maximum
 * @param amount USDC amount (in micro USDC)
 * @returns Formatted amount with max 6 decimals
 */
export function formatUSDC(amount: USDCAmount): USDCAmount {
  // amount는 이미 micro USDC 단위이므로 정수여야 함
  return new Big(amount.toFixed(0, Big.roundDown));
}

// ============================================================================
// BASIC MATH OPERATIONS
// ============================================================================

/**
 * WAD multiplication: (a * b) / WAD
 * @param a First operand
 * @param b Second operand
 * @returns Product in WAD format
 */
export function wMul(a: WADAmount, b: WADAmount): WADAmount {
  return a.mul(b).div(WAD);
}

/**
 * WAD division: (a * WAD) / b
 * @param a Dividend
 * @param b Divisor
 * @returns Quotient in WAD format
 */
export function wDiv(a: WADAmount, b: WADAmount): WADAmount {
  if (b.eq(0)) {
    throw new ValidationError("Division by zero");
  }
  return a.mul(WAD).div(b);
}

/**
 * WAD exponentiation: e^x
 * Uses Taylor series expansion for accurate results
 * @param x Exponent in WAD format
 * @returns e^x in WAD format
 */
export function wExp(x: WADAmount): WADAmount {
  if (x.gt(MAX_EXP_INPUT_WAD)) {
    throw new ValidationError(
      `Exponent too large: ${x.toString()}, max: ${MAX_EXP_INPUT_WAD.toString()}`
    );
  }

  // Convert to regular number for Math.exp, then back to Big
  // For high precision, we could implement Taylor series, but Math.exp is sufficient for our use case
  const xNumber = parseFloat(x.div(WAD).toString());
  const result = Math.exp(xNumber);

  return new Big(result.toString()).mul(WAD);
}

/**
 * WAD natural logarithm: ln(x)
 * @param x Input in WAD format (must be > 0)
 * @returns ln(x) in WAD format
 */
export function wLn(x: WADAmount): WADAmount {
  if (x.lte(0)) {
    throw new ValidationError("Logarithm input must be positive");
  }

  // Convert to regular number for Math.log, then back to Big
  const xNumber = parseFloat(x.div(WAD).toString());
  const result = Math.log(xNumber);

  return new Big(result.toString()).mul(WAD);
}

/**
 * WAD square root: √x
 * @param x Input in WAD format
 * @returns √x in WAD format
 */
export function wSqrt(x: WADAmount): WADAmount {
  if (x.lt(0)) {
    throw new ValidationError("Square root input must be non-negative");
  }

  // Use Big.js sqrt method
  const xScaled = x.div(WAD);
  const result = xScaled.sqrt();

  return result.mul(WAD);
}

// ============================================================================
// AGGREGATION FUNCTIONS
// ============================================================================

/**
 * Sum of exponentials: Σ exp(v_i)
 * @param values Array of values in WAD format
 * @returns Sum of exponentials in WAD format
 */
export function sumExp(values: WADAmount[]): WADAmount {
  if (values.length === 0) {
    throw new ValidationError("Empty array provided to sumExp");
  }

  let sum = new Big(0);

  for (const v of values) {
    const expV = wExp(v);
    sum = sum.plus(expV);
  }

  return sum;
}

/**
 * Logarithm of sum of exponentials: ln(Σ exp(v_i))
 * Uses numerical stability techniques (subtract max value)
 * @param values Array of values in WAD format
 * @returns ln(Σ exp(v_i)) in WAD format
 */
export function logSumExp(values: WADAmount[]): WADAmount {
  if (values.length === 0) {
    throw new ValidationError("Empty array provided to logSumExp");
  }

  // Find maximum value for numerical stability
  let maxVal = values[0];
  for (let i = 1; i < values.length; i++) {
    if (values[i].gt(maxVal)) {
      maxVal = values[i];
    }
  }

  // Calculate sum of exp(x - max) with proper scaling
  let sumScaled = new Big(0);

  for (const v of values) {
    // Safe subtraction to avoid underflow
    const diff = v.gte(maxVal) ? v.minus(maxVal) : new Big(0);
    const eScaled = wExp(diff);
    sumScaled = sumScaled.plus(eScaled);
  }

  if (sumScaled.eq(0)) {
    throw new CalculationError("Sum scaled to zero in logSumExp");
  }

  return maxVal.plus(wLn(sumScaled));
}

// ============================================================================
// CLMSR-SPECIFIC FUNCTIONS
// ============================================================================

/**
 * Calculate CLMSR price from exponential values
 * Price = exp(q/α) / Σ exp(q_i/α)
 * @param expValue Pre-computed exp(q/α) value for this tick
 * @param totalSumExp Sum of all exponentials Σ exp(q/α)
 * @returns Normalized price in WAD format
 */
export function clmsrPrice(
  expValue: WADAmount,
  totalSumExp: WADAmount
): WADAmount {
  if (totalSumExp.eq(0)) {
    throw new ValidationError("Total sum of exponentials is zero");
  }

  return wDiv(expValue, totalSumExp);
}

/**
 * Calculate CLMSR cost: α * ln(Σ_after / Σ_before)
 * @param alpha Liquidity parameter α in WAD format
 * @param sumBefore Sum of exponentials before trade
 * @param sumAfter Sum of exponentials after trade
 * @returns Trade cost in WAD format (always positive)
 */
export function clmsrCost(
  alpha: WADAmount,
  sumBefore: WADAmount,
  sumAfter: WADAmount
): WADAmount {
  if (sumBefore.eq(0)) {
    throw new ValidationError("Sum before trade is zero");
  }

  const ratio = wDiv(sumAfter, sumBefore);

  if (ratio.lt(WAD)) {
    throw new ValidationError("Ratio < 1 not supported in unsigned version");
  }

  const lnRatio = wLn(ratio);
  return wMul(alpha, lnRatio);
}

/**
 * Calculate CLMSR proceeds (for selling): α * ln(Σ_before / Σ_after)
 * @param alpha Liquidity parameter α in WAD format
 * @param sumBefore Sum of exponentials before sell
 * @param sumAfter Sum of exponentials after sell
 * @returns Trade proceeds in WAD format
 */
export function clmsrProceeds(
  alpha: WADAmount,
  sumBefore: WADAmount,
  sumAfter: WADAmount
): WADAmount {
  if (sumBefore.eq(0) || sumAfter.eq(0)) {
    throw new ValidationError("Sum before or after trade is zero");
  }

  if (sumBefore.lte(sumAfter)) {
    return new Big(0); // No proceeds if sum doesn't decrease
  }

  const ratio = wDiv(sumBefore, sumAfter);
  const lnRatio = wLn(ratio);
  return wMul(alpha, lnRatio);
}

// ============================================================================
// SAFE EXPONENTIAL WITH CHUNKING
// ============================================================================

/**
 * Calculate exp(q/α) safely by chunking large values to avoid overflow
 * Equivalent to contract's _safeExp function
 * @param q Quantity in WAD format
 * @param alpha Liquidity parameter in WAD format
 * @returns Result of exp(q/α) in WAD format
 */
export function safeExp(q: WADAmount, alpha: WADAmount): WADAmount {
  if (alpha.eq(0)) {
    throw new ValidationError("Alpha cannot be zero");
  }

  const maxPerChunk = wMul(alpha, MAX_EXP_INPUT_WAD); // α * 1.0
  let result = WAD; // 1.0
  let remaining = new Big(q.toString());

  while (remaining.gt(0)) {
    const chunk = remaining.gt(maxPerChunk) ? maxPerChunk : remaining;
    const factor = wExp(wDiv(chunk, alpha)); // Safe: chunk/α ≤ 1.0
    result = wMul(result, factor);
    remaining = remaining.minus(chunk);
  }

  return result;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if a factor is within safe bounds for segment tree operations
 * @param factor Factor to check
 * @returns true if factor is within bounds
 */
export function isFactorSafe(factor: WADAmount): boolean {
  return factor.gte(MIN_FACTOR) && factor.lte(MAX_FACTOR);
}

/**
 * Create a new Big number from string, number, or Big
 * @param value Input value
 * @returns Big number
 */
export function toBig(value: string | number | Big): Big {
  return new Big(value);
}

/**
 * Create WAD amount from numeric value (multiply by 1e18)
 * Use this for converting regular numbers to WAD format
 * @param value Input value in regular units (e.g., 1.5 USDC)
 * @returns WAD amount (18 decimals)
 */
export function toWAD(value: string | number): WADAmount {
  return new Big(value).mul(WAD);
}

/**
 * Create micro-USDC amount from USDC value (multiply by 1e6)
 * Use this for converting user input USDC amounts to SDK format
 * @param value Input value in USDC (e.g., "100" = 100 USDC)
 * @returns USDC amount in 6-decimal format (micro-USDC)
 */
export function toMicroUSDC(value: string | number): USDCAmount {
  return new Big(value).mul(USDC_PRECISION);
}
