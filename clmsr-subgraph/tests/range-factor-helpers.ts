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

export function halfWad(): BigInt {
  return wad().div(BigInt.fromI32(2));
}

export function nearestOfSumAfter(sumBefore: BigInt, phiInt: BigInt): BigInt {
  return sumBefore
    .times(phiInt)
    .plus(halfWad())
    .div(wad());
}

export function sumOfNearestAfter(
  bins: Array<BigInt>,
  phiInt: BigInt
): SumOfFloorsResult {
  const result = new SumOfFloorsResult(bins.length);
  let runningSum = zero();

  for (let i = 0; i < bins.length; i++) {
    const value = bins[i];
    const product = value.times(phiInt);
    let quotient = product.div(wad());
    const remainder = product.mod(wad());

    if (remainder.ge(halfWad())) {
      quotient = quotient.plus(BigInt.fromI32(1));
    }

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
