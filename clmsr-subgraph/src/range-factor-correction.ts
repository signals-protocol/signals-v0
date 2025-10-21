// Performs Option B correction: per-bin floors plus deterministic residual distribution
// so that range sums match the contract's single floor(sumBefore * factor).
import { BigInt, log } from "@graphprotocol/graph-ts";

import { ONE_BI, WAD_BI, ZERO_BI } from "./constants";

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

function clampResidual(residual: BigInt): BigInt {
  return residual.lt(ZERO_BI) ? ZERO_BI : residual;
}

export function computeRangeFactorCorrection(
  values: Array<BigInt>,
  factor: BigInt
): RangeFactorCorrectionResult {
  const size = values.length;
  const rows = new Array<CorrectionRow>(size);
  let sumBefore = ZERO_BI;
  let tildeSum = ZERO_BI;

  for (let i = 0; i < size; i++) {
    const value = values[i];
    sumBefore = sumBefore.plus(value);

    const product = value.times(factor);
    const quotient = product.div(WAD_BI);
    const remainder = product.mod(WAD_BI);

    rows[i] = new CorrectionRow(i, quotient, remainder);
    tildeSum = tildeSum.plus(quotient);
  }

  const targetAfter = sumBefore.times(factor).div(WAD_BI);
  let residual = clampResidual(targetAfter.minus(tildeSum));

  const sorted = rows.slice(0);
  if (!residual.equals(ZERO_BI)) {
    sorted.sort((a: CorrectionRow, b: CorrectionRow): i32 => {
      if (a.remainder.equals(b.remainder)) {
        return a.index - b.index;
      }
      if (a.remainder.gt(b.remainder)) {
        return -1;
      }
      return 1;
    });

    const maxAlloc = sorted.length;
    let limit = residual.toI32();
    if (limit > maxAlloc) {
      limit = maxAlloc;
    }

    for (let i = 0; i < limit; i++) {
      sorted[i].quotient = sorted[i].quotient.plus(ONE_BI);
    }
  }

  const correctedValues = new Array<BigInt>(size);
  let afterSum = ZERO_BI;
  for (let i = 0; i < sorted.length; i++) {
    const row = sorted[i];
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
    residual
  );
}
