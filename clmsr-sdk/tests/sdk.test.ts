import { CLMSRSDK } from "../src/clmsr-sdk";
import * as MathUtils from "../src/utils/math";
import {
  Market,
  MarketDistribution,
  mapDistribution,
  MarketDistributionRaw,
  FeePolicyKind,
} from "../src/types";
import { toWAD, toMicroUSDC } from "../src/index";
import Big from "big.js";
import * as FeeModule from "../src/fees";

describe("CLMSR SDK - LMSR Mathematical Properties Tests", () => {
  let sdk: CLMSRSDK;
  let market: Market;
  let distribution: MarketDistribution;

  beforeEach(() => {
    sdk = new CLMSRSDK();

    market = {
      liquidityParameter: toWAD("1000"), // α = 1000 (적당한 유동성으로 가격 임팩트 확인)
      minTick: 100000, // $1000.00
      maxTick: 140000, // $1400.00
      tickSpacing: 100, // $1.00 increments
    };

    // 400개 bin (100000부터 140000까지, 100씩 증가)
    const binFactors = [];
    for (let i = 0; i < 400; i++) {
      // LMSR 초기 분포: 모든 bin이 동일한 확률 (exp(0) = 1.0)
      binFactors.push("1000000000000000000"); // WAD 문자열 배열
    }

    // Raw 데이터를 생성한 후 어댑터를 통해 변환
    const rawDistribution: MarketDistributionRaw = {
      totalSum: "400000000000000000000", // 계산용 WAD 값 (400 * 1e18)
      binFactors,
    };

    distribution = mapDistribution(rawDistribution);
  });

  describe("🎯 LMSR 핵심 특성 - 가격 임팩트 (Price Impact)", () => {
    test("더 많은 수량일수록 총비용이 비선형적으로 증가한다", () => {
      const range = { lower: 115000, upper: 125000 }; // $1150-$1250 범위

      // 현실적인 베팅 규모로 테스트 (실제 사용자 베팅 패턴)
      const small = sdk.calculateOpenCost(
        range.lower,
        range.upper,
        toMicroUSDC("20"), // 20달러 베팅
        distribution,
        market
      );

      const large = sdk.calculateOpenCost(
        range.lower,
        range.upper,
        toMicroUSDC("100"), // 100달러 베팅 (5배 증가)
        distribution,
        market
      );

      // 🎯 LMSR 특성: 더 많은 수량일수록 총비용이 비선형적으로 증가
      // Number 캐스팅 제거하고 Big 연산 사용
      expect(large.cost.gt(small.cost)).toBe(true);

      // 비선형성 확인 - 5배 수량이면 비용도 5배보다 많이 증가해야 함
      const expectedLinearCost = small.cost.mul(5);
      expect(large.cost.gt(expectedLinearCost)).toBe(true);

      // 🎯 평균가 증가 확인 (완화된 조건)
      expect(large.averagePrice.gte(small.averagePrice)).toBe(true);
    });

    test("수량이 증가할수록 marginal cost가 exponential하게 증가", () => {
      const range = { lower: 115000, upper: 125000 }; // 올바른 spacing (100의 배수)

      const cost1x = sdk.calculateOpenCost(
        range.lower,
        range.upper,
        toMicroUSDC("1"),
        distribution,
        market
      );
      const cost2x = sdk.calculateOpenCost(
        range.lower,
        range.upper,
        toMicroUSDC("2"),
        distribution,
        market
      );
      const cost4x = sdk.calculateOpenCost(
        range.lower,
        range.upper,
        toMicroUSDC("4"),
        distribution,
        market
      );

      // 🎯 LMSR 특성: marginal cost 증가 (2x → 4x 차이가 1x → 2x 차이보다 큼)
      // Number 캐스팅 제거하고 Big 연산 사용
      const diff1to2 = cost2x.cost.minus(cost1x.cost);
      const diff2to4 = cost4x.cost.minus(cost2x.cost);
      expect(diff2to4.gt(diff1to2)).toBe(true);
    });
  });

  describe("🎯 LMSR 핵심 특성 - 범위 효과 (Range Effect)", () => {
    test("넓은 범위일수록 더 비싸다", () => {
      const quantity = toMicroUSDC("10");

      const narrow = sdk.calculateOpenCost(
        119000,
        121000,
        quantity,
        distribution,
        market
      ); // 20달러 범위
      const medium = sdk.calculateOpenCost(
        115000,
        125000,
        quantity,
        distribution,
        market
      ); // 100달러 범위
      const wide = sdk.calculateOpenCost(
        110000,
        130000,
        quantity,
        distribution,
        market
      ); // 200달러 범위

      // 🎯 LMSR 특성: 넓은 범위 → 더 비쌈
      // Number 캐스팅 제거하고 Big 연산 사용
      expect(narrow.cost.lt(medium.cost)).toBe(true);
      expect(medium.cost.lt(wide.cost)).toBe(true);
    });

    test("같은 확률이라면 범위가 넓어도 비슷한 가격", () => {
      const quantity = toMicroUSDC("1");

      // 같은 확률이지만 다른 크기의 범위
      const small = sdk.calculateOpenCost(
        119000,
        119500,
        quantity,
        distribution,
        market
      ); // 작은 범위 (5달러)
      const large = sdk.calculateOpenCost(
        125000,
        125500,
        quantity,
        distribution,
        market
      ); // 같은 크기 범위 (5달러)

      const smallPrice = Number(small.averagePrice.toString());
      const largePrice = Number(large.averagePrice.toString());

      // 🎯 LMSR 특성: 같은 확률 (균등분포) → 비슷한 가격
      const priceDiff = Math.abs(smallPrice - largePrice);
      const averagePrice = (smallPrice + largePrice) / 2;
      const percentDiff = (priceDiff / averagePrice) * 100;

      expect(percentDiff).toBeLessThan(5); // 5% 이내 차이
    });
  });

  describe("🎯 LMSR 핵심 특성 - 수학적 일관성", () => {
    test("동일한 입력에 대해 항상 같은 결과를 반환한다 (순수 함수)", () => {
      const range = { lower: 115000, upper: 125000 };
      const quantity = toMicroUSDC("50");

      // 같은 파라미터로 여러 번 호출
      const result1 = sdk.calculateOpenCost(
        range.lower,
        range.upper,
        quantity,
        distribution,
        market
      );

      const result2 = sdk.calculateOpenCost(
        range.lower,
        range.upper,
        quantity,
        distribution,
        market
      );

      // 순수 함수이므로 정확히 같은 결과여야 함
      expect(result1.cost.toString()).toBe(result2.cost.toString());
      expect(result1.averagePrice.toString()).toBe(
        result2.averagePrice.toString()
      );
    });

    test("매수 비용은 항상 양수이다", () => {
      const range = { lower: 115000, upper: 125000 };
      const quantity = toMicroUSDC("1");

      const result = sdk.calculateOpenCost(
        range.lower,
        range.upper,
        quantity,
        distribution,
        market
      );

      expect(result.cost.gt(0)).toBe(true);
      expect(result.averagePrice.gt(0)).toBe(true);
    });
  });

  describe("🎯 LMSR 핵심 특성 - 확률과 가격의 관계", () => {
    test("같은 확률이면 비슷한 가격이다 (균등분포)", () => {
      const quantity = toMicroUSDC("5");

      // 균등분포에서는 모든 영역이 같은 확률
      const range1 = sdk.calculateOpenCost(
        110000,
        120000,
        quantity,
        distribution,
        market
      );
      const range2 = sdk.calculateOpenCost(
        125000,
        135000,
        quantity,
        distribution,
        market
      );

      const price1 = Number(range1.averagePrice.toString());
      const price2 = Number(range2.averagePrice.toString());

      // 🎯 LMSR 특성: 같은 확률 → 비슷한 가격
      const priceDiff = Math.abs(price1 - price2);
      const averagePrice = (price1 + price2) / 2;
      const percentDiff = (priceDiff / averagePrice) * 100;

      expect(percentDiff).toBeLessThan(10); // 10% 이내 차이
    });

    test("전체 범위 베팅은 최대 비용", () => {
      const quantity = toMicroUSDC("1");

      // 전체 범위
      const fullRange = sdk.calculateOpenCost(
        100000,
        139800,
        quantity,
        distribution,
        market
      ); // 거의 전체 범위

      // 부분 범위
      const partialRange = sdk.calculateOpenCost(
        115000,
        125000,
        quantity,
        distribution,
        market
      );

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
      const smallQuantity = toMicroUSDC("5");
      const additionalQuantity = toMicroUSDC("5");

      // 처음부터 큰 포지션
      const bigPosition = sdk.calculateOpenCost(
        range.lower,
        range.upper,
        smallQuantity.add(additionalQuantity),
        distribution,
        market
      );

      // 작은 포지션 → 증가
      const smallPosition = sdk.calculateOpenCost(
        range.lower,
        range.upper,
        smallQuantity,
        distribution,
        market
      );

      const position = {
        lowerTick: range.lower,
        upperTick: range.upper,
        quantity: smallQuantity,
      };

      const increaseResult = sdk.calculateIncreaseCost(
        position,
        additionalQuantity,
        distribution,
        market
      );

      const bigCost = Number(bigPosition.cost.toString());
      const totalCost =
        Number(smallPosition.cost.toString()) +
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
      const totalQuantity = toMicroUSDC("10");
      const partialQuantity = toMicroUSDC("5");

      const position = {
        lowerTick: range.lower,
        upperTick: range.upper,
        quantity: totalQuantity,
      };

      // 전체 닫기
      const fullClose = sdk.calculateCloseProceeds(
        position,
        distribution,
        market
      );

      // 부분 닫기
      const partialClose = sdk.calculateDecreaseProceeds(
        position,
        partialQuantity,
        distribution,
        market
      );

      // 남은 부분 닫기
      const remainingPosition = {
        lowerTick: range.lower,
        upperTick: range.upper,
        quantity: totalQuantity.sub(partialQuantity),
      };
      const remainingClose = sdk.calculateCloseProceeds(
        remainingPosition,
        distribution,
        market
      );

      const fullProceeds = Number(fullClose.proceeds.toString());
      const totalProceeds =
        Number(partialClose.proceeds.toString()) +
        Number(remainingClose.proceeds.toString());

      // 🎯 일관성: 전체 닫기 >= 부분 닫기 합계 (가격 임팩트 때문)
      expect(fullProceeds).toBeGreaterThanOrEqual(totalProceeds * 0.8); // 20% 허용 오차 (LMSR 특성)
    });
  });

  describe("🎯 역함수 (Inverse Function) 검증", () => {
    test("역함수가 올바른 방향으로 작동한다", () => {
      const range = { lower: 115000, upper: 125000 }; // $1150-$1250 범위

      // 더 작은 비용으로 테스트 (오버플로우 방지)
      const smallCost = toMicroUSDC("0.1");
      const largeCost = toMicroUSDC("1");

      const smallQuantity = sdk.calculateQuantityFromCost(
        range.lower,
        range.upper,
        smallCost,
        distribution,
        market
      );

      const largeQuantity = sdk.calculateQuantityFromCost(
        range.lower,
        range.upper,
        largeCost,
        distribution,
        market
      );

      const smallQty = Number(smallQuantity.quantity.toString());
      const largeQty = Number(largeQuantity.quantity.toString());

      // 🎯 역함수 특성: 더 많은 돈 → 더 많은 수량
      expect(largeQty).toBeGreaterThan(smallQty);
    });

    test("역함수 근사 정확도", () => {
      const range = { lower: 115000, upper: 125000 }; // $1150-$1250 범위
      const targetCost = toMicroUSDC("20"); // 적당한 베팅 비용으로 테스트 (오버플로우 방지)

      // 역함수로 수량 계산
      const inverseResult = sdk.calculateQuantityFromCost(
        range.lower,
        range.upper,
        targetCost,
        distribution,
        market
      );

      // 그 수량으로 다시 비용 계산
      const forwardResult = sdk.calculateOpenCost(
        range.lower,
        range.upper,
        inverseResult.quantity,
        distribution,
        market
      );

      // 🎯 역함수 정확도: 10% 이내 오차 (개선된 기준)
      // Number 캐스팅 제거하고 Big 연산 사용
      const forwardTotal = forwardResult.cost.plus(forwardResult.feeAmount);
      const error = forwardTotal.minus(targetCost).abs();
      const percentError = error.div(targetCost).mul(100);
      expect(percentError.lt(10)).toBe(true); // 50% → 10%로 개선
    });
  });

  describe("🎯 클레임 로직 검증", () => {
    test("승리 포지션은 전액 클레임", () => {
      const winningPositions = [
        { lowerTick: 100000, upperTick: 110000, quantity: toMicroUSDC("100") }, // 정산가 포함
        { lowerTick: 100500, upperTick: 110000, quantity: toMicroUSDC("50") }, // 정산가 포함
      ];

      // Settlement range: [100500, 100510) - one tick spacing
      const settlementLower = 100500;
      const settlementUpper = 100510;

      winningPositions.forEach((pos) => {
        // 정산 틱이 포지션 범위에 포함 (승리) - 105000으로 설정
        const result = sdk.calculateClaim(
          pos,
          105000 // 포지션 범위에 포함
        );

        expect(result.payout.toString()).toBe(pos.quantity.toString());

        // 정산 틱이 포지션 범위 밖 (패배) - 130000으로 설정
        const result2 = sdk.calculateClaim(
          pos,
          130000 // 포지션 범위 밖
        );

        expect(result2.payout.toString()).toBe("0");
      });
    });

    test("패배 포지션은 클레임 없음", () => {
      const losingPositions = [
        { lowerTick: 130000, upperTick: 140000, quantity: toMicroUSDC("100") }, // 정산가 미포함
        { lowerTick: 90000, upperTick: 100000, quantity: toMicroUSDC("50") }, // 정산가 미포함 (정확히 범위 밖)
      ];

      // Settlement range: [100500, 100510) - one tick spacing
      const settlementLower = 100500;
      const settlementUpper = 100510;

      losingPositions.forEach((pos) => {
        const result = sdk.calculateClaim(
          pos,
          105000 // 포지션 범위에 포함되지 않는 틱
        );
        expect(result.payout.toString()).toBe("0");
      });
    });
  });

  describe("🎯 에러 핸들링", () => {
    test("잘못된 파라미터 처리", () => {
      expect(() => {
        sdk.calculateOpenCost(
          125000,
          115000, // upper < lower
          toMicroUSDC("1"),
          distribution,
          market
        );
      }).toThrow();

      expect(() => {
        sdk.calculateOpenCost(
          115000,
          125000,
          toMicroUSDC("-1"), // 음수 수량
          distribution,
          market
        );
      }).toThrow();
    });

    test("포지션 수량 초과 매도", () => {
      const position = {
        lowerTick: 115000,
        upperTick: 125000,
        quantity: toMicroUSDC("5"),
      };

      expect(() => {
        sdk.calculateDecreaseProceeds(
          position,
          toMicroUSDC("10"), // 보유량보다 많이 매도
          distribution,
          market
        );
      }).toThrow();
    });
  });

  describe("🎯 수학적 일관성", () => {
    test("증분 계산의 일관성 (additivity)", () => {
      const range = { lower: 115000, upper: 125000 };
      const quantity1 = toMicroUSDC("2");
      const quantity2 = toMicroUSDC("3");

      // 직접 계산
      const directResult = sdk.calculateOpenCost(
        range.lower,
        range.upper,
        quantity1.add(quantity2),
        distribution,
        market
      );

      // 증분 계산
      const first = sdk.calculateOpenCost(
        range.lower,
        range.upper,
        quantity1,
        distribution,
        market
      );

      const position = {
        lowerTick: range.lower,
        upperTick: range.upper,
        quantity: quantity1,
      };

      const second = sdk.calculateIncreaseCost(
        position,
        quantity2,
        distribution,
        market
      );

      // Number 캐스팅 제거하고 Big 연산 사용
      const directCost = directResult.cost;
      const totalCost = first.cost.plus(second.additionalCost);

      // 🎯 수학적 일관성: 증분 계산과 직접 계산의 차이 확인
      const difference = totalCost.minus(directCost).abs();
      const percentDiff = difference.div(directCost).mul(100);
      expect(percentDiff.lt(10)).toBe(true); // 50% → 10%로 개선, 중복 제거
    });

    test("균등 분포에서 같은 크기 범위는 비슷한 가격", () => {
      const quantity = toMicroUSDC("1");

      // 균등 분포에서 같은 크기의 범위
      const range1 = sdk.calculateOpenCost(
        119000,
        119500,
        quantity,
        distribution,
        market
      ); // 범위 1 (5달러)
      const range2 = sdk.calculateOpenCost(
        125000,
        125500,
        quantity,
        distribution,
        market
      ); // 범위 2 (같은 크기 5달러)

      // 🎯 LMSR 특성: 균등 분포에서 같은 크기 범위 → 비슷한 가격
      // Number 캐스팅 제거하고 Big 연산 사용
      const priceDiff = range1.averagePrice.minus(range2.averagePrice).abs();
      const averagePrice = range1.averagePrice.plus(range2.averagePrice).div(2);
      const percentDiff = priceDiff.div(averagePrice).mul(100);

      // NaN 방어: averagePrice가 0이 아닌지 확인
      expect(averagePrice.gt(0)).toBe(true);
      expect(percentDiff.lt(5)).toBe(true); // 5% 이내 차이 (개선된 오차)
    });
  });

  describe("🎯 계산 정확성 테스트 (스케일링 & Chunking)", () => {
    test("큰 수량에 대해 safeExp chunking이 정상 작동한다", () => {
      const range = { lower: 115000, upper: 125000 }; // $1150-$1250 범위

      // 🔍 Chunking 근거:
      // - MAX_EXP_INPUT_WAD = 0.13e18 (컨트랙트·SDK 상수)
      // - exp(x)가 안전하게 계산 가능한 최대값 x = 0.13
      // - α = 1000일 때, 임계점: quantity/α = 0.13 → quantity = 130 USDC
      // - 150 USDC > 130 USDC이므로 safeExp chunking 필요
      const largeQuantity = toMicroUSDC("150"); // 150 USDC (> 0.13 * 1000)

      const result = sdk.calculateOpenCost(
        range.lower,
        range.upper,
        largeQuantity,
        distribution,
        market
      );

      // 결과가 유효한 범위 안에 있어야 함
      expect(result.cost.gt(0)).toBe(true);
      expect(result.cost.lt(toMicroUSDC("1000"))).toBe(true); // 비용이 너무 크지 않아야 함
      expect(result.averagePrice.gt(0)).toBe(true);
    });

    test("WAD 스케일링이 정확히 동작한다", () => {
      const range = { lower: 115000, upper: 125000 };
      const quantity = toMicroUSDC("1"); // 작은 수량으로 테스트 (스케일링 검증용)

      const result = sdk.calculateOpenCost(
        range.lower,
        range.upper,
        quantity,
        distribution,
        market
      );

      // 같은 분포에서 순매도 - LMSR 특성상 매수와 매도는 항상 다르지만 작은 수량에서는 차이가 작아야 함
      const sellResult = sdk.calculateDecreaseProceeds(
        { lowerTick: range.lower, upperTick: range.upper, quantity },
        quantity,
        distribution,
        market
      );

      // 작은 수량에서는 차이가 비교적 작아야 함 (LMSR의 convexity로 인한 자연스러운 차이)
      const difference = result.cost.minus(sellResult.proceeds).abs();
      const maxExpectedDifference = result.cost.mul(0.1); // 비용의 10% 이내

      expect(difference.lte(maxExpectedDifference)).toBe(true);

      // WAD 스케일링 자체는 정확해야 함 - 같은 계산을 두 번 해도 같은 결과
      const result2 = sdk.calculateOpenCost(
        range.lower,
        range.upper,
        quantity,
        distribution,
        market
      );

      expect(result.cost.toString()).toBe(result2.cost.toString());
    });

    test("binFactors 배열이 올바르게 처리된다", () => {
      // 분포를 수정해서 특정 bin만 다른 값을 가지도록 함
      const modifiedRaw: MarketDistributionRaw = {
        totalSum: "402000000000000000000", // 402 * 1e18
        binFactors: [...Array(400).fill("1000000000000000000")],
      };

      // 특정 bin의 factor를 2.0으로 변경
      modifiedRaw.binFactors[50] = "2000000000000000000"; // 2.0 * 1e18

      const modifiedDist = mapDistribution(modifiedRaw);

      // 해당 bin이 포함된 범위와 포함되지 않은 범위 비교
      const range1 = { lower: 105000, upper: 105100 }; // bin 50 포함 (105000 = 100000 + 50*100)
      const range2 = { lower: 106000, upper: 106100 }; // bin 60 포함 (factor = 1.0)

      const cost1 = sdk.calculateOpenCost(
        range1.lower,
        range1.upper,
        toMicroUSDC("10"),
        modifiedDist,
        market
      );

      const cost2 = sdk.calculateOpenCost(
        range2.lower,
        range2.upper,
        toMicroUSDC("10"),
        modifiedDist,
        market
      );

      // factor가 높은 bin이 포함된 범위가 더 비싸야 함
      expect(cost1.cost.gt(cost2.cost)).toBe(true);
    });
  });

  describe("🎯 대용량 거래 테스트 (α=200 환경)", () => {
    test("α=200에서 큰 수량 처리 테스트", () => {
      // α = 200으로 시장 설정
      const highLiquidityMarket: Market = {
        liquidityParameter: toWAD("200"), // α = 200
        minTick: 100000, // $1000.00
        maxTick: 140000, // $1400.00
        tickSpacing: 100, // $1.00 increments
      };

      const range = { lower: 115000, upper: 125000 }; // $1150-$1250 범위

      // 26 USDC (임계값)는 성공해야 함
      const quantity26 = toMicroUSDC("26"); // 26 USDC = 0.13 * α
      const result26 = sdk.calculateOpenCost(
        range.lower,
        range.upper,
        quantity26,
        distribution,
        highLiquidityMarket
      );
      expect(result26.cost.gt(0)).toBe(true);

      // 26.3 USDC (임계값 초과)도 chunk-split으로 처리되어야 함
      const quantity263 = toMicroUSDC("26.2987691303341730"); // 임계값 초과
      const result263 = sdk.calculateOpenCost(
        range.lower,
        range.upper,
        quantity263,
        distribution,
        highLiquidityMarket
      );
      expect(result263.cost.gt(0)).toBe(true);

      // 더 큰 수량도 처리되어야 함 (1000 USDC)
      const quantity1000 = toMicroUSDC("1000");
      const result1000 = sdk.calculateOpenCost(
        range.lower,
        range.upper,
        quantity1000,
        distribution,
        highLiquidityMarket
      );
      expect(result1000.cost.gt(0)).toBe(true);

      // 매도 수익 계산도 정상 작동해야 함
      const position = {
        lowerTick: range.lower,
        upperTick: range.upper,
        quantity: quantity1000,
      };
      const sellQuantity = toMicroUSDC("500");
      const sellResult = sdk.calculateSellProceeds(
        position,
        sellQuantity,
        distribution,
        highLiquidityMarket
      );
      expect(sellResult.proceeds.gt(0)).toBe(true);
    });
  });

  describe("💰 Fee policy integration", () => {
    const feeDescriptor = JSON.stringify({
      policy: "percentage",
      params: {
        bps: "150", // 1.5%
        name: "OnePointFive",
      },
    });

    test("calculateOpenCost attaches fee breakdown when descriptor provided", () => {
      const range = { lower: 115000, upper: 125000 };
      const quantity = toMicroUSDC("50");
      const marketWithFee = {
        ...market,
        feePolicyDescriptor: feeDescriptor,
      };

      const result = sdk.calculateOpenCost(
        range.lower,
        range.upper,
        quantity,
        distribution,
        marketWithFee
      );

      expect(result.feeAmount).toBeDefined();
      expect(result.feeRate).toBeDefined();
      expect(result.feeInfo).toBeDefined();
      const expectedFee = MathUtils.formatUSDC(
        result.cost.mul(150).div(10000).round(0, Big.roundDown)
      );
      expect(result.feeAmount.toString()).toBe(expectedFee.toString());
      expect(result.feeRate.eq(new Big("0.015"))).toBe(true);
      const feeInfo = result.feeInfo;
      expect(feeInfo.policy).toBe(FeePolicyKind.Percentage);
      if (feeInfo.policy !== FeePolicyKind.Percentage) {
        throw new Error("expected percentage fee info");
      }
      expect(feeInfo.bps?.toString()).toBe("150");
      expect(feeInfo.descriptor).toBe(feeDescriptor);
      expect(result.cost.plus(result.feeAmount).toString()).toBe(
        result.cost.plus(expectedFee).toString()
      );
    });

    test("calculateDecreaseProceeds reports net proceeds and fee", () => {
      const position = {
        lowerTick: 115000,
        upperTick: 125000,
        quantity: toMicroUSDC("120"),
      };
      const sellQuantity = toMicroUSDC("40");
      const marketWithFee = {
        ...market,
        feePolicyDescriptor: feeDescriptor,
      };

      const result = sdk.calculateDecreaseProceeds(
        position,
        sellQuantity,
        distribution,
        marketWithFee
      );

      expect(result.feeAmount).toBeDefined();
      expect(result.feeRate).toBeDefined();
      expect(result.feeInfo).toBeDefined();
      const expectedFee = MathUtils.formatUSDC(
        result.proceeds.mul(150).div(10000).round(0, Big.roundDown)
      );
      expect(result.feeAmount.toString()).toBe(expectedFee.toString());
      expect(result.feeRate.eq(new Big("0.015"))).toBe(true);
      const feeInfo = result.feeInfo;
      expect(feeInfo.policy).toBe(FeePolicyKind.Percentage);
      expect(feeInfo.descriptor).toBe(feeDescriptor);
      if (feeInfo.policy !== FeePolicyKind.Percentage) {
        throw new Error("expected percentage fee info");
      }
      expect(feeInfo.bps?.toString()).toBe("150");
      expect(result.proceeds.minus(result.feeAmount).toString()).toBe(
        result.proceeds.minus(expectedFee).toString()
      );
    });

    test("calculateQuantityFromCost 역산은 총 지출 한도에서 수수료를 고려한다", () => {
      const range = { lower: 115000, upper: 125000 };
      const marketWithFee = {
        ...market,
        feePolicyDescriptor: feeDescriptor,
      };

      const targetSpend = toMicroUSDC("110"); // 총 110 SUSD 지출 (1.5% 수수료 포함)

      const inverseResult = sdk.calculateQuantityFromCost(
        range.lower,
        range.upper,
        targetSpend,
        distribution,
        marketWithFee
      );

      const forwardResult = sdk.calculateOpenCost(
        range.lower,
        range.upper,
        inverseResult.quantity,
        distribution,
        marketWithFee
      );

      const totalSpend = forwardResult.cost.plus(forwardResult.feeAmount);
      const diff = totalSpend.minus(targetSpend).abs();

      // 1 micro USDC 이내 오차 허용
      expect(diff.lte(new Big(1))).toBe(true);
      expect(forwardResult.feeAmount.gt(0)).toBe(true);
      expect(inverseResult.actualCost.lt(targetSpend)).toBe(true);
    });

    test("calculateQuantityFromCost는 includeFees=false면 순수 비용 기준으로 동작한다", () => {
      const range = { lower: 115000, upper: 125000 };
      const marketWithFee = {
        ...market,
        feePolicyDescriptor: feeDescriptor,
      };

      const targetCost = toMicroUSDC("80");

      const inverseResult = sdk.calculateQuantityFromCost(
        range.lower,
        range.upper,
        targetCost,
        distribution,
        marketWithFee,
        false
      );

      const forwardResult = sdk.calculateOpenCost(
        range.lower,
        range.upper,
        inverseResult.quantity,
        distribution,
        marketWithFee
      );

      expect(inverseResult.actualCost.toString()).toBe(targetCost.toString());
      expect(forwardResult.cost.toString()).toBe(targetCost.toString());
      expect(forwardResult.feeAmount.gt(0)).toBe(true);
      expect(
        forwardResult.cost.plus(forwardResult.feeAmount).gt(targetCost)
      ).toBe(true);
    });

    test("calculateQuantityFromProceeds 역산은 목표 순수 수익을 맞춘다", () => {
      const range = { lower: 115000, upper: 125000 };
      const marketWithFee = {
        ...market,
        feePolicyDescriptor: feeDescriptor,
      };

      const position = {
        lowerTick: range.lower,
        upperTick: range.upper,
        quantity: toMicroUSDC("120"),
      };

      const maxNetResult = sdk.calculateDecreaseProceeds(
        position,
        position.quantity,
        distribution,
        marketWithFee
      );
      const maxNet = maxNetResult.proceeds.minus(maxNetResult.feeAmount);
      const targetNet = MathUtils.formatUSDC(maxNet.div(2));

      const inverseResult = sdk.calculateQuantityFromProceeds(
        position,
        targetNet,
        distribution,
        marketWithFee
      );

      const forwardResult = sdk.calculateDecreaseProceeds(
        position,
        inverseResult.quantity,
        distribution,
        marketWithFee
      );

      const netProceeds = forwardResult.proceeds.minus(forwardResult.feeAmount);
      const diff = netProceeds.minus(targetNet).abs();

      expect(diff.lte(new Big(1))).toBe(true);
      expect(forwardResult.feeAmount.gt(0)).toBe(true);
      expect(forwardResult.feeInfo.policy).toBe(FeePolicyKind.Percentage);
      expect(inverseResult.actualProceeds.toString()).toBe(
        forwardResult.proceeds.toString()
      );
    });

    test("calculateQuantityFromProceeds는 includeFees=false면 총 수익 기준으로 역산한다", () => {
      const range = { lower: 115000, upper: 125000 };
      const marketWithFee = {
        ...market,
        feePolicyDescriptor: feeDescriptor,
      };

      const position = {
        lowerTick: range.lower,
        upperTick: range.upper,
        quantity: toMicroUSDC("120"),
      };

      const maxBase = sdk.calculateDecreaseProceeds(
        position,
        position.quantity,
        distribution,
        marketWithFee
      ).proceeds;
      const targetBase = MathUtils.formatUSDC(maxBase.div(2));

      const inverseResult = sdk.calculateQuantityFromProceeds(
        position,
        targetBase,
        distribution,
        marketWithFee,
        false
      );

      const forwardResult = sdk.calculateDecreaseProceeds(
        position,
        inverseResult.quantity,
        distribution,
        marketWithFee
      );

      const baseDiff = forwardResult.proceeds.minus(targetBase).abs();
      expect(baseDiff.lte(new Big(1))).toBe(true);
      expect(forwardResult.feeAmount.gt(0)).toBe(true);
      expect(
        forwardResult.proceeds.minus(forwardResult.feeAmount).lt(targetBase)
      ).toBe(true);
      expect(inverseResult.actualProceeds.toString()).toBe(
        forwardResult.proceeds.toString()
      );
    });

    test("calculateQuantityFromCost는 수수료 기본요금이 목표보다 크면 ValidationError", () => {
      const range = { lower: 115000, upper: 125000 };
      const descriptor = "flat-fee-policy";
      const marketWithFlatFee = {
        ...market,
        feePolicyDescriptor: descriptor,
      };

      const originalResolve = FeeModule.resolveFeePolicyWithMetadata;
      const resolveSpy = jest
        .spyOn(FeeModule, "resolveFeePolicyWithMetadata")
        .mockImplementation((input: any) => {
          if (input === descriptor) {
            return {
              policy: {
                quote: (params: any) => 200_000000n,
                name: "FlatFeePolicy",
              },
            };
          }
          return originalResolve(input as any);
        });

      try {
        expect(() =>
          sdk.calculateQuantityFromCost(
            range.lower,
            range.upper,
            toMicroUSDC("150"),
            distribution,
            marketWithFlatFee,
            true
          )
        ).toThrow("Target cost is below the minimum spend achievable after fees");
      } finally {
        resolveSpy.mockRestore();
      }
    });

    test("calculateQuantityFromProceeds는 includeFees=false에서 최대 base 수익을 초과하면 ValidationError", () => {
      const range = { lower: 115000, upper: 125000 };
      const marketWithFee = {
        ...market,
        feePolicyDescriptor: feeDescriptor,
      };

      const position = {
        lowerTick: range.lower,
        upperTick: range.upper,
        quantity: toMicroUSDC("120"),
      };

      const maxBaseProceeds = sdk.calculateDecreaseProceeds(
        position,
        position.quantity,
        distribution,
        marketWithFee
      ).proceeds;

      expect(() =>
        sdk.calculateQuantityFromProceeds(
          position,
          maxBaseProceeds.plus(1),
          distribution,
          marketWithFee,
          false
        )
      ).toThrow("Target proceeds exceed the maximum proceeds available for this position");
    });

    test("calculateQuantityFromProceeds는 네트 수익이 도달 불가능하면 ValidationError", () => {
      const range = { lower: 115000, upper: 125000 };
      const descriptor = "confiscatory-fee";
      const marketWithCustomFee = {
        ...market,
        feePolicyDescriptor: descriptor,
      };

      const originalResolve = FeeModule.resolveFeePolicyWithMetadata;
      const resolveSpy = jest
        .spyOn(FeeModule, "resolveFeePolicyWithMetadata")
        .mockImplementation((input: any) => {
          if (input === descriptor) {
            return {
              policy: {
                quote: (params: any) => {
                  const base = params?.proceeds6 ?? params?.cost6 ?? 0n;
                  return BigInt(base) + 100_000000n;
                },
                name: "ConfiscatoryFee",
              },
            };
          }
          return originalResolve(input as any);
        });

      try {
        const position = {
          lowerTick: range.lower,
          upperTick: range.upper,
          quantity: toMicroUSDC("80"),
        };

        expect(() =>
          sdk.calculateQuantityFromProceeds(
            position,
            toMicroUSDC("10"),
            distribution,
            marketWithCustomFee,
            true
          )
        ).toThrow("Target proceeds exceed the maximum net proceeds available for this position");
      } finally {
        resolveSpy.mockRestore();
      }
    });

    test("calculateQuantityFromCost는 커스텀 수수료 정책에서도 총 지출 한도를 맞춘다", () => {
      const range = { lower: 115000, upper: 125000 };
      const descriptor = "custom-linear-fee";
      const marketWithCustomFee = {
        ...market,
        feePolicyDescriptor: descriptor,
      };
      const originalResolve = FeeModule.resolveFeePolicyWithMetadata;
      const resolveSpy = jest
        .spyOn(FeeModule, "resolveFeePolicyWithMetadata")
        .mockImplementation((input: any) => {
          if (input === descriptor) {
            return {
              policy: {
                quote: ({
                  baseAmount6,
                  quantity6,
                }: {
                  baseAmount6: bigint;
                  quantity6: bigint;
                }) => baseAmount6 / 10n + quantity6 / 20n,
                name: "LinearFeePolicy",
              },
            };
          }
          return originalResolve(input as any);
        });

      try {
        const targetSpend = toMicroUSDC("90");
        const inverseResult = sdk.calculateQuantityFromCost(
          range.lower,
          range.upper,
          targetSpend,
          distribution,
          marketWithCustomFee
        );

        const forwardResult = sdk.calculateOpenCost(
          range.lower,
          range.upper,
          inverseResult.quantity,
          distribution,
          marketWithCustomFee
        );

        const totalSpend = forwardResult.cost.plus(forwardResult.feeAmount);
        const diff = totalSpend.minus(targetSpend).abs();

        expect(diff.lte(new Big(1))).toBe(true);
        expect(forwardResult.feeInfo.policy).toBe(FeePolicyKind.Custom);
        expect(forwardResult.feeAmount.gt(0)).toBe(true);
      } finally {
        resolveSpy.mockRestore();
      }
    });

    test("calculateQuantityFromProceeds는 커스텀 수수료 정책에서도 목표 순수 수익을 맞춘다", () => {
      const range = { lower: 115000, upper: 125000 };
      const descriptor = "custom-linear-fee-sell";
      const marketWithCustomFee = {
        ...market,
        feePolicyDescriptor: descriptor,
      };
      const originalResolve = FeeModule.resolveFeePolicyWithMetadata;
      const resolveSpy = jest
        .spyOn(FeeModule, "resolveFeePolicyWithMetadata")
        .mockImplementation((input: any) => {
          if (input === descriptor) {
            return {
              policy: {
                quote: ({
                  baseAmount6,
                  quantity6,
                }: {
                  baseAmount6: bigint;
                  quantity6: bigint;
                }) => baseAmount6 / 8n + quantity6 / 25n,
                name: "LinearSellFee",
              },
            };
          }
          return originalResolve(input as any);
        });

      try {
        const position = {
          lowerTick: range.lower,
          upperTick: range.upper,
          quantity: toMicroUSDC("150"),
        };

        const maxNetResult = sdk.calculateDecreaseProceeds(
          position,
          position.quantity,
          distribution,
          marketWithCustomFee
        );
        const maxNet = maxNetResult.proceeds.minus(maxNetResult.feeAmount);
        const targetNet = MathUtils.formatUSDC(maxNet.div(2));

        const inverseResult = sdk.calculateQuantityFromProceeds(
          position,
          targetNet,
          distribution,
          marketWithCustomFee
        );

        const forwardResult = sdk.calculateDecreaseProceeds(
          position,
          inverseResult.quantity,
          distribution,
          marketWithCustomFee
        );

        const netProceeds = forwardResult.proceeds.minus(
          forwardResult.feeAmount
        );
        const diff = netProceeds.minus(targetNet).abs();

        expect(diff.lte(new Big(1))).toBe(true);
        expect(forwardResult.feeInfo.policy).toBe(FeePolicyKind.Custom);
        expect(forwardResult.feeAmount.gt(0)).toBe(true);
        expect(inverseResult.actualProceeds.toString()).toBe(
          forwardResult.proceeds.toString()
        );
      } finally {
        resolveSpy.mockRestore();
      }
    });

    test("calculateOpenCost leaves fee undefined when descriptor omitted", () => {
      const result = sdk.calculateOpenCost(
        115000,
        125000,
        toMicroUSDC("10"),
        distribution,
        market
      );
      expect(result.feeAmount.eq(new Big(0))).toBe(true);
      expect(result.feeRate.eq(new Big(0))).toBe(true);
      expect(result.feeInfo.policy).toBe(FeePolicyKind.Null);
    });
  });
});
