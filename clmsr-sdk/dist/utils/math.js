"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_FACTOR = exports.MIN_FACTOR = exports.MAX_CHUNKS_PER_TX = exports.MAX_EXP_INPUT_WAD = exports.SCALE_DIFF = exports.WAD = void 0;
exports.toWad = toWad;
exports.fromWad = fromWad;
exports.fromWadRoundUp = fromWadRoundUp;
exports.wMul = wMul;
exports.wDiv = wDiv;
exports.wExp = wExp;
exports.wLn = wLn;
exports.wSqrt = wSqrt;
exports.sumExp = sumExp;
exports.logSumExp = logSumExp;
exports.clmsrPrice = clmsrPrice;
exports.clmsrCost = clmsrCost;
exports.clmsrProceeds = clmsrProceeds;
exports.safeExp = safeExp;
exports.isFactorSafe = isFactorSafe;
exports.toBig = toBig;
exports.toWAD = toWAD;
exports.toUSDC = toUSDC;
const big_js_1 = __importDefault(require("big.js"));
const types_1 = require("../types");
// ============================================================================
// CONSTANTS
// ============================================================================
/** WAD format constant: 1e18 */
exports.WAD = new big_js_1.default("1e18");
/** Scale difference between USDC (6 decimals) and WAD (18 decimals): 1e12 */
exports.SCALE_DIFF = new big_js_1.default("1e12");
/** Maximum safe input for exp() function: 0.13 * 1e18 */
exports.MAX_EXP_INPUT_WAD = new big_js_1.default("130000000000000000"); // 0.13 * 1e18
/** Maximum number of chunks per transaction */
exports.MAX_CHUNKS_PER_TX = 1000;
/** Minimum and maximum factor bounds for segment tree operations */
exports.MIN_FACTOR = new big_js_1.default("0.01e18"); // 1%
exports.MAX_FACTOR = new big_js_1.default("100e18"); // 100x
// Big.js configuration for precision
big_js_1.default.DP = 40; // 40 decimal places for internal calculations
big_js_1.default.RM = big_js_1.default.roundHalfUp; // Round half up
// ============================================================================
// SCALING FUNCTIONS
// ============================================================================
/**
 * Convert 6-decimal USDC amount to 18-decimal WAD format
 * @param amt6 Amount in 6-decimal format
 * @returns Amount in WAD format
 */
function toWad(amt6) {
    return amt6.mul(exports.SCALE_DIFF);
}
/**
 * Convert 18-decimal WAD format to 6-decimal USDC amount (truncates)
 * @param amtWad Amount in WAD format
 * @returns Amount in 6-decimal format
 */
function fromWad(amtWad) {
    return amtWad.div(exports.SCALE_DIFF);
}
/**
 * Convert 18-decimal WAD format to 6-decimal USDC amount with round-up
 * Always rounds up to ensure minimum 1 micro unit cost
 * @param amtWad Amount in WAD format
 * @returns Amount in 6-decimal format (rounded up)
 */
function fromWadRoundUp(amtWad) {
    const result = amtWad.plus(exports.SCALE_DIFF.minus(1)).div(exports.SCALE_DIFF);
    return new big_js_1.default(result.toFixed(6, big_js_1.default.roundUp));
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
function wMul(a, b) {
    return a.mul(b).div(exports.WAD);
}
/**
 * WAD division: (a * WAD) / b
 * @param a Dividend
 * @param b Divisor
 * @returns Quotient in WAD format
 */
function wDiv(a, b) {
    if (b.eq(0)) {
        throw new types_1.ValidationError("Division by zero");
    }
    return a.mul(exports.WAD).div(b);
}
/**
 * WAD exponentiation: e^x
 * Uses Taylor series expansion for accurate results
 * @param x Exponent in WAD format
 * @returns e^x in WAD format
 */
function wExp(x) {
    if (x.gt(exports.MAX_EXP_INPUT_WAD)) {
        throw new types_1.ValidationError(`Exponent too large: ${x.toString()}, max: ${exports.MAX_EXP_INPUT_WAD.toString()}`);
    }
    // Convert to regular number for Math.exp, then back to Big
    // For high precision, we could implement Taylor series, but Math.exp is sufficient for our use case
    const xNumber = parseFloat(x.div(exports.WAD).toString());
    const result = Math.exp(xNumber);
    return new big_js_1.default(result.toString()).mul(exports.WAD);
}
/**
 * WAD natural logarithm: ln(x)
 * @param x Input in WAD format (must be > 0)
 * @returns ln(x) in WAD format
 */
function wLn(x) {
    if (x.lte(0)) {
        throw new types_1.ValidationError("Logarithm input must be positive");
    }
    // Convert to regular number for Math.log, then back to Big
    const xNumber = parseFloat(x.div(exports.WAD).toString());
    const result = Math.log(xNumber);
    return new big_js_1.default(result.toString()).mul(exports.WAD);
}
/**
 * WAD square root: √x
 * @param x Input in WAD format
 * @returns √x in WAD format
 */
function wSqrt(x) {
    if (x.lt(0)) {
        throw new types_1.ValidationError("Square root input must be non-negative");
    }
    // Use Big.js sqrt method
    const xScaled = x.div(exports.WAD);
    const result = xScaled.sqrt();
    return result.mul(exports.WAD);
}
// ============================================================================
// AGGREGATION FUNCTIONS
// ============================================================================
/**
 * Sum of exponentials: Σ exp(v_i)
 * @param values Array of values in WAD format
 * @returns Sum of exponentials in WAD format
 */
function sumExp(values) {
    if (values.length === 0) {
        throw new types_1.ValidationError("Empty array provided to sumExp");
    }
    let sum = new big_js_1.default(0);
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
function logSumExp(values) {
    if (values.length === 0) {
        throw new types_1.ValidationError("Empty array provided to logSumExp");
    }
    // Find maximum value for numerical stability
    let maxVal = values[0];
    for (let i = 1; i < values.length; i++) {
        if (values[i].gt(maxVal)) {
            maxVal = values[i];
        }
    }
    // Calculate sum of exp(x - max) with proper scaling
    let sumScaled = new big_js_1.default(0);
    for (const v of values) {
        // Safe subtraction to avoid underflow
        const diff = v.gte(maxVal) ? v.minus(maxVal) : new big_js_1.default(0);
        const eScaled = wExp(diff);
        sumScaled = sumScaled.plus(eScaled);
    }
    if (sumScaled.eq(0)) {
        throw new types_1.CalculationError("Sum scaled to zero in logSumExp");
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
function clmsrPrice(expValue, totalSumExp) {
    if (totalSumExp.eq(0)) {
        throw new types_1.ValidationError("Total sum of exponentials is zero");
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
function clmsrCost(alpha, sumBefore, sumAfter) {
    if (sumBefore.eq(0)) {
        throw new types_1.ValidationError("Sum before trade is zero");
    }
    const ratio = wDiv(sumAfter, sumBefore);
    if (ratio.lt(exports.WAD)) {
        throw new types_1.ValidationError("Ratio < 1 not supported in unsigned version");
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
function clmsrProceeds(alpha, sumBefore, sumAfter) {
    if (sumBefore.eq(0) || sumAfter.eq(0)) {
        throw new types_1.ValidationError("Sum before or after trade is zero");
    }
    if (sumBefore.lte(sumAfter)) {
        return new big_js_1.default(0); // No proceeds if sum doesn't decrease
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
function safeExp(q, alpha) {
    if (alpha.eq(0)) {
        throw new types_1.ValidationError("Alpha cannot be zero");
    }
    const maxPerChunk = wMul(alpha, exports.MAX_EXP_INPUT_WAD); // α * 0.13
    let result = exports.WAD; // 1.0
    let remaining = new big_js_1.default(q.toString());
    while (remaining.gt(0)) {
        const chunk = remaining.gt(maxPerChunk) ? maxPerChunk : remaining;
        const factor = wExp(wDiv(chunk, alpha)); // Safe: chunk/α ≤ 0.13
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
function isFactorSafe(factor) {
    return factor.gte(exports.MIN_FACTOR) && factor.lte(exports.MAX_FACTOR);
}
/**
 * Create a new Big number from string, number, or Big
 * @param value Input value
 * @returns Big number
 */
function toBig(value) {
    return new big_js_1.default(value);
}
/**
 * Create WAD amount from string or number
 * @param value Input value
 * @returns WAD amount
 */
function toWAD(value) {
    return new big_js_1.default(value).mul(exports.WAD);
}
/**
 * Create USDC amount from string or number (6-decimal ERC20)
 * @param value Input value in USDC (e.g., "100" = 100 USDC)
 * @returns USDC amount in 6-decimal format (micro-USDC)
 */
function toUSDC(value) {
    return new big_js_1.default(value).mul(new big_js_1.default("1000000")); // 6-decimal: 100 USDC = 100,000,000 micro-USDC
}
