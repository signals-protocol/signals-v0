import "./_bootstrap";

import { BigInt } from "@graphprotocol/graph-ts";
import { test, assert } from "matchstick-as/assembly/index";

import {
  nearestOfSumAfter,
  sumOfNearestAfter,
  toWadFromInt,
  sumBigIntVector,
} from "./range-factor-helpers";
import { one, wad, zero } from "../src/constants";
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

test("sum-of-nearest matches global nearest rounding for heterogeneous bins", () => {
  const phiInt = BigInt.fromString("367879441171442322"); // e^-1 rounded up

  const bins = createDiverseBins();

  const sumBefore = sumBigIntVector(bins);
  const targetAfter = nearestOfSumAfter(sumBefore, phiInt);
  const grouped = sumOfNearestAfter(bins, phiInt);

  assert.stringEquals(
    grouped.tildeSum.toString(),
    targetAfter.toString(),
    "Per-bin nearest rounding should match contract nearest rounding"
  );
});

test("global correction aligns sum to contract nearest rounding exactly", () => {
  const phiInt = BigInt.fromString("367879441171442322");
  const bins = createDiverseBins();

  const correction = computeRangeFactorCorrection(bins, phiInt);
  const sumBefore = sumBigIntVector(bins);
  const targetAfter = nearestOfSumAfter(sumBefore, phiInt);
  const naive = sumOfNearestAfter(bins, phiInt);

  assert.stringEquals(
    correction.targetAfter.toString(),
    targetAfter.toString(),
    "Expected targetAfter to match contract nearest rounding"
  );
  assert.stringEquals(
    correction.afterSum.toString(),
    targetAfter.toString(),
    "Corrected values must sum to contract nearest rounding"
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
    wad()
  );
  handleMarketCreated(marketEvent);

  const phiInt = BigInt.fromString("367879441171442322");
  const bins = createDiverseBins();
  const sumBefore = sumBigIntVector(bins);
  const targetAfter = nearestOfSumAfter(sumBefore, phiInt);

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
    binState.updateCount = zero();
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
      one().toString(),
      "Each bin should record exactly one update"
    );
  }

  const afterSum = sumBigIntVector(afterValues);
  assert.stringEquals(
    afterSum.toString(),
    targetAfter.toString(),
    "Persisted bins must sum to contract nearest rounding"
  );
});

test("no correction when products align with integer boundaries", () => {
  const phiInt = BigInt.fromString("2000000000000000000"); // 2x factor
  const bins = new Array<BigInt>();
  bins.push(wad().times(BigInt.fromI32(1)));
  bins.push(wad().times(BigInt.fromI32(4)));
  bins.push(wad().times(BigInt.fromI32(7)));

  const correction = computeRangeFactorCorrection(bins, phiInt);
  const naive = sumOfNearestAfter(bins, phiInt);

  assert.stringEquals(
    correction.residual.toString(),
    zero().toString(),
    "Residual should be zero when every product is integer"
  );
  assert.stringEquals(
    correction.afterSum.toString(),
    correction.targetAfter.toString(),
    "After-sum should equal target when residual is zero"
  );

  for (let i = 0; i < bins.length; i++) {
    const expected = bins[i].times(phiInt).div(wad());
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
  const phiInt = wad();
  const bins = createDiverseBins();
  const correction = computeRangeFactorCorrection(bins, phiInt);

  assert.stringEquals(
    correction.residual.toString(),
    zero().toString(),
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
  const phiInt = zero();
  const bins = createDiverseBins();
  const correction = computeRangeFactorCorrection(bins, phiInt);

  assert.stringEquals(
    correction.targetAfter.toString(),
    zero().toString(),
    "Nearest rounded sum should be zero when factor is zero"
  );
  assert.stringEquals(
    correction.afterSum.toString(),
    zero().toString(),
    "After-sum must be zero with zero factor"
  );
  for (let i = 0; i < bins.length; i++) {
    assert.stringEquals(
      correction.correctedValues[i].toString(),
      zero().toString(),
      "Each bin should collapse to zero under zero factor"
    );
  }
});

test("bins with remainder >= halfWad round up", () => {
  const phiInt = BigInt.fromString("1500000000000000001");
  const bins = new Array<BigInt>();
  bins.push(BigInt.fromString("333333333333333333"));

  const correction = computeRangeFactorCorrection(bins, phiInt);

  const product = bins[0].times(phiInt);
  const expected = product.plus(halfWad()).div(wad());

  assert.stringEquals(
    correction.correctedValues[0].toString(),
    expected.toString(),
    "Nearest rounding should bump values when remainder >= half"
  );
  assert.stringEquals(
    correction.residual.toString(),
    zero().toString(),
    "Residual should vanish under nearest rounding"
  );
});

test("positive residual distributes to bins with largest remainders", () => {
  const phiInt = BigInt.fromString("1100000000000000000"); // 1.1x factor
  const bins = new Array<BigInt>();
  bins.push(wad());
  bins.push(wad().times(BigInt.fromI32(2)).div(BigInt.fromI32(5))); // 0.4 WAD

  const naive = sumOfNearestAfter(bins, phiInt);
  const correction = computeRangeFactorCorrection(bins, phiInt);

  const residual = correction.targetAfter.minus(naive.tildeSum);
  assert.stringEquals(
    residual.toString(),
    wad().toString(),
    "Residual should equal one WAD for this scenario"
  );

  let increments = 0;
  for (let i = 0; i < correction.correctedValues.length; i++) {
    const diff = correction.correctedValues[i].minus(naive.afters[i]);
    if (diff.equals(wad())) {
      increments++;
    } else {
      assert.stringEquals(
        diff.toString(),
        zero().toString(),
        "Only bins with largest remainder should increase"
      );
    }
  }

  assert.i32Equals(
    increments,
    1,
    "Exactly one bin should absorb the positive residual"
  );
});

test("negative residual subtracts from bins with smallest remainders", () => {
  const phiInt = BigInt.fromString("1100000000000000000"); // 1.1x factor
  const bins = new Array<BigInt>();
  const sixTenths = wad().times(BigInt.fromI32(6)).div(BigInt.fromI32(10)); // 0.6 WAD
  bins.push(sixTenths);
  bins.push(sixTenths);

  const naive = sumOfNearestAfter(bins, phiInt);
  const correction = computeRangeFactorCorrection(bins, phiInt);

  const residual = correction.targetAfter.minus(naive.tildeSum);
  assert.stringEquals(
    residual.toString(),
    wad().times(BigInt.fromI32(-1)).toString(),
    "Residual should equal minus one WAD for this scenario"
  );

  let decrements = 0;
  for (let i = 0; i < correction.correctedValues.length; i++) {
    const diff = correction.correctedValues[i].minus(naive.afters[i]);
    if (diff.equals(wad().times(BigInt.fromI32(-1)))) {
      decrements++;
    } else {
      assert.stringEquals(
        diff.toString(),
        zero().toString(),
        "Only bins with smallest remainder should decrease"
      );
    }
  }

  assert.i32Equals(
    decrements,
    1,
    "Exactly one bin should donate the negative residual"
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
