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
// Re-export types and utilities for easy access
__exportStar(require("./types"), exports);
var math_1 = require("./utils/math");
Object.defineProperty(exports, "toWAD", { enumerable: true, get: function () { return math_1.toWAD; } });
Object.defineProperty(exports, "toMicroUSDC", { enumerable: true, get: function () { return math_1.toMicroUSDC; } });
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
        // Input validation
        if (new big_js_1.default(quantity).lte(0)) {
            throw new types_1.ValidationError("Quantity must be positive");
        }
        if (!distribution) {
            throw new types_1.ValidationError("Distribution data is required but was undefined");
        }
        // Tick range 검증
        this.validateTickRange(lowerTick, upperTick, market);
        // 시장별 최대 수량 검증 (UX 개선)
        this._assertQuantityWithinLimit(quantity, market.liquidityParameter);
        // Convert to WAD for calculations
        const alpha = market.liquidityParameter;
        // quantity는 이미 micro-USDC(6 decimals) 정수이므로 바로 WAD로 변환
        const quantityWad = MathUtils.toWad(quantity);
        // Get current state
        const sumBefore = distribution.totalSum;
        const affectedSum = this.getAffectedSum(lowerTick, upperTick, distribution, market);
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
        // Calculate average price with proper formatting
        // cost는 micro USDC, quantity도 micro USDC이므로 결과는 USDC/USDC = 비율
        const averagePrice = cost.div(quantity);
        const formattedAveragePrice = new big_js_1.default(averagePrice.toFixed(6, big_js_1.default.roundDown)); // 6자리 정밀도로 충분
        return {
            cost: MathUtils.formatUSDC(cost),
            averagePrice: formattedAveragePrice,
        };
    }
    /**
     * calculateIncreaseCost - 기존 포지션 증가 비용 계산
     */
    calculateIncreaseCost(position, additionalQuantity, distribution, market) {
        const result = this.calculateOpenCost(position.lowerTick, position.upperTick, additionalQuantity, distribution, market);
        return {
            additionalCost: result.cost,
            averagePrice: result.averagePrice,
        };
    }
    /**
     * Decrease position 비용 계산
     */
    calculateDecreaseProceeds(position, sellQuantity, distribution, market) {
        return this._calcSellProceeds(position.lowerTick, position.upperTick, sellQuantity, position.quantity, distribution, market);
    }
    /**
     * Close position 비용 계산
     */
    calculateCloseProceeds(position, distribution, market) {
        const result = this.calculateDecreaseProceeds(position, position.quantity, distribution, market);
        return {
            proceeds: result.proceeds,
            averagePrice: result.averagePrice,
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
        return this._calcSellProceeds(position.lowerTick, position.upperTick, sellQuantity, position.quantity, distribution, market);
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
    calculateQuantityFromCost(lowerTick, upperTick, cost, distribution, market) {
        const costWad = MathUtils.toWad(cost); // 6→18 dec 변환
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
            actualCost = cost;
            console.warn("calculateQuantityFromCost: verification failed, using target cost as approximation", error);
        }
        return {
            quantity: MathUtils.formatUSDC(quantity),
            actualCost: MathUtils.formatUSDC(actualCost),
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
        // Calculate average price with proper formatting
        const averagePrice = proceeds.div(sellQuantity);
        const formattedAveragePrice = new big_js_1.default(averagePrice.toFixed(6, big_js_1.default.roundDown)); // 6자리 정밀도로 충분
        return {
            proceeds: MathUtils.formatUSDC(proceeds),
            averagePrice: formattedAveragePrice,
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
