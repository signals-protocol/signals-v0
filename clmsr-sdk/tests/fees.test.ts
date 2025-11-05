import {
  resolveFeePolicyWithMetadata,
  NullFeePolicy,
  encodePercentageFeePolicyDescriptor,
  quoteOpenFee,
  getFeePolicy,
} from "../src/fees";

const zeroContext = (`0x${"00".repeat(32)}`) as const;

const baseOpenArgs = {
  trader: "0xabc",
  marketId: 1n,
  lowerTick: 100000,
  upperTick: 100500,
  quantity6: 1_000_000n,
  cost6: 42_000_000n,
  context: zeroContext,
};

const baseSellArgs = {
  trader: "0xdef",
  marketId: 2n,
  lowerTick: -200,
  upperTick: 100,
  sellQuantity6: 750_000n,
  proceeds6: 10_000_000n,
  context: zeroContext,
};

const percentageDescriptor = JSON.stringify({
  policy: "percentage",
  params: {
    bps: "100", // 1%
    name: "Promo 1%",
  },
});

const nullDescriptor = JSON.stringify({
  policy: "null",
  params: {
    name: "ZeroFee",
  },
});

describe("fees helpers - descriptor based policies", () => {
  test("resolveFeePolicyWithMetadata parses percentage descriptor", () => {
    const { policy } = resolveFeePolicyWithMetadata(percentageDescriptor);
    const fee = policy.quote({
      trader: baseOpenArgs.trader,
      marketId: baseOpenArgs.marketId,
      lowerTick: BigInt(baseOpenArgs.lowerTick),
      upperTick: BigInt(baseOpenArgs.upperTick),
      quantity6: baseOpenArgs.quantity6,
      baseAmount6: baseOpenArgs.cost6,
      side: "BUY",
      context: zeroContext,
    });

    const expectedPct = (baseOpenArgs.cost6 * 100n) / 10_000n;
    expect(fee).toBe(expectedPct);
    expect(policy.name).toBe("Promo 1%");
  });

  test("invalid descriptor throws informative error", () => {
    expect(() => resolveFeePolicyWithMetadata("not-json")).toThrow(
      /Invalid fee policy descriptor/i
    );
    expect(() =>
      resolveFeePolicyWithMetadata(
        JSON.stringify({ policy: "percentage", params: {} })
      )
    ).toThrow(/bps/i);
    expect(() =>
      resolveFeePolicyWithMetadata(JSON.stringify({ policy: "unknown" }))
    ).toThrow(/Unsupported fee policy/i);
  });

  test("NullFeePolicy constant still available", () => {
    expect(NullFeePolicy.quote as any).toBeDefined();
    expect(
      NullFeePolicy.quote({
        trader: baseOpenArgs.trader,
        marketId: baseOpenArgs.marketId,
        lowerTick: BigInt(baseOpenArgs.lowerTick),
        upperTick: BigInt(baseOpenArgs.upperTick),
        quantity6: baseOpenArgs.quantity6,
        baseAmount6: baseOpenArgs.cost6,
        side: "BUY",
        context: zeroContext,
      })
    ).toBe(0n);
  });

  test("encodePercentageFeePolicyDescriptor produces canonical descriptor", () => {
    const descriptor = encodePercentageFeePolicyDescriptor({
      bps: 150n,
      name: "OnePointFive",
    });
    const parsed = JSON.parse(descriptor);
    expect(parsed.policy).toBe("percentage");
    expect(parsed.params.bps).toBe("150");
    expect(parsed.params.name).toBe("OnePointFive");
    const { policy } = resolveFeePolicyWithMetadata(descriptor);
    const fee = policy.quote({
      trader: baseOpenArgs.trader,
      marketId: baseOpenArgs.marketId,
      lowerTick: BigInt(baseOpenArgs.lowerTick),
      upperTick: BigInt(baseOpenArgs.upperTick),
      quantity6: baseOpenArgs.quantity6,
      baseAmount6: baseOpenArgs.cost6,
      side: "BUY",
      context: zeroContext,
    });
    expect(fee).toBe((baseOpenArgs.cost6 * 150n) / 10_000n);
    expect(policy.name).toBe("OnePointFive");
  });
});

describe("fees helpers - 정규화 및 검증", () => {
  test("quoteOpenFee는 trader/market/context 기본값을 보정한다", () => {
    const spyPolicy = {
      quote: jest.fn().mockReturnValue(0n),
      name: "SpyPolicy",
    };

    quoteOpenFee(spyPolicy, {
      trader: "" as any,
      marketId: undefined as any,
      lowerTick: 1n,
      upperTick: 2n,
      quantity6: 1000n,
      cost6: 5000n,
    });

    expect(spyPolicy.quote).toHaveBeenCalledWith(
      expect.objectContaining({
        trader: "0x0000000000000000000000000000000000000000",
        marketId: 0n,
        context: `0x${"00".repeat(32)}`,
      })
    );
  });

  test("getFeePolicy는 Percentage 설정 누락 시 에러를 던진다", () => {
    expect(() => getFeePolicy("Percentage" as const, undefined as any)).toThrow(
      /requires configuration/i
    );
  });

  test("encodePercentageFeePolicyDescriptor는 음수 BPS를 거부한다", () => {
    expect(() =>
      encodePercentageFeePolicyDescriptor({ bps: -1n })
    ).toThrow(/non-negative/i);
  });

  test("getFeePolicy는 Null, Percentage, 알 수 없는 정책을 구분한다", () => {
    expect(getFeePolicy("Null")).toBe(NullFeePolicy);
    const percentage = getFeePolicy("Percentage", { bps: 100n });
    expect(percentage.quote({ baseAmount6: 0n } as any)).toBe(0n);
    expect(() => getFeePolicy("Custom" as any)).toThrow(/Unsupported fee policy/i);
  });

  test("resolveFeePolicyWithMetadata는 이름이 다른 null 정책을 유지한다", () => {
    const descriptor = JSON.stringify({
      policy: "null",
      params: { name: "AltNull" },
    });
    const resolved = resolveFeePolicyWithMetadata(descriptor);
    expect(resolved.policy.name).toBe("AltNull");
    expect(resolved.descriptor?.name).toBe("AltNull");
  });

  test("잘못된 bps 값은 parseBigIntParam을 통해 에러를 던진다", () => {
    const badDescriptor = JSON.stringify({
      policy: "percentage",
      params: { bps: "abc" },
    });
    expect(() => resolveFeePolicyWithMetadata(badDescriptor)).toThrow(/Invalid value/);
  });
});
