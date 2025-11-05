import Big from "big.js";
import { CLMSRSDK, createCLMSRSDK } from "../src/clmsr-sdk";
import * as MathUtils from "../src/utils/math";
import {
  Market,
  MarketDistribution,
  FeePolicyKind,
  ValidationError,
  CalculationError,
} from "../src/types";
import * as FeeModule from "../src/fees";

const descriptorPercentage = JSON.stringify({
  policy: "percentage",
  params: { bps: "100" },
});

describe("CLMSR SDK - 검증 경계", () => {
  let sdk: CLMSRSDK;
  let market: Market;
  let distribution: MarketDistribution;

  beforeEach(() => {
    sdk = new CLMSRSDK();
    market = {
      liquidityParameter: MathUtils.toWAD("1"),
      minTick: 0,
      maxTick: 10,
      tickSpacing: 1,
    };
    distribution = {
      totalSum: MathUtils.WAD.mul(10),
      binFactors: Array.from({ length: 10 }, () => MathUtils.WAD),
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  test("calculateOpenCost는 분포 누락 시 ValidationError를 던진다", () => {
    expect(() =>
      sdk.calculateOpenCost(
        0,
        1,
        MathUtils.toMicroUSDC("1"),
        undefined as any,
        market
      )
    ).toThrow(ValidationError);
  });

  test("calculateQuantityFromCost는 영향을 받는 합이 0이면 CalculationError", () => {
    const zeroDistribution: MarketDistribution = {
      totalSum: MathUtils.WAD.mul(10),
      binFactors: Array.from({ length: 10 }, () => new Big(0)),
    };

    expect(() =>
      sdk.calculateQuantityFromCost(
        0,
        1,
        MathUtils.toMicroUSDC("1"),
        zeroDistribution,
        market
      )
    ).toThrow(/affected sum is zero/i);
  });

  test("_assertQuantityWithinLimit은 시장 한도를 초과하면 ValidationError", () => {
    const tinyAlphaMarket: Market = {
      ...market,
      liquidityParameter: MathUtils.toWAD("0.0000001"),
    };

    expect(() =>
      sdk.calculateOpenCost(
        0,
        1,
        MathUtils.toMicroUSDC("1000000000"),
        distribution,
        tinyAlphaMarket
      )
    ).toThrow(/Quantity too large/i);
  });

  test("computeFeeOverlay는 비정수 입력 시 CalculationError를 던진다", () => {
    expect(() =>
      (sdk as any).computeFeeOverlay(
        "BUY",
        new Big("1.23"),
        new Big("0.5"),
        0,
        1,
        descriptorPercentage
      )
    ).toThrow(CalculationError);
  });

  test("computeFeeOverlay는 커스텀 수수료 정책을 Custom으로 분류한다", () => {
    jest
      .spyOn(FeeModule, "resolveFeePolicyWithMetadata")
      .mockReturnValue({
        policy: {
          quote: jest.fn().mockReturnValue(123n),
          name: "CustomPolicy",
        },
      });

    const overlay = (sdk as any).computeFeeOverlay(
      "BUY",
      MathUtils.formatUSDC(new Big(0)),
      MathUtils.formatUSDC(new Big(0)),
      0,
      1,
      descriptorPercentage
    );

    expect(overlay.info.policy).toBe(FeePolicyKind.Custom);
    expect(overlay.amount.toString()).toBe("123");
  });

  test("calculateQuantityFromCost는 검증 단계에서 예외가 발생하면 catch 경로를 사용한다", () => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
    const spy = jest
      .spyOn(sdk, "calculateOpenCost")
      .mockImplementation(() => {
        throw new Error("verification failure");
      });

    const result = sdk.calculateQuantityFromCost(
      0,
      1,
      MathUtils.toMicroUSDC("1"),
      distribution,
      market
    );

    expect(result.actualCost.toString()).toBe(MathUtils.toMicroUSDC("1").toString());
    expect(spy).toHaveBeenCalled();
  });

  test("calculateQuantityFromProceeds는 targetSumAfter < unaffectedSum일 때 ValidationError", () => {
    jest.spyOn(sdk, "calculateDecreaseProceeds").mockReturnValueOnce({
      proceeds: MathUtils.toMicroUSDC("1000"),
      averagePrice: new Big(0),
      feeAmount: MathUtils.formatUSDC(new Big(0)),
      feeRate: new Big(0),
      feeInfo: { policy: FeePolicyKind.Null },
    } as any);
    const unaffected = distribution.totalSum.minus(distribution.binFactors[0]);
    const originalWDiv = MathUtils.wDiv;
    let callCount = 0;
    jest.spyOn(MathUtils, "wDiv").mockImplementation((a: any, b: any) => {
      callCount += 1;
      if (callCount === 1) {
        return unaffected.minus(MathUtils.WAD); // 작게 만들어 lt 트리거
      }
      return originalWDiv(a, b);
    });
    expect(() =>
      sdk.calculateQuantityFromProceeds(
        {
          lowerTick: 0,
          upperTick: 1,
          quantity: MathUtils.toMicroUSDC("10"),
        },
        MathUtils.toMicroUSDC("5"),
        distribution,
        market
      )
    ).toThrow(/selling more than the position holds/i);
  });

  test("calculateQuantityFromProceeds는 requiredAffectedSumAfter <= 0이면 ValidationError", () => {
    jest.spyOn(sdk, "calculateDecreaseProceeds").mockReturnValueOnce({
      proceeds: MathUtils.toMicroUSDC("1000"),
      averagePrice: new Big(0),
      feeAmount: MathUtils.formatUSDC(new Big(0)),
      feeRate: new Big(0),
      feeInfo: { policy: FeePolicyKind.Null },
    } as any);
    const sumBefore = distribution.totalSum;
    const affected = distribution.binFactors[0];
    const unaffected = sumBefore.minus(affected);
    const originalWDiv = MathUtils.wDiv;
    let callCount = 0;
    jest.spyOn(MathUtils, "wDiv").mockImplementation((a: any, b: any) => {
      callCount += 1;
      if (callCount === 1) {
        return unaffected;
      }
      return originalWDiv(a, b);
    });

    expect(() =>
      sdk.calculateQuantityFromProceeds(
        {
          lowerTick: 0,
          upperTick: 1,
          quantity: MathUtils.toMicroUSDC("10"),
        },
        MathUtils.toMicroUSDC("1"),
        distribution,
        market
      )
    ).toThrow(/reduce the affected sum to zero/i);
  });

  test("calculateQuantityFromProceeds는 requiredAffectedSumAfter > affectedSum이면 CalculationError", () => {
    jest.spyOn(sdk, "calculateDecreaseProceeds").mockReturnValueOnce({
      proceeds: MathUtils.toMicroUSDC("1000"),
      averagePrice: new Big(0),
      feeAmount: MathUtils.formatUSDC(new Big(0)),
      feeRate: new Big(0),
      feeInfo: { policy: FeePolicyKind.Null },
    } as any);
    const sumBefore = distribution.totalSum;
    const affected = distribution.binFactors[0];
    const unaffected = sumBefore.minus(affected);
    const originalWDiv = MathUtils.wDiv;
    let callCount = 0;
    jest.spyOn(MathUtils, "wDiv").mockImplementation((a: any, b: any) => {
      callCount += 1;
      if (callCount === 1) {
        return unaffected.plus(affected).plus(MathUtils.WAD);
      }
      return originalWDiv(a, b);
    });
    expect(() =>
      sdk.calculateQuantityFromProceeds(
        {
          lowerTick: 0,
          upperTick: 1,
          quantity: MathUtils.toMicroUSDC("10"),
        },
        MathUtils.toMicroUSDC("1"),
        distribution,
        market
      )
    ).toThrow(/require increasing the affected sum/i);
  });

  test("computeFeeOverlay는 빈 descriptor에서도 Null 정책을 반환한다", () => {
    const overlay = (sdk as any).computeFeeOverlay(
      "BUY",
      MathUtils.formatUSDC(new Big(0)),
      MathUtils.formatUSDC(new Big(0)),
      0,
      1,
      "   "
    );
    expect(overlay.amount.toString()).toBe("0");
    expect(overlay.info.policy).toBe(FeePolicyKind.Null);
  });

  test("computeFeeOverlay는 null descriptor에서 NullFeePolicy 분기를 탄다", () => {
    const descriptor = JSON.stringify({
      policy: "null",
      params: { name: "CustomNull" },
    });
    const overlay = (sdk as any).computeFeeOverlay(
      "BUY",
      MathUtils.formatUSDC(new Big(0)),
      MathUtils.formatUSDC(new Big(0)),
      0,
      1,
      descriptor
    );
    expect(overlay.info.name).toBe("CustomNull");
    expect(overlay.info.policy).toBe(FeePolicyKind.Null);
  });

  test("computeFeeOverlay는 descriptor 문자열이 비어 있으면 zero overlay를 반환한다", () => {
    jest.spyOn(FeeModule, "resolveFeePolicyWithMetadata").mockReturnValue({
      policy: {
        quote: jest.fn().mockReturnValue(0n),
        name: "MockPolicy",
      },
      descriptor: {
        descriptor: "",
        policy: "null",
      } as any,
    });

    const overlay = (sdk as any).computeFeeOverlay(
      "BUY",
      MathUtils.formatUSDC(new Big(0)),
      MathUtils.formatUSDC(new Big(0)),
      0,
      1,
      "stub"
    );

    expect(overlay.amount.toString()).toBe("0");
    expect(overlay.info.policy).toBe(FeePolicyKind.Null);
  });

  test("calculateQuantityFromProceeds는 distribution이 없으면 ValidationError", () => {
    expect(() =>
      sdk.calculateQuantityFromProceeds(
        {
          lowerTick: 0,
          upperTick: 1,
          quantity: MathUtils.toMicroUSDC("1"),
        },
        MathUtils.toMicroUSDC("1"),
        undefined as any,
        market
      )
    ).toThrow(/Distribution data is required/i);
  });

  test("calculateQuantityFromProceeds는 포지션 수량이 0 이하면 ValidationError", () => {
    expect(() =>
      sdk.calculateQuantityFromProceeds(
        {
          lowerTick: 0,
          upperTick: 1,
          quantity: MathUtils.formatUSDC(new Big(0)),
        },
        MathUtils.toMicroUSDC("1"),
        distribution,
        market
      )
    ).toThrow(/Position quantity must be positive/i);
  });

  test("calculateQuantityFromProceeds는 목표 수익이 0 이하면 ValidationError", () => {
    expect(() =>
      sdk.calculateQuantityFromProceeds(
        {
          lowerTick: 0,
          upperTick: 1,
          quantity: MathUtils.toMicroUSDC("1"),
        },
        MathUtils.formatUSDC(new Big(0)),
        distribution,
        market
      )
    ).toThrow(/Target proceeds must be positive/i);
  });

  test("calculateQuantityFromProceeds는 affectedSum이 0이면 CalculationError", () => {
    jest.spyOn(sdk, "calculateDecreaseProceeds").mockReturnValueOnce({
      proceeds: MathUtils.toMicroUSDC("1000"),
      averagePrice: new Big(0),
      feeAmount: MathUtils.formatUSDC(new Big(0)),
      feeRate: new Big(0),
      feeInfo: { policy: FeePolicyKind.Null },
    } as any);

    const zeroDistribution: MarketDistribution = {
      totalSum: MathUtils.WAD.mul(5),
      binFactors: Array.from({ length: 5 }, () => new Big(0)),
    };

    expect(() =>
      sdk.calculateQuantityFromProceeds(
        {
          lowerTick: 0,
          upperTick: 1,
          quantity: MathUtils.toMicroUSDC("10"),
        },
        MathUtils.toMicroUSDC("1"),
        zeroDistribution,
        market
      )
    ).toThrow(/affected sum is zero/i);
  });

  test("calculateQuantityFromProceeds는 inverse factor 범위 검증을 수행한다", () => {
    jest.spyOn(sdk, "calculateDecreaseProceeds").mockReturnValueOnce({
      proceeds: MathUtils.toMicroUSDC("1000"),
      averagePrice: new Big(0),
      feeAmount: MathUtils.formatUSDC(new Big(0)),
      feeRate: new Big(0),
      feeInfo: { policy: FeePolicyKind.Null },
    } as any);

    const originalWDiv = MathUtils.wDiv;
    let callCount = 0;
    jest.spyOn(MathUtils, "wDiv").mockImplementation((a: any, b: any) => {
      callCount += 1;
      if (callCount === 1) {
        const sumBefore = distribution.totalSum;
        const affected = distribution.binFactors[0];
        const unaffected = sumBefore.minus(affected);
        return unaffected.plus(MathUtils.WAD.div(10));
      }
      if (callCount === 2) {
        return new Big(0);
      }
      return originalWDiv(a, b);
    });

    expect(() =>
      sdk.calculateQuantityFromProceeds(
        {
          lowerTick: 0,
          upperTick: 1,
          quantity: MathUtils.toMicroUSDC("10"),
        },
        MathUtils.toMicroUSDC("1"),
        distribution,
        market
      )
    ).toThrow(/Inverse factor out of bounds/i);
  });

  test("calculateQuantityFromProceeds는 formattedQuantity가 기존 수량을 넘으면 클램프한다", () => {
    jest.spyOn(sdk, "calculateDecreaseProceeds").mockReturnValueOnce({
      proceeds: MathUtils.toMicroUSDC("1000"),
      averagePrice: new Big(0),
      feeAmount: MathUtils.formatUSDC(new Big(0)),
      feeRate: new Big(0),
      feeInfo: { policy: FeePolicyKind.Null },
    } as any);

    const originalWDiv = MathUtils.wDiv;
    let wDivCalls = 0;
    jest.spyOn(MathUtils, "wDiv").mockImplementation((a: any, b: any) => {
      wDivCalls += 1;
      if (wDivCalls === 1) {
        const sumBefore = distribution.totalSum;
        const affected = distribution.binFactors[0];
        const unaffected = sumBefore.minus(affected);
        return unaffected.plus(MathUtils.WAD.div(10));
      }
      return originalWDiv(a, b);
    });

    const originalFormatUSDC = MathUtils.formatUSDC;
    let callCount = 0;
    jest.spyOn(MathUtils, "formatUSDC").mockImplementation((value: any) => {
      callCount += 1;
      if (callCount === 1) {
        return MathUtils.toMicroUSDC("1000");
      }
      return originalFormatUSDC(value);
    });

    const result = sdk.calculateQuantityFromProceeds(
      {
        lowerTick: 0,
        upperTick: 1,
        quantity: MathUtils.toMicroUSDC("5"),
      },
      MathUtils.toMicroUSDC("1"),
      distribution,
      market
    );

    expect(result.quantity.toString()).toBe(MathUtils.toMicroUSDC("5").toString());
  });

  test("calculateQuantityFromProceeds는 검증 단계에서 _calcSellProceeds 실패 시 경고를 출력한다", () => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(sdk, "calculateDecreaseProceeds").mockReturnValueOnce({
      proceeds: MathUtils.toMicroUSDC("1000"),
      averagePrice: new Big(0),
      feeAmount: MathUtils.formatUSDC(new Big(0)),
      feeRate: new Big(0),
      feeInfo: { policy: FeePolicyKind.Null },
    } as any);

    const originalWDiv = MathUtils.wDiv;
    let wDivCalls = 0;
    jest.spyOn(MathUtils, "wDiv").mockImplementation((a: any, b: any) => {
      wDivCalls += 1;
      if (wDivCalls === 1) {
        const sumBefore = distribution.totalSum;
        const affected = distribution.binFactors[0];
        const unaffected = sumBefore.minus(affected);
        return unaffected.plus(MathUtils.WAD.div(10));
      }
      return originalWDiv(a, b);
    });

    jest
      .spyOn<any, any>(sdk as any, "_calcSellProceeds")
      .mockImplementation(() => {
        throw new Error("sell fail");
      });

    const result = sdk.calculateQuantityFromProceeds(
      {
        lowerTick: 0,
        upperTick: 1,
        quantity: MathUtils.toMicroUSDC("5"),
      },
      MathUtils.toMicroUSDC("1"),
      distribution,
      market
    );

    expect(result.actualProceeds.toString()).toBe(MathUtils.toMicroUSDC("1").toString());
  });

  test("calculateSellProceeds는 잘못된 매도 수량을 거부한다", () => {
    const position = {
      lowerTick: 0,
      upperTick: 1,
      quantity: MathUtils.toMicroUSDC("5"),
    };

    expect(() =>
      sdk.calculateSellProceeds(
        position,
        MathUtils.formatUSDC(new Big(0)),
        distribution,
        market
      )
    ).toThrow(/Sell quantity must be positive/i);

    expect(() =>
      sdk.calculateSellProceeds(
        position,
        MathUtils.toMicroUSDC("10"),
        distribution,
        market
      )
    ).toThrow(/Cannot sell more than current position/i);
  });

  test("validateTickRange는 경계 조건마다 ValidationError를 던진다", () => {
    const validator = (sdk as any).validateTickRange.bind(sdk);
    expect(() => validator(1, 1, market)).toThrow(/Lower tick must be less than upper tick/i);
    expect(() => validator(-1, 1, market)).toThrow(/out of market bounds/i);
    expect(() => validator(0, 11, market)).toThrow(/out of market bounds/i);

    const misalignedMarket = { ...market, minTick: 0, tickSpacing: 2 };
    expect(() => validator(1, 4, misalignedMarket)).toThrow(/Lower tick is not aligned/i);
    expect(() => validator(0, 3, misalignedMarket)).toThrow(/Upper tick is not aligned/i);
  });

  test("getAffectedSum는 입력 검증을 수행한다", () => {
    const getter = (sdk as any).getAffectedSum.bind(sdk);
    expect(() => getter(0, 1, undefined, market)).toThrow(/Distribution data is required/i);
    expect(() =>
      getter(
        0,
        1,
        { totalSum: MathUtils.WAD, binFactors: undefined } as any,
        market
      )
    ).toThrow(/binFactors is required/i);
    expect(() =>
      getter(0, 1, { totalSum: MathUtils.WAD, binFactors: {} as any }, market)
    ).toThrow(/binFactors must be an array/i);
  });

  test("createCLMSRSDK는 새로운 인스턴스를 생성한다", () => {
    const instance = createCLMSRSDK();
    expect(instance).toBeInstanceOf(CLMSRSDK);
  });
});
