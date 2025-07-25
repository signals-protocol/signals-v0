import { Market, Position, MarketDistribution, OpenCostResult, IncreaseCostResult, DecreaseProceedsResult, CloseProceedsResult, ClaimResult, QuantityFromCostResult, WADAmount, USDCAmount, Quantity, Tick } from "./types";
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
     * calculateDecreaseProceeds - 포지션 감소시 수익 계산
     */
    calculateDecreaseProceeds(position: Position, sellQuantity: Quantity, distribution: MarketDistribution, market: Market): DecreaseProceedsResult;
    /**
     * calculateCloseProceeds - 전체 포지션 닫기 수익 계산
     */
    calculateCloseProceeds(position: Position, distribution: MarketDistribution, market: Market): CloseProceedsResult;
    /**
     * calculateClaimAmount - 정산 후 클레임 금액 계산
     */
    calculateClaimAmount(position: Position, settlementLowerTick: Tick, settlementUpperTick: Tick): ClaimResult;
    /**
     * calculateQuantityFromCost - 목표 비용에서 수량 계산 (역함수)
     */
    calculateQuantityFromCost(lowerTick: Tick, upperTick: Tick, targetCost: USDCAmount, distribution: MarketDistribution, market: Market): QuantityFromCostResult;
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
