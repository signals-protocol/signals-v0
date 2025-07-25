import Big from "big.js";

// ============================================================================
// BASIC TYPES
// ============================================================================

/** WAD format number (18 decimal precision) */
export type WADAmount = Big;

/** USDC amount (6 decimal precision) */
export type USDCAmount = Big;

/** Quantity in USDC terms */
export type Quantity = USDCAmount;

/** Tick position */
export type Tick = number;

// ============================================================================
// MARKET DATA (from indexer)
// ============================================================================

/** Market metadata */
export interface Market {
  liquidityParameter: WADAmount; // α 값
  minTick: Tick;
  maxTick: Tick;
  tickSpacing: Tick;
}

/** Market distribution data (from indexer) */
export interface MarketDistribution {
  totalSum: WADAmount; // Σ exp(q_i/α) - from totalSumWad
  binFactors: WADAmount[]; // 모든 bin의 factor 배열 - from binFactors
}

/** Position data */
export interface Position {
  lowerTick: Tick;
  upperTick: Tick;
  quantity: Quantity;
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

/** calculateClaimAmount 결과 */
export interface ClaimResult {
  claimAmount: USDCAmount;
  isWinning: boolean;
}

/** Settlement range for market */
export interface SettlementRange {
  lowerTick: Tick;
  upperTick: Tick;
}

/** 역함수 결과 (돈 → 수량) */
export interface QuantityFromCostResult {
  quantity: Quantity;
  actualCost: USDCAmount;
}

// ============================================================================
// ERROR TYPES
// ============================================================================

export class CLMSRError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CLMSRError";
  }
}

export class ValidationError extends CLMSRError {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class CalculationError extends CLMSRError {
  constructor(message: string) {
    super(message);
    this.name = "CalculationError";
  }
}
