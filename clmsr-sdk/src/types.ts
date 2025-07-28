import Big from "big.js";

// ============================================================================
// BASIC TYPES
// ============================================================================

/** WAD format amount (18 decimals) */
export type WADAmount = Big;

/** USDC amount (6 decimals) */
export type USDCAmount = Big;

/** Trade quantity (also 6 decimals like USDC) */
export type Quantity = Big;

/** Tick value (int256) */
export type Tick = number;

// ============================================================================
// RAW GRAPHQL TYPES (문자열 기반 - 인덱서에서 직접 온 데이터)
// ============================================================================

/** Raw market distribution data from GraphQL (문자열 형태) */
export interface MarketDistributionRaw {
  totalSum: string; // 표시용 decimal 문자열
  totalSumWad: string; // WAD 형식 문자열
  binFactors: string[]; // 표시용 decimal 문자열 배열 ["1.0", "2.0", ...]
  binFactorsWad: string[]; // WAD 형식 문자열 배열 ["1000000000000000000", ...]
}

/** Raw market data from GraphQL */
export interface MarketRaw {
  liquidityParameter: string; // WAD 형식 문자열
  minTick: number;
  maxTick: number;
  tickSpacing: number;
}

// ============================================================================
// SDK CALCULATION TYPES (Big 기반 - 순수 계산용)
// ============================================================================

/** Market data for SDK calculations (숫자 객체만) */
export interface Market {
  liquidityParameter: WADAmount; // α 값
  minTick: Tick;
  maxTick: Tick;
  tickSpacing: Tick;
}

/** Market distribution data for SDK calculations (숫자 객체만) */
export interface MarketDistribution {
  totalSumWad: WADAmount; // 계산용 WAD 값 (컨트랙트와 일치)
  binFactorsWad: WADAmount[]; // WAD 형식의 bin factor 배열 (계산용)
}

/** Position data */
export interface Position {
  lowerTick: Tick;
  upperTick: Tick;
  quantity: Quantity;
}

// ============================================================================
// DATA ADAPTERS (GraphQL ↔ SDK 타입 변환)
// ============================================================================

/**
 * Convert raw GraphQL market data to SDK calculation format
 * @param raw Raw market data from GraphQL
 * @returns Market data for SDK calculations
 */
export function mapMarket(raw: MarketRaw): Market {
  return {
    liquidityParameter: new Big(raw.liquidityParameter),
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
export function mapDistribution(
  raw: MarketDistributionRaw
): MarketDistribution {
  return {
    totalSumWad: new Big(raw.totalSumWad),
    binFactorsWad: raw.binFactorsWad.map((s) => new Big(s)),
  };
}

// ============================================================================
// CALCULATION RESULTS
// ============================================================================

/** calculateOpenCost 결과 */
export interface OpenCostResult {
  cost: USDCAmount;
  averagePrice: USDCAmount;
}

/** calculateIncreaseCost 결과 */
export interface IncreaseCostResult {
  additionalCost: USDCAmount;
  averagePrice: USDCAmount;
}

/** calculateDecreaseProceeds 결과 */
export interface DecreaseProceedsResult {
  proceeds: USDCAmount;
  averagePrice: USDCAmount;
}

/** calculateCloseProceeds 결과 */
export interface CloseProceedsResult {
  proceeds: USDCAmount;
  averagePrice: USDCAmount;
}

/** calculateClaim 결과 */
export interface ClaimResult {
  payout: USDCAmount;
}

/** calculateQuantityFromCost 결과 */
export interface QuantityFromCostResult {
  quantity: Quantity;
  actualCost: USDCAmount;
}

// ============================================================================
// ERRORS
// ============================================================================

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class CalculationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalculationError";
  }
}
