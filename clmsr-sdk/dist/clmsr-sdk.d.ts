import { MarketDistribution, Market, Position, OpenCostResult, IncreaseCostResult, DecreaseProceedsResult, CloseProceedsResult, ClaimResult, QuantityFromCostResult, USDCAmount, Quantity, Tick } from "./types";
export * from "./types";
export { toWAD, toMicroUSDC } from "./utils/math";
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
     * @param cost 목표 비용 (6 decimals)
     * @param distribution Current market distribution
     * @param market Market parameters
     * @returns 구매 가능한 수량
     */
    calculateQuantityFromCost(lowerTick: Tick, upperTick: Tick, cost: USDCAmount, distribution: MarketDistribution, market: Market): QuantityFromCostResult;
    /**
     * 시장별 최대 수량 한계 검증 (컨트랙트와 동일한 제한)
     * @param quantity 검증할 수량 (6 decimals)
     * @param alpha 유동성 파라미터 α (18 decimals WAD)
     * @throws Error if quantity exceeds market limit
     */
    private _assertQuantityWithinLimit;
    /**
     * 내부 헬퍼: 매도 수익 계산 (코드 중복 제거)
     * @param lowerTick Lower tick bound
     * @param upperTick Upper tick bound
     * @param sellQuantity 매도할 수량
     * @param positionQuantity 현재 포지션 수량 (검증용)
     * @param distribution Current market distribution
     * @param market Market parameters
     * @returns 매도 수익
     */
    private _calcSellProceeds;
    private validateTickRange;
    private getAffectedSum;
}
/**
 * Create CLMSR SDK instance
 */
export declare function createCLMSRSDK(): CLMSRSDK;
