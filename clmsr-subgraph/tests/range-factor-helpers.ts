import { BigInt } from "@graphprotocol/graph-ts";
import { wad, zero } from "../src/constants";

export class SumOfFloorsResult {
  afters: Array<BigInt>;
  tildeSum: BigInt;
  remainders: Array<BigInt>;

  constructor(size: i32) {
    this.afters = new Array<BigInt>(size);
    this.remainders = new Array<BigInt>(size);
    this.tildeSum = zero();
  }
}

export function toWadFromInt(value: i32): BigInt {
  return BigInt.fromI32(value).times(wad());
}

export function floorOfSumAfter(sumBefore: BigInt, phiInt: BigInt): BigInt {
  return sumBefore.times(phiInt).div(wad());
}

export function sumOfFloorsAfter(
  bins: Array<BigInt>,
  phiInt: BigInt
): SumOfFloorsResult {
  const result = new SumOfFloorsResult(bins.length);
  let runningSum = zero();

  for (let i = 0; i < bins.length; i++) {
    const value = bins[i];
    const product = value.times(phiInt);
    const quotient = product.div(wad());
    const remainder = product.mod(wad());

    result.afters[i] = quotient;
    result.remainders[i] = remainder;
    runningSum = runningSum.plus(quotient);
  }

  result.tildeSum = runningSum;
  return result;
}

export function sumBigIntVector(values: Array<BigInt>): BigInt {
  let total = zero();
  for (let i = 0; i < values.length; i++) {
    total = total.plus(values[i]);
  }
  return total;
}
