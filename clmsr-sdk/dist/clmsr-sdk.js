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
exports.CLMSRSDK = void 0;
exports.createCLMSRSDK = createCLMSRSDK;
exports.toWAD = toWAD;
exports.toUSDC = toUSDC;
const big_js_1 = __importDefault(require("big.js"));
const types_1 = require("./types");
const MathUtils = __importStar(require("./utils/math"));
// Re-export types for easy access
__exportStar(require("./types"), exports);
/**
 * CLMSR SDK - 컨트랙트 뷰함수들과 역함수 제공
 */
class CLMSRSDK {
    // ============================================================================
    // CONTRACT VIEW FUNCTIONS (컨트랙트 뷰함수들)
    // ============================================================================
    /**
     * calculateOpenCost - 새 포지션 열기 비용 계산
     */
    calculateOpenCost(lowerTick, upperTick, quantity, distribution, market) {
        this.validateTickRange(lowerTick, upperTick, market);
        if (quantity.lte(0)) {
            throw new types_1.ValidationError("Quantity must be positive");
        }
        // 🎯 컨트랙트와 정확히 동일한 LMSR 공식 구현
        const quantityWad = MathUtils.toWad(quantity);
        const alpha = market.liquidityParameter;
        // Get current state
        const sumBefore = distribution.totalSumWad;
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
        // Calculate average price
        const averagePrice = cost.div(quantity);
        return { cost, averagePrice };
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
     * calculateDecreaseProceeds - 포지션 감소시 수익 계산
     */
    calculateDecreaseProceeds(position, sellQuantity, distribution, market) {
        this.validateTickRange(position.lowerTick, position.upperTick, market);
        if (sellQuantity.lte(0)) {
            throw new types_1.ValidationError("Sell quantity must be positive");
        }
        if (sellQuantity.gt(position.quantity)) {
            throw new types_1.ValidationError("Cannot sell more than position quantity");
        }
        const quantityWad = MathUtils.toWad(sellQuantity);
        const alpha = market.liquidityParameter;
        // Get current state
        const sumBefore = distribution.totalSumWad;
        const affectedSum = this.getAffectedSum(position.lowerTick, position.upperTick, distribution, market);
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
     * calculateCloseProceeds - 전체 포지션 닫기 수익 계산
     */
    calculateCloseProceeds(position, distribution, market) {
        const result = this.calculateDecreaseProceeds(position, position.quantity, distribution, market);
        return {
            proceeds: result.proceeds,
            averagePrice: result.averagePrice,
        };
    }
    /**
     * calculateClaimAmount - 정산 후 클레임 금액 계산
     */
    calculateClaimAmount(position, settlementLowerTick, settlementUpperTick) {
        // 포지션 범위와 정산 범위가 겹치는지 확인
        const hasOverlap = position.lowerTick < settlementUpperTick &&
            position.upperTick > settlementLowerTick;
        if (hasOverlap) {
            // 승리 포지션: 전체 수량을 클레임 가능
            return {
                payout: position.quantity,
            };
        }
        else {
            // 패배 포지션: 클레임 불가
            return {
                payout: new big_js_1.default(0),
            };
        }
    }
    // ============================================================================
    // INVERSE FUNCTION (역함수: 돈 → 수량)
    // ============================================================================
    /**
     * calculateQuantityFromCost - 목표 비용에서 수량 계산 (역함수)
     */
    calculateQuantityFromCost(lowerTick, upperTick, targetCost, distribution, market) {
        this.validateTickRange(lowerTick, upperTick, market);
        if (targetCost.lte(0)) {
            throw new types_1.ValidationError("Target cost must be positive");
        }
        const targetCostWad = MathUtils.toWad(targetCost);
        const alpha = market.liquidityParameter;
        // Get current state
        const sumBefore = distribution.totalSumWad;
        const affectedSum = this.getAffectedSum(lowerTick, upperTick, distribution, market);
        // Direct mathematical inverse:
        // From: C = α * ln(sumAfter / sumBefore)
        // Calculate: q = α * ln(factor)
        // Calculate target sum after: sumAfter = sumBefore * exp(C/α) - safe chunking 사용
        const expValue = MathUtils.safeExp(targetCostWad, alpha);
        const targetSumAfter = MathUtils.wMul(sumBefore, expValue);
        // Calculate required affected sum after trade
        const requiredAffectedSum = targetSumAfter.minus(sumBefore.minus(affectedSum));
        // Calculate factor: newAffectedSum / affectedSum
        const factor = MathUtils.wDiv(requiredAffectedSum, affectedSum);
        // Calculate quantity: q = α * ln(factor)
        const quantityWad = MathUtils.wMul(alpha, MathUtils.wLn(factor));
        const quantity = MathUtils.fromWad(quantityWad);
        // Verify by calculating actual cost
        const verification = this.calculateOpenCost(lowerTick, upperTick, quantity, distribution, market);
        return {
            quantity,
            actualCost: verification.cost,
        };
    }
    // ============================================================================
    // HELPER FUNCTIONS
    // ============================================================================
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
        // 컨트랙트와 동일한 _rangeToBins 로직 사용
        const lowerBin = Math.floor((lowerTick - market.minTick) / market.tickSpacing);
        const upperBin = Math.floor((upperTick - market.minTick) / market.tickSpacing - 1);
        let affectedSum = new big_js_1.default(0);
        // 컨트랙트와 동일하게 inclusive 범위로 계산 (lowerBin <= binIndex <= upperBin)
        for (let binIndex = lowerBin; binIndex <= upperBin; binIndex++) {
            if (binIndex >= 0 && binIndex < distribution.binFactorsWad.length) {
                // 이미 WAD 형식의 Big 객체이므로 직접 사용
                affectedSum = affectedSum.plus(distribution.binFactorsWad[binIndex]);
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
/**
 * Convert to WAD amount (18 decimals)
 */
function toWAD(amount) {
    return new big_js_1.default(amount).mul(MathUtils.WAD);
}
/**
 * Convert to USDC amount (6 decimals)
 */
function toUSDC(amount) {
    return new big_js_1.default(amount).mul(new big_js_1.default("1000000")); // 6자리 소수점: 1 USDC = 1,000,000 micro USDC
}
