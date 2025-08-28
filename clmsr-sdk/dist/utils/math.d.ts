import Big from "big.js";
import { WADAmount, USDCAmount } from "../types";
/** WAD format constant: 1e18 */
export declare const WAD: Big.Big;
/** Scale difference between USDC (6 decimals) and WAD (18 decimals): 1e12 */
export declare const SCALE_DIFF: Big.Big;
/** USDC precision constant: 1e6 */
export declare const USDC_PRECISION: Big.Big;
/** Maximum safe input for exp() function: 1.0 * 1e18 */
export declare const MAX_EXP_INPUT_WAD: Big.Big;
/** Maximum number of chunks per transaction */
export declare const MAX_CHUNKS_PER_TX = 1000;
/** Minimum and maximum factor bounds for segment tree operations */
export declare const MIN_FACTOR: Big.Big;
export declare const MAX_FACTOR: Big.Big;
/**
 * Convert 6-decimal USDC amount to 18-decimal WAD format
 * @param amt6 Amount in 6-decimal format
 * @returns Amount in WAD format
 */
export declare function toWad(amt6: USDCAmount): WADAmount;
/**
 * Convert 18-decimal WAD format to 6-decimal USDC amount (truncates)
 * @param amtWad Amount in WAD format
 * @returns Amount in 6-decimal format
 */
export declare function fromWad(amtWad: WADAmount): USDCAmount;
/**
 * Convert 18-decimal WAD format to 6-decimal USDC amount with round-up
 * Always rounds up to ensure minimum 1 micro unit cost
 * @param amtWad Amount in WAD format
 * @returns Amount in 6-decimal format (rounded up)
 */
export declare function fromWadRoundUp(amtWad: WADAmount): USDCAmount;
/**
 * Convert WAD format to regular number (divide by 1e18)
 * @param amtWad Amount in WAD format
 * @returns Regular number
 */
export declare function wadToNumber(amtWad: WADAmount): Big;
/**
 * Format USDC amount to 6 decimal places maximum
 * @param amount USDC amount (in micro USDC)
 * @returns Formatted amount with max 6 decimals
 */
export declare function formatUSDC(amount: USDCAmount): USDCAmount;
/**
 * WAD multiplication: (a * b) / WAD
 * @param a First operand
 * @param b Second operand
 * @returns Product in WAD format
 */
export declare function wMul(a: WADAmount, b: WADAmount): WADAmount;
/**
 * WAD division: (a * WAD) / b
 * @param a Dividend
 * @param b Divisor
 * @returns Quotient in WAD format
 */
export declare function wDiv(a: WADAmount, b: WADAmount): WADAmount;
/**
 * WAD exponentiation: e^x
 * Uses Taylor series expansion for accurate results
 * @param x Exponent in WAD format
 * @returns e^x in WAD format
 */
export declare function wExp(x: WADAmount): WADAmount;
/**
 * WAD natural logarithm: ln(x)
 * @param x Input in WAD format (must be > 0)
 * @returns ln(x) in WAD format
 */
export declare function wLn(x: WADAmount): WADAmount;
/**
 * WAD square root: √x
 * @param x Input in WAD format
 * @returns √x in WAD format
 */
export declare function wSqrt(x: WADAmount): WADAmount;
/**
 * Sum of exponentials: Σ exp(v_i)
 * @param values Array of values in WAD format
 * @returns Sum of exponentials in WAD format
 */
export declare function sumExp(values: WADAmount[]): WADAmount;
/**
 * Logarithm of sum of exponentials: ln(Σ exp(v_i))
 * Uses numerical stability techniques (subtract max value)
 * @param values Array of values in WAD format
 * @returns ln(Σ exp(v_i)) in WAD format
 */
export declare function logSumExp(values: WADAmount[]): WADAmount;
/**
 * Calculate CLMSR price from exponential values
 * Price = exp(q/α) / Σ exp(q_i/α)
 * @param expValue Pre-computed exp(q/α) value for this tick
 * @param totalSumExp Sum of all exponentials Σ exp(q/α)
 * @returns Normalized price in WAD format
 */
export declare function clmsrPrice(expValue: WADAmount, totalSumExp: WADAmount): WADAmount;
/**
 * Calculate CLMSR cost: α * ln(Σ_after / Σ_before)
 * @param alpha Liquidity parameter α in WAD format
 * @param sumBefore Sum of exponentials before trade
 * @param sumAfter Sum of exponentials after trade
 * @returns Trade cost in WAD format (always positive)
 */
export declare function clmsrCost(alpha: WADAmount, sumBefore: WADAmount, sumAfter: WADAmount): WADAmount;
/**
 * Calculate CLMSR proceeds (for selling): α * ln(Σ_before / Σ_after)
 * @param alpha Liquidity parameter α in WAD format
 * @param sumBefore Sum of exponentials before sell
 * @param sumAfter Sum of exponentials after sell
 * @returns Trade proceeds in WAD format
 */
export declare function clmsrProceeds(alpha: WADAmount, sumBefore: WADAmount, sumAfter: WADAmount): WADAmount;
/**
 * Calculate exp(q/α) safely by chunking large values to avoid overflow
 * Equivalent to contract's _safeExp function
 * @param q Quantity in WAD format
 * @param alpha Liquidity parameter in WAD format
 * @returns Result of exp(q/α) in WAD format
 */
export declare function safeExp(q: WADAmount, alpha: WADAmount): WADAmount;
/**
 * Check if a factor is within safe bounds for segment tree operations
 * @param factor Factor to check
 * @returns true if factor is within bounds
 */
export declare function isFactorSafe(factor: WADAmount): boolean;
/**
 * Create a new Big number from string, number, or Big
 * @param value Input value
 * @returns Big number
 */
export declare function toBig(value: string | number | Big): Big;
/**
 * Create WAD amount from numeric value (multiply by 1e18)
 * Use this for converting regular numbers to WAD format
 * @param value Input value in regular units (e.g., 1.5 USDC)
 * @returns WAD amount (18 decimals)
 */
export declare function toWAD(value: string | number): WADAmount;
/**
 * Create micro-USDC amount from USDC value (multiply by 1e6)
 * Use this for converting user input USDC amounts to SDK format
 * @param value Input value in USDC (e.g., "100" = 100 USDC)
 * @returns USDC amount in 6-decimal format (micro-USDC)
 */
export declare function toMicroUSDC(value: string | number): USDCAmount;
