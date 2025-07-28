"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CalculationError = exports.ValidationError = void 0;
exports.mapMarket = mapMarket;
exports.mapDistribution = mapDistribution;
const big_js_1 = __importDefault(require("big.js"));
// ============================================================================
// DATA ADAPTERS (GraphQL ↔ SDK 타입 변환)
// ============================================================================
/**
 * Convert raw GraphQL market data to SDK calculation format
 * @param raw Raw market data from GraphQL
 * @returns Market data for SDK calculations
 */
function mapMarket(raw) {
    return {
        liquidityParameter: new big_js_1.default(raw.liquidityParameter),
        minTick: raw.minTick,
        maxTick: raw.maxTick,
        tickSpacing: raw.tickSpacing,
    };
}
/**
 * Convert raw GraphQL distribution data to SDK calculation format
 * @param raw Raw distribution data from GraphQL
 * @returns Distribution data for SDK calculations
 */
function mapDistribution(raw) {
    return {
        totalSum: new big_js_1.default(raw.totalSum),
        minFactor: new big_js_1.default(raw.minFactor),
        maxFactor: new big_js_1.default(raw.maxFactor),
        avgFactor: new big_js_1.default(raw.avgFactor),
        totalVolume: new big_js_1.default(raw.totalVolume), // raw 6 decimals
        binFactors: raw.binFactors.map((s) => new big_js_1.default(s)),
        binVolumes: raw.binVolumes.map((s) => new big_js_1.default(s)), // raw 6 decimals
        tickRanges: raw.tickRanges,
    };
}
// ============================================================================
// ERRORS
// ============================================================================
class ValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = "ValidationError";
    }
}
exports.ValidationError = ValidationError;
class CalculationError extends Error {
    constructor(message) {
        super(message);
        this.name = "CalculationError";
    }
}
exports.CalculationError = CalculationError;
