import Big from "big.js";
/** WAD format amount (18 decimals) */
export type WADAmount = Big;
/** USDC amount (6 decimals) */
export type USDCAmount = Big;
/** Trade quantity (also 6 decimals like USDC) */
export type Quantity = Big;
/** Tick value (int256) */
export type Tick = number;
/** Raw market distribution data from GraphQL (문자열 형태) */
export interface MarketDistributionRaw {
    totalSum: string;
    binFactors: string[];
    minFactor?: string;
    maxFactor?: string;
    avgFactor?: string;
    totalVolume?: string;
    binVolumes?: string[];
    tickRanges?: string[];
}
/** Raw market data from GraphQL */
export interface MarketRaw {
    liquidityParameter: string;
    minTick: number;
    maxTick: number;
    tickSpacing: number;
    isSettled?: boolean;
    settlementValue?: string;
    settlementTick?: number;
}
/** Market data for SDK calculations (숫자 객체만) */
export interface Market {
    liquidityParameter: WADAmount;
    minTick: Tick;
    maxTick: Tick;
    tickSpacing: Tick;
    isSettled?: boolean;
    settlementValue?: USDCAmount;
    settlementTick?: Tick;
}
/** Market distribution data for SDK calculations (WAD 기반) */
export interface MarketDistribution {
    totalSum: WADAmount;
    binFactors: WADAmount[];
    minFactor?: WADAmount;
    maxFactor?: WADAmount;
    avgFactor?: WADAmount;
    totalVolume?: USDCAmount;
    binVolumes?: USDCAmount[];
    tickRanges?: string[];
}
/** Position data */
export interface Position {
    lowerTick: Tick;
    upperTick: Tick;
    quantity: Quantity;
}
/**
 * Convert raw GraphQL market data to SDK calculation format
 * @param raw Raw market data from GraphQL
 * @returns Market data for SDK calculations
 */
export declare function mapMarket(raw: MarketRaw): Market;
/**
 * Convert raw GraphQL distribution data to SDK calculation format
 * @param raw Raw distribution data from GraphQL
 * @returns Distribution data for SDK calculations
 */
export declare function mapDistribution(raw: MarketDistributionRaw): MarketDistribution;
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
export declare class ValidationError extends Error {
    constructor(message: string);
}
export declare class CalculationError extends Error {
    constructor(message: string);
}
