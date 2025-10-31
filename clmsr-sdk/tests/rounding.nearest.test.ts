import Big from "big.js";
import {
  toWAD,
  fromWadNearest,
  fromWadNearestMin1,
  wMulNearest,
  wDivUp,
  WAD,
} from "../src/utils/math";

describe("Nearest rounding helpers", () => {
  it("rounds to nearest micro USDC with ties up", () => {
    const halfUp = toWAD("0.0000005");
    const justBelowHalf = toWAD("0.000000499999");
    const justAboveHalf = toWAD("0.000000500001");

    expect(fromWadNearest(halfUp).toString()).toBe("1");
    expect(fromWadNearest(justBelowHalf).toString()).toBe("0");
    expect(fromWadNearest(justAboveHalf).toString()).toBe("1");
  });

  it("enforces minimum 1 micro USDC when input is non-zero", () => {
    const tiny = toWAD("0.000000000000000001");
    expect(fromWadNearestMin1(tiny).toString()).toBe("1");
    expect(fromWadNearestMin1(new Big(0)).toString()).toBe("0");
  });

  it("matches nearest rounding for WAD multiplication", () => {
    const a = toWAD("1.75");
    const b = toWAD("0.333333333333");

    const exactProduct = a.mul(b).div(WAD);
    const expected = exactProduct.round(0, Big.roundHalfUp);

    expect(wMulNearest(a, b).toString()).toBe(expected.toString());
  });

  it("performs ceiling division for WAD values", () => {
    const numerator = toWAD("2.5");
    const denominator = toWAD("0.7");
    const result = wDivUp(numerator, denominator);

    const exact = numerator.mul(WAD).div(denominator);
    const expected = exact.round(0, Big.roundUp);

    expect(result.toString()).toBe(expected.toString());
  });
});
