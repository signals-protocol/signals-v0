"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CLMSRSDK = exports.toMicroUSDC = exports.toWAD = void 0;
exports.createCLMSRSDK = createCLMSRSDK;
const big_js_1 = __importDefault(require("big.js"));
const types_1 = require("./types");
const MathUtils = __importStar(require("./utils/math"));
const fees_1 = require("./fees");
// Re-export types and utilities for easy access
__exportStar(require("./types"), exports);
var math_1 = require("./utils/math");
Object.defineProperty(exports, "toWAD", { enumerable: true, get: function () { return math_1.toWAD; } });
Object.defineProperty(exports, "toMicroUSDC", { enumerable: true, get: function () { return math_1.toMicroUSDC; } });
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ZERO_CONTEXT = `0x${"00".repeat(32)}`;
const INVERSE_SPEND_TOLERANCE = new big_js_1.default(1); // 1 micro USDC tolerance
const MAX_INVERSE_ITERATIONS = 64;
function bigToBigInt(value) {
    const rounded = value.round(0, big_js_1.default.roundDown);
    if (!rounded.eq(value)) {
        throw new types_1.CalculationError("Fee calculations require integer micro-USDC amounts");
    }
    return BigInt(rounded.toFixed(0, big_js_1.default.roundDown));
}
/**
 * CLMSR SDK - 컨트랙트 뷰함수들과 역함수 제공
 */
class CLMSRSDK {
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
    calculateOpenCost(lowerTick, upperTick, quantity, distribution, market) {
        const normalizedQuantity = MathUtils.formatUSDC(new big_js_1.default(quantity));
        // Input validation
        if (normalizedQuantity.lte(0)) {
            throw new types_1.ValidationError("Quantity must be positive");
        }
        if (!distribution) {
            throw new types_1.ValidationError("Distribution data is required but was undefined");
        }
        // Tick range 검증
        this.validateTickRange(lowerTick, upperTick, market);
        // 시장별 최대 수량 검증 (UX 개선)
        this._assertQuantityWithinLimit(normalizedQuantity, market.liquidityParameter);
        // Convert to WAD for calculations
        const alpha = market.liquidityParameter;
        const quantityWad = MathUtils.toWad(normalizedQuantity);
        // Get current state
        const sumBefore = distribution.totalSum;
        const affectedSum = this.getAffectedSum(lowerTick, upperTick, distribution, market);
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
        const formattedAveragePrice = new big_js_1.default(averagePrice.toFixed(6, big_js_1.default.roundDown)); // 6자리 정밀도로 충분
        const feeOverlay = this.computeFeeOverlay("BUY", cost, normalizedQuantity, lowerTick, upperTick, market.feePolicyDescriptor);
        const result = {
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
    calculateIncreaseCost(position, additionalQuantity, distribution, market) {
        const result = this.calculateOpenCost(position.lowerTick, position.upperTick, additionalQuantity, distribution, market);
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
    calculateDecreaseProceeds(position, sellQuantity, distribution, market) {
        const normalizedSellQuantity = MathUtils.formatUSDC(new big_js_1.default(sellQuantity));
        const baseResult = this._calcSellProceeds(position.lowerTick, position.upperTick, normalizedSellQuantity, position.quantity, distribution, market);
        const feeOverlay = this.computeFeeOverlay("SELL", baseResult.proceeds, normalizedSellQuantity, position.lowerTick, position.upperTick, market.feePolicyDescriptor);
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
    calculateCloseProceeds(position, distribution, market) {
        const result = this.calculateDecreaseProceeds(position, position.quantity, distribution, market);
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
    calculateClaim(position, settlementTick) {
        // 정산 틱이 포지션 범위 [lowerTick, upperTick)에 포함되는지 확인
        const hasWinning = position.lowerTick <= settlementTick &&
            position.upperTick > settlementTick;
        if (!hasWinning) {
            // 패배 포지션: 클레임 불가
            return {
                payout: new big_js_1.default(0),
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
    calculateSellProceeds(position, sellQuantity, distribution, market) {
        const base = this._calcSellProceeds(position.lowerTick, position.upperTick, sellQuantity, position.quantity, distribution, market);
        return {
            proceeds: base.proceeds,
            averagePrice: base.averagePrice,
            feeAmount: MathUtils.formatUSDC(new big_js_1.default(0)),
            feeRate: new big_js_1.default(0),
            feeInfo: {
                policy: types_1.FeePolicyKind.Null,
                name: "NullFeePolicy",
            },
        };
    }
    /**
     * 주어진 총 지출(수수료 포함)으로 살 수 있는 수량 계산 (역산)
     * @param lowerTick Lower tick bound (inclusive)
     * @param upperTick Upper tick bound (exclusive)
     * @param cost 총 지출 한도 (수수료 포함, 6 decimals)
     * @param distribution Current market distribution
     * @param market Market parameters
     * @returns 구매 가능한 수량과 순수 베팅 비용
     */
    // Tick boundary in absolute ticks; internally maps to inclusive bin indices [loBin, hiBin]
    calculateQuantityFromCost(lowerTick, upperTick, cost, distribution, market, includeFees = true) {
        const targetSpend = MathUtils.formatUSDC(new big_js_1.default(cost));
        // 0 또는 음수 입력은 기존 로직과 동일하게 처리
        if (targetSpend.lte(0)) {
            return this._calculateQuantityFromNetCost(lowerTick, upperTick, targetSpend, distribution, market);
        }
        if (!includeFees) {
            return this._calculateQuantityFromNetCost(lowerTick, upperTick, targetSpend, distribution, market);
        }
        const descriptor = market.feePolicyDescriptor?.trim();
        if (!descriptor || descriptor.length === 0) {
            return this._calculateQuantityFromNetCost(lowerTick, upperTick, targetSpend, distribution, market);
        }
        const resolvedPolicy = (0, fees_1.resolveFeePolicyWithMetadata)(descriptor);
        if (resolvedPolicy.descriptor?.policy === "null" ||
            resolvedPolicy.policy === fees_1.NullFeePolicy) {
            return this._calculateQuantityFromNetCost(lowerTick, upperTick, targetSpend, distribution, market);
        }
        const zeroBase = MathUtils.formatUSDC(new big_js_1.default(0));
        const minSpend = this._computeTotalSpendWithFees(zeroBase, zeroBase, lowerTick, upperTick, descriptor);
        if (targetSpend.lt(minSpend)) {
            throw new types_1.ValidationError("Target cost is below the minimum spend achievable after fees");
        }
        let low = new big_js_1.default(0);
        let high = new big_js_1.default(targetSpend);
        // 퍼센트 수수료의 경우 총액을 (1+rate)로 나눠 초기 추정치를 잡아 수렴 속도 개선
        let initialGuess = new big_js_1.default(targetSpend);
        if (resolvedPolicy.descriptor?.policy === "percentage") {
            const bps = new big_js_1.default(resolvedPolicy.descriptor.bps.toString());
            const rate = bps.div(10000);
            const onePlusRate = new big_js_1.default(1).plus(rate);
            initialGuess = targetSpend.div(onePlusRate);
        }
        let netGuess = MathUtils.formatUSDC(initialGuess);
        if (netGuess.lt(0)) {
            netGuess = new big_js_1.default(0);
        }
        let bestResult = this._calculateQuantityFromNetCost(lowerTick, upperTick, netGuess, distribution, market);
        let bestDiff = this._computeTotalSpendWithFees(bestResult.actualCost, bestResult.quantity, lowerTick, upperTick, descriptor).minus(targetSpend);
        if (bestDiff.abs().lte(INVERSE_SPEND_TOLERANCE)) {
            return bestResult;
        }
        if (bestDiff.gt(0)) {
            high = new big_js_1.default(netGuess);
        }
        else {
            low = new big_js_1.default(netGuess);
        }
        for (let i = 0; i < MAX_INVERSE_ITERATIONS; i++) {
            const mid = low.plus(high).div(2);
            const midFormatted = MathUtils.formatUSDC(mid);
            const lowFormatted = MathUtils.formatUSDC(low);
            const highFormatted = MathUtils.formatUSDC(high);
            // 수렴 조건: 더 이상 변화가 없거나 잔여 구간이 tolerance 이하
            if (midFormatted.eq(lowFormatted) ||
                midFormatted.eq(highFormatted) ||
                high.minus(low).abs().lte(INVERSE_SPEND_TOLERANCE)) {
                const seen = new Set();
                [lowFormatted, highFormatted].forEach((boundary) => {
                    const key = boundary.toString();
                    if (seen.has(key)) {
                        return;
                    }
                    seen.add(key);
                    const boundaryCandidate = this._calculateQuantityFromNetCost(lowerTick, upperTick, boundary, distribution, market);
                    const boundaryTotal = this._computeTotalSpendWithFees(boundaryCandidate.actualCost, boundaryCandidate.quantity, lowerTick, upperTick, descriptor);
                    const boundaryDiff = boundaryTotal.minus(targetSpend);
                    if (boundaryDiff.abs().lt(bestDiff.abs())) {
                        bestResult = boundaryCandidate;
                        bestDiff = boundaryDiff;
                    }
                });
                break;
            }
            const candidate = this._calculateQuantityFromNetCost(lowerTick, upperTick, MathUtils.formatUSDC(midFormatted), distribution, market);
            const totalSpend = this._computeTotalSpendWithFees(candidate.actualCost, candidate.quantity, lowerTick, upperTick, descriptor);
            const diff = totalSpend.minus(targetSpend);
            if (diff.abs().lt(bestDiff.abs())) {
                bestResult = candidate;
                bestDiff = diff;
            }
            if (diff.abs().lte(INVERSE_SPEND_TOLERANCE)) {
                bestResult = candidate;
                break;
            }
            if (diff.gt(0)) {
                high = mid;
            }
            else {
                low = mid;
            }
        }
        if (bestDiff.abs().gt(INVERSE_SPEND_TOLERANCE)) {
            throw new types_1.ValidationError("Target cost cannot be achieved with current fee policy");
        }
        return bestResult;
    }
    _calculateQuantityFromNetCost(lowerTick, upperTick, netCost, distribution, market) {
        const costWad = MathUtils.toWad(netCost); // 6→18 dec 변환
        // Convert from input
        const alpha = market.liquidityParameter;
        // Get current state
        const sumBefore = distribution.totalSum;
        const affectedSum = this.getAffectedSum(lowerTick, upperTick, distribution, market);
        // Direct mathematical inverse:
        // From: C = α * ln(sumAfter / sumBefore)
        // Calculate: q = α * ln(factor)
        // Calculate target sum after: sumAfter = sumBefore * exp(C/α) - safe chunking 사용
        const expValue = MathUtils.safeExp(costWad, alpha);
        const targetSumAfter = MathUtils.wMul(sumBefore, expValue);
        // Calculate required affected sum after trade
        const requiredAffectedSum = targetSumAfter.minus(sumBefore.minus(affectedSum));
        // Calculate factor: newAffectedSum / affectedSum
        if (affectedSum.eq(0)) {
            throw new types_1.CalculationError("Cannot calculate quantity from cost: affected sum is zero. This usually means the tick range is outside the market or the distribution data is empty.");
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
        let actualCost;
        try {
            const verification = this.calculateOpenCost(lowerTick, upperTick, quantity, distribution, market);
            actualCost = verification.cost;
        }
        catch (error) {
            // 매우 큰 수량이나 극단적인 경우에만 예외 처리
            // 입력 비용을 그대로 사용
            actualCost = netCost;
            console.warn("calculateQuantityFromCost: verification failed, using target cost as approximation", error);
        }
        // Calculate fee information for the final result
        const formattedActualCost = MathUtils.formatUSDC(actualCost);
        const formattedQuantity = MathUtils.formatUSDC(quantity);
        const feeOverlay = this.computeFeeOverlay("BUY", formattedActualCost, formattedQuantity, lowerTick, upperTick, market.feePolicyDescriptor);
        return {
            quantity: formattedQuantity,
            actualCost: formattedActualCost,
            feeAmount: feeOverlay.amount,
            feeRate: feeOverlay.rate,
            feeInfo: feeOverlay.info,
        };
    }
    _computeTotalSpendWithFees(baseAmount, quantity, lowerTick, upperTick, descriptor) {
        const formattedBase = MathUtils.formatUSDC(baseAmount);
        const formattedQuantity = MathUtils.formatUSDC(quantity);
        const feeOverlay = this.computeFeeOverlay("BUY", formattedBase, formattedQuantity, lowerTick, upperTick, descriptor);
        return MathUtils.formatUSDC(formattedBase.plus(feeOverlay.amount));
    }
    /**
     * 주어진 목표 수익(수수료 반영)으로 필요한 매도 수량 역산
     * @param position 보유 포지션 정보
     * @param targetProceeds 수수료 제외 후 실제로 받고 싶은 금액 (6 decimals)
     * @param distribution Current market distribution
     * @param market Market parameters
     * @returns 매도해야 할 수량과 검증된 실제 수익(수수료 제외 전 기준)
     */
    calculateQuantityFromProceeds(position, targetProceeds, distribution, market, includeFees = true) {
        this.validateTickRange(position.lowerTick, position.upperTick, market);
        if (!distribution) {
            throw new types_1.ValidationError("Distribution data is required but was undefined");
        }
        if (new big_js_1.default(position.quantity).lte(0)) {
            throw new types_1.ValidationError("Position quantity must be positive");
        }
        if (new big_js_1.default(targetProceeds).lte(0)) {
            throw new types_1.ValidationError("Target proceeds must be positive");
        }
        const maxDecrease = this.calculateDecreaseProceeds(position, position.quantity, distribution, market);
        const targetAmount = MathUtils.formatUSDC(new big_js_1.default(targetProceeds));
        const maxBaseProceeds = MathUtils.formatUSDC(maxDecrease.proceeds);
        if (!includeFees) {
            if (targetAmount.gt(maxBaseProceeds)) {
                throw new types_1.ValidationError("Target proceeds exceed the maximum proceeds available for this position");
            }
            return this._calculateQuantityFromBaseProceeds(position, targetAmount, distribution, market);
        }
        const descriptor = market.feePolicyDescriptor?.trim();
        const targetNetProceeds = targetAmount;
        if (!descriptor || descriptor.length === 0) {
            if (targetNetProceeds.gt(maxBaseProceeds)) {
                throw new types_1.ValidationError("Target proceeds exceed the maximum proceeds available for this position");
            }
            return this._calculateQuantityFromBaseProceeds(position, targetNetProceeds, distribution, market);
        }
        const maxNetProceeds = MathUtils.formatUSDC(maxDecrease.proceeds.minus(maxDecrease.feeAmount));
        if (targetNetProceeds.gt(maxNetProceeds)) {
            throw new types_1.ValidationError("Target proceeds exceed the maximum net proceeds available for this position");
        }
        const resolvedPolicy = (0, fees_1.resolveFeePolicyWithMetadata)(descriptor);
        if (resolvedPolicy.descriptor?.policy === "null" ||
            resolvedPolicy.policy === fees_1.NullFeePolicy) {
            return this._calculateQuantityFromBaseProceeds(position, targetNetProceeds, distribution, market);
        }
        let lowBound = new big_js_1.default(targetNetProceeds);
        let highBound = new big_js_1.default(maxBaseProceeds);
        if (lowBound.gt(highBound)) {
            lowBound = new big_js_1.default(highBound);
        }
        let initialGuess = new big_js_1.default(targetNetProceeds);
        const parsedDescriptor = resolvedPolicy.descriptor;
        if (parsedDescriptor?.policy === "percentage") {
            const bps = new big_js_1.default(parsedDescriptor.bps.toString());
            const rate = bps.div(10000);
            const denominator = new big_js_1.default(1).minus(rate);
            if (denominator.gt(0)) {
                const derived = targetNetProceeds.div(denominator);
                if (derived.gt(initialGuess)) {
                    initialGuess = derived;
                }
            }
            else {
                initialGuess = new big_js_1.default(highBound);
            }
        }
        if (initialGuess.gt(highBound)) {
            initialGuess = new big_js_1.default(highBound);
        }
        if (initialGuess.lt(lowBound)) {
            initialGuess = new big_js_1.default(lowBound);
        }
        let baseGuess = MathUtils.formatUSDC(initialGuess);
        let bestResult = this._calculateQuantityFromBaseProceeds(position, baseGuess, distribution, market);
        let bestNet = this._computeNetProceedsAfterFees(bestResult.actualProceeds, bestResult.quantity, position.lowerTick, position.upperTick, descriptor);
        let bestDiff = bestNet.minus(targetNetProceeds);
        if (bestDiff.abs().lte(INVERSE_SPEND_TOLERANCE)) {
            return bestResult;
        }
        const adjustBounds = (candidateBase, diff) => {
            if (diff.gt(0)) {
                highBound = candidateBase;
            }
            else {
                lowBound = candidateBase;
            }
        };
        adjustBounds(new big_js_1.default(bestResult.actualProceeds), bestDiff);
        for (let i = 0; i < MAX_INVERSE_ITERATIONS; i++) {
            const mid = lowBound.plus(highBound).div(2);
            const midFormatted = MathUtils.formatUSDC(mid);
            const lowFormatted = MathUtils.formatUSDC(lowBound);
            const highFormatted = MathUtils.formatUSDC(highBound);
            if (midFormatted.eq(lowFormatted) ||
                midFormatted.eq(highFormatted) ||
                highBound.minus(lowBound).abs().lte(INVERSE_SPEND_TOLERANCE)) {
                const seen = new Set();
                [lowFormatted, highFormatted].forEach((boundary) => {
                    const key = boundary.toString();
                    if (seen.has(key)) {
                        return;
                    }
                    seen.add(key);
                    const boundaryCandidate = this._calculateQuantityFromBaseProceeds(position, boundary, distribution, market);
                    const boundaryNet = this._computeNetProceedsAfterFees(boundaryCandidate.actualProceeds, boundaryCandidate.quantity, position.lowerTick, position.upperTick, descriptor);
                    const boundaryDiff = boundaryNet.minus(targetNetProceeds);
                    if (boundaryDiff.abs().lt(bestDiff.abs())) {
                        bestResult = boundaryCandidate;
                        bestDiff = boundaryDiff;
                    }
                });
                break;
            }
            const candidate = this._calculateQuantityFromBaseProceeds(position, MathUtils.formatUSDC(midFormatted), distribution, market);
            const candidateNet = this._computeNetProceedsAfterFees(candidate.actualProceeds, candidate.quantity, position.lowerTick, position.upperTick, descriptor);
            const diff = candidateNet.minus(targetNetProceeds);
            if (diff.abs().lt(bestDiff.abs())) {
                bestResult = candidate;
                bestDiff = diff;
            }
            if (diff.abs().lte(INVERSE_SPEND_TOLERANCE)) {
                bestResult = candidate;
                break;
            }
            adjustBounds(new big_js_1.default(candidate.actualProceeds), diff);
        }
        if (bestDiff.abs().gt(INVERSE_SPEND_TOLERANCE)) {
            throw new types_1.ValidationError("Target proceeds cannot be achieved with current fee policy");
        }
        return bestResult;
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
    _assertQuantityWithinLimit(quantity, alpha) {
        // maxQty = α × MAX_EXP_INPUT_WAD × MAX_CHUNKS_PER_TX
        //        = α × 1.0 × 1000
        // alpha는 WAD 형식, 직접 계산
        const chunksWad = new big_js_1.default(MathUtils.MAX_CHUNKS_PER_TX.toString()).mul(MathUtils.WAD);
        const step1 = MathUtils.wMul(alpha, MathUtils.MAX_EXP_INPUT_WAD);
        const maxQtyWad = MathUtils.wMul(step1, chunksWad);
        // quantity는 이미 micro-USDC(6 decimals) 정수이므로 바로 WAD로 변환
        const qtyWad = MathUtils.toWad(quantity);
        if (qtyWad.gt(maxQtyWad)) {
            const maxQtyFormatted = MathUtils.wadToNumber(maxQtyWad);
            throw new types_1.ValidationError(`Quantity too large. Max per trade = ${maxQtyFormatted.toString()} USDC (market limit: α × 1.0 × 1000)`);
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
    _calculateQuantityFromBaseProceeds(position, baseProceeds, distribution, market) {
        const alpha = market.liquidityParameter;
        const proceedsWad = MathUtils.toWad(baseProceeds);
        const sumBefore = distribution.totalSum;
        const affectedSum = this.getAffectedSum(position.lowerTick, position.upperTick, distribution, market);
        if (affectedSum.eq(0)) {
            throw new types_1.CalculationError("Cannot calculate quantity from proceeds: affected sum is zero. This usually means the tick range is outside the market or the distribution data is empty.");
        }
        const expProceeds = MathUtils.safeExp(proceedsWad, alpha);
        const targetSumAfter = MathUtils.wDiv(sumBefore, expProceeds);
        const unaffectedSum = sumBefore.minus(affectedSum);
        if (targetSumAfter.lt(unaffectedSum)) {
            throw new types_1.ValidationError("Target proceeds require selling more than the position holds");
        }
        const requiredAffectedSumAfter = targetSumAfter.minus(unaffectedSum);
        if (requiredAffectedSumAfter.lte(0)) {
            throw new types_1.ValidationError("Target proceeds would reduce the affected sum to zero or negative");
        }
        if (requiredAffectedSumAfter.gt(affectedSum)) {
            throw new types_1.CalculationError("Target proceeds require increasing the affected sum, which is impossible for a sale");
        }
        const inverseFactor = MathUtils.wDiv(requiredAffectedSumAfter, affectedSum);
        if (inverseFactor.lte(0) || inverseFactor.gt(MathUtils.WAD)) {
            throw new types_1.CalculationError("Inverse factor out of bounds when calculating sell quantity");
        }
        const factor = MathUtils.wDiv(MathUtils.WAD, inverseFactor);
        const quantityWad = MathUtils.wMul(alpha, MathUtils.wLn(factor));
        const quantityValue = MathUtils.wadToNumber(quantityWad);
        const quantity = quantityValue.mul(MathUtils.USDC_PRECISION);
        this._assertQuantityWithinLimit(quantity, alpha);
        let formattedQuantity = MathUtils.formatUSDC(quantity);
        if (formattedQuantity.gt(position.quantity)) {
            formattedQuantity = MathUtils.formatUSDC(position.quantity);
        }
        let actualProceeds;
        try {
            const verification = this._calcSellProceeds(position.lowerTick, position.upperTick, formattedQuantity, position.quantity, distribution, market);
            actualProceeds = verification.proceeds;
        }
        catch (error) {
            actualProceeds = baseProceeds;
            console.warn("calculateQuantityFromProceeds: verification failed, using target proceeds as approximation", error);
        }
        // Calculate fee information
        const feeOverlay = this.computeFeeOverlay("SELL", actualProceeds, formattedQuantity, position.lowerTick, position.upperTick, market.feePolicyDescriptor);
        return {
            quantity: formattedQuantity,
            actualProceeds: MathUtils.formatUSDC(actualProceeds),
            feeAmount: feeOverlay.amount,
            feeRate: feeOverlay.rate,
            feeInfo: feeOverlay.info,
        };
    }
    _calcSellProceeds(lowerTick, upperTick, sellQuantity, positionQuantity, distribution, market) {
        this.validateTickRange(lowerTick, upperTick, market);
        // Input validation
        if (new big_js_1.default(sellQuantity).lte(0)) {
            throw new types_1.ValidationError("Sell quantity must be positive");
        }
        if (new big_js_1.default(sellQuantity).gt(positionQuantity)) {
            throw new types_1.ValidationError("Cannot sell more than current position");
        }
        // 시장별 최대 수량 검증 (UX 개선)
        this._assertQuantityWithinLimit(sellQuantity, market.liquidityParameter);
        // Convert to WAD for calculations
        const alpha = market.liquidityParameter;
        const quantityWad = MathUtils.toWad(sellQuantity);
        // Get current state
        const sumBefore = distribution.totalSum;
        const affectedSum = this.getAffectedSum(lowerTick, upperTick, distribution, market);
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
        const formattedAveragePrice = new big_js_1.default(averagePrice.toFixed(6, big_js_1.default.roundDown)); // 6자리 정밀도로 충분
        return {
            proceeds: MathUtils.formatUSDC(proceeds),
            averagePrice: formattedAveragePrice,
        };
    }
    _computeNetProceedsAfterFees(baseProceeds, quantity, lowerTick, upperTick, descriptor) {
        const formattedBase = MathUtils.formatUSDC(baseProceeds);
        const formattedQuantity = MathUtils.formatUSDC(quantity);
        const feeOverlay = this.computeFeeOverlay("SELL", formattedBase, formattedQuantity, lowerTick, upperTick, descriptor);
        return MathUtils.formatUSDC(formattedBase.minus(feeOverlay.amount));
    }
    computeFeeOverlay(side, baseAmount, quantity, lowerTick, upperTick, descriptor) {
        const makeZeroOverlay = (descriptorString, policyName) => ({
            amount: MathUtils.formatUSDC(new big_js_1.default(0)),
            rate: new big_js_1.default(0),
            info: {
                policy: types_1.FeePolicyKind.Null,
                ...(descriptorString ? { descriptor: descriptorString } : {}),
                name: policyName ?? "NullFeePolicy",
            },
        });
        if (!descriptor || descriptor.trim().length === 0) {
            return makeZeroOverlay();
        }
        const resolved = (0, fees_1.resolveFeePolicyWithMetadata)(descriptor);
        const baseAmountInt = bigToBigInt(baseAmount);
        const quantityInt = bigToBigInt(quantity);
        const trader = ZERO_ADDRESS;
        const marketId = 0;
        const context = ZERO_CONTEXT;
        const feeBigInt = side === "BUY"
            ? (0, fees_1.quoteOpenFee)(resolved.policy, {
                trader,
                marketId,
                lowerTick,
                upperTick,
                quantity6: quantityInt,
                cost6: baseAmountInt,
                context,
            })
            : (0, fees_1.quoteSellFee)(resolved.policy, {
                trader,
                marketId,
                lowerTick,
                upperTick,
                sellQuantity6: quantityInt,
                proceeds6: baseAmountInt,
                context,
            });
        const feeAmount = MathUtils.formatUSDC(new big_js_1.default(feeBigInt.toString()));
        const parsedDescriptor = resolved.descriptor;
        const descriptorString = parsedDescriptor?.descriptor ?? descriptor;
        const policyName = parsedDescriptor?.name ??
            (typeof resolved.policy.name === "string"
                ? resolved.policy.name
                : undefined);
        if (!descriptorString || descriptorString.length === 0) {
            return makeZeroOverlay();
        }
        if (parsedDescriptor?.policy === "null" || resolved.policy === fees_1.NullFeePolicy) {
            return {
                amount: feeAmount,
                rate: new big_js_1.default(0),
                info: {
                    policy: types_1.FeePolicyKind.Null,
                    descriptor: descriptorString,
                    name: policyName ?? "NullFeePolicy",
                },
            };
        }
        if (parsedDescriptor?.policy === "percentage") {
            const bps = new big_js_1.default(parsedDescriptor.bps.toString());
            const rate = bps.div(new big_js_1.default("10000"));
            return {
                amount: feeAmount,
                rate,
                info: {
                    policy: types_1.FeePolicyKind.Percentage,
                    descriptor: descriptorString,
                    name: policyName,
                    bps,
                },
            };
        }
        const effectiveRate = baseAmount.gt(0) && feeAmount.gt(0)
            ? feeAmount.div(baseAmount)
            : new big_js_1.default(0);
        return {
            amount: feeAmount,
            rate: effectiveRate,
            info: {
                policy: types_1.FeePolicyKind.Custom,
                descriptor: descriptorString,
                name: policyName,
            },
        };
    }
    validateTickRange(lowerTick, upperTick, market) {
        if (lowerTick >= upperTick) {
            throw new types_1.ValidationError("Lower tick must be less than upper tick");
        }
        if (lowerTick < market.minTick || upperTick > market.maxTick) {
            throw new types_1.ValidationError("Tick range is out of market bounds");
        }
        if ((lowerTick - market.minTick) % market.tickSpacing !== 0) {
            throw new types_1.ValidationError("Lower tick is not aligned to tick spacing");
        }
        if ((upperTick - market.minTick) % market.tickSpacing !== 0) {
            throw new types_1.ValidationError("Upper tick is not aligned to tick spacing");
        }
    }
    getAffectedSum(lowerTick, upperTick, distribution, market) {
        // 입력 데이터 검증
        if (!distribution) {
            throw new types_1.ValidationError("Distribution data is required but was undefined");
        }
        if (!distribution.binFactors) {
            throw new types_1.ValidationError("binFactors is required but was undefined. Make sure to include 'binFactors' field in your GraphQL query and use mapDistribution() to convert the data.");
        }
        if (!Array.isArray(distribution.binFactors)) {
            throw new types_1.ValidationError("binFactors must be an array");
        }
        // 컨트랙트와 동일한 _rangeToBins 로직 사용
        const lowerBin = Math.floor((lowerTick - market.minTick) / market.tickSpacing);
        const upperBin = Math.floor((upperTick - market.minTick) / market.tickSpacing - 1);
        let affectedSum = new big_js_1.default(0);
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
exports.CLMSRSDK = CLMSRSDK;
// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================
/**
 * Create CLMSR SDK instance
 */
function createCLMSRSDK() {
    return new CLMSRSDK();
}
