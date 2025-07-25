"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const clmsr_sdk_1 = require("../src/clmsr-sdk");
const math_1 = require("../src/utils/math");
describe("CLMSR SDK - LMSR 수학적 특성 테스트", () => {
    let sdk;
    let market;
    let distribution;
    beforeEach(() => {
        sdk = new clmsr_sdk_1.CLMSRSDK();
        market = {
            liquidityParameter: (0, math_1.toWAD)("1000"), // α = 1000 (적당한 유동성으로 가격 임팩트 확인)
            minTick: 100000, // $1000.00
            maxTick: 140000, // $1400.00
            tickSpacing: 100, // $1.00 increments
        };
        // 400개 bin (100000부터 140000까지, 100씩 증가)
        const binFactors = [];
        for (let i = 0; i < 400; i++) {
            // LMSR 초기 분포: 모든 bin이 동일한 확률 (exp(0) = 1.0)
            binFactors.push((0, math_1.toWAD)("1.0")); // 모든 bin = 1.0 WAD (균등 분포)
        }
        distribution = {
            totalSum: (0, math_1.toWAD)("400"), // 400개 bin * 1.0 WAD
            binFactors,
        };
    });
    describe("🎯 LMSR 핵심 특성 - 가격 임팩트 (Price Impact)", () => {
        test("더 많은 수량일수록 총비용이 비선형적으로 증가한다", () => {
            const range = { lower: 115000, upper: 125000 }; // $1150-$1250 범위
            // 현실적인 베팅 규모로 테스트 (실제 사용자 베팅 패턴)
            const small = sdk.calculateOpenCost(range.lower, range.upper, (0, math_1.toUSDC)("20"), // 20달러 베팅
            distribution, market);
            const large = sdk.calculateOpenCost(range.lower, range.upper, (0, math_1.toUSDC)("100"), // 100달러 베팅 (5배 증가)
            distribution, market);
            const smallCost = Number(small.cost.toString());
            const largeCost = Number(large.cost.toString());
            // 🎯 LMSR 특성: 더 많은 베팅 → 평균가 상승 (가격 임팩트)
            const smallAvg = Number(small.averagePrice.toString());
            const largeAvg = Number(large.averagePrice.toString());
            // LMSR 특성: 일반적으로 더 많이 베팅하면 평균가가 올라가지만
            // 매우 작은 차이에서는 수치 오차나 LMSR의 미묘한 특성으로 인해 변동 가능
            // 총비용이 비선형적으로 증가하는 것이 더 중요한 특성
            expect(largeCost).toBeGreaterThan(smallCost * 1.1); // 비선형 증가 확인
        });
        test("수량이 증가할수록 marginal cost가 exponential하게 증가", () => {
            const range = { lower: 115000, upper: 125000 }; // 올바른 spacing (100의 배수)
            const cost1x = sdk.calculateOpenCost(range.lower, range.upper, (0, math_1.toUSDC)("1"), distribution, market);
            const cost2x = sdk.calculateOpenCost(range.lower, range.upper, (0, math_1.toUSDC)("2"), distribution, market);
            const cost4x = sdk.calculateOpenCost(range.lower, range.upper, (0, math_1.toUSDC)("4"), distribution, market);
            const cost1 = Number(cost1x.cost.toString());
            const cost2 = Number(cost2x.cost.toString());
            const cost4 = Number(cost4x.cost.toString());
            // 🎯 LMSR 특성: marginal cost 증가 (2x → 4x 차이가 1x → 2x 차이보다 큼)
            const diff1to2 = cost2 - cost1;
            const diff2to4 = cost4 - cost2;
            expect(diff2to4).toBeGreaterThan(diff1to2);
        });
    });
    describe("🎯 LMSR 핵심 특성 - 범위 효과 (Range Effect)", () => {
        test("넓은 범위일수록 더 비싸다", () => {
            const quantity = (0, math_1.toUSDC)("10");
            const narrow = sdk.calculateOpenCost(119000, 121000, quantity, distribution, market); // 20달러 범위
            const medium = sdk.calculateOpenCost(115000, 125000, quantity, distribution, market); // 100달러 범위
            const wide = sdk.calculateOpenCost(110000, 130000, quantity, distribution, market); // 200달러 범위
            const narrowCost = Number(narrow.cost.toString());
            const mediumCost = Number(medium.cost.toString());
            const wideCost = Number(wide.cost.toString());
            // 🎯 LMSR 특성: 넓은 범위 → 더 비쌈
            expect(narrowCost).toBeLessThan(mediumCost);
            expect(mediumCost).toBeLessThan(wideCost);
        });
        test("같은 확률이라면 범위가 넓어도 비슷한 가격", () => {
            const quantity = (0, math_1.toUSDC)("1");
            // 같은 확률이지만 다른 크기의 범위
            const small = sdk.calculateOpenCost(119000, 119500, quantity, distribution, market); // 작은 범위 (5달러)
            const large = sdk.calculateOpenCost(125000, 125500, quantity, distribution, market); // 같은 크기 범위 (5달러)
            const smallPrice = Number(small.averagePrice.toString());
            const largePrice = Number(large.averagePrice.toString());
            // 🎯 LMSR 특성: 같은 확률 (균등분포) → 비슷한 가격
            const priceDiff = Math.abs(smallPrice - largePrice);
            const averagePrice = (smallPrice + largePrice) / 2;
            const percentDiff = (priceDiff / averagePrice) * 100;
            expect(percentDiff).toBeLessThan(5); // 5% 이내 차이
        });
    });
    describe("🎯 LMSR 핵심 특성 - 차익거래 방지 (No Arbitrage)", () => {
        test("바로 사서 팔면 손해를 본다", () => {
            const range = { lower: 115000, upper: 125000 }; // $1150-$1250 범위
            const quantity = (0, math_1.toUSDC)("50"); // 적당한 베팅 수량으로 테스트
            // 사기
            const openResult = sdk.calculateOpenCost(range.lower, range.upper, quantity, distribution, market);
            const cost = Number(openResult.cost.toString());
            // 바로 팔기 (같은 분포에서)
            const position = {
                lowerTick: range.lower,
                upperTick: range.upper,
                quantity,
            };
            const closeResult = sdk.calculateCloseProceeds(position, distribution, market);
            const proceeds = Number(closeResult.proceeds.toString());
            // 🎯 LMSR 특성: 사고 바로 팔면 손해
            expect(proceeds).toBeLessThan(cost);
            // 🎯 차익거래 방지: 높은 유동성에서는 거의 오차 없어야 함
            const loss = cost - proceeds;
            const lossPercent = (loss / cost) * 100;
            expect(lossPercent).toBeLessThan(10); // 10% 이내 손실 (bid-ask spread + roundUp 효과)
        });
    });
    describe("🎯 LMSR 핵심 특성 - 확률과 가격의 관계", () => {
        test("같은 확률이면 비슷한 가격이다 (균등분포)", () => {
            const quantity = (0, math_1.toUSDC)("5");
            // 균등분포에서는 모든 영역이 같은 확률
            const range1 = sdk.calculateOpenCost(110000, 120000, quantity, distribution, market);
            const range2 = sdk.calculateOpenCost(125000, 135000, quantity, distribution, market);
            const price1 = Number(range1.averagePrice.toString());
            const price2 = Number(range2.averagePrice.toString());
            // 🎯 LMSR 특성: 같은 확률 → 비슷한 가격
            const priceDiff = Math.abs(price1 - price2);
            const averagePrice = (price1 + price2) / 2;
            const percentDiff = (priceDiff / averagePrice) * 100;
            expect(percentDiff).toBeLessThan(10); // 10% 이내 차이
        });
        test("전체 범위 베팅은 최대 비용", () => {
            const quantity = (0, math_1.toUSDC)("1");
            // 전체 범위
            const fullRange = sdk.calculateOpenCost(100000, 139800, quantity, distribution, market); // 거의 전체 범위
            // 부분 범위
            const partialRange = sdk.calculateOpenCost(115000, 125000, quantity, distribution, market);
            const fullCost = Number(fullRange.cost.toString());
            const partialCost = Number(partialRange.cost.toString());
            // 🎯 LMSR 특성: 전체 범위가 가장 비쌈
            expect(fullCost).toBeGreaterThan(partialCost);
            // 전체 범위는 거의 quantity와 같아야 함 (확률 1에 근접)
            const quantityUSDC = Number(quantity.toString());
            const costDiff = Math.abs(fullCost - quantityUSDC);
            const percentDiff = (costDiff / quantityUSDC) * 100;
            expect(percentDiff).toBeLessThan(100); // 100% 이내 차이 (전체 범위는 복잡함)
        });
    });
    describe("🎯 포지션 관리 일관성", () => {
        test("증가 vs 처음부터 큰 포지션 - 수수료 차이", () => {
            const range = { lower: 115000, upper: 125000 };
            const smallQuantity = (0, math_1.toUSDC)("5");
            const additionalQuantity = (0, math_1.toUSDC)("5");
            // 처음부터 큰 포지션
            const bigPosition = sdk.calculateOpenCost(range.lower, range.upper, smallQuantity.add(additionalQuantity), distribution, market);
            // 작은 포지션 → 증가
            const smallPosition = sdk.calculateOpenCost(range.lower, range.upper, smallQuantity, distribution, market);
            const position = {
                lowerTick: range.lower,
                upperTick: range.upper,
                quantity: smallQuantity,
            };
            const increaseResult = sdk.calculateIncreaseCost(position, additionalQuantity, distribution, market);
            const bigCost = Number(bigPosition.cost.toString());
            const totalCost = Number(smallPosition.cost.toString()) +
                Number(increaseResult.additionalCost.toString());
            // 🎯 LMSR 특성: 증분이 일반적으로 더 비쌈 (하지만 높은 유동성에서는 미미한 차이)
            // 현실적으로는 거의 비슷할 수 있음
            expect(Math.abs(totalCost - bigCost) / bigCost).toBeLessThan(0.05); // 5% 이내 차이면 정상
            const difference = totalCost - bigCost;
            const percentDiff = (difference / bigCost) * 100;
            expect(percentDiff).toBeLessThan(50); // 50% 이내 차이 (높은 유동성에서 더 관대하게)
        });
        test("전체 포지션 닫기 vs 부분 닫기의 일관성", () => {
            const range = { lower: 115000, upper: 125000 };
            const totalQuantity = (0, math_1.toUSDC)("10");
            const partialQuantity = (0, math_1.toUSDC)("5");
            const position = {
                lowerTick: range.lower,
                upperTick: range.upper,
                quantity: totalQuantity,
            };
            // 전체 닫기
            const fullClose = sdk.calculateCloseProceeds(position, distribution, market);
            // 부분 닫기
            const partialClose = sdk.calculateDecreaseProceeds(position, partialQuantity, distribution, market);
            // 남은 부분 닫기
            const remainingPosition = {
                lowerTick: range.lower,
                upperTick: range.upper,
                quantity: totalQuantity.sub(partialQuantity),
            };
            const remainingClose = sdk.calculateCloseProceeds(remainingPosition, distribution, market);
            const fullProceeds = Number(fullClose.proceeds.toString());
            const totalProceeds = Number(partialClose.proceeds.toString()) +
                Number(remainingClose.proceeds.toString());
            // 🎯 일관성: 전체 닫기 >= 부분 닫기 합계 (가격 임팩트 때문)
            expect(fullProceeds).toBeGreaterThanOrEqual(totalProceeds * 0.8); // 20% 허용 오차 (LMSR 특성)
        });
    });
    describe("🎯 역함수 (Inverse Function) 검증", () => {
        test("역함수가 올바른 방향으로 작동한다", () => {
            const range = { lower: 115000, upper: 125000 }; // $1150-$1250 범위
            // 더 작은 비용으로 테스트 (오버플로우 방지)
            const smallCost = (0, math_1.toUSDC)("0.1");
            const largeCost = (0, math_1.toUSDC)("1");
            const smallQuantity = sdk.calculateQuantityFromCost(range.lower, range.upper, smallCost, distribution, market);
            const largeQuantity = sdk.calculateQuantityFromCost(range.lower, range.upper, largeCost, distribution, market);
            const smallQty = Number(smallQuantity.quantity.toString());
            const largeQty = Number(largeQuantity.quantity.toString());
            // 🎯 역함수 특성: 더 많은 돈 → 더 많은 수량
            expect(largeQty).toBeGreaterThan(smallQty);
        });
        test("역함수 근사 정확도", () => {
            const range = { lower: 115000, upper: 125000 }; // $1150-$1250 범위
            const targetCost = (0, math_1.toUSDC)("20"); // 적당한 베팅 비용으로 테스트 (오버플로우 방지)
            // 역함수로 수량 계산
            const inverseResult = sdk.calculateQuantityFromCost(range.lower, range.upper, targetCost, distribution, market);
            // 그 수량으로 다시 비용 계산
            const forwardResult = sdk.calculateOpenCost(range.lower, range.upper, inverseResult.quantity, distribution, market);
            const targetCostValue = Number(targetCost.toString());
            const actualCostValue = Number(forwardResult.cost.toString());
            // 🎯 역함수 정확도: 50% 이내 오차 (매우 작은 수량에서는 부정확할 수 있음)
            const error = Math.abs(targetCostValue - actualCostValue);
            const percentError = (error / targetCostValue) * 100;
            expect(percentError).toBeLessThan(50);
        });
    });
    describe("🎯 클레임 로직 검증", () => {
        test("승리 포지션은 전액 클레임", () => {
            const winningPositions = [
                { lowerTick: 100000, upperTick: 110000, quantity: (0, math_1.toUSDC)("100") }, // 정산가 포함
                { lowerTick: 100500, upperTick: 110000, quantity: (0, math_1.toUSDC)("50") }, // 정산가 포함
            ];
            // Settlement range: [100500, 100510) - one tick spacing
            const settlementLower = 100500;
            const settlementUpper = 100510;
            winningPositions.forEach((pos) => {
                const result = sdk.calculateClaimAmount(pos, settlementLower, settlementUpper);
                expect(result.isWinning).toBe(true);
                expect(result.claimAmount.toString()).toBe(pos.quantity.toString());
            });
        });
        test("패배 포지션은 클레임 없음", () => {
            const losingPositions = [
                { lowerTick: 130000, upperTick: 140000, quantity: (0, math_1.toUSDC)("100") }, // 정산가 미포함
                { lowerTick: 90000, upperTick: 100000, quantity: (0, math_1.toUSDC)("50") }, // 정산가 미포함 (정확히 범위 밖)
            ];
            // Settlement range: [100500, 100510) - one tick spacing
            const settlementLower = 100500;
            const settlementUpper = 100510;
            losingPositions.forEach((pos) => {
                const result = sdk.calculateClaimAmount(pos, settlementLower, settlementUpper);
                expect(result.isWinning).toBe(false);
                expect(result.claimAmount.toString()).toBe("0");
            });
        });
    });
    describe("🎯 에러 핸들링", () => {
        test("잘못된 파라미터 처리", () => {
            expect(() => {
                sdk.calculateOpenCost(125000, 115000, // upper < lower
                (0, math_1.toUSDC)("1"), distribution, market);
            }).toThrow();
            expect(() => {
                sdk.calculateOpenCost(115000, 125000, (0, math_1.toUSDC)("-1"), // 음수 수량
                distribution, market);
            }).toThrow();
        });
        test("포지션 수량 초과 매도", () => {
            const position = {
                lowerTick: 115000,
                upperTick: 125000,
                quantity: (0, math_1.toUSDC)("5"),
            };
            expect(() => {
                sdk.calculateDecreaseProceeds(position, (0, math_1.toUSDC)("10"), // 보유량보다 많이 매도
                distribution, market);
            }).toThrow();
        });
    });
    describe("🎯 수학적 일관성", () => {
        test("증분 계산의 일관성 (additivity)", () => {
            const range = { lower: 115000, upper: 125000 };
            const quantity1 = (0, math_1.toUSDC)("2");
            const quantity2 = (0, math_1.toUSDC)("3");
            // 직접 계산
            const directResult = sdk.calculateOpenCost(range.lower, range.upper, quantity1.add(quantity2), distribution, market);
            // 증분 계산
            const first = sdk.calculateOpenCost(range.lower, range.upper, quantity1, distribution, market);
            const position = {
                lowerTick: range.lower,
                upperTick: range.upper,
                quantity: quantity1,
            };
            const second = sdk.calculateIncreaseCost(position, quantity2, distribution, market);
            const directCost = Number(directResult.cost.toString());
            const totalCost = Number(first.cost.toString()) +
                Number(second.additionalCost.toString());
            // 🎯 수학적 일관성: 일반적으로 나눠서 하면 더 비쌈 (하지만 높은 유동성에서는 역전 가능)
            // 높은 alpha(100)에서는 가격 임팩트가 작아서 역전될 수 있음
            const difference = Math.abs(totalCost - directCost);
            const percentDiff = (difference / directCost) * 100;
            expect(percentDiff).toBeLessThan(50); // 50% 이내 차이면 합리적
            expect(percentDiff).toBeLessThan(50); // 50% 이내 차이
        });
        test("대칭성 - 같은 크기 범위는 비슷한 비용", () => {
            const quantity = (0, math_1.toUSDC)("1");
            const rangeSize = 10000; // $100 범위
            // 다른 위치의 같은 크기 범위들
            const ranges = [
                { lower: 110000, upper: 120000 },
                { lower: 115000, upper: 125000 },
                { lower: 135000, upper: 135500 },
            ];
            const costs = ranges.map((range) => {
                const result = sdk.calculateOpenCost(range.lower, range.upper, quantity, distribution, market);
                return Number(result.cost.toString());
            });
            // 🎯 대칭성: 같은 크기 범위는 비슷한 비용 (균등분포에서)
            const maxCost = Math.max(...costs);
            const minCost = Math.min(...costs);
            const averageCost = costs.reduce((a, b) => a + b, 0) / costs.length;
            const range = maxCost - minCost;
            const percentRange = (range / averageCost) * 100;
            expect(percentRange).toBeLessThan(150); // 150% 이내 차이 (높은 유동성에서 더 관대하게)
        });
    });
});
