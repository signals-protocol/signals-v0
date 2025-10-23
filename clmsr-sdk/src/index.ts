/**
 * @signals/clmsr-v0 - CLMSR SDK for TypeScript
 *
 * 컨트랙트 뷰함수들과 역함수 제공
 */

// Export main SDK class
export { CLMSRSDK } from "./clmsr-sdk";

// Export types
export {
  // Basic types
  WADAmount,
  USDCAmount,
  Quantity,
  Tick,

  // Raw GraphQL types (문자열 기반)
  MarketDistributionRaw,
  MarketRaw,

  // SDK calculation types (Big 기반)
  Market,
  MarketDistribution,
  Position,

  // Data adapters
  mapMarket,
  mapDistribution,

  // Result types
  OpenCostResult,
  IncreaseCostResult,
  DecreaseProceedsResult,
  CloseProceedsResult,
  ClaimResult,
  QuantityFromCostResult,
  QuantityFromProceedsResult,

  // Errors
  ValidationError,
  CalculationError,
} from "./types";

// Export utility functions
export * as MathUtils from "./utils/math";

// Convenience functions
export { toWAD, toMicroUSDC } from "./clmsr-sdk";

// Version (keep in sync with package.json)
export const VERSION = "1.10.0";
