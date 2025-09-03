import { newMockEvent } from "matchstick-as";
import { ethereum, Address, BigInt, Bytes } from "@graphprotocol/graph-ts";

// Trade ID 중복 방지
let __seq = 0;
export function stamp<T extends ethereum.Event>(evt: T): T {
  __seq += 1;
  evt.logIndex = BigInt.fromI32(__seq as i32);
  // 64자리 hex 생성
  let hex = "0x" + __seq.toString(16).padStart(64, "0");
  evt.transaction.hash = Bytes.fromHexString(hex) as Bytes;
  return evt;
}

// 공통 Mock 설정 헬퍼
function setupMockEvent(event: ethereum.Event): void {
  event.address = Address.fromString(
    "0xA16081F360e3847006dB660bae1c6d1b2e17eC2A"
  );
  event.transaction.from = Address.fromString(
    "0x1234567890123456789012345678901234567890"
  );
  event.transaction.to = Address.fromString(
    "0xA16081F360e3847006dB660bae1c6d1b2e17eC2A"
  );
  event.block.number = BigInt.fromI32(1);
  event.block.timestamp = BigInt.fromI32(1000000);
}
import {
  MarketCreated,
  MarketSettled,
  MarketSettlementValueSubmitted,
  PositionClaimed,
  PositionClosed,
  PositionDecreased,
  PositionIncreased,
  PositionOpened,
  PositionSettled,
  RangeFactorApplied,
} from "../generated/CLMSRMarketCore/CLMSRMarketCore";

export function createMarketCreatedEvent(
  marketId: BigInt,
  startTimestamp: BigInt,
  endTimestamp: BigInt,
  minTick: BigInt,
  maxTick: BigInt,
  tickSpacing: BigInt,
  numBins: BigInt,
  liquidityParameter: BigInt
): MarketCreated {
  let marketCreatedEvent = changetype<MarketCreated>(newMockEvent());

  // 공통 Mock 설정 적용
  setupMockEvent(marketCreatedEvent);
  marketCreatedEvent.transaction.hash = Bytes.fromHexString(
    "0x1234567890123456789012345678901234567890123456789012345678901234"
  );
  marketCreatedEvent.logIndex = BigInt.fromI32(0);

  marketCreatedEvent.parameters = new Array();

  marketCreatedEvent.parameters.push(
    new ethereum.EventParam(
      "marketId",
      ethereum.Value.fromUnsignedBigInt(marketId)
    )
  );
  marketCreatedEvent.parameters.push(
    new ethereum.EventParam(
      "startTimestamp",
      ethereum.Value.fromUnsignedBigInt(startTimestamp)
    )
  );
  marketCreatedEvent.parameters.push(
    new ethereum.EventParam(
      "endTimestamp",
      ethereum.Value.fromUnsignedBigInt(endTimestamp)
    )
  );
  marketCreatedEvent.parameters.push(
    new ethereum.EventParam("minTick", ethereum.Value.fromSignedBigInt(minTick))
  );
  marketCreatedEvent.parameters.push(
    new ethereum.EventParam("maxTick", ethereum.Value.fromSignedBigInt(maxTick))
  );
  marketCreatedEvent.parameters.push(
    new ethereum.EventParam(
      "tickSpacing",
      ethereum.Value.fromSignedBigInt(tickSpacing)
    )
  );
  marketCreatedEvent.parameters.push(
    new ethereum.EventParam(
      "numBins",
      ethereum.Value.fromUnsignedBigInt(numBins)
    )
  );
  marketCreatedEvent.parameters.push(
    new ethereum.EventParam(
      "liquidityParameter",
      ethereum.Value.fromUnsignedBigInt(liquidityParameter)
    )
  );

  return stamp(marketCreatedEvent);
}

export function createMarketSettledEvent(
  marketId: BigInt,
  settlementTick: BigInt
): MarketSettled {
  let marketSettledEvent = changetype<MarketSettled>(newMockEvent());

  // 공통 Mock 설정 적용
  setupMockEvent(marketSettledEvent);
  marketSettledEvent.transaction.hash = Bytes.fromHexString(
    "0x123456789012345678901234567890123456789012345678901234567890123B"
  );
  marketSettledEvent.logIndex = BigInt.fromI32(0);

  marketSettledEvent.parameters = new Array();

  marketSettledEvent.parameters.push(
    new ethereum.EventParam(
      "marketId",
      ethereum.Value.fromUnsignedBigInt(marketId)
    )
  );
  marketSettledEvent.parameters.push(
    new ethereum.EventParam(
      "settlementTick",
      ethereum.Value.fromSignedBigInt(settlementTick)
    )
  );

  return stamp(marketSettledEvent);
}

export function createMarketSettlementValueSubmittedEvent(
  marketId: BigInt,
  settlementValue: BigInt
): MarketSettlementValueSubmitted {
  let marketSettlementValueSubmittedEvent =
    changetype<MarketSettlementValueSubmitted>(newMockEvent());

  // Mock 이벤트 기본값 설정
  marketSettlementValueSubmittedEvent.address = Address.fromString(
    "0xA16081F360e3847006dB660bae1c6d1b2e17eC2A"
  );
  marketSettlementValueSubmittedEvent.transaction.hash = Bytes.fromHexString(
    "0x123456789012345678901234567890123456789012345678901234567890123C"
  );
  marketSettlementValueSubmittedEvent.logIndex = BigInt.fromI32(1);
  marketSettlementValueSubmittedEvent.block.number = BigInt.fromI32(1);
  marketSettlementValueSubmittedEvent.block.timestamp = BigInt.fromI32(1000000);

  marketSettlementValueSubmittedEvent.parameters = new Array();

  marketSettlementValueSubmittedEvent.parameters.push(
    new ethereum.EventParam(
      "marketId",
      ethereum.Value.fromUnsignedBigInt(marketId)
    )
  );
  marketSettlementValueSubmittedEvent.parameters.push(
    new ethereum.EventParam(
      "settlementValue",
      ethereum.Value.fromSignedBigInt(settlementValue)
    )
  );

  return marketSettlementValueSubmittedEvent;
}

export function createPositionClaimedEvent(
  positionId: BigInt,
  trader: Address,
  payout: BigInt
): PositionClaimed {
  let positionClaimedEvent = changetype<PositionClaimed>(newMockEvent());

  positionClaimedEvent.parameters = new Array();

  positionClaimedEvent.parameters.push(
    new ethereum.EventParam(
      "positionId",
      ethereum.Value.fromUnsignedBigInt(positionId)
    )
  );
  positionClaimedEvent.parameters.push(
    new ethereum.EventParam("trader", ethereum.Value.fromAddress(trader))
  );
  positionClaimedEvent.parameters.push(
    new ethereum.EventParam("payout", ethereum.Value.fromUnsignedBigInt(payout))
  );

  return positionClaimedEvent;
}

export function createPositionClosedEvent(
  positionId: BigInt,
  trader: Address,
  proceeds: BigInt
): PositionClosed {
  let positionClosedEvent = changetype<PositionClosed>(newMockEvent());

  // Mock 이벤트 기본값 설정
  positionClosedEvent.address = Address.fromString(
    "0xA16081F360e3847006dB660bae1c6d1b2e17eC2A"
  );
  positionClosedEvent.transaction.hash = Bytes.fromHexString(
    "0x1234567890123456789012345678901234567890123456789012345678901238"
  );
  positionClosedEvent.logIndex = BigInt.fromI32(0);
  positionClosedEvent.block.number = BigInt.fromI32(1);
  positionClosedEvent.block.timestamp = BigInt.fromI32(1000000);

  positionClosedEvent.parameters = new Array();

  positionClosedEvent.parameters.push(
    new ethereum.EventParam(
      "positionId",
      ethereum.Value.fromUnsignedBigInt(positionId)
    )
  );
  positionClosedEvent.parameters.push(
    new ethereum.EventParam("trader", ethereum.Value.fromAddress(trader))
  );
  positionClosedEvent.parameters.push(
    new ethereum.EventParam(
      "proceeds",
      ethereum.Value.fromUnsignedBigInt(proceeds)
    )
  );

  return positionClosedEvent;
}

export function createPositionDecreasedEvent(
  positionId: BigInt,
  trader: Address,
  sellQuantity: BigInt,
  newQuantity: BigInt,
  proceeds: BigInt
): PositionDecreased {
  let positionDecreasedEvent = changetype<PositionDecreased>(newMockEvent());

  // Mock 이벤트 기본값 설정
  positionDecreasedEvent.address = Address.fromString(
    "0xA16081F360e3847006dB660bae1c6d1b2e17eC2A"
  );
  positionDecreasedEvent.transaction.hash = Bytes.fromHexString(
    "0x1234567890123456789012345678901234567890123456789012345678901237"
  );
  positionDecreasedEvent.logIndex = BigInt.fromI32(0);
  positionDecreasedEvent.block.number = BigInt.fromI32(1);
  positionDecreasedEvent.block.timestamp = BigInt.fromI32(1000000);

  positionDecreasedEvent.parameters = new Array();

  positionDecreasedEvent.parameters.push(
    new ethereum.EventParam(
      "positionId",
      ethereum.Value.fromUnsignedBigInt(positionId)
    )
  );
  positionDecreasedEvent.parameters.push(
    new ethereum.EventParam("trader", ethereum.Value.fromAddress(trader))
  );
  positionDecreasedEvent.parameters.push(
    new ethereum.EventParam(
      "sellQuantity",
      ethereum.Value.fromUnsignedBigInt(sellQuantity)
    )
  );
  positionDecreasedEvent.parameters.push(
    new ethereum.EventParam(
      "newQuantity",
      ethereum.Value.fromUnsignedBigInt(newQuantity)
    )
  );
  positionDecreasedEvent.parameters.push(
    new ethereum.EventParam(
      "proceeds",
      ethereum.Value.fromUnsignedBigInt(proceeds)
    )
  );

  return positionDecreasedEvent;
}

export function createPositionIncreasedEvent(
  positionId: BigInt,
  trader: Address,
  additionalQuantity: BigInt,
  newQuantity: BigInt,
  cost: BigInt
): PositionIncreased {
  let positionIncreasedEvent = changetype<PositionIncreased>(newMockEvent());

  // Mock 이벤트 기본값 설정
  positionIncreasedEvent.address = Address.fromString(
    "0xA16081F360e3847006dB660bae1c6d1b2e17eC2A"
  );
  positionIncreasedEvent.transaction.hash = Bytes.fromHexString(
    "0x1234567890123456789012345678901234567890123456789012345678901236"
  );
  positionIncreasedEvent.logIndex = BigInt.fromI32(0);
  positionIncreasedEvent.block.number = BigInt.fromI32(1);
  positionIncreasedEvent.block.timestamp = BigInt.fromI32(1000000);

  positionIncreasedEvent.parameters = new Array();

  positionIncreasedEvent.parameters.push(
    new ethereum.EventParam(
      "positionId",
      ethereum.Value.fromUnsignedBigInt(positionId)
    )
  );
  positionIncreasedEvent.parameters.push(
    new ethereum.EventParam("trader", ethereum.Value.fromAddress(trader))
  );
  positionIncreasedEvent.parameters.push(
    new ethereum.EventParam(
      "additionalQuantity",
      ethereum.Value.fromUnsignedBigInt(additionalQuantity)
    )
  );
  positionIncreasedEvent.parameters.push(
    new ethereum.EventParam(
      "newQuantity",
      ethereum.Value.fromUnsignedBigInt(newQuantity)
    )
  );
  positionIncreasedEvent.parameters.push(
    new ethereum.EventParam("cost", ethereum.Value.fromUnsignedBigInt(cost))
  );

  return positionIncreasedEvent;
}

export function createPositionOpenedEvent(
  positionId: BigInt,
  trader: Address,
  marketId: BigInt,
  lowerTick: BigInt,
  upperTick: BigInt,
  quantity: BigInt,
  cost: BigInt
): PositionOpened {
  let positionOpenedEvent = changetype<PositionOpened>(newMockEvent());

  // Mock 이벤트 기본값 설정
  positionOpenedEvent.address = Address.fromString(
    "0xA16081F360e3847006dB660bae1c6d1b2e17eC2A"
  );
  positionOpenedEvent.transaction.hash = Bytes.fromHexString(
    "0x1234567890123456789012345678901234567890123456789012345678901235"
  );
  positionOpenedEvent.logIndex = BigInt.fromI32(0);
  positionOpenedEvent.block.number = BigInt.fromI32(1);
  positionOpenedEvent.block.timestamp = BigInt.fromI32(1000000);

  positionOpenedEvent.parameters = new Array();

  positionOpenedEvent.parameters.push(
    new ethereum.EventParam(
      "positionId",
      ethereum.Value.fromUnsignedBigInt(positionId)
    )
  );
  positionOpenedEvent.parameters.push(
    new ethereum.EventParam("trader", ethereum.Value.fromAddress(trader))
  );
  positionOpenedEvent.parameters.push(
    new ethereum.EventParam(
      "marketId",
      ethereum.Value.fromUnsignedBigInt(marketId)
    )
  );
  positionOpenedEvent.parameters.push(
    new ethereum.EventParam(
      "lowerTick",
      ethereum.Value.fromUnsignedBigInt(lowerTick)
    )
  );
  positionOpenedEvent.parameters.push(
    new ethereum.EventParam(
      "upperTick",
      ethereum.Value.fromUnsignedBigInt(upperTick)
    )
  );
  positionOpenedEvent.parameters.push(
    new ethereum.EventParam(
      "quantity",
      ethereum.Value.fromUnsignedBigInt(quantity)
    )
  );
  positionOpenedEvent.parameters.push(
    new ethereum.EventParam("cost", ethereum.Value.fromUnsignedBigInt(cost))
  );

  return positionOpenedEvent;
}

export function createRangeFactorAppliedEvent(
  marketId: BigInt,
  lo: BigInt,
  hi: BigInt,
  factor: BigInt
): RangeFactorApplied {
  let rangeFactorAppliedEvent = changetype<RangeFactorApplied>(newMockEvent());

  // Mock 이벤트 기본값 설정
  rangeFactorAppliedEvent.address = Address.fromString(
    "0xA16081F360e3847006dB660bae1c6d1b2e17eC2A"
  );
  rangeFactorAppliedEvent.transaction.hash = Bytes.fromHexString(
    "0x1234567890123456789012345678901234567890123456789012345678901239"
  );
  rangeFactorAppliedEvent.logIndex = BigInt.fromI32(0);
  rangeFactorAppliedEvent.block.number = BigInt.fromI32(1);
  rangeFactorAppliedEvent.block.timestamp = BigInt.fromI32(1000000);

  rangeFactorAppliedEvent.parameters = new Array();

  rangeFactorAppliedEvent.parameters.push(
    new ethereum.EventParam(
      "marketId",
      ethereum.Value.fromUnsignedBigInt(marketId)
    )
  );
  rangeFactorAppliedEvent.parameters.push(
    new ethereum.EventParam("lo", ethereum.Value.fromSignedBigInt(lo))
  );
  rangeFactorAppliedEvent.parameters.push(
    new ethereum.EventParam("hi", ethereum.Value.fromSignedBigInt(hi))
  );
  rangeFactorAppliedEvent.parameters.push(
    new ethereum.EventParam("factor", ethereum.Value.fromUnsignedBigInt(factor))
  );

  return rangeFactorAppliedEvent;
}

export function createPositionSettledEvent(
  positionId: BigInt,
  trader: Address,
  payout: BigInt,
  isWin: boolean
): PositionSettled {
  let positionSettledEvent = changetype<PositionSettled>(newMockEvent());

  // Mock 이벤트 기본값 설정
  positionSettledEvent.address = Address.fromString(
    "0xA16081F360e3847006dB660bae1c6d1b2e17eC2A"
  );
  positionSettledEvent.transaction.hash = Bytes.fromHexString(
    "0x123456789012345678901234567890123456789012345678901234567890123A"
  );
  positionSettledEvent.logIndex = BigInt.fromI32(0);
  positionSettledEvent.block.number = BigInt.fromI32(1);
  positionSettledEvent.block.timestamp = BigInt.fromI32(1000000);

  positionSettledEvent.parameters = new Array();

  positionSettledEvent.parameters.push(
    new ethereum.EventParam(
      "positionId",
      ethereum.Value.fromUnsignedBigInt(positionId)
    )
  );
  positionSettledEvent.parameters.push(
    new ethereum.EventParam("trader", ethereum.Value.fromAddress(trader))
  );
  positionSettledEvent.parameters.push(
    new ethereum.EventParam("payout", ethereum.Value.fromUnsignedBigInt(payout))
  );
  positionSettledEvent.parameters.push(
    new ethereum.EventParam("isWin", ethereum.Value.fromBoolean(isWin))
  );

  return positionSettledEvent;
}
