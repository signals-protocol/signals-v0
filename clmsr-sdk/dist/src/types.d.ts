import Big from "big.js";
/** WAD format number (18 decimal precision) */
export type WADAmount = Big;
/** USDC amount (6 decimal precision) */
export type USDCAmount = Big;
/** Quantity in USDC terms */
export type Quantity = USDCAmount;
/** Tick position */
export type Tick = number;
/** Market metadata */
export interface Market {
    liquidityParameter: WADAmount;
    minTick: Tick;
    maxTick: Tick;
    tickSpacing: Tick;
}
/** Market distribution data (from indexer) */
export interface MarketDistribution {
    totalSum: WADAmount;
    binFactors: WADAmount[];
}
/** Position data */
export interface Position {
    lowerTick: Tick;
    upperTick: Tick;
    quantity: Quantity;
}
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
export declare class CLMSRError extends Error {
    constructor(message: string);
}
export declare class ValidationError extends CLMSRError {
    constructor(message: string);
}
export declare class CalculationError extends CLMSRError {
    constructor(message: string);
}
