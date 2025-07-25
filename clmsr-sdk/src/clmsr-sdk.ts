import Big from "big.js";
import {
  Market,
  Position,
  MarketDistribution,
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
  ValidationError,
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
    this.validateTickRange(lowerTick, upperTick, market);

    if (quantity.lte(0)) {
      throw new ValidationError("Quantity must be positive");
    }

    // 🎯 컨트랙트와 정확히 동일한 LMSR 공식 구현
    const quantityWad = MathUtils.toWad(quantity);
    const alpha = market.liquidityParameter;

    // Get current state
    const sumBefore = distribution.totalSum;
    const affectedSum = this.getAffectedSum(
      lowerTick,
      upperTick,
      distribution,
      market
    );

    // 1. Calculate factor: exp(quantity / α) - 컨트랙트와 동일
    const quantityScaled = MathUtils.wDiv(quantityWad, alpha);
    const factor = MathUtils.wExp(quantityScaled);

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
   * calculateDecreaseProceeds - 포지션 감소시 수익 계산
   */
  calculateDecreaseProceeds(
    position: Position,
    sellQuantity: Quantity,
    distribution: MarketDistribution,
    market: Market
  ): DecreaseProceedsResult {
    this.validateTickRange(position.lowerTick, position.upperTick, market);

    if (sellQuantity.lte(0)) {
      throw new ValidationError("Sell quantity must be positive");
    }

    if (sellQuantity.gt(position.quantity)) {
      throw new ValidationError("Cannot sell more than position quantity");
    }

    const quantityWad = MathUtils.toWad(sellQuantity);
    const alpha = market.liquidityParameter;

    // Get current state
    const sumBefore = distribution.totalSum;
    const affectedSum = this.getAffectedSum(
      position.lowerTick,
      position.upperTick,
      distribution,
      market
    );

    // 🎯 컨트랙트와 정확히 동일한 LMSR sell 공식 구현
    // 1. Calculate inverse factor: exp(-quantity / α) = 1 / exp(quantity / α)
    const quantityScaled = MathUtils.wDiv(quantityWad, alpha);
    const factor = MathUtils.wExp(quantityScaled);
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
   * calculateCloseProceeds - 전체 포지션 닫기 수익 계산
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
   * calculateClaimAmount - 정산 후 클레임 금액 계산
   */
  calculateClaimAmount(
    position: Position,
    settlementLowerTick: Tick,
    settlementUpperTick: Tick
  ): ClaimResult {
    // Check if position range overlaps with winning range
    // Same logic as contract: position.lowerTick <= market.settlementUpperTick && position.upperTick >= market.settlementLowerTick
    const hasOverlap =
      position.lowerTick <= settlementUpperTick &&
      position.upperTick >= settlementLowerTick;

    if (hasOverlap) {
      return {
        claimAmount: position.quantity,
        isWinning: true,
      };
    } else {
      return {
        claimAmount: new Big(0),
        isWinning: false,
      };
    }
  }

  // ============================================================================
  // INVERSE FUNCTION (역함수: 돈 → 수량)
  // ============================================================================

  /**
   * calculateQuantityFromCost - 목표 비용에서 수량 계산 (역함수)
   */
  calculateQuantityFromCost(
    lowerTick: Tick,
    upperTick: Tick,
    targetCost: USDCAmount,
    distribution: MarketDistribution,
    market: Market
  ): QuantityFromCostResult {
    this.validateTickRange(lowerTick, upperTick, market);

    if (targetCost.lte(0)) {
      throw new ValidationError("Target cost must be positive");
    }

    const targetCostWad = MathUtils.toWad(targetCost);
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

    // Calculate target sum after: sumAfter = sumBefore * exp(C/α)
    const targetSumAfter = MathUtils.wMul(
      sumBefore,
      MathUtils.wExp(MathUtils.wDiv(targetCostWad, alpha))
    );

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
      throw new ValidationError("Lower tick must be less than upper tick");
    }

    if (lowerTick < market.minTick || upperTick > market.maxTick) {
      throw new ValidationError("Tick range is out of market bounds");
    }

    if ((lowerTick - market.minTick) % market.tickSpacing !== 0) {
      throw new ValidationError("Lower tick is not aligned to tick spacing");
    }

    if ((upperTick - market.minTick) % market.tickSpacing !== 0) {
      throw new ValidationError("Upper tick is not aligned to tick spacing");
    }
  }

  private getAffectedSum(
    lowerTick: Tick,
    upperTick: Tick,
    distribution: MarketDistribution,
    market: Market
  ): WADAmount {
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
