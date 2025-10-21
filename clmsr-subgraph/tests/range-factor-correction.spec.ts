import "./_bootstrap";

import { BigInt } from "@graphprotocol/graph-ts";
import { test, assert } from "matchstick-as/assembly/index";

import {
  floorOfSumAfter,
  sumOfFloorsAfter,
  toWadFromInt,
  sumBigIntVector,
} from "./range-factor-helpers";
import { ZERO_BI, WAD_BI, ONE_BI } from "../src/constants";
import { computeRangeFactorCorrection } from "../src/range-factor-correction";
import {
  handleMarketCreated,
  handleRangeFactorApplied,
  buildBinStateId,
} from "../src/clmsr-market-core";
import {
  createMarketCreatedEvent,
  createRangeFactorAppliedEvent,
} from "./clmsr-market-core-utils";
import { BinState } from "../generated/schema";

test("sum-of-floors underestimates floor-of-sum for heterogeneous bins", () => {
  const phiInt = BigInt.fromString("367879441171442322"); // e^-1 rounded up

  const bins = createDiverseBins();

  const sumBefore = sumBigIntVector(bins);
  const targetAfter = floorOfSumAfter(sumBefore, phiInt);
  const grouped = sumOfFloorsAfter(bins, phiInt);

  const diff = targetAfter.minus(grouped.tildeSum);
  const isPositive = diff.gt(ZERO_BI);
  const isLess = grouped.tildeSum.lt(targetAfter);

  assert.stringEquals(
    isPositive ? "1" : "0",
    "1",
    "Expected floor-of-sum - sum-of-floors residual to be positive"
  );
  assert.stringEquals(
    isLess ? "1" : "0",
    "1",
    "Expected per-bin floored sum to remain strictly below contract target"
  );
});

test("global correction aligns sum to contract floor-of-sum exactly", () => {
  const phiInt = BigInt.fromString("367879441171442322");
  const bins = createDiverseBins();

  const correction = computeRangeFactorCorrection(bins, phiInt);
  const sumBefore = sumBigIntVector(bins);
  const targetAfter = floorOfSumAfter(sumBefore, phiInt);
  const naive = sumOfFloorsAfter(bins, phiInt);

  assert.stringEquals(
    correction.targetAfter.toString(),
    targetAfter.toString(),
    "Expected targetAfter to match contract floor-of-sum"
  );
  assert.stringEquals(
    correction.afterSum.toString(),
    targetAfter.toString(),
    "Corrected values must sum to contract floor-of-sum"
  );
  const residualExpected = targetAfter.minus(naive.tildeSum);
  assert.stringEquals(
    correction.residual.toString(),
    residualExpected.toString(),
    "Residual should equal targetAfter - naive sum"
  );
  assert.stringEquals(
    correction.correctedValues.length.toString(),
    bins.length.toString(),
    "Corrected vector length must equal input length"
  );
});

test("handler applying correction matches contract target sum", () => {
  const marketId = BigInt.fromI32(64);
  const startTimestamp = BigInt.fromI32(1000000);
  const endTimestamp = BigInt.fromI32(2000000);
  const minTick = BigInt.fromI32(100);
  const maxTick = BigInt.fromI32(200);
  const tickSpacing = BigInt.fromI32(10);
  const numBins = BigInt.fromI32(10);

  const marketEvent = createMarketCreatedEvent(
    marketId,
    startTimestamp,
    endTimestamp,
    minTick,
    maxTick,
    tickSpacing,
    numBins,
    WAD_BI
  );
  handleMarketCreated(marketEvent);

  const phiInt = BigInt.fromString("367879441171442322");
  const bins = createDiverseBins();
  const sumBefore = sumBigIntVector(bins);
  const targetAfter = floorOfSumAfter(sumBefore, phiInt);

  for (let i = 0; i < bins.length; i++) {
    const binId = buildBinStateId(marketId, i);
    const loaded = BinState.load(binId);
    assert.stringEquals(
      loaded == null ? "1" : "0",
      "0",
      "Expected BinState to exist after market creation"
    );
    if (loaded == null) {
      continue;
    }
    const binState = loaded as BinState;
    binState.currentFactor = bins[i];
    binState.updateCount = ZERO_BI;
    binState.save();
  }

  const rangeEvent = createRangeFactorAppliedEvent(
    marketId,
    minTick,
    maxTick,
    phiInt
  );
  handleRangeFactorApplied(rangeEvent);

  const afterValues = new Array<BigInt>();
  for (let i = 0; i < bins.length; i++) {
    const binId = buildBinStateId(marketId, i);
    const binState = BinState.load(binId);
    assert.stringEquals(
      binState == null ? "1" : "0",
      "0",
      "BinState should persist after handler execution"
    );
    if (binState == null) {
      continue;
    }
    afterValues.push(binState.currentFactor);
    assert.stringEquals(
      binState.updateCount.toString(),
      ONE_BI.toString(),
      "Each bin should record exactly one update"
    );
  }

  const afterSum = sumBigIntVector(afterValues);
  assert.stringEquals(
    afterSum.toString(),
    targetAfter.toString(),
    "Persisted bins must sum to contract floor-of-sum"
  );
});

test("no correction when products align with integer boundaries", () => {
  const phiInt = BigInt.fromString("2000000000000000000"); // 2x factor
  const bins = new Array<BigInt>();
  bins.push(WAD_BI.times(BigInt.fromI32(1)));
  bins.push(WAD_BI.times(BigInt.fromI32(4)));
  bins.push(WAD_BI.times(BigInt.fromI32(7)));

  const correction = computeRangeFactorCorrection(bins, phiInt);
  const naive = sumOfFloorsAfter(bins, phiInt);

  assert.stringEquals(
    correction.residual.toString(),
    ZERO_BI.toString(),
    "Residual should be zero when every product is integer"
  );
  assert.stringEquals(
    correction.afterSum.toString(),
    correction.targetAfter.toString(),
    "After-sum should equal target when residual is zero"
  );

  for (let i = 0; i < bins.length; i++) {
    const expected = bins[i].times(phiInt).div(WAD_BI);
    assert.stringEquals(
      correction.correctedValues[i].toString(),
      expected.toString(),
      "Per-bin result should match exact product for integer case"
    );
    assert.stringEquals(
      correction.correctedValues[i].toString(),
      naive.afters[i].toString(),
      "Naive and corrected paths should match without residual"
    );
  }
});

test("factor one behaves as identity on stored bins", () => {
  const phiInt = WAD_BI;
  const bins = createDiverseBins();
  const correction = computeRangeFactorCorrection(bins, phiInt);

  assert.stringEquals(
    correction.residual.toString(),
    ZERO_BI.toString(),
    "Residual should be zero for identity factor"
  );
  for (let i = 0; i < bins.length; i++) {
    assert.stringEquals(
      correction.correctedValues[i].toString(),
      bins[i].toString(),
      "Identity factor must leave each bin unchanged"
    );
  }
  const sumBefore = sumBigIntVector(bins);
  assert.stringEquals(
    correction.afterSum.toString(),
    sumBefore.toString(),
    "After-sum must equal original sum for identity factor"
  );
});

test("factor zero collapses all values to zero deterministically", () => {
  const phiInt = ZERO_BI;
  const bins = createDiverseBins();
  const correction = computeRangeFactorCorrection(bins, phiInt);

  assert.stringEquals(
    correction.targetAfter.toString(),
    ZERO_BI.toString(),
    "Floor-of-sum should be zero when factor is zero"
  );
  assert.stringEquals(
    correction.afterSum.toString(),
    ZERO_BI.toString(),
    "After-sum must be zero with zero factor"
  );
  for (let i = 0; i < bins.length; i++) {
    assert.stringEquals(
      correction.correctedValues[i].toString(),
      ZERO_BI.toString(),
      "Each bin should collapse to zero under zero factor"
    );
  }
});

test("tie-breaker favours lower indices when remainders match exactly", () => {
  const phiInt = BigInt.fromString("1500000000000000000"); // 1.5x
  const bins = new Array<BigInt>();
  bins.push(WAD_BI);
  bins.push(WAD_BI);

  const correction = computeRangeFactorCorrection(bins, phiInt);
  const expectedFirst = WAD_BI.times(BigInt.fromI32(2));
  const expectedSecond = WAD_BI;

  assert.stringEquals(
    correction.residual.toString(),
    ONE_BI.toString(),
    "Residual should equal one when two identical bins share remainder"
  );
  assert.stringEquals(
    correction.correctedValues[0].toString(),
    expectedFirst.toString(),
    "Lower index bin should absorb the extra unit"
  );
  assert.stringEquals(
    correction.correctedValues[1].toString(),
    expectedSecond.toString(),
    "Second bin should remain at floored value"
  );
  const expectedSum = expectedFirst.plus(expectedSecond);
  assert.stringEquals(
    correction.afterSum.toString(),
    expectedSum.toString(),
    "Corrected sum must equal contract target after tie-break"
  );
});

function createDiverseBins(): Array<BigInt> {
  const bins = new Array<BigInt>();
  bins.push(toWadFromInt(9000000));
  bins.push(toWadFromInt(7000000));
  bins.push(toWadFromInt(5000000));
  bins.push(toWadFromInt(3000000));
  bins.push(toWadFromInt(2000000));
  bins.push(toWadFromInt(900000));
  bins.push(toWadFromInt(700000));
  bins.push(toWadFromInt(500000));
  bins.push(toWadFromInt(300000));
  bins.push(toWadFromInt(200000));
  return bins;
}
