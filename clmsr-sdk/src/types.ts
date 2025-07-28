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
  totalSum: string; // WAD 형식 문자열 (BigInt from GraphQL)
  minFactor: string; // WAD 형식 문자열 (BigInt from GraphQL)
  maxFactor: string; // WAD 형식 문자열 (BigInt from GraphQL)
  avgFactor: string; // WAD 형식 문자열 (BigInt from GraphQL)
  totalVolume: string; // 6 decimals raw USDC (BigInt from GraphQL)
  binFactors: string[]; // WAD 형식 문자열 배열 ["1000000000000000000", ...]
  binVolumes: string[]; // 6 decimals raw USDC 문자열 배열 ["1000000", ...]
  tickRanges: string[]; // 틱 범위 문자열 배열 ["100500-100600", ...]
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

/** Market distribution data for SDK calculations (WAD 기반) */
export interface MarketDistribution {
  totalSum: WADAmount; // WAD 계산용 값 (18 decimals) - 컨트랙트와 일치
  minFactor: WADAmount; // 최소 factor 값 (WAD, 18 decimals)
  maxFactor: WADAmount; // 최대 factor 값 (WAD, 18 decimals)
  avgFactor: WADAmount; // 평균 factor 값 (WAD, 18 decimals)
  totalVolume: USDCAmount; // 전체 거래량 (raw 6 decimals) - 정보성, 계산에 미사용
  binFactors: WADAmount[]; // WAD 형식의 bin factor 배열 (18 decimals) - 핵심 계산용
  binVolumes: USDCAmount[]; // bin volume 배열 (raw 6 decimals) - 정보성, 계산에 미사용
  tickRanges: string[]; // 틱 범위 문자열 배열
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
    totalSum: new Big(raw.totalSum),
    minFactor: new Big(raw.minFactor),
    maxFactor: new Big(raw.maxFactor),
    avgFactor: new Big(raw.avgFactor),
    totalVolume: new Big(raw.totalVolume), // raw 6 decimals
    binFactors: raw.binFactors.map((s) => new Big(s)),
    binVolumes: raw.binVolumes.map((s) => new Big(s)), // raw 6 decimals
    tickRanges: raw.tickRanges,
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
