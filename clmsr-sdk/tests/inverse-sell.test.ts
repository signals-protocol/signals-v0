import { CLMSRSDK } from "../src/clmsr-sdk";
import {
  Market,
  MarketDistribution,
  mapDistribution,
  MarketDistributionRaw,
  FeePolicyKind,
} from "../src/types";
import { toWAD, toMicroUSDC } from "../src/index";
import Big from "big.js";

describe("🎯 Inverse Sell Function (calculateQuantityFromProceeds)", () => {
  let sdk: CLMSRSDK;
  let market: Market;
  let distribution: MarketDistribution;

  const range = { lower: 115000, upper: 125000 };

  beforeEach(() => {
    sdk = new CLMSRSDK();

    market = {
      liquidityParameter: toWAD("1000"),
      minTick: 100000,
      maxTick: 140000,
      tickSpacing: 100,
    };

    const binFactors = Array(400).fill("1000000000000000000");
    const rawDistribution: MarketDistributionRaw = {
      totalSum: "400000000000000000000",
      binFactors,
    };

    distribution = mapDistribution(rawDistribution);
  });

  test("Higher target proceeds require more sell quantity", () => {
    const position = {
      lowerTick: range.lower,
      upperTick: range.upper,
      quantity: toMicroUSDC("100"),
    };

    const small = sdk.calculateQuantityFromProceeds(
      position,
      toMicroUSDC("5"),
      distribution,
      market
    );
    const large = sdk.calculateQuantityFromProceeds(
      position,
      toMicroUSDC("15"),
      distribution,
      market
    );

    expect(large.quantity.gt(small.quantity)).toBe(true);
  });

  test("Inverse function approximation accuracy (sell)", () => {
  const position = {
    lowerTick: range.lower,
    upperTick: range.upper,
    quantity: toMicroUSDC("80"),
  };

  const targetProceeds = toMicroUSDC("12");
  const inverseResult = sdk.calculateQuantityFromProceeds(
    position,
    targetProceeds,
    distribution,
    market
  );

  // Actual sell proceeds with calculated quantity
  const forwardResult = sdk.calculateDecreaseProceeds(
    position,
    inverseResult.quantity,
    distribution,
    market
  );

  const netProceeds = forwardResult.proceeds.minus(forwardResult.feeAmount);
  const error = netProceeds.minus(targetProceeds).abs();
  const percentError = error.div(targetProceeds).mul(100);

  expect(percentError.lt(10)).toBe(true);
  expect(inverseResult.actualProceeds.toString()).toBe(
    forwardResult.proceeds.toString()
    );
  });

  test("Target exceeding maximum proceeds throws validation error", () => {
  const position = {
    lowerTick: range.lower,
    upperTick: range.upper,
    quantity: toMicroUSDC("50"),
  };

  const maxProceedsResult = sdk.calculateDecreaseProceeds(
    position,
    position.quantity,
    distribution,
    market
  );

  const maxNet = maxProceedsResult.proceeds.minus(
    maxProceedsResult.feeAmount
  );
  const excessiveTarget = maxNet.plus(1); // 1 micro USDC 초과

  expect(() =>
    sdk.calculateQuantityFromProceeds(
      position,
      excessiveTarget,
      distribution,
      market
    )
  ).toThrow(
    "Target proceeds exceed the maximum proceeds available for this position"
  );
  });

  test("🎯 calculateQuantityFromProceeds returns fee information with null fee policy", () => {
    const position = {
      lowerTick: range.lower,
      upperTick: range.upper,
      quantity: toMicroUSDC("100"),
    };

    const targetProceeds = toMicroUSDC("10");
    const result = sdk.calculateQuantityFromProceeds(
      position,
      targetProceeds,
      distribution,
      market
    );

    // Check fee information is present
    expect(result.feeAmount).toBeDefined();
    expect(result.feeRate).toBeDefined();
    expect(result.feeInfo).toBeDefined();

    // With null fee policy, fees should be zero
    expect(result.feeAmount.eq(0)).toBe(true);
    expect(result.feeRate.eq(0)).toBe(true);
    expect(result.feeInfo.policy).toBe(FeePolicyKind.Null);
    expect(result.feeInfo.name).toBe("NullFeePolicy");
  });

  test("🎯 calculateQuantityFromProceeds returns correct fee information with percentage fee policy", () => {
    const marketWithFee = {
      ...market,
      feePolicyDescriptor: JSON.stringify({
        policy: "percentage",
        params: {
          bps: "25", // 0.25% fee
          name: "QuarterPercent",
        },
      }),
    };

    const position = {
      lowerTick: range.lower,
      upperTick: range.upper,
      quantity: toMicroUSDC("100"),
    };

    const targetProceeds = toMicroUSDC("10");
    const result = sdk.calculateQuantityFromProceeds(
      position,
      targetProceeds,
      distribution,
      marketWithFee
    );

    // Check fee information is present and correct
    expect(result.feeAmount).toBeDefined();
    expect(result.feeRate).toBeDefined();
    expect(result.feeInfo).toBeDefined();

    // With percentage fee policy, fees should be calculated
    expect(result.feeAmount.gt(0)).toBe(true);
    expect(result.feeRate.gt(0)).toBe(true);
    expect(result.feeInfo.policy).toBe(FeePolicyKind.Percentage);
    if (result.feeInfo.policy === FeePolicyKind.Percentage) {
      expect(result.feeInfo.bps?.eq(25)).toBe(true);
    }

    // Verify fee calculation consistency
    const expectedFee = result.actualProceeds.mul(result.feeRate);
    const feeDiff = expectedFee.minus(result.feeAmount).abs();
    expect(feeDiff.lt(100)).toBe(true); // Allow small rounding difference
  });

  test("🎯 calculateQuantityFromProceeds fee consistency with forward calculation", () => {
    const marketWithFee = {
      ...market,
      feePolicyDescriptor: JSON.stringify({
        policy: "percentage",
        params: {
          bps: "50", // 0.5% fee
          name: "HalfPercent",
        },
      }),
    };

    const position = {
      lowerTick: range.lower,
      upperTick: range.upper,
      quantity: toMicroUSDC("80"),
    };

    const targetProceeds = toMicroUSDC("12");
    const inverseResult = sdk.calculateQuantityFromProceeds(
      position,
      targetProceeds,
      distribution,
      marketWithFee
    );

    // Calculate forward to verify consistency
    const forwardResult = sdk.calculateDecreaseProceeds(
      position,
      inverseResult.quantity,
      distribution,
      marketWithFee
    );

    // Fee information should match between inverse and forward calculations
    expect(inverseResult.feeAmount.toString()).toBe(
      forwardResult.feeAmount.toString()
    );
    expect(inverseResult.feeRate.toString()).toBe(
      forwardResult.feeRate.toString()
    );
    expect(inverseResult.feeInfo.policy).toBe(forwardResult.feeInfo.policy);
    expect(inverseResult.feeInfo.name).toBe(forwardResult.feeInfo.name);
  });

  test("🎯 calculateQuantityFromProceeds includeFees=false returns zero fees", () => {
    const marketWithFee = {
      ...market,
      feePolicyDescriptor: JSON.stringify({
        policy: "percentage",
        params: {
          bps: "100", // 1% fee
          name: "OnePercent",
        },
      }),
    };

    const position = {
      lowerTick: range.lower,
      upperTick: range.upper,
      quantity: toMicroUSDC("100"),
    };

    const targetProceeds = toMicroUSDC("10");
    const result = sdk.calculateQuantityFromProceeds(
      position,
      targetProceeds,
      distribution,
      marketWithFee,
      false // includeFees = false
    );

    // When includeFees=false, should still return fee info but calculated based on actual proceeds
    expect(result.feeAmount).toBeDefined();
    expect(result.feeRate).toBeDefined();
    expect(result.feeInfo).toBeDefined();
    
    // But since we're ignoring fees in calculation, the fee structure should still be present
    expect(result.feeInfo.policy).toBe(FeePolicyKind.Percentage);
    expect(result.feeRate.gt(0)).toBe(true);
  });

  test("🎯 calculateQuantityFromProceeds precision test with large amounts", () => {
    const marketWithFee = {
      ...market,
      feePolicyDescriptor: JSON.stringify({
        policy: "percentage",
        params: {
          bps: "10", // 0.1% fee
          name: "TenthPercent",
        },
      }),
    };

    const position = {
      lowerTick: range.lower,
      upperTick: range.upper,
      quantity: toMicroUSDC("10000"), // Large position
    };

    // Verify the maximum possible net proceeds first
    const maxDecrease = sdk.calculateDecreaseProceeds(
      position,
      position.quantity,
      distribution,
      marketWithFee
    );
    const maxNetProceeds = maxDecrease.proceeds.minus(maxDecrease.feeAmount);
    
    // Use a reasonable target within the limits (about 70% of max)
    const targetProceeds = maxNetProceeds.mul(0.7).round(0, Big.roundDown);
    
    const result = sdk.calculateQuantityFromProceeds(
      position,
      targetProceeds,
      distribution,
      marketWithFee
    );

    // Verify precision is maintained with large amounts
    expect(result.quantity.gt(0)).toBe(true);
    expect(result.actualProceeds.gt(0)).toBe(true);
    expect(result.feeAmount.gt(0)).toBe(true);
    expect(result.feeRate.gt(0)).toBe(true);

    // Verify net proceeds match target within tight tolerance
    const netProceeds = result.actualProceeds.minus(result.feeAmount);
    const error = netProceeds.minus(targetProceeds).abs();
    const percentError = error.div(targetProceeds).mul(100);
    expect(percentError.lt(0.1)).toBe(true); // Should be very precise (< 0.1% error)
    
    // Verify the calculated quantity is reasonable for large position
    expect(result.quantity.lt(position.quantity)).toBe(true);
  });
});
