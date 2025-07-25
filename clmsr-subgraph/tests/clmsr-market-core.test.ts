import {
  assert,
  describe,
  test,
  clearStore,
  beforeAll,
  afterAll,
} from "matchstick-as/assembly/index";
import { Address, BigInt } from "@graphprotocol/graph-ts";
import { MarketDistribution } from "../generated/schema";
import {
  handleMarketCreated,
  handleRangeFactorApplied,
  handlePositionOpened,
  handlePositionDecreased,
  handlePositionIncreased,
  handlePositionClosed,
} from "../src/clmsr-market-core";
import {
  createMarketCreatedEvent,
  createRangeFactorAppliedEvent,
  createPositionOpenedEvent,
  createPositionDecreasedEvent,
  createPositionIncreasedEvent,
  createPositionClosedEvent,
} from "./clmsr-market-core-utils";

// Tests structure (matchstick-as >=0.5.0)
// https://thegraph.com/docs/en/subgraphs/developing/creating/unit-testing-framework/#tests-structure

describe("CLMSR Market Core Tests", () => {
  beforeAll(() => {
    clearStore();
  });

  afterAll(() => {
    clearStore();
  });

  test("Market Creation - BinState and MarketDistribution initialized", () => {
    clearStore(); // 각 테스트마다 초기화

    // 마켓 생성 이벤트 생성
    let marketId = BigInt.fromI32(1);
    let startTimestamp = BigInt.fromI32(1000000);
    let endTimestamp = BigInt.fromI32(2000000);
    let minTick = BigInt.fromI32(100);
    let maxTick = BigInt.fromI32(200);
    let tickSpacing = BigInt.fromI32(10);
    let numBins = BigInt.fromI32(10); // (200-100)/10 = 10 bins
    let liquidityParameter = BigInt.fromString("1000000000000000000"); // 1e18

    let marketCreatedEvent = createMarketCreatedEvent(
      marketId,
      startTimestamp,
      endTimestamp,
      minTick,
      maxTick,
      tickSpacing,
      numBins,
      liquidityParameter
    );

    handleMarketCreated(marketCreatedEvent);

    // Market 엔티티 확인
    assert.entityCount("Market", 1);
    assert.fieldEquals("Market", "1", "marketId", "1");
    assert.fieldEquals("Market", "1", "numBins", "10");

    // BinState 엔티티들 확인 (10개 생성되어야 함)
    assert.entityCount("BinState", 10);

    // 첫 번째 bin 확인
    assert.fieldEquals("BinState", "1-0", "binIndex", "0");
    assert.fieldEquals("BinState", "1-0", "lowerTick", "100");
    assert.fieldEquals("BinState", "1-0", "upperTick", "110");
    assert.fieldEquals("BinState", "1-0", "currentFactor", "1");

    // 마지막 bin 확인
    assert.fieldEquals("BinState", "1-9", "binIndex", "9");
    assert.fieldEquals("BinState", "1-9", "lowerTick", "190");
    assert.fieldEquals("BinState", "1-9", "upperTick", "200");

    // MarketDistribution 엔티티 확인
    assert.entityCount("MarketDistribution", 1);
    assert.fieldEquals("MarketDistribution", "1", "totalBins", "10");
    assert.fieldEquals("MarketDistribution", "1", "totalSum", "10"); // 모든 bin이 1.0이므로 합=10
  });

  test("Range Factor Applied", () => {
    clearStore(); // 스토어 초기화

    // 먼저 마켓 생성
    let marketId = BigInt.fromI32(1);
    let startTimestamp = BigInt.fromI32(1000000);
    let endTimestamp = BigInt.fromI32(2000000);
    let minTick = BigInt.fromI32(100);
    let maxTick = BigInt.fromI32(200);
    let tickSpacing = BigInt.fromI32(10);
    let numBins = BigInt.fromI32(10);
    let liquidityParameter = BigInt.fromString("1000000000000000000");

    let marketCreatedEvent = createMarketCreatedEvent(
      marketId,
      startTimestamp,
      endTimestamp,
      minTick,
      maxTick,
      tickSpacing,
      numBins,
      liquidityParameter
    );
    handleMarketCreated(marketCreatedEvent);

    // RangeFactorApplied 이벤트 생성 (bin 0에만 factor 2.0 적용)
    let lo = BigInt.fromI32(100); // bin 0의 lowerTick
    let hi = BigInt.fromI32(110); // bin 0 범위 끝 (aligned)
    let factor = BigInt.fromString("2000000000000000000"); // 2.0 in WAD

    let rangeFactorEvent = createRangeFactorAppliedEvent(
      marketId,
      lo,
      hi,
      factor
    );
    handleRangeFactorApplied(rangeFactorEvent);

    // 영향받은 bin 확인 (bin 0)
    assert.fieldEquals("BinState", "1-0", "currentFactor", "2"); // 1.0 * 2.0 = 2.0

    // 영향받지 않은 bin 확인 (bin 1)
    assert.fieldEquals("BinState", "1-1", "currentFactor", "1");

    // MarketDistribution 업데이트 확인
    // 총합: bin0(2) + bin1~9(1*9) = 2 + 9 = 11
    assert.fieldEquals("MarketDistribution", "1", "totalSum", "11");
    assert.fieldEquals("MarketDistribution", "1", "maxFactor", "2");
  });

  test("Position Open - User History Test", () => {
    clearStore(); // 스토어 초기화

    // 먼저 마켓 생성
    let marketId = BigInt.fromI32(1);
    let startTimestamp = BigInt.fromI32(1000000);
    let endTimestamp = BigInt.fromI32(2000000);
    let minTick = BigInt.fromI32(100);
    let maxTick = BigInt.fromI32(200);
    let tickSpacing = BigInt.fromI32(10);
    let numBins = BigInt.fromI32(10);
    let liquidityParameter = BigInt.fromString("1000000000000000000");

    let marketCreatedEvent = createMarketCreatedEvent(
      marketId,
      startTimestamp,
      endTimestamp,
      minTick,
      maxTick,
      tickSpacing,
      numBins,
      liquidityParameter
    );
    handleMarketCreated(marketCreatedEvent);

    // 포지션 오픈
    let trader = Address.fromString(
      "0x1234567890123456789012345678901234567890"
    );
    let positionId = BigInt.fromI32(1);
    let lowerTick = BigInt.fromI32(100);
    let upperTick = BigInt.fromI32(110);
    let quantity = BigInt.fromI32(1000000); // 1.0 in 6-decimal
    let cost = BigInt.fromI32(500000); // 0.5 in 6-decimal

    let positionOpenedEvent = createPositionOpenedEvent(
      positionId,
      trader,
      marketId,
      lowerTick,
      upperTick,
      quantity,
      cost
    );
    handlePositionOpened(positionOpenedEvent);

    // 포지션 히스토리 검증 - 엔티티 개수 확인
    assert.entityCount("UserPosition", 1);
    assert.entityCount("Trade", 1);
    assert.entityCount("UserStats", 1);
    assert.entityCount("MarketStats", 1);

    // UserPosition 상세 검증
    assert.fieldEquals("UserPosition", "1", "currentQuantity", "1");
    assert.fieldEquals("UserPosition", "1", "totalCostBasis", "0.5");
    assert.fieldEquals("UserPosition", "1", "isActive", "true");

    // UserStats 검증 - 모든 통계가 업데이트되었는지 확인
    assert.fieldEquals("UserStats", trader.toHexString(), "totalTrades", "1");
    assert.fieldEquals("UserStats", trader.toHexString(), "totalVolume", "1");
    assert.fieldEquals("UserStats", trader.toHexString(), "totalCosts", "0.5");
    assert.fieldEquals(
      "UserStats",
      trader.toHexString(),
      "activePositionsCount",
      "1"
    );

    // MarketStats 검증 - 시장 통계가 업데이트되었는지 확인
    assert.fieldEquals("MarketStats", "1", "totalTrades", "1");
    assert.fieldEquals("MarketStats", "1", "totalVolume", "1");
  });

  test("Position Decrease - Basic Test", () => {
    clearStore(); // 스토어 초기화

    // 1. 마켓 생성
    let marketId = BigInt.fromI32(1);
    let marketCreatedEvent = createMarketCreatedEvent(
      marketId,
      BigInt.fromI32(1000000),
      BigInt.fromI32(2000000),
      BigInt.fromI32(100),
      BigInt.fromI32(200),
      BigInt.fromI32(10),
      BigInt.fromI32(10),
      BigInt.fromString("1000000000000000000")
    );
    handleMarketCreated(marketCreatedEvent);

    // 2. 포지션 오픈
    let trader = Address.fromString(
      "0x1234567890123456789012345678901234567890"
    );
    let positionId = BigInt.fromI32(1);
    let positionOpenedEvent = createPositionOpenedEvent(
      positionId,
      trader,
      marketId,
      BigInt.fromI32(100),
      BigInt.fromI32(110),
      BigInt.fromI32(1000000), // 1.0
      BigInt.fromI32(500000) // 0.5
    );
    // logIndex 설정으로 ID 충돌 방지
    positionOpenedEvent.logIndex = BigInt.fromI32(0);
    handlePositionOpened(positionOpenedEvent);

    // 포지션이 제대로 생성되었는지 확인
    assert.entityCount("UserPosition", 1);
    assert.fieldEquals("UserPosition", "1", "currentQuantity", "1");

    // 3. Position Decrease - 0.6 판매, 0.4 남음
    let positionDecreasedEvent = createPositionDecreasedEvent(
      positionId, // positionId
      trader, // trader
      BigInt.fromI32(600000), // sellQuantity: 0.6
      BigInt.fromI32(400000), // newQuantity: 0.4
      BigInt.fromI32(350000) // proceeds: 0.35
    );
    // logIndex를 다르게 설정하여 Trade ID 충돌 방지
    positionDecreasedEvent.logIndex = BigInt.fromI32(1);

    // Position Decrease 핸들러 실행
    handlePositionDecreased(positionDecreasedEvent);

    // 기본 검증: 엔티티가 여전히 존재하는가?
    assert.entityCount("UserPosition", 1);
    assert.entityCount("Trade", 2); // OPEN + DECREASE
    assert.fieldEquals("UserPosition", "1", "currentQuantity", "0.4"); // 1.0 - 0.6 = 0.4
    assert.fieldEquals("UserPosition", "1", "isActive", "true"); // 아직 활성 (수량 > 0)
  });

  test("Position Increase - Test", () => {
    clearStore(); // 스토어 초기화

    // 1. 마켓 생성
    let marketId = BigInt.fromI32(1);
    let marketCreatedEvent = createMarketCreatedEvent(
      marketId,
      BigInt.fromI32(1000000),
      BigInt.fromI32(2000000),
      BigInt.fromI32(100),
      BigInt.fromI32(200),
      BigInt.fromI32(10),
      BigInt.fromI32(10),
      BigInt.fromString("1000000000000000000")
    );
    handleMarketCreated(marketCreatedEvent);

    // 2. 포지션 오픈
    let trader = Address.fromString(
      "0x1234567890123456789012345678901234567890"
    );
    let positionId = BigInt.fromI32(1);
    let positionOpenedEvent = createPositionOpenedEvent(
      positionId,
      trader,
      marketId,
      BigInt.fromI32(100),
      BigInt.fromI32(110),
      BigInt.fromI32(1000000), // 1.0
      BigInt.fromI32(500000) // 0.5
    );
    positionOpenedEvent.logIndex = BigInt.fromI32(0);
    handlePositionOpened(positionOpenedEvent);

    // 3. Position Increase - 0.5 추가, 1.5로 증가
    let positionIncreasedEvent = createPositionIncreasedEvent(
      positionId, // positionId
      trader, // trader
      BigInt.fromI32(500000), // additionalQuantity: 0.5
      BigInt.fromI32(1500000), // newQuantity: 1.5
      BigInt.fromI32(300000) // cost: 0.3
    );
    positionIncreasedEvent.logIndex = BigInt.fromI32(1);

    // Position Increase 핸들러 실행
    handlePositionIncreased(positionIncreasedEvent);

    // 검증
    assert.entityCount("UserPosition", 1);
    assert.entityCount("Trade", 2); // OPEN + INCREASE
    assert.fieldEquals("UserPosition", "1", "currentQuantity", "1.5"); // 1.0 + 0.5 = 1.5
    assert.fieldEquals("UserPosition", "1", "totalCostBasis", "0.8"); // 0.5 + 0.3 = 0.8
  });

  test("Position Close - Test", () => {
    clearStore(); // 스토어 초기화

    // 1. 마켓 생성
    let marketId = BigInt.fromI32(1);
    let marketCreatedEvent = createMarketCreatedEvent(
      marketId,
      BigInt.fromI32(1000000),
      BigInt.fromI32(2000000),
      BigInt.fromI32(100),
      BigInt.fromI32(200),
      BigInt.fromI32(10),
      BigInt.fromI32(10),
      BigInt.fromString("1000000000000000000")
    );
    handleMarketCreated(marketCreatedEvent);

    // 2. 포지션 오픈
    let trader = Address.fromString(
      "0x1234567890123456789012345678901234567890"
    );
    let positionId = BigInt.fromI32(1);
    let positionOpenedEvent = createPositionOpenedEvent(
      positionId,
      trader,
      marketId,
      BigInt.fromI32(100),
      BigInt.fromI32(110),
      BigInt.fromI32(1000000), // 1.0
      BigInt.fromI32(500000) // 0.5
    );
    positionOpenedEvent.logIndex = BigInt.fromI32(0);
    handlePositionOpened(positionOpenedEvent);

    // 3. Position Close - 전량 매도
    let positionClosedEvent = createPositionClosedEvent(
      positionId, // positionId
      trader, // trader
      BigInt.fromI32(600000) // proceeds: 0.6
    );
    positionClosedEvent.logIndex = BigInt.fromI32(1);

    // Position Close 핸들러 실행
    handlePositionClosed(positionClosedEvent);

    // 검증
    assert.entityCount("UserPosition", 1);
    assert.entityCount("Trade", 2); // OPEN + CLOSE
    assert.fieldEquals("UserPosition", "1", "currentQuantity", "0"); // 전량 매도
    assert.fieldEquals("UserPosition", "1", "isActive", "false"); // 비활성화
  });

  test("Multi-User Cross Position Test", () => {
    clearStore(); // 스토어 초기화

    // 1. 3개 빈 마켓 생성 (100-130, 간격 10)
    let marketId = BigInt.fromI32(1);
    let marketCreatedEvent = createMarketCreatedEvent(
      marketId,
      BigInt.fromI32(1000000),
      BigInt.fromI32(2000000),
      BigInt.fromI32(100),
      BigInt.fromI32(130),
      BigInt.fromI32(10),
      BigInt.fromI32(3), // 3개 빈
      BigInt.fromString("1000000000000000000")
    );
    handleMarketCreated(marketCreatedEvent);

    // 2. 첫 번째 유저 - 전체 범위 포지션 오픈
    let trader1 = Address.fromString(
      "0x1111111111111111111111111111111111111111"
    );
    let positionOpenedEvent1 = createPositionOpenedEvent(
      BigInt.fromI32(1),
      trader1,
      marketId,
      BigInt.fromI32(100), // 전체 범위
      BigInt.fromI32(130),
      BigInt.fromI32(1000000), // 1.0
      BigInt.fromI32(500000) // 0.5
    );
    positionOpenedEvent1.logIndex = BigInt.fromI32(0);
    handlePositionOpened(positionOpenedEvent1);

    // 3. 두 번째 유저 - 부분 범위 포지션 오픈 (같은 틱 범위)
    let trader2 = Address.fromString(
      "0x2222222222222222222222222222222222222222"
    );
    let positionOpenedEvent2 = createPositionOpenedEvent(
      BigInt.fromI32(2),
      trader2,
      marketId,
      BigInt.fromI32(110), // 부분 범위
      BigInt.fromI32(120),
      BigInt.fromI32(500000), // 0.5
      BigInt.fromI32(250000) // 0.25
    );
    positionOpenedEvent2.logIndex = BigInt.fromI32(1);
    handlePositionOpened(positionOpenedEvent2);

    // 검증: 다중 유저 포지션
    assert.entityCount("UserPosition", 2);
    assert.entityCount("UserStats", 2);
    assert.fieldEquals("MarketStats", "1", "totalUsers", "2"); // 두 유저 모두 카운트

    // 검증: bin volume 누적 (bin 1은 두 유저 모두 영향)
    assert.fieldEquals("BinState", "1-1", "totalVolume", "1.5"); // 1.0 + 0.5 = 1.5

    // 검증: 전체 시장 통계
    assert.fieldEquals("MarketStats", "1", "totalVolume", "1.5"); // 1.0 + 0.5
    assert.fieldEquals("MarketStats", "1", "totalTrades", "2");
  });

  test("Factor Update + Position Trading Test", () => {
    clearStore(); // 스토어 초기화

    // 1. 마켓 생성
    let marketId = BigInt.fromI32(1);
    let marketCreatedEvent = createMarketCreatedEvent(
      marketId,
      BigInt.fromI32(1000000),
      BigInt.fromI32(2000000),
      BigInt.fromI32(100),
      BigInt.fromI32(130),
      BigInt.fromI32(10),
      BigInt.fromI32(3),
      BigInt.fromString("1000000000000000000")
    );
    handleMarketCreated(marketCreatedEvent);

    // 2. 초기 포지션 오픈
    let trader = Address.fromString(
      "0x1234567890123456789012345678901234567890"
    );
    let positionOpenedEvent = createPositionOpenedEvent(
      BigInt.fromI32(1),
      trader,
      marketId,
      BigInt.fromI32(110),
      BigInt.fromI32(120),
      BigInt.fromI32(1000000), // 1.0
      BigInt.fromI32(500000) // 0.5
    );
    positionOpenedEvent.logIndex = BigInt.fromI32(0);
    handlePositionOpened(positionOpenedEvent);

    // 3. Factor 업데이트 (bin 1에 2.5배 적용)
    let rangeFactorEvent = createRangeFactorAppliedEvent(
      marketId,
      BigInt.fromI32(110), // bin 1 범위
      BigInt.fromI32(120),
      BigInt.fromString("2500000000000000000") // 2.5x factor
    );
    handleRangeFactorApplied(rangeFactorEvent);

    // 검증: Factor 업데이트
    assert.fieldEquals("BinState", "1-1", "currentFactor", "2.5"); // 1.0 * 2.5 = 2.5
    assert.fieldEquals("MarketDistribution", "1", "totalSum", "4.5"); // bin0(1) + bin1(2.5) + bin2(1) = 4.5

    // 4. Factor 변경 후 추가 거래 (INCREASE)
    let positionIncreasedEvent = createPositionIncreasedEvent(
      BigInt.fromI32(1),
      trader,
      BigInt.fromI32(500000), // 0.5 추가
      BigInt.fromI32(1500000), // 총 1.5
      BigInt.fromI32(300000) // 0.3 비용
    );
    positionIncreasedEvent.logIndex = BigInt.fromI32(1);
    handlePositionIncreased(positionIncreasedEvent);

    // 검증: Factor 변경 후 거래가 정상 처리됨
    assert.fieldEquals("UserPosition", "1", "currentQuantity", "1.5");
    assert.fieldEquals("BinState", "1-1", "totalVolume", "1.5"); // 초기 1.0 + 추가 0.5 = 1.5
    assert.entityCount("Trade", 2); // OPEN + INCREASE

    // 검증: MarketDistribution이 factor 변경 및 거래량 반영
    let distribution = MarketDistribution.load("1");
    assert.assertTrue(distribution != null);
    if (distribution != null) {
      assert.assertTrue(distribution.binVolumes[1] == "1.5"); // bin 1의 volume
      assert.assertTrue(distribution.binFactors[1] == "2.5"); // bin 1의 factor
    }
  });

  // TODO: User Lifecycle Test - Matchstick 프레임워크 호환성 문제로 임시 비활성화
});
