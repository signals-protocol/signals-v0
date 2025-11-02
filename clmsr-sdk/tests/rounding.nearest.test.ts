import Big from "big.js";
import {
  toWAD,
  fromWad,
  fromWadRoundUp,
  wMulNearest,
  wDivUp,
  WAD,
} from "../src/utils/math";

describe("Rounding policy helpers", () => {
  it("rounds buys up to the next micro unit", () => {
    const fractional = toWAD("0.0000001"); // 0.1 μUSDC in WAD
    const rounded = fromWadRoundUp(fractional);
    expect(rounded.toString()).toBe("1");

    const exact = toWAD("5");
    const roundedExact = fromWadRoundUp(exact);
    expect(roundedExact.toString()).toBe("5000000");
  });

  it("floors sells to the lower micro unit", () => {
    const fractionalMicro = toWAD("0.0000004"); // 0.4 μUSDC
    expect(fromWad(fractionalMicro).toString()).toBe("0");

    const justBelowWhole = toWAD("0.999999"); // slightly below 1 USDC
    expect(fromWad(justBelowWhole).toString()).toBe("999999");

    const exact = toWAD("12.5");
    const flooredExact = fromWad(exact);
    expect(flooredExact.toString()).toBe("12500000");
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
