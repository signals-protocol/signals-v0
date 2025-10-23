import { CLMSRSDK } from "../src/clmsr-sdk";
import {
  Market,
  MarketDistribution,
  mapDistribution,
  MarketDistributionRaw,
} from "../src/types";
import { toWAD, toMicroUSDC } from "../src/index";

describe("🎯 매도 역함수 (calculateQuantityFromProceeds)", () => {
  let sdk: CLMSRSDK;
  let market: Market;
  let distribution: MarketDistribution;

  const range = { lower: 115000, upper: 125000 };

  beforeEach(() => {
    sdk = new CLMSRSDK();

    market = {
      liquidityParameter: toWAD("1000"),
      minTick: 100000,
      maxTick: 140000,
      tickSpacing: 100,
    };

    const binFactors = Array(400).fill("1000000000000000000");
    const rawDistribution: MarketDistributionRaw = {
      totalSum: "400000000000000000000",
      binFactors,
    };

    distribution = mapDistribution(rawDistribution);
  });

  test("더 큰 목표 수익은 더 많은 매도 수량을 요구한다", () => {
    const position = {
      lowerTick: range.lower,
      upperTick: range.upper,
      quantity: toMicroUSDC("100"),
    };

    const small = sdk.calculateQuantityFromProceeds(
      position,
      toMicroUSDC("5"),
      distribution,
      market
    );
    const large = sdk.calculateQuantityFromProceeds(
      position,
      toMicroUSDC("15"),
      distribution,
      market
    );

    expect(large.quantity.gt(small.quantity)).toBe(true);
  });

  test("역함수 근사 정확도 (매도)", () => {
    const position = {
      lowerTick: range.lower,
      upperTick: range.upper,
      quantity: toMicroUSDC("80"),
    };

    const targetProceeds = toMicroUSDC("12");
    const inverseResult = sdk.calculateQuantityFromProceeds(
      position,
      targetProceeds,
      distribution,
      market
    );

    // 계산된 수량으로 실제 매도 시도의 수익
    const forwardResult = sdk.calculateDecreaseProceeds(
      position,
      inverseResult.quantity,
      distribution,
      market
    );

    const error = forwardResult.proceeds.minus(targetProceeds).abs();
    const percentError = error.div(targetProceeds).mul(100);

    expect(percentError.lt(10)).toBe(true);
    expect(inverseResult.actualProceeds.toString()).toBe(
      forwardResult.proceeds.toString()
    );
  });

  test("최대 수익을 넘는 목표는 검증 오류를 발생시킨다", () => {
    const position = {
      lowerTick: range.lower,
      upperTick: range.upper,
      quantity: toMicroUSDC("50"),
    };

    const maxProceeds = sdk.calculateDecreaseProceeds(
      position,
      position.quantity,
      distribution,
      market
    ).proceeds;

    const excessiveTarget = maxProceeds.plus(1); // 1 micro USDC 초과

    expect(() =>
      sdk.calculateQuantityFromProceeds(
        position,
        excessiveTarget,
        distribution,
        market
      )
    ).toThrow("Target proceeds exceed the maximum proceeds available for this position");
  });
});
