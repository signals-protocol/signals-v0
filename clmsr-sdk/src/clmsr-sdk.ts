import Big from "big.js";
import {
  MarketDistribution,
  Market,
  Position,
  OpenCostResult,
  IncreaseCostResult,
  DecreaseProceedsResult,
  CloseProceedsResult,
  ClaimResult,
  QuantityFromCostResult,
  WADAmount,
  USDCAmount,
  Quantity,
  Tick,
} from "./types";

import * as MathUtils from "./utils/math";

// Re-export types for easy access
export * from "./types";

/**
 * CLMSR SDK - 컨트랙트 뷰함수들과 역함수 제공
 */
export class CLMSRSDK {
  // ============================================================================
  // CONTRACT VIEW FUNCTIONS (컨트랙트 뷰함수들)
  // ============================================================================

  /**
   * calculateOpenCost - 새 포지션 열기 비용 계산
   */
  calculateOpenCost(
    lowerTick: Tick,
    upperTick: Tick,
    quantity: Quantity,
    distribution: MarketDistribution,
    market: Market
  ): OpenCostResult {
    // Input validation
    if (new Big(quantity).lte(0)) {
      throw new Error("Quantity must be positive");
    }

    // Convert to WAD for calculations
    const alpha = market.liquidityParameter;
    const quantityWad = new Big(quantity).mul(MathUtils.WAD);

    // Get current state
    const sumBefore = distribution.totalSum;
    const affectedSum = this.getAffectedSum(
      lowerTick,
      upperTick,
      distribution,
      market
    );

    // 1. Calculate factor: exp(quantity / α) - 컨트랙트와 동일, safe chunking 사용
    const factor = MathUtils.safeExp(quantityWad, alpha);

    // 2. Calculate sum after trade - 컨트랙트와 동일
    const sumAfter = sumBefore
      .minus(affectedSum)
      .plus(MathUtils.wMul(affectedSum, factor));

    // 3. Calculate cost: α * ln(sumAfter / sumBefore) - 컨트랙트와 동일
    const ratio = MathUtils.wDiv(sumAfter, sumBefore);
    const lnRatio = MathUtils.wLn(ratio);
    const costWad = MathUtils.wMul(alpha, lnRatio);

    // 계산 완료

    const cost = MathUtils.fromWadRoundUp(costWad);

    // Calculate average price
    const averagePrice = cost.div(quantity);

    return { cost, averagePrice };
  }

  /**
   * calculateIncreaseCost - 기존 포지션 증가 비용 계산
   */
  calculateIncreaseCost(
    position: Position,
    additionalQuantity: Quantity,
    distribution: MarketDistribution,
    market: Market
  ): IncreaseCostResult {
    const result = this.calculateOpenCost(
      position.lowerTick,
      position.upperTick,
      additionalQuantity,
      distribution,
      market
    );

    return {
      additionalCost: result.cost,
      averagePrice: result.averagePrice,
    };
  }

  /**
   * Decrease position 비용 계산
   */
  calculateDecreaseProceeds(
    position: Position,
    sellQuantity: Quantity,
    distribution: MarketDistribution,
    market: Market
  ): DecreaseProceedsResult {
    this.validateTickRange(position.lowerTick, position.upperTick, market);

    if (new Big(sellQuantity).lte(0)) {
      throw new Error("Sell quantity must be positive");
    }

    if (new Big(sellQuantity).gt(position.quantity)) {
      throw new Error("Cannot sell more than position quantity");
    }

    // Convert to WAD for calculations
    const alpha = market.liquidityParameter;

    // Get current state
    const beforeSum = distribution.totalSum;
    const deltaWadAmount = this.getAffectedSum(
      position.lowerTick,
      position.upperTick,
      distribution,
      market
    );

    // 새로운 affected sum 계산: 기존 affected sum에 inverse factor 적용
    const factor = MathUtils.wExp(
      new Big(sellQuantity).div(market.liquidityParameter).neg()
    );
    const newAffectedSum = deltaWadAmount.mul(factor);

    // 전체 sum 업데이트: before - old_affected + new_affected
    const afterSum = beforeSum.minus(deltaWadAmount).plus(newAffectedSum);

    // CLMSR 공식: 수익 = 이전 비용 - 이후 비용
    const beforeCost = market.liquidityParameter.mul(MathUtils.wLn(beforeSum));
    const afterCost = market.liquidityParameter.mul(MathUtils.wLn(afterSum));

    const proceedsWad = beforeCost.minus(afterCost);

    const proceeds = MathUtils.fromWadRoundUp(proceedsWad);

    // Calculate average price
    const averagePrice = proceeds.div(sellQuantity);

    return { proceeds, averagePrice };
  }

  /**
   * Close position 비용 계산
   */
  calculateCloseProceeds(
    position: Position,
    distribution: MarketDistribution,
    market: Market
  ): CloseProceedsResult {
    const result = this.calculateDecreaseProceeds(
      position,
      position.quantity,
      distribution,
      market
    );

    return {
      proceeds: result.proceeds,
      averagePrice: result.averagePrice,
    };
  }

  /**
   * Claim amount 계산
   */
  calculateClaim(
    position: Position,
    settlementLowerTick: Tick,
    settlementUpperTick: Tick
  ): ClaimResult {
    // 포지션 범위와 정산 범위가 겹치는지 확인
    const hasOverlap =
      position.lowerTick < settlementUpperTick &&
      position.upperTick > settlementLowerTick;

    if (!hasOverlap) {
      // 패배 포지션: 클레임 불가
      return {
        payout: new Big(0),
      };
    }

    // 승리 포지션: 1 USDC per unit
    return {
      payout: position.quantity,
    };
  }

  // ============================================================================
  // INVERSE FUNCTION (역함수: 돈 → 수량)
  // ============================================================================

  /**
   * Sell position의 예상 수익 계산
   * @param position 포지션 정보
   * @param sellQuantity 매도할 수량
   * @param distribution Current market distribution
   * @param market Market parameters
   * @returns 예상 수익
   */
  calculateSellProceeds(
    position: Position,
    sellQuantity: Quantity,
    distribution: MarketDistribution,
    market: Market
  ): DecreaseProceedsResult {
    // Input validation
    if (new Big(sellQuantity).lte(0)) {
      throw new Error("Sell quantity must be positive");
    }

    if (new Big(sellQuantity).gt(position.quantity)) {
      throw new Error("Cannot sell more than current position");
    }

    // Convert to WAD for calculations
    const alpha = market.liquidityParameter;
    const quantityWad = new Big(sellQuantity).mul(MathUtils.WAD);

    // Get current state
    const sumBefore = distribution.totalSum;
    const affectedSum = this.getAffectedSum(
      position.lowerTick,
      position.upperTick,
      distribution,
      market
    );

    // 🎯 컨트랙트와 정확히 동일한 LMSR sell 공식 구현
    // 1. Calculate inverse factor: exp(-quantity / α) = 1 / exp(quantity / α) - safe chunking 사용
    const factor = MathUtils.safeExp(quantityWad, alpha);
    const inverseFactor = MathUtils.wDiv(MathUtils.WAD, factor);

    // 2. Calculate sum after sell
    const sumAfter = sumBefore
      .minus(affectedSum)
      .plus(MathUtils.wMul(affectedSum, inverseFactor));

    // 3. Calculate proceeds: α * ln(sumBefore / sumAfter)
    const ratio = MathUtils.wDiv(sumBefore, sumAfter);
    const lnRatio = MathUtils.wLn(ratio);
    const proceedsWad = MathUtils.wMul(alpha, lnRatio);

    const proceeds = MathUtils.fromWadRoundUp(proceedsWad);

    // Calculate average price
    const averagePrice = proceeds.div(sellQuantity);

    return { proceeds, averagePrice };
  }

  /**
   * 주어진 비용으로 살 수 있는 수량 계산 (역산)
   * @param lowerTick Lower tick bound
   * @param upperTick Upper tick bound
   * @param targetCostWad 목표 비용 (WAD 형식)
   * @param distribution Current market distribution
   * @param market Market parameters
   * @returns 구매 가능한 수량
   */
  calculateQuantityFromCost(
    lowerTick: Tick,
    upperTick: Tick,
    targetCostWad: WADAmount,
    distribution: MarketDistribution,
    market: Market
  ): QuantityFromCostResult {
    // Convert from input
    const alpha = market.liquidityParameter;

    // Get current state
    const sumBefore = distribution.totalSum;
    const affectedSum = this.getAffectedSum(
      lowerTick,
      upperTick,
      distribution,
      market
    );

    // Direct mathematical inverse:
    // From: C = α * ln(sumAfter / sumBefore)
    // Calculate: q = α * ln(factor)

    // Calculate target sum after: sumAfter = sumBefore * exp(C/α) - safe chunking 사용
    const expValue = MathUtils.safeExp(targetCostWad, alpha);
    const targetSumAfter = MathUtils.wMul(sumBefore, expValue);

    // Calculate required affected sum after trade
    const requiredAffectedSum = targetSumAfter.minus(
      sumBefore.minus(affectedSum)
    );

    // Calculate factor: newAffectedSum / affectedSum
    const factor = MathUtils.wDiv(requiredAffectedSum, affectedSum);

    // Calculate quantity: q = α * ln(factor)
    const quantityWad = MathUtils.wMul(alpha, MathUtils.wLn(factor));
    const quantity = MathUtils.fromWad(quantityWad);

    // Verify by calculating actual cost
    const verification = this.calculateOpenCost(
      lowerTick,
      upperTick,
      quantity,
      distribution,
      market
    );

    return {
      quantity,
      actualCost: verification.cost,
    };
  }

  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================

  private validateTickRange(
    lowerTick: Tick,
    upperTick: Tick,
    market: Market
  ): void {
    if (lowerTick >= upperTick) {
      throw new Error("Lower tick must be less than upper tick");
    }

    if (lowerTick < market.minTick || upperTick > market.maxTick) {
      throw new Error("Tick range is out of market bounds");
    }

    if ((lowerTick - market.minTick) % market.tickSpacing !== 0) {
      throw new Error("Lower tick is not aligned to tick spacing");
    }

    if ((upperTick - market.minTick) % market.tickSpacing !== 0) {
      throw new Error("Upper tick is not aligned to tick spacing");
    }
  }

  private getAffectedSum(
    lowerTick: Tick,
    upperTick: Tick,
    distribution: MarketDistribution,
    market: Market
  ): WADAmount {
    // 입력 데이터 검증
    if (!distribution) {
      throw new Error("Distribution data is required but was undefined");
    }

    if (!distribution.binFactors) {
      throw new Error(
        "binFactors is required but was undefined. Make sure to include 'binFactors' field in your GraphQL query and use mapDistribution() to convert the data."
      );
    }

    if (!Array.isArray(distribution.binFactors)) {
      throw new Error("binFactors must be an array");
    }

    // 컨트랙트와 동일한 _rangeToBins 로직 사용
    const lowerBin = Math.floor(
      (lowerTick - market.minTick) / market.tickSpacing
    );
    const upperBin = Math.floor(
      (upperTick - market.minTick) / market.tickSpacing - 1
    );

    let affectedSum = new Big(0);

    // 컨트랙트와 동일하게 inclusive 범위로 계산 (lowerBin <= binIndex <= upperBin)
    for (let binIndex = lowerBin; binIndex <= upperBin; binIndex++) {
      if (binIndex >= 0 && binIndex < distribution.binFactors.length) {
        // 이미 WAD 형식의 Big 객체이므로 직접 사용
        affectedSum = affectedSum.plus(distribution.binFactors[binIndex]);
      }
    }

    return affectedSum;
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Create CLMSR SDK instance
 */
export function createCLMSRSDK(): CLMSRSDK {
  return new CLMSRSDK();
}

/**
 * Convert to WAD amount (18 decimals)
 */
export function toWAD(amount: string | number): WADAmount {
  return new Big(amount).mul(MathUtils.WAD);
}

/**
 * Convert to USDC amount (6 decimals)
 */
export function toUSDC(amount: string | number): USDCAmount {
  return new Big(amount).mul(new Big("1000000")); // 6자리 소수점: 1 USDC = 1,000,000 micro USDC
}
