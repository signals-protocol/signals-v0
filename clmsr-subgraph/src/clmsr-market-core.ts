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
  RangeFactorApplied as RangeFactorAppliedEvent
} from "../generated/CLMSRMarketCore/CLMSRMarketCore"
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
} from "../generated/schema"

export function handleEmergencyPaused(event: EmergencyPausedEvent): void {
  let entity = new EmergencyPaused(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.by = event.params.by
  entity.reason = event.params.reason

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleEmergencyUnpaused(event: EmergencyUnpausedEvent): void {
  let entity = new EmergencyUnpaused(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.by = event.params.by

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleMarketCreated(event: MarketCreatedEvent): void {
  let entity = new MarketCreated(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.marketId = event.params.marketId
  entity.startTimestamp = event.params.startTimestamp
  entity.endTimestamp = event.params.endTimestamp
  entity.numTicks = event.params.numTicks
  entity.liquidityParameter = event.params.liquidityParameter

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleMarketSettled(event: MarketSettledEvent): void {
  let entity = new MarketSettled(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.marketId = event.params.marketId
  entity.settlementLowerTick = event.params.settlementLowerTick
  entity.settlementUpperTick = event.params.settlementUpperTick

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handlePositionClaimed(event: PositionClaimedEvent): void {
  let entity = new PositionClaimed(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.positionId = event.params.positionId
  entity.trader = event.params.trader
  entity.payout = event.params.payout

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handlePositionClosed(event: PositionClosedEvent): void {
  let entity = new PositionClosed(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.positionId = event.params.positionId
  entity.trader = event.params.trader
  entity.proceeds = event.params.proceeds

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handlePositionDecreased(event: PositionDecreasedEvent): void {
  let entity = new PositionDecreased(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.positionId = event.params.positionId
  entity.trader = event.params.trader
  entity.sellQuantity = event.params.sellQuantity
  entity.newQuantity = event.params.newQuantity
  entity.proceeds = event.params.proceeds

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handlePositionIncreased(event: PositionIncreasedEvent): void {
  let entity = new PositionIncreased(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.positionId = event.params.positionId
  entity.trader = event.params.trader
  entity.additionalQuantity = event.params.additionalQuantity
  entity.newQuantity = event.params.newQuantity
  entity.cost = event.params.cost

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handlePositionOpened(event: PositionOpenedEvent): void {
  let entity = new PositionOpened(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.positionId = event.params.positionId
  entity.trader = event.params.trader
  entity.marketId = event.params.marketId
  entity.lowerTick = event.params.lowerTick
  entity.upperTick = event.params.upperTick
  entity.quantity = event.params.quantity
  entity.cost = event.params.cost

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleRangeFactorApplied(event: RangeFactorAppliedEvent): void {
  let entity = new RangeFactorApplied(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.marketId = event.params.marketId
  entity.lo = event.params.lo
  entity.hi = event.params.hi
  entity.factor = event.params.factor

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}
