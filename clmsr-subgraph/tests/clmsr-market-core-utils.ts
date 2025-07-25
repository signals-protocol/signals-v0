import { newMockEvent } from "matchstick-as"
import { ethereum, Address, BigInt } from "@graphprotocol/graph-ts"
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
  RangeFactorApplied
} from "../generated/CLMSRMarketCore/CLMSRMarketCore"

export function createEmergencyPausedEvent(
  by: Address,
  reason: string
): EmergencyPaused {
  let emergencyPausedEvent = changetype<EmergencyPaused>(newMockEvent())

  emergencyPausedEvent.parameters = new Array()

  emergencyPausedEvent.parameters.push(
    new ethereum.EventParam("by", ethereum.Value.fromAddress(by))
  )
  emergencyPausedEvent.parameters.push(
    new ethereum.EventParam("reason", ethereum.Value.fromString(reason))
  )

  return emergencyPausedEvent
}

export function createEmergencyUnpausedEvent(by: Address): EmergencyUnpaused {
  let emergencyUnpausedEvent = changetype<EmergencyUnpaused>(newMockEvent())

  emergencyUnpausedEvent.parameters = new Array()

  emergencyUnpausedEvent.parameters.push(
    new ethereum.EventParam("by", ethereum.Value.fromAddress(by))
  )

  return emergencyUnpausedEvent
}

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
  let marketCreatedEvent = changetype<MarketCreated>(newMockEvent())

  marketCreatedEvent.parameters = new Array()

  marketCreatedEvent.parameters.push(
    new ethereum.EventParam(
      "marketId",
      ethereum.Value.fromUnsignedBigInt(marketId)
    )
  )
  marketCreatedEvent.parameters.push(
    new ethereum.EventParam(
      "startTimestamp",
      ethereum.Value.fromUnsignedBigInt(startTimestamp)
    )
  )
  marketCreatedEvent.parameters.push(
    new ethereum.EventParam(
      "endTimestamp",
      ethereum.Value.fromUnsignedBigInt(endTimestamp)
    )
  )
  marketCreatedEvent.parameters.push(
    new ethereum.EventParam(
      "minTick",
      ethereum.Value.fromSignedBigInt(minTick)
    )
  )
  marketCreatedEvent.parameters.push(
    new ethereum.EventParam(
      "maxTick",
      ethereum.Value.fromSignedBigInt(maxTick)
    )
  )
  marketCreatedEvent.parameters.push(
    new ethereum.EventParam(
      "tickSpacing",
      ethereum.Value.fromSignedBigInt(tickSpacing)
    )
  )
  marketCreatedEvent.parameters.push(
    new ethereum.EventParam(
      "numBins",
      ethereum.Value.fromUnsignedBigInt(numBins)
    )
  )
  marketCreatedEvent.parameters.push(
    new ethereum.EventParam(
      "liquidityParameter",
      ethereum.Value.fromUnsignedBigInt(liquidityParameter)
    )
  )

  return marketCreatedEvent
}

export function createMarketSettledEvent(
  marketId: BigInt,
  settlementLowerTick: BigInt,
  settlementUpperTick: BigInt
): MarketSettled {
  let marketSettledEvent = changetype<MarketSettled>(newMockEvent())

  marketSettledEvent.parameters = new Array()

  marketSettledEvent.parameters.push(
    new ethereum.EventParam(
      "marketId",
      ethereum.Value.fromUnsignedBigInt(marketId)
    )
  )
  marketSettledEvent.parameters.push(
    new ethereum.EventParam(
      "settlementLowerTick",
      ethereum.Value.fromUnsignedBigInt(settlementLowerTick)
    )
  )
  marketSettledEvent.parameters.push(
    new ethereum.EventParam(
      "settlementUpperTick",
      ethereum.Value.fromUnsignedBigInt(settlementUpperTick)
    )
  )

  return marketSettledEvent
}

export function createPositionClaimedEvent(
  positionId: BigInt,
  trader: Address,
  payout: BigInt
): PositionClaimed {
  let positionClaimedEvent = changetype<PositionClaimed>(newMockEvent())

  positionClaimedEvent.parameters = new Array()

  positionClaimedEvent.parameters.push(
    new ethereum.EventParam(
      "positionId",
      ethereum.Value.fromUnsignedBigInt(positionId)
    )
  )
  positionClaimedEvent.parameters.push(
    new ethereum.EventParam("trader", ethereum.Value.fromAddress(trader))
  )
  positionClaimedEvent.parameters.push(
    new ethereum.EventParam("payout", ethereum.Value.fromUnsignedBigInt(payout))
  )

  return positionClaimedEvent
}

export function createPositionClosedEvent(
  positionId: BigInt,
  trader: Address,
  proceeds: BigInt
): PositionClosed {
  let positionClosedEvent = changetype<PositionClosed>(newMockEvent())

  positionClosedEvent.parameters = new Array()

  positionClosedEvent.parameters.push(
    new ethereum.EventParam(
      "positionId",
      ethereum.Value.fromUnsignedBigInt(positionId)
    )
  )
  positionClosedEvent.parameters.push(
    new ethereum.EventParam("trader", ethereum.Value.fromAddress(trader))
  )
  positionClosedEvent.parameters.push(
    new ethereum.EventParam(
      "proceeds",
      ethereum.Value.fromUnsignedBigInt(proceeds)
    )
  )

  return positionClosedEvent
}

export function createPositionDecreasedEvent(
  positionId: BigInt,
  trader: Address,
  sellQuantity: BigInt,
  newQuantity: BigInt,
  proceeds: BigInt
): PositionDecreased {
  let positionDecreasedEvent = changetype<PositionDecreased>(newMockEvent())

  positionDecreasedEvent.parameters = new Array()

  positionDecreasedEvent.parameters.push(
    new ethereum.EventParam(
      "positionId",
      ethereum.Value.fromUnsignedBigInt(positionId)
    )
  )
  positionDecreasedEvent.parameters.push(
    new ethereum.EventParam("trader", ethereum.Value.fromAddress(trader))
  )
  positionDecreasedEvent.parameters.push(
    new ethereum.EventParam(
      "sellQuantity",
      ethereum.Value.fromUnsignedBigInt(sellQuantity)
    )
  )
  positionDecreasedEvent.parameters.push(
    new ethereum.EventParam(
      "newQuantity",
      ethereum.Value.fromUnsignedBigInt(newQuantity)
    )
  )
  positionDecreasedEvent.parameters.push(
    new ethereum.EventParam(
      "proceeds",
      ethereum.Value.fromUnsignedBigInt(proceeds)
    )
  )

  return positionDecreasedEvent
}

export function createPositionIncreasedEvent(
  positionId: BigInt,
  trader: Address,
  additionalQuantity: BigInt,
  newQuantity: BigInt,
  cost: BigInt
): PositionIncreased {
  let positionIncreasedEvent = changetype<PositionIncreased>(newMockEvent())

  positionIncreasedEvent.parameters = new Array()

  positionIncreasedEvent.parameters.push(
    new ethereum.EventParam(
      "positionId",
      ethereum.Value.fromUnsignedBigInt(positionId)
    )
  )
  positionIncreasedEvent.parameters.push(
    new ethereum.EventParam("trader", ethereum.Value.fromAddress(trader))
  )
  positionIncreasedEvent.parameters.push(
    new ethereum.EventParam(
      "additionalQuantity",
      ethereum.Value.fromUnsignedBigInt(additionalQuantity)
    )
  )
  positionIncreasedEvent.parameters.push(
    new ethereum.EventParam(
      "newQuantity",
      ethereum.Value.fromUnsignedBigInt(newQuantity)
    )
  )
  positionIncreasedEvent.parameters.push(
    new ethereum.EventParam("cost", ethereum.Value.fromUnsignedBigInt(cost))
  )

  return positionIncreasedEvent
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
  let positionOpenedEvent = changetype<PositionOpened>(newMockEvent())

  positionOpenedEvent.parameters = new Array()

  positionOpenedEvent.parameters.push(
    new ethereum.EventParam(
      "positionId",
      ethereum.Value.fromUnsignedBigInt(positionId)
    )
  )
  positionOpenedEvent.parameters.push(
    new ethereum.EventParam("trader", ethereum.Value.fromAddress(trader))
  )
  positionOpenedEvent.parameters.push(
    new ethereum.EventParam(
      "marketId",
      ethereum.Value.fromUnsignedBigInt(marketId)
    )
  )
  positionOpenedEvent.parameters.push(
    new ethereum.EventParam(
      "lowerTick",
      ethereum.Value.fromUnsignedBigInt(lowerTick)
    )
  )
  positionOpenedEvent.parameters.push(
    new ethereum.EventParam(
      "upperTick",
      ethereum.Value.fromUnsignedBigInt(upperTick)
    )
  )
  positionOpenedEvent.parameters.push(
    new ethereum.EventParam(
      "quantity",
      ethereum.Value.fromUnsignedBigInt(quantity)
    )
  )
  positionOpenedEvent.parameters.push(
    new ethereum.EventParam("cost", ethereum.Value.fromUnsignedBigInt(cost))
  )

  return positionOpenedEvent
}

export function createRangeFactorAppliedEvent(
  marketId: BigInt,
  lo: BigInt,
  hi: BigInt,
  factor: BigInt
): RangeFactorApplied {
  let rangeFactorAppliedEvent = changetype<RangeFactorApplied>(newMockEvent())

  rangeFactorAppliedEvent.parameters = new Array()

  rangeFactorAppliedEvent.parameters.push(
    new ethereum.EventParam(
      "marketId",
      ethereum.Value.fromUnsignedBigInt(marketId)
    )
  )
  rangeFactorAppliedEvent.parameters.push(
    new ethereum.EventParam("lo", ethereum.Value.fromUnsignedBigInt(lo))
  )
  rangeFactorAppliedEvent.parameters.push(
    new ethereum.EventParam("hi", ethereum.Value.fromUnsignedBigInt(hi))
  )
  rangeFactorAppliedEvent.parameters.push(
    new ethereum.EventParam("factor", ethereum.Value.fromUnsignedBigInt(factor))
  )

  return rangeFactorAppliedEvent
}
