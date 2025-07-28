import { MarketDistribution, Market, Position, OpenCostResult, IncreaseCostResult, DecreaseProceedsResult, CloseProceedsResult, ClaimResult, QuantityFromCostResult, WADAmount, USDCAmount, Quantity, Tick } from "./types";
export * from "./types";
/**
 * CLMSR SDK - 컨트랙트 뷰함수들과 역함수 제공
 */
export declare class CLMSRSDK {
    /**
     * calculateOpenCost - 새 포지션 열기 비용 계산
     */
    calculateOpenCost(lowerTick: Tick, upperTick: Tick, quantity: Quantity, distribution: MarketDistribution, market: Market): OpenCostResult;
    /**
     * calculateIncreaseCost - 기존 포지션 증가 비용 계산
     */
    calculateIncreaseCost(position: Position, additionalQuantity: Quantity, distribution: MarketDistribution, market: Market): IncreaseCostResult;
    /**
     * Decrease position 비용 계산
     */
    calculateDecreaseProceeds(position: Position, sellQuantity: Quantity, distribution: MarketDistribution, market: Market): DecreaseProceedsResult;
    /**
     * Close position 비용 계산
     */
    calculateCloseProceeds(position: Position, distribution: MarketDistribution, market: Market): CloseProceedsResult;
    /**
     * Claim amount 계산
     */
    calculateClaim(position: Position, settlementLowerTick: Tick, settlementUpperTick: Tick): ClaimResult;
    /**
     * Sell position의 예상 수익 계산
     * @param position 포지션 정보
     * @param sellQuantity 매도할 수량
     * @param distribution Current market distribution
     * @param market Market parameters
     * @returns 예상 수익
     */
    calculateSellProceeds(position: Position, sellQuantity: Quantity, distribution: MarketDistribution, market: Market): DecreaseProceedsResult;
    /**
     * 주어진 비용으로 살 수 있는 수량 계산 (역산)
     * @param lowerTick Lower tick bound
     * @param upperTick Upper tick bound
     * @param targetCostWad 목표 비용 (WAD 형식)
     * @param distribution Current market distribution
     * @param market Market parameters
     * @returns 구매 가능한 수량
     */
    calculateQuantityFromCost(lowerTick: Tick, upperTick: Tick, targetCostWad: WADAmount, distribution: MarketDistribution, market: Market): QuantityFromCostResult;
    private validateTickRange;
    private getAffectedSum;
}
/**
 * Create CLMSR SDK instance
 */
export declare function createCLMSRSDK(): CLMSRSDK;
/**
 * Convert to WAD amount (18 decimals)
 */
export declare function toWAD(amount: string | number): WADAmount;
/**
 * Convert to USDC amount (6 decimals)
 */
export declare function toUSDC(amount: string | number): USDCAmount;
