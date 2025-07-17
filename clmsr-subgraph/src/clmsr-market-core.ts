import {
  EmergencyPaused as EmergencyPausedEvent,
  EmergencyUnpaused as EmergencyUnpausedEvent,
  MarketCreated as MarketCreatedEvent,
  MarketSettled as MarketSettledEvent,
  PositionClaimed as PositionClaimedEvent,
  PositionClosed as PositionClosedEvent,
  PositionDecreased as PositionDecreasedEvent,
  PositionIncreased as PositionIncreasedEvent,
  PositionOpened as PositionOpenedEvent,
  RangeFactorApplied as RangeFactorAppliedEvent,
} from "../generated/CLMSRMarketCore/CLMSRMarketCore";
import {
  EmergencyPaused,
  EmergencyUnpaused,
  MarketCreated,
  MarketSettled,
  PositionClaimed,
  PositionClosed,
  PositionDecreased,
  PositionIncreased,
  PositionOpened,
  RangeFactorApplied,
  Market,
  TickState,
  TickRange,
} from "../generated/schema";
import { BigDecimal, BigInt } from "@graphprotocol/graph-ts";

export function handleEmergencyPaused(event: EmergencyPausedEvent): void {
  let entity = new EmergencyPaused(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.by = event.params.by;
  entity.reason = event.params.reason;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();
}

export function handleEmergencyUnpaused(event: EmergencyUnpausedEvent): void {
  let entity = new EmergencyUnpaused(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.by = event.params.by;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();
}

export function handleMarketCreated(event: MarketCreatedEvent): void {
  // 이벤트 엔티티 저장
  let entity = new MarketCreated(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.marketId = event.params.marketId;
  entity.startTimestamp = event.params.startTimestamp;
  entity.endTimestamp = event.params.endTimestamp;
  entity.numTicks = event.params.numTicks;
  entity.liquidityParameter = event.params.liquidityParameter;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();

  // 마켓 상태 엔티티 생성
  let market = new Market(event.params.marketId.toString());
  market.marketId = event.params.marketId;
  market.startTimestamp = event.params.startTimestamp;
  market.endTimestamp = event.params.endTimestamp;
  market.numTicks = event.params.numTicks;
  market.liquidityParameter = event.params.liquidityParameter;
  market.isSettled = false;
  market.lastUpdated = event.block.timestamp;
  market.save();

  // 모든 틱의 초기 상태 생성 (factor = 1.0)
  for (let i = 0; i < event.params.numTicks.toI32(); i++) {
    let tickId = event.params.marketId.toString() + "-" + i.toString();
    let tickState = new TickState(tickId);
    tickState.market = market.id;
    tickState.tickNumber = BigInt.fromI32(i);
    tickState.currentFactor = BigDecimal.fromString("1.0");
    tickState.lastUpdated = event.block.timestamp;
    tickState.updateCount = BigInt.fromI32(0);
    tickState.save();
  }
}

export function handleMarketSettled(event: MarketSettledEvent): void {
  // 이벤트 엔티티 저장
  let entity = new MarketSettled(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.marketId = event.params.marketId;
  entity.settlementLowerTick = event.params.settlementLowerTick;
  entity.settlementUpperTick = event.params.settlementUpperTick;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();

  // 마켓 상태 업데이트
  let market = Market.load(event.params.marketId.toString());
  if (market != null) {
    market.isSettled = true;
    market.settlementLowerTick = event.params.settlementLowerTick;
    market.settlementUpperTick = event.params.settlementUpperTick;
    market.lastUpdated = event.block.timestamp;
    market.save();
  }
}

export function handlePositionClaimed(event: PositionClaimedEvent): void {
  let entity = new PositionClaimed(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.positionId = event.params.positionId;
  entity.trader = event.params.trader;
  entity.payout = event.params.payout;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();
}

export function handlePositionClosed(event: PositionClosedEvent): void {
  let entity = new PositionClosed(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.positionId = event.params.positionId;
  entity.trader = event.params.trader;
  entity.proceeds = event.params.proceeds;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();
}

export function handlePositionDecreased(event: PositionDecreasedEvent): void {
  let entity = new PositionDecreased(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.positionId = event.params.positionId;
  entity.trader = event.params.trader;
  entity.sellQuantity = event.params.sellQuantity;
  entity.newQuantity = event.params.newQuantity;
  entity.proceeds = event.params.proceeds;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();
}

export function handlePositionIncreased(event: PositionIncreasedEvent): void {
  let entity = new PositionIncreased(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.positionId = event.params.positionId;
  entity.trader = event.params.trader;
  entity.additionalQuantity = event.params.additionalQuantity;
  entity.newQuantity = event.params.newQuantity;
  entity.cost = event.params.cost;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();
}

export function handlePositionOpened(event: PositionOpenedEvent): void {
  let entity = new PositionOpened(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.positionId = event.params.positionId;
  entity.trader = event.params.trader;
  entity.marketId = event.params.marketId;
  entity.lowerTick = event.params.lowerTick;
  entity.upperTick = event.params.upperTick;
  entity.quantity = event.params.quantity;
  entity.cost = event.params.cost;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();

  // 틱 범위 거래량 업데이트
  let rangeId =
    event.params.marketId.toString() +
    "-" +
    event.params.lowerTick.toString() +
    "-" +
    event.params.upperTick.toString();
  let tickRange = TickRange.load(rangeId);

  if (tickRange != null) {
    // quantity를 6-decimal에서 BigDecimal로 변환
    let quantityDecimal = event.params.quantity
      .toBigDecimal()
      .div(BigDecimal.fromString("1000000"));
    tickRange.totalVolume = tickRange.totalVolume.plus(quantityDecimal);
    tickRange.save();
  }
}

export function handleRangeFactorApplied(event: RangeFactorAppliedEvent): void {
  // 이벤트 엔티티 저장
  let entity = new RangeFactorApplied(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.marketId = event.params.marketId;
  entity.lo = event.params.lo;
  entity.hi = event.params.hi;
  entity.factor = event.params.factor;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();

  // 마켓 상태 업데이트
  let market = Market.load(event.params.marketId.toString());
  if (market != null) {
    market.lastUpdated = event.block.timestamp;
    market.save();
  }

  // Factor를 BigDecimal로 변환 (Wei에서 Ether로)
  let factorDecimal = event.params.factor
    .toBigDecimal()
    .div(BigDecimal.fromString("1000000000000000000"));

  // 1. 개별 틱 상태 업데이트 (세밀한 분석용)
  for (
    let tick = event.params.lo.toI32();
    tick <= event.params.hi.toI32();
    tick++
  ) {
    let tickId = event.params.marketId.toString() + "-" + tick.toString();
    let tickState = TickState.load(tickId);

    if (tickState != null) {
      // 기존 factor에 새 factor를 곱셈 (누적)
      tickState.currentFactor = tickState.currentFactor.times(factorDecimal);
      tickState.lastUpdated = event.block.timestamp;
      tickState.updateCount = tickState.updateCount.plus(BigInt.fromI32(1));
      tickState.save();
    }
  }

  // 2. 틱 범위(구간) 상태 업데이트 (실제 거래 단위)
  let rangeId =
    event.params.marketId.toString() +
    "-" +
    event.params.lo.toString() +
    "-" +
    event.params.hi.toString();
  let tickRange = TickRange.load(rangeId);

  if (tickRange == null) {
    // 새로운 틱 범위 생성
    tickRange = new TickRange(rangeId);
    tickRange.market = event.params.marketId.toString();
    tickRange.lowerTick = event.params.lo;
    tickRange.upperTick = event.params.hi;
    tickRange.currentFactor = BigDecimal.fromString("1.0");
    tickRange.updateCount = BigInt.fromI32(0);
    tickRange.totalVolume = BigDecimal.fromString("0");
  }

  // 기존 factor에 새 factor를 곱셈 (누적)
  tickRange.currentFactor = tickRange.currentFactor.times(factorDecimal);
  tickRange.lastUpdated = event.block.timestamp;
  tickRange.updateCount = tickRange.updateCount.plus(BigInt.fromI32(1));
  tickRange.save();
}
