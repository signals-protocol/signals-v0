import Big from "big.js";
import * as MathUtils from "../src/utils/math";
import { ValidationError } from "../src/types";

const { WAD, SCALE_DIFF, HALF_WAD, MIN_FACTOR, MAX_FACTOR } = MathUtils as any;

describe("math utils - 추가 케이스", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("fromWadRoundUp은 0이 아닌 값을 항상 올림한다", () => {
    const halfMicro = SCALE_DIFF.div(2);
    expect(MathUtils.fromWadRoundUp(halfMicro).toString()).toBe("1");
    expect(MathUtils.fromWadRoundUp(new Big(0)).toString()).toBe("0");
  });

  test("fromWadNearest와 fromWadNearestMin1의 최소값 보장", () => {
    const quarterMicro = SCALE_DIFF.div(4);
    expect(MathUtils.fromWadNearest(quarterMicro).toString()).toBe("0");
    expect(MathUtils.fromWadNearestMin1(quarterMicro).toString()).toBe("1");
  });

  test("wMulNearest는 0 인자가 있으면 0을 반환한다", () => {
    expect(MathUtils.wMulNearest(new Big(0), WAD).toString()).toBe("0");
  });

  test("wMulNearest는 반올림을 수행한다", () => {
    const a = WAD;
    const b = WAD.div(2); // 0.5
    const expected = a
      .mul(b)
      .plus(HALF_WAD)
      .div(WAD)
      .round(0, Big.roundDown);
    expect(MathUtils.wMulNearest(a, b).toString()).toBe(expected.toString());
  });

  test("wDiv는 0으로 나누기 시 예외를 던지고 정상 케이스는 값을 반환한다", () => {
    expect(() => MathUtils.wDiv(WAD, new Big(0))).toThrow(ValidationError);
    const result = MathUtils.wDiv(WAD.mul(2), WAD);
    expect(result.toString()).toBe(WAD.mul(2).toString());
  });

  test("wDivUp은 정확히 나누어떨어질 때 그대로 반환한다", () => {
    const result = MathUtils.wDivUp(WAD.mul(3), WAD);
    expect(result.toString()).toBe(WAD.mul(3).toString());
  });

  test("wLn은 양수 입력에서는 값을 반환하고 0 이하는 예외를 던진다", () => {
    const expValue = MathUtils.wExp(WAD.div(2));
    const lnValue = MathUtils.wLn(expValue);
    expect(lnValue.toString()).toBe(WAD.div(2).toString());
    expect(() => MathUtils.wLn(new Big(0))).toThrow(ValidationError);
  });

  test("wSqrt는 음수 입력에서 예외를 던진다", () => {
    expect(() => MathUtils.wSqrt(new Big(-1))).toThrow(ValidationError);
    const four = MathUtils.toWAD("4");
    const sqrt = MathUtils.wSqrt(four);
    expect(sqrt.toString()).toBe(MathUtils.toWAD("2").toString());
  });

  test("sumExp는 각 항의 지수를 합산한다", () => {
    const result = MathUtils.sumExp([new Big(0), new Big(0)]);
    expect(result.toString()).toBe(WAD.mul(2).toString());
  });

  test("logSumExp는 안정화 로직을 사용해 합의 로그를 계산한다", () => {
    const values = [MathUtils.toWAD("0.2"), MathUtils.toWAD("1.1")];
    const result = MathUtils.logSumExp(values);
    const maxVal = values.reduce((max, current) =>
      current.gt(max) ? current : max
    );
    let sumScaled = new Big(0);
    for (const value of values) {
      const diff = value.gte(maxVal) ? value.minus(maxVal) : new Big(0);
      const eScaled = MathUtils.wExp(diff);
      sumScaled = sumScaled.plus(eScaled);
    }
    const expected = maxVal.plus(MathUtils.wLn(sumScaled));
    expect(result.toString()).toBe(expected.toString());
  });

  test("clmsrPrice는 총합이 0이면 예외를 던지고 정상 동작한다", () => {
    expect(() => MathUtils.clmsrPrice(WAD, new Big(0))).toThrow(
      ValidationError
    );
    const price = MathUtils.clmsrPrice(WAD, WAD.mul(4));
    expect(parseFloat(price.div(WAD).toString())).toBeCloseTo(0.25, 12);
  });

  test("clmsrCost는 ratio < 1이면 예외", () => {
    expect(() =>
      MathUtils.clmsrCost(WAD, WAD, WAD.div(2))
    ).toThrow(ValidationError);
    const cost = MathUtils.clmsrCost(WAD, WAD, WAD.mul(2));
    expect(cost.gt(0)).toBe(true);
  });

  test("clmsrProceeds는 조건에 따라 0 또는 값을 반환한다", () => {
    expect(MathUtils.clmsrProceeds(WAD, WAD, WAD.mul(2)).toString()).toBe("0");
    const proceeds = MathUtils.clmsrProceeds(WAD, WAD.mul(3), WAD.mul(2));
    expect(proceeds.gt(0)).toBe(true);
  });

  test("safeExp는 청크를 분할해 곱을 계산한다", () => {
    const alpha = WAD;
    const result = MathUtils.safeExp(WAD.mul(3), alpha);
    const expected = new Big(Math.exp(3).toString()).mul(WAD);
    expect(parseFloat(result.div(WAD).toFixed(6))).toBeCloseTo(
      parseFloat(expected.div(WAD).toFixed(6)),
      6
    );
  });

  test("isFactorSafe는 범위 안팎을 구분한다", () => {
    expect(MathUtils.isFactorSafe(WAD)).toBe(true);
    expect(MathUtils.isFactorSafe(MIN_FACTOR.div(10))).toBe(false);
    expect(MathUtils.isFactorSafe(MAX_FACTOR.mul(2))).toBe(false);
  });

  test("toBig는 문자열 입력을 Big으로 변환한다", () => {
    const value = MathUtils.toBig("123.45");
    expect(value instanceof Big).toBe(true);
    expect(value.toString()).toBe("123.45");
  });
});
