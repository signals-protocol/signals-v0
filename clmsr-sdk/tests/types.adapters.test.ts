import {
  mapMarket,
  mapDistribution,
  MarketRaw,
  MarketDistributionRaw,
} from "../src/types";

describe("type adapters - 선택 필드 처리", () => {
  test("mapMarket는 선택 필드를 생략하면 undefined로 남긴다", () => {
    const raw: MarketRaw = {
      liquidityParameter: "1000000000000000000",
      minTick: 0,
      maxTick: 10,
      tickSpacing: 1,
    };

    const mapped = mapMarket(raw);
    expect("feePolicyDescriptor" in mapped).toBe(false);
    expect("isSettled" in mapped).toBe(false);
  });

  test("mapMarket는 선택 필드를 Big/원시 타입으로 변환한다", () => {
    const raw: MarketRaw = {
      liquidityParameter: "2000000000000000000",
      minTick: 0,
      maxTick: 5,
      tickSpacing: 1,
      feePolicyDescriptor: "descriptor",
      isSettled: true,
      settlementValue: "123456",
      settlementTick: 2,
    };

    const mapped = mapMarket(raw);
    expect(mapped.feePolicyDescriptor).toBe("descriptor");
    expect(mapped.isSettled).toBe(true);
    expect(mapped.settlementValue?.toString()).toBe("123456");
    expect(mapped.settlementTick).toBe(2);
  });

  test("mapDistribution는 선택 필드를 제공할 때 Big으로 변환한다", () => {
    const raw: MarketDistributionRaw = {
      totalSum: "1000000000000000000",
      binFactors: ["1000000000000000000"],
      minFactor: "100000000000000000",
      maxFactor: "2000000000000000000",
      avgFactor: "1500000000000000000",
      totalVolume: "42",
      binVolumes: ["1", "2"],
      tickRanges: ["[0,1)"],
    };

    const mapped = mapDistribution(raw);
    expect(mapped.minFactor?.toString()).toBe("100000000000000000");
    expect(mapped.maxFactor?.toString()).toBe("2000000000000000000");
    expect(mapped.avgFactor?.toString()).toBe("1500000000000000000");
    expect(mapped.totalVolume?.toString()).toBe("42");
    expect(mapped.binVolumes?.map((v) => v.toString())).toEqual(["1", "2"]);
    expect(mapped.tickRanges).toEqual(["[0,1)"]);
  });

  test("mapDistribution는 선택 필드가 없으면 누락된 상태로 유지한다", () => {
    const raw: MarketDistributionRaw = {
      totalSum: "1000000000000000000",
      binFactors: ["1000000000000000000"],
    };

    const mapped = mapDistribution(raw);
    expect("minFactor" in mapped).toBe(false);
    expect("totalVolume" in mapped).toBe(false);
  });
});
