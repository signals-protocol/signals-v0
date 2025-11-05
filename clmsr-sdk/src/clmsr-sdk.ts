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
  QuantityFromProceedsResult,
  WADAmount,
  USDCAmount,
  Quantity,
  Tick,
  FeeInfo,
  FeePolicyKind,
  ValidationError,
  CalculationError,
} from "./types";

import * as MathUtils from "./utils/math";
import {
  Bytes32Like,
  TradeSide,
  quoteOpenFee,
  quoteSellFee,
  resolveFeePolicyWithMetadata,
  NullFeePolicy,
} from "./fees";

// Re-export types and utilities for easy access
export * from "./types";
export { toWAD, toMicroUSDC } from "./utils/math";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ZERO_CONTEXT: Bytes32Like = `0x${"00".repeat(32)}` as Bytes32Like;

function bigToBigInt(value: Big): bigint {
  const rounded = value.round(0, Big.roundDown);
  if (!rounded.eq(value)) {
    throw new CalculationError(
      "Fee calculations require integer micro-USDC amounts"
    );
  }
  return BigInt(rounded.toFixed(0, Big.roundDown));
}

/**
 * CLMSR SDK - 컨트랙트 뷰함수들과 역함수 제공
 */
export class CLMSRSDK {
  // ============================================================================
  // CONTRACT VIEW FUNCTIONS (컨트랙트 뷰함수들)
  // ============================================================================

  /**
   * calculateOpenCost - 새 포지션 열기 비용 계산
   * @param lowerTick Lower tick bound (inclusive)
   * @param upperTick Upper tick bound (exclusive)
   * @param quantity 매수 수량
   * @param distribution Current market distribution
   * @param market Market parameters
   */
  // Tick boundary in absolute ticks; internally maps to inclusive bin indices [loBin, hiBin]
  calculateOpenCost(
    lowerTick: Tick,
    upperTick: Tick,
    quantity: Quantity,
    distribution: MarketDistribution,
    market: Market
  ): OpenCostResult {
    const normalizedQuantity = MathUtils.formatUSDC(new Big(quantity));

    // Input validation
    if (normalizedQuantity.lte(0)) {
      throw new ValidationError("Quantity must be positive");
    }

    if (!distribution) {
      throw new ValidationError(
        "Distribution data is required but was undefined"
      );
    }

    // Tick range 검증
    this.validateTickRange(lowerTick, upperTick, market);

    // 시장별 최대 수량 검증 (UX 개선)
    this._assertQuantityWithinLimit(
      normalizedQuantity,
      market.liquidityParameter
    );

    // Convert to WAD for calculations
    const alpha = market.liquidityParameter;
    const quantityWad = MathUtils.toWad(normalizedQuantity);

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
      .plus(MathUtils.wMulNearest(affectedSum, factor));

    // 3. Calculate cost: α * ln(sumAfter / sumBefore) - 컨트랙트와 동일
    const ratio = MathUtils.wDivUp(sumAfter, sumBefore);
    const lnRatio = MathUtils.wLn(ratio);
    const costWad = MathUtils.wMul(alpha, lnRatio);

    // 계산 완료

    const cost = MathUtils.formatUSDC(MathUtils.fromWadRoundUp(costWad));

    // Calculate average price with proper formatting
    // cost는 micro USDC, quantity도 micro USDC이므로 결과는 USDC/USDC = 비율
    const averagePrice = cost.div(normalizedQuantity);
    const formattedAveragePrice = new Big(
      averagePrice.toFixed(6, Big.roundDown)
    ); // 6자리 정밀도로 충분

    const feeOverlay = this.computeFeeOverlay(
      "BUY",
      cost,
      normalizedQuantity,
      lowerTick,
      upperTick,
      market.feePolicyDescriptor
    );

    const result: OpenCostResult = {
      cost,
      averagePrice: formattedAveragePrice,
      feeAmount: feeOverlay.amount,
      feeRate: feeOverlay.rate,
      feeInfo: feeOverlay.info,
    };

    return result;
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
      feeAmount: result.feeAmount,
      feeRate: result.feeRate,
      feeInfo: result.feeInfo,
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
    const normalizedSellQuantity = MathUtils.formatUSDC(new Big(sellQuantity));

    const baseResult = this._calcSellProceeds(
      position.lowerTick,
      position.upperTick,
      normalizedSellQuantity,
      position.quantity,
      distribution,
      market
    );

    const feeOverlay = this.computeFeeOverlay(
      "SELL",
      baseResult.proceeds,
      normalizedSellQuantity,
      position.lowerTick,
      position.upperTick,
      market.feePolicyDescriptor
    );

    return {
      proceeds: baseResult.proceeds,
      averagePrice: baseResult.averagePrice,
      feeAmount: feeOverlay.amount,
      feeRate: feeOverlay.rate,
      feeInfo: feeOverlay.info,
    };
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
      feeAmount: result.feeAmount,
      feeRate: result.feeRate,
      feeInfo: result.feeInfo,
    };
  }

  /**
   * Claim amount 계산
   */
  calculateClaim(position: Position, settlementTick: Tick): ClaimResult {
    // 정산 틱이 포지션 범위 [lowerTick, upperTick)에 포함되는지 확인
    const hasWinning =
      position.lowerTick <= settlementTick &&
      position.upperTick > settlementTick;

    if (!hasWinning) {
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
    const base = this._calcSellProceeds(
      position.lowerTick,
      position.upperTick,
      sellQuantity,
      position.quantity,
      distribution,
      market
    );

    return {
      proceeds: base.proceeds,
      averagePrice: base.averagePrice,
      feeAmount: MathUtils.formatUSDC(new Big(0)),
      feeRate: new Big(0),
      feeInfo: {
        policy: FeePolicyKind.Null,
        name: "NullFeePolicy",
      },
    };
  }

  /**
   * 주어진 비용으로 살 수 있는 수량 계산 (역산)
   * @param lowerTick Lower tick bound (inclusive)
   * @param upperTick Upper tick bound (exclusive)
   * @param cost 목표 비용 (6 decimals)
   * @param distribution Current market distribution
   * @param market Market parameters
   * @returns 구매 가능한 수량
   */
  // Tick boundary in absolute ticks; internally maps to inclusive bin indices [loBin, hiBin]
  calculateQuantityFromCost(
    lowerTick: Tick,
    upperTick: Tick,
    cost: USDCAmount,
    distribution: MarketDistribution,
    market: Market
  ): QuantityFromCostResult {
    const costWad = MathUtils.toWad(cost); // 6→18 dec 변환

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
    const expValue = MathUtils.safeExp(costWad, alpha);
    const targetSumAfter = MathUtils.wMul(sumBefore, expValue);

    // Calculate required affected sum after trade
    const requiredAffectedSum = targetSumAfter.minus(
      sumBefore.minus(affectedSum)
    );

    // Calculate factor: newAffectedSum / affectedSum
    if (affectedSum.eq(0)) {
      throw new CalculationError(
        "Cannot calculate quantity from cost: affected sum is zero. This usually means the tick range is outside the market or the distribution data is empty."
      );
    }
    const factor = MathUtils.wDiv(requiredAffectedSum, affectedSum);

    // Calculate quantity: q = α * ln(factor)
    const quantityWad = MathUtils.wMul(alpha, MathUtils.wLn(factor));
    // quantityWad는 WAD 형식이므로 WAD를 일반 수로 변환 후 micro USDC로 변환
    const quantityValue = MathUtils.wadToNumber(quantityWad);
    const quantity = quantityValue.mul(MathUtils.USDC_PRECISION); // 일반 수를 micro USDC로 변환

    // 역산 결과 수량이 시장 한계 내에 있는지 검증 (UX 개선)
    this._assertQuantityWithinLimit(quantity, market.liquidityParameter);

    // Verify by calculating actual cost
    // 스케일링 문제 수정으로 이제 안전하게 검증 가능
    let actualCost: Big;
    try {
      const verification = this.calculateOpenCost(
        lowerTick,
        upperTick,
        quantity,
        distribution,
        market
      );
      actualCost = verification.cost;
    } catch (error) {
      // 매우 큰 수량이나 극단적인 경우에만 예외 처리
      // 입력 비용을 그대로 사용
      actualCost = cost;
      console.warn(
        "calculateQuantityFromCost: verification failed, using target cost as approximation",
        error
      );
    }

    return {
      quantity: MathUtils.formatUSDC(quantity),
      actualCost: MathUtils.formatUSDC(actualCost),
    };
  }

  /**
   * 주어진 목표 수익(proceeds)으로 필요한 매도 수량 역산
   * @param position 보유 포지션 정보
   * @param targetProceeds 목표 수익 (6 decimals)
   * @param distribution Current market distribution
   * @param market Market parameters
   * @returns 매도해야 할 수량과 검증된 실제 수익
   */
  calculateQuantityFromProceeds(
    position: Position,
    targetProceeds: USDCAmount,
    distribution: MarketDistribution,
    market: Market
  ): QuantityFromProceedsResult {
    this.validateTickRange(position.lowerTick, position.upperTick, market);

    if (!distribution) {
      throw new ValidationError(
        "Distribution data is required but was undefined"
      );
    }

    if (new Big(position.quantity).lte(0)) {
      throw new ValidationError("Position quantity must be positive");
    }

    if (new Big(targetProceeds).lte(0)) {
      throw new ValidationError("Target proceeds must be positive");
    }

    // 최대 수익 한계 확인 (전체 매도)
    const maxProceeds = this.calculateDecreaseProceeds(
      position,
      position.quantity,
      distribution,
      market
    ).proceeds;

    if (new Big(targetProceeds).gt(maxProceeds)) {
      throw new ValidationError(
        "Target proceeds exceed the maximum proceeds available for this position"
      );
    }

    const alpha = market.liquidityParameter;
    const proceedsWad = MathUtils.toWad(targetProceeds);

    const sumBefore = distribution.totalSum;
    const affectedSum = this.getAffectedSum(
      position.lowerTick,
      position.upperTick,
      distribution,
      market
    );

    if (affectedSum.eq(0)) {
      throw new CalculationError(
        "Cannot calculate quantity from proceeds: affected sum is zero. This usually means the tick range is outside the market or the distribution data is empty."
      );
    }

    // sumAfter = sumBefore * exp(-targetProceeds/α)
    const expProceeds = MathUtils.safeExp(proceedsWad, alpha);
    const targetSumAfter = MathUtils.wDiv(sumBefore, expProceeds);

    const unaffectedSum = sumBefore.minus(affectedSum);

    if (targetSumAfter.lt(unaffectedSum)) {
      throw new ValidationError(
        "Target proceeds require selling more than the position holds"
      );
    }

    const requiredAffectedSumAfter = targetSumAfter.minus(unaffectedSum);

    if (requiredAffectedSumAfter.lte(0)) {
      throw new ValidationError(
        "Target proceeds would reduce the affected sum to zero or negative"
      );
    }

    if (requiredAffectedSumAfter.gt(affectedSum)) {
      throw new CalculationError(
        "Target proceeds require increasing the affected sum, which is impossible for a sale"
      );
    }

    const inverseFactor = MathUtils.wDiv(requiredAffectedSumAfter, affectedSum);

    if (inverseFactor.lte(0) || inverseFactor.gt(MathUtils.WAD)) {
      throw new CalculationError(
        "Inverse factor out of bounds when calculating sell quantity"
      );
    }

    // q = α * ln(1 / inverseFactor)
    const factor = MathUtils.wDiv(MathUtils.WAD, inverseFactor);
    const quantityWad = MathUtils.wMul(alpha, MathUtils.wLn(factor));

    const quantityValue = MathUtils.wadToNumber(quantityWad);
    const quantity = quantityValue.mul(MathUtils.USDC_PRECISION);

    this._assertQuantityWithinLimit(quantity, alpha);

    let formattedQuantity = MathUtils.formatUSDC(quantity);

    if (formattedQuantity.gt(position.quantity)) {
      formattedQuantity = MathUtils.formatUSDC(position.quantity);
    }

    let actualProceeds: Big;

    try {
      const verification = this._calcSellProceeds(
        position.lowerTick,
        position.upperTick,
        formattedQuantity,
        position.quantity,
        distribution,
        market
      );
      actualProceeds = verification.proceeds;
    } catch (error) {
      actualProceeds = targetProceeds;
      console.warn(
        "calculateQuantityFromProceeds: verification failed, using target proceeds as approximation",
        error
      );
    }

    return {
      quantity: formattedQuantity,
      actualProceeds: MathUtils.formatUSDC(actualProceeds),
    };
  }

  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================

  /**
   * 시장별 최대 수량 한계 검증 (컨트랙트와 동일한 제한)
   * @param quantity 검증할 수량 (6 decimals)
   * @param alpha 유동성 파라미터 α (18 decimals WAD)
   * @throws Error if quantity exceeds market limit
   */
  private _assertQuantityWithinLimit(
    quantity: Quantity,
    alpha: WADAmount
  ): void {
    // maxQty = α × MAX_EXP_INPUT_WAD × MAX_CHUNKS_PER_TX
    //        = α × 1.0 × 1000
    // alpha는 WAD 형식, 직접 계산
    const chunksWad = new Big(MathUtils.MAX_CHUNKS_PER_TX.toString()).mul(
      MathUtils.WAD
    );
    const step1 = MathUtils.wMul(alpha, MathUtils.MAX_EXP_INPUT_WAD);
    const maxQtyWad = MathUtils.wMul(step1, chunksWad);
    // quantity는 이미 micro-USDC(6 decimals) 정수이므로 바로 WAD로 변환
    const qtyWad = MathUtils.toWad(quantity);

    if (qtyWad.gt(maxQtyWad)) {
      const maxQtyFormatted = MathUtils.wadToNumber(maxQtyWad);
      throw new ValidationError(
        `Quantity too large. Max per trade = ${maxQtyFormatted.toString()} USDC (market limit: α × 1.0 × 1000)`
      );
    }
  }

  /**
   * 내부 헬퍼: 매도 수익 계산 (코드 중복 제거)
   * @param lowerTick Lower tick bound (inclusive)
   * @param upperTick Upper tick bound (exclusive)
   * @param sellQuantity 매도할 수량
   * @param positionQuantity 현재 포지션 수량 (검증용)
   * @param distribution Current market distribution
   * @param market Market parameters
   * @returns 매도 수익
   */
  // Tick boundary in absolute ticks; internally maps to inclusive bin indices [loBin, hiBin]
  private _calcSellProceeds(
    lowerTick: Tick,
    upperTick: Tick,
    sellQuantity: Quantity,
    positionQuantity: Quantity,
    distribution: MarketDistribution,
    market: Market
  ): { proceeds: USDCAmount; averagePrice: USDCAmount } {
    this.validateTickRange(lowerTick, upperTick, market);

    // Input validation
    if (new Big(sellQuantity).lte(0)) {
      throw new ValidationError("Sell quantity must be positive");
    }

    if (new Big(sellQuantity).gt(positionQuantity)) {
      throw new ValidationError("Cannot sell more than current position");
    }

    // 시장별 최대 수량 검증 (UX 개선)
    this._assertQuantityWithinLimit(sellQuantity, market.liquidityParameter);

    // Convert to WAD for calculations
    const alpha = market.liquidityParameter;
    const quantityWad = MathUtils.toWad(sellQuantity);

    // Get current state
    const sumBefore = distribution.totalSum;
    const affectedSum = this.getAffectedSum(
      lowerTick,
      upperTick,
      distribution,
      market
    );

    // 🎯 컨트랙트와 정확히 동일한 LMSR sell 공식 구현
    // 1. Calculate inverse factor: exp(-quantity / α) = 1 / exp(quantity / α) - safe chunking 사용
    const factor = MathUtils.safeExp(quantityWad, alpha);
    const inverseFactor = MathUtils.wDivUp(MathUtils.WAD, factor);

    // 2. Calculate sum after sell
    const sumAfter = sumBefore
      .minus(affectedSum)
      .plus(MathUtils.wMulNearest(affectedSum, inverseFactor));

    // 3. Calculate proceeds: α * ln(sumBefore / sumAfter)
    const ratio = MathUtils.wDivUp(sumBefore, sumAfter);
    const lnRatio = MathUtils.wLn(ratio);
    const proceedsWad = MathUtils.wMul(alpha, lnRatio);

    const proceeds = MathUtils.fromWad(proceedsWad);

    // Calculate average price with proper formatting
    const averagePrice = proceeds.div(sellQuantity);
    const formattedAveragePrice = new Big(
      averagePrice.toFixed(6, Big.roundDown)
    ); // 6자리 정밀도로 충분

    return {
      proceeds: MathUtils.formatUSDC(proceeds),
      averagePrice: formattedAveragePrice,
    };
  }

  private computeFeeOverlay(
    side: TradeSide,
    baseAmount: USDCAmount,
    quantity: USDCAmount,
    lowerTick: Tick,
    upperTick: Tick,
    descriptor?: string
  ): { amount: USDCAmount; rate: Big; info: FeeInfo } {
    const makeZeroOverlay = (descriptorString?: string, policyName?: string) => ({
      amount: MathUtils.formatUSDC(new Big(0)),
      rate: new Big(0),
      info: {
        policy: FeePolicyKind.Null,
        ...(descriptorString ? { descriptor: descriptorString } : {}),
        name: policyName ?? "NullFeePolicy",
      },
    });

    if (!descriptor || descriptor.trim().length === 0) {
      return makeZeroOverlay();
    }

    const resolved = resolveFeePolicyWithMetadata(descriptor);
    const baseAmountInt = bigToBigInt(baseAmount);
    const quantityInt = bigToBigInt(quantity);

    const trader = ZERO_ADDRESS;
    const marketId = 0;
    const context = ZERO_CONTEXT;

    const feeBigInt =
      side === "BUY"
        ? quoteOpenFee(resolved.policy, {
            trader,
            marketId,
            lowerTick,
            upperTick,
            quantity6: quantityInt,
            cost6: baseAmountInt,
            context,
          })
        : quoteSellFee(resolved.policy, {
            trader,
            marketId,
            lowerTick,
            upperTick,
            sellQuantity6: quantityInt,
            proceeds6: baseAmountInt,
            context,
          });

    const feeAmount = MathUtils.formatUSDC(new Big(feeBigInt.toString()));
    const parsedDescriptor = resolved.descriptor;
    const descriptorString = parsedDescriptor?.descriptor ?? descriptor;
    const policyName =
      parsedDescriptor?.name ??
      (typeof resolved.policy.name === "string"
        ? resolved.policy.name
        : undefined);

    if (!descriptorString || descriptorString.length === 0) {
      return makeZeroOverlay();
    }

    if (parsedDescriptor?.policy === "null" || resolved.policy === NullFeePolicy) {
      return {
        amount: feeAmount,
        rate: new Big(0),
        info: {
          policy: FeePolicyKind.Null,
          descriptor: descriptorString,
          name: policyName ?? "NullFeePolicy",
        },
      };
    }

    if (parsedDescriptor?.policy === "percentage") {
      const bps = new Big(parsedDescriptor.bps!.toString());
      const rate = bps.div(new Big("10000"));

      return {
        amount: feeAmount,
        rate,
        info: {
          policy: FeePolicyKind.Percentage,
          descriptor: descriptorString,
          name: policyName,
          bps,
        },
      };
    }

    const effectiveRate =
      baseAmount.gt(0) && feeAmount.gt(0)
        ? feeAmount.div(baseAmount)
        : new Big(0);

    return {
      amount: feeAmount,
      rate: effectiveRate,
      info: {
        policy: FeePolicyKind.Custom,
        descriptor: descriptorString,
        name: policyName,
      },
    };
  }

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
    // 입력 데이터 검증
    if (!distribution) {
      throw new ValidationError(
        "Distribution data is required but was undefined"
      );
    }

    if (!distribution.binFactors) {
      throw new ValidationError(
        "binFactors is required but was undefined. Make sure to include 'binFactors' field in your GraphQL query and use mapDistribution() to convert the data."
      );
    }

    if (!Array.isArray(distribution.binFactors)) {
      throw new ValidationError("binFactors must be an array");
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
