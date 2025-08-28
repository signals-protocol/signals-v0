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
        ...(raw.isSettled !== undefined && { isSettled: raw.isSettled }),
        ...(raw.settlementValue !== undefined && {
            settlementValue: new big_js_1.default(raw.settlementValue),
        }),
        ...(raw.settlementTick !== undefined && {
            settlementTick: raw.settlementTick,
        }),
    };
}
/**
 * Convert raw GraphQL distribution data to SDK calculation format
 * @param raw Raw distribution data from GraphQL
 * @returns Distribution data for SDK calculations
 */
function mapDistribution(raw) {
    return {
        // 필수 필드들
        totalSum: new big_js_1.default(raw.totalSum),
        binFactors: raw.binFactors.map((s) => new big_js_1.default(s)),
        // 선택적 필드들 (정보성, 계산에 사용되지 않음)
        ...(raw.minFactor !== undefined && { minFactor: new big_js_1.default(raw.minFactor) }),
        ...(raw.maxFactor !== undefined && { maxFactor: new big_js_1.default(raw.maxFactor) }),
        ...(raw.avgFactor !== undefined && { avgFactor: new big_js_1.default(raw.avgFactor) }),
        ...(raw.totalVolume !== undefined && {
            totalVolume: new big_js_1.default(raw.totalVolume),
        }),
        ...(raw.binVolumes !== undefined && {
            binVolumes: raw.binVolumes.map((s) => new big_js_1.default(s)),
        }),
        ...(raw.tickRanges !== undefined && { tickRanges: raw.tickRanges }),
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
