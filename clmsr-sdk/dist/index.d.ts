/**
 * @signals/clmsr-v0 - CLMSR SDK for TypeScript
 *
 * 컨트랙트 뷰함수들과 역함수 제공
 */
export { CLMSRSDK } from "./clmsr-sdk";
export { WADAmount, USDCAmount, Quantity, Tick, MarketDistributionRaw, MarketRaw, Market, MarketDistribution, Position, mapMarket, mapDistribution, OpenCostResult, IncreaseCostResult, DecreaseProceedsResult, CloseProceedsResult, ClaimResult, QuantityFromCostResult, ValidationError, CalculationError, } from "./types";
export * as MathUtils from "./utils/math";
export { toWAD, toMicroUSDC } from "./clmsr-sdk";
export declare const VERSION = "1.7.1";
