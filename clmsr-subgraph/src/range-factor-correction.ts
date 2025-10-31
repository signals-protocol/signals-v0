import { BigInt, log } from "@graphprotocol/graph-ts";

import { wad, zero } from "./constants";

class CorrectionRow {
  index: i32;
  quotient: BigInt;
  remainder: BigInt;

  constructor(index: i32, quotient: BigInt, remainder: BigInt) {
    this.index = index;
    this.quotient = quotient;
    this.remainder = remainder;
  }
}

function adjustResidual(rows: Array<CorrectionRow>, residual: BigInt): void {
  if (residual.equals(zero())) {
    return;
  }

  const step = wad();
  const positive = residual.gt(zero());
  let remaining = positive ? residual : residual.times(BigInt.fromI32(-1));
  const steps = remaining.div(step).toI32();

  if (steps === 0) {
    return;
  }

  for (let s = 0; s < steps; s++) {
    let target = rows[0];
    for (let i = 1; i < rows.length; i++) {
      const candidate = rows[i];
      if (positive) {
        if (
          candidate.remainder.gt(target.remainder) ||
          (candidate.remainder.equals(target.remainder) &&
            candidate.index < target.index)
        ) {
          target = candidate;
        }
      } else {
        if (
          candidate.remainder.lt(target.remainder) ||
          (candidate.remainder.equals(target.remainder) &&
            candidate.index < target.index)
        ) {
          target = candidate;
        }
      }
    }

    if (positive) {
      target.quotient = target.quotient.plus(step);
    } else {
      target.quotient = target.quotient.minus(step);
    }
  }
}

export class RangeFactorCorrectionResult {
  correctedValues: Array<BigInt>;
  sumBefore: BigInt;
  targetAfter: BigInt;
  tildeSum: BigInt;
  afterSum: BigInt;
  residual: BigInt;

  constructor(
    correctedValues: Array<BigInt>,
    sumBefore: BigInt,
    targetAfter: BigInt,
    tildeSum: BigInt,
    afterSum: BigInt,
    residual: BigInt
  ) {
    this.correctedValues = correctedValues;
    this.sumBefore = sumBefore;
    this.targetAfter = targetAfter;
    this.tildeSum = tildeSum;
    this.afterSum = afterSum;
    this.residual = residual;
  }
}

export function computeRangeFactorCorrection(
  values: Array<BigInt>,
  factor: BigInt
): RangeFactorCorrectionResult {
  const size = values.length;
  const rows = new Array<CorrectionRow>(size);
  let sumBefore = zero();
  let tildeSum = zero();
  const half = wad().div(BigInt.fromI32(2));

  for (let i = 0; i < size; i++) {
    const value = values[i];
    sumBefore = sumBefore.plus(value);

    const product = value.times(factor);
    const quotient = product.plus(half).div(wad());
    const remainder = product.mod(wad());

    rows[i] = new CorrectionRow(i, quotient, remainder);
    tildeSum = tildeSum.plus(quotient);
  }

  const targetAfter = sumBefore.times(factor).plus(half).div(wad());
  const residual = targetAfter.minus(tildeSum);

  const correctedValues = new Array<BigInt>(size);
  adjustResidual(rows, residual);
  let afterSum = zero();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    correctedValues[row.index] = row.quotient;
  }

  for (let i = 0; i < correctedValues.length; i++) {
    afterSum = afterSum.plus(correctedValues[i]);
  }

  if (!afterSum.equals(targetAfter)) {
    log.warning(
      "[range-factor] After-sum {} mismatches target {} (residual {})",
      [afterSum.toString(), targetAfter.toString(), residual.toString()]
    );
  }

  return new RangeFactorCorrectionResult(
    correctedValues,
    sumBefore,
    targetAfter,
    tildeSum,
    afterSum,
    targetAfter.minus(afterSum)
  );
}
