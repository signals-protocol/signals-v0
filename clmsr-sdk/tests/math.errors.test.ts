import Big from "big.js";
import {
  fromWad,
  fromWadNearest,
  fromWadNearestMin1,
  wDivUp,
  wExp,
  sumExp,
  logSumExp,
  clmsrCost,
  clmsrProceeds,
  safeExp,
  WAD,
  MAX_EXP_INPUT_WAD,
} from "../src/utils/math";
import { ValidationError } from "../src/types";

describe("math utils - 에러 및 경계 케이스", () => {
  test("fromWad은 0 입력 시 0을 반환한다", () => {
    const result = fromWad(new Big(0));
    expect(result.toString()).toBe("0");
  });

  test("wDivUp은 0으로 나누기 시 ValidationError를 던진다", () => {
    expect(() => wDivUp(WAD, new Big(0))).toThrow(ValidationError);
  });

  test("wExp는 허용 범위를 넘는 입력에 ValidationError를 던진다", () => {
    const tooLarge = MAX_EXP_INPUT_WAD.plus(1);
    expect(() => wExp(tooLarge)).toThrow(ValidationError);
  });

  test("sumExp는 빈 배열 입력 시 ValidationError를 던진다", () => {
    expect(() => sumExp([])).toThrow(ValidationError);
  });

  test("fromWadNearest와 fromWadNearestMin1은 0 입력 시 0을 반환한다", () => {
    expect(fromWadNearest(new Big(0)).toString()).toBe("0");
    expect(fromWadNearestMin1(new Big(0)).toString()).toBe("0");
  });

  test("logSumExp는 빈 배열 입력 시 ValidationError를 던진다", () => {
    expect(() => logSumExp([])).toThrow(ValidationError);
  });

  test("clmsrCost는 sumBefore가 0이면 ValidationError", () => {
    expect(() => clmsrCost(WAD, new Big(0), WAD)).toThrow(ValidationError);
  });

  test("clmsrProceeds는 sumBefore/sumAfter가 0이면 ValidationError", () => {
    expect(() => clmsrProceeds(WAD, new Big(0), WAD)).toThrow(ValidationError);
    expect(() => clmsrProceeds(WAD, WAD, new Big(0))).toThrow(ValidationError);
  });

  test("safeExp는 alpha가 0일 때 ValidationError", () => {
    expect(() => safeExp(WAD, new Big(0))).toThrow(ValidationError);
  });
});
