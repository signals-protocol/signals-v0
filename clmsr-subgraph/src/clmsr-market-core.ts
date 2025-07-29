import { BigInt, BigDecimal, Bytes } from "@graphprotocol/graph-ts";
import {
  PositionOpened as PositionOpenedEvent,
  PositionIncreased as PositionIncreasedEvent,
  PositionDecreased as PositionDecreasedEvent,
  PositionClosed as PositionClosedEvent,
  PositionClaimed as PositionClaimedEvent,
  MarketCreated as MarketCreatedEvent,
  MarketSettled as MarketSettledEvent,
  RangeFactorApplied as RangeFactorAppliedEvent,
} from "../generated/CLMSRMarketCore/CLMSRMarketCore";
import {
  PositionOpened,
  PositionIncreased,
  PositionDecreased,
  PositionClosed,
  PositionClaimed,
  MarketCreated,
  MarketSettled,
  RangeFactorApplied,
  Market,
  UserPosition,
  Trade,
  UserStats,
  MarketStats,
  BinState,
  MarketDistribution,
} from "../generated/schema";

// Helper types
class UserStatsResult {
  userStats: UserStats;
  isNew: boolean;

  constructor(userStats: UserStats, isNew: boolean) {
    this.userStats = userStats;
    this.isNew = isNew;
  }
}

function getOrCreateUserStats(userAddress: Bytes): UserStats {
  let userStats = UserStats.load(userAddress);

  if (userStats == null) {
    userStats = new UserStats(userAddress);
    userStats.user = userAddress;
    userStats.totalTrades = BigInt.fromI32(0);
    userStats.totalVolume = BigInt.fromI32(0);
    userStats.totalCosts = BigInt.fromI32(0);
    userStats.totalProceeds = BigInt.fromI32(0);
    userStats.totalRealizedPnL = BigInt.fromI32(0);
    userStats.totalGasFees = BigInt.fromI32(0);
    userStats.netPnL = BigInt.fromI32(0);
    userStats.activePositionsCount = BigInt.fromI32(0);
    userStats.winningTrades = BigInt.fromI32(0);
    userStats.losingTrades = BigInt.fromI32(0);
    userStats.winRate = BigDecimal.fromString("0");
    userStats.avgTradeSize = BigInt.fromI32(0);
    userStats.firstTradeAt = BigInt.fromI32(0);
    userStats.lastTradeAt = BigInt.fromI32(0);
    userStats.save(); // B-1 fix: save new entity immediately
  }

  return userStats;
}

function getOrCreateUserStatsWithFlag(userAddress: Bytes): UserStatsResult {
  let userStats = UserStats.load(userAddress);
  let isNew = false;

  if (userStats == null) {
    userStats = new UserStats(userAddress);
    userStats.user = userAddress;
    userStats.totalTrades = BigInt.fromI32(0);
    userStats.totalVolume = BigInt.fromI32(0);
    userStats.totalCosts = BigInt.fromI32(0);
    userStats.totalProceeds = BigInt.fromI32(0);
    userStats.totalRealizedPnL = BigInt.fromI32(0);
    userStats.totalGasFees = BigInt.fromI32(0);
    userStats.netPnL = BigInt.fromI32(0);
    userStats.activePositionsCount = BigInt.fromI32(0);
    userStats.winningTrades = BigInt.fromI32(0);
    userStats.losingTrades = BigInt.fromI32(0);
    userStats.winRate = BigDecimal.fromString("0");
    userStats.avgTradeSize = BigInt.fromI32(0);
    userStats.firstTradeAt = BigInt.fromI32(0);
    userStats.lastTradeAt = BigInt.fromI32(0);
    userStats.save(); // B-1 fix: save new entity immediately
    isNew = true;
  } else {
    // Update lastTradeAt for existing users
    userStats.lastTradeAt = BigInt.fromI32(0); // Will be set by caller
  }

  return new UserStatsResult(userStats, isNew);
}

function getOrCreateMarketStats(marketId: string): MarketStats {
  let marketStats = MarketStats.load(marketId);

  if (marketStats == null) {
    marketStats = new MarketStats(marketId);
    marketStats.market = marketId;
    marketStats.totalVolume = BigInt.fromI32(0);
    marketStats.totalTrades = BigInt.fromI32(0);
    marketStats.totalFees = BigInt.fromI32(0);
    marketStats.highestPrice = BigInt.fromI32(0);
    marketStats.lowestPrice = BigInt.fromString("999999999999999"); // Very high initial value
    marketStats.currentPrice = BigInt.fromI32(0);
    marketStats.priceChange24h = BigDecimal.fromString("0");
    marketStats.volume24h = BigInt.fromI32(0);
    marketStats.lastUpdated = BigInt.fromI32(0);
    marketStats.save(); // B-1 fix: save new entity immediately
  }

  return marketStats;
}

// Helper function to calculate raw price (cost * 1e6 / quantity)
function calculateRawPrice(cost: BigInt, quantity: BigInt): BigInt {
  if (quantity.equals(BigInt.fromI32(0))) {
    return BigInt.fromI32(0);
  }
  // Calculate price as (cost * 1e6) / quantity to maintain 6 decimal precision
  return cost.times(BigInt.fromString("1000000")).div(quantity);
}

// Helper function to calculate BigDecimal price for display
function calculateDisplayPrice(cost: BigInt, quantity: BigInt): BigDecimal {
  if (quantity.equals(BigInt.fromI32(0))) {
    return BigDecimal.fromString("0");
  }
  let costDecimal = cost.toBigDecimal().div(BigDecimal.fromString("1000000"));
  let quantityDecimal = quantity
    .toBigDecimal()
    .div(BigDecimal.fromString("1000000"));
  return costDecimal.div(quantityDecimal);
}

// Helper function to update bin volumes for given tick range
function updateBinVolumes(
  marketId: BigInt,
  lowerTick: BigInt,
  upperTick: BigInt,
  volume: BigInt
): void {
  let market = Market.load(marketId.toString());
  if (market == null) return;

  // B-6 fix: Convert tick range to bin indices with overflow protection
  let lowerBinBigInt = lowerTick.minus(market.minTick).div(market.tickSpacing);
  let upperBinBigInt = upperTick
    .minus(market.minTick)
    .div(market.tickSpacing)
    .minus(BigInt.fromI32(1));

  // Check for potential overflow before casting to i32
  let maxSafeI32 = BigInt.fromI32(2147483647); // MAX_INT32
  if (lowerBinBigInt.gt(maxSafeI32)) lowerBinBigInt = maxSafeI32;
  if (upperBinBigInt.gt(maxSafeI32)) upperBinBigInt = maxSafeI32;
  if (lowerBinBigInt.lt(BigInt.fromI32(0))) lowerBinBigInt = BigInt.fromI32(0);
  if (upperBinBigInt.lt(BigInt.fromI32(0))) upperBinBigInt = BigInt.fromI32(0);

  let lowerBinIndex = lowerBinBigInt.toI32();
  let upperBinIndex = upperBinBigInt.toI32();

  // Safety check: limit bin index range
  let maxBinIndex = market.numBins.toI32() - 1;
  if (lowerBinIndex < 0) lowerBinIndex = 0;
  if (lowerBinIndex > maxBinIndex) lowerBinIndex = maxBinIndex;
  if (upperBinIndex < 0) upperBinIndex = 0;
  if (upperBinIndex > maxBinIndex) upperBinIndex = maxBinIndex;

  // Update each affected bin's volume
  for (let binIndex = lowerBinIndex; binIndex <= upperBinIndex; binIndex++) {
    let binStateId = marketId.toString() + "-" + binIndex.toString();
    let binState = BinState.load(binStateId);
    if (binState != null) {
      binState.totalVolume = binState.totalVolume.plus(volume);
      binState.save();
    }
  }

  // Update MarketDistribution's binVolumes array
  let distribution = MarketDistribution.load(marketId.toString());
  if (distribution != null) {
    let binVolumes = distribution.binVolumes;
    for (let binIndex = lowerBinIndex; binIndex <= upperBinIndex; binIndex++) {
      if (binIndex >= 0 && binIndex < binVolumes.length) {
        let currentVolume = BigInt.fromString(binVolumes[binIndex]);
        binVolumes[binIndex] = currentVolume.plus(volume).toString();
      }
    }
    distribution.binVolumes = binVolumes;
    distribution.save();
  }
}

// Helper function to check if market is settled
function isMarketSettled(marketId: string): boolean {
  let market = Market.load(marketId);
  return market != null && market.isSettled;
}

// Helper function to determine if position is in winning range (only for settled markets)
function isPositionInWinningRange(
  marketId: string,
  lowerTick: BigInt,
  upperTick: BigInt
): boolean {
  let market = Market.load(marketId);
  if (market == null || !market.isSettled) {
    return false; // Cannot determine win/loss for unsettled markets
  }

  let settlementTick = market.settlementTick!;

  // Position wins if settlement tick is within position range [lowerTick, upperTick)
  return lowerTick.le(settlementTick) && upperTick.gt(settlementTick);
}

// Helper function to update win/loss stats only for settled markets
function updateWinLossStats(
  userStats: UserStats,
  userPosition: UserPosition,
  realizedPnL: BigInt
): void {
  // Only count win/loss for settled markets
  if (!isMarketSettled(userPosition.market)) {
    return; // Skip win/loss calculation for active markets
  }

  // Determine win/loss based on settlement outcome
  let isWinning = isPositionInWinningRange(
    userPosition.market,
    userPosition.lowerTick,
    userPosition.upperTick
  );

  if (isWinning) {
    userStats.winningTrades = userStats.winningTrades.plus(BigInt.fromI32(1));
  } else {
    userStats.losingTrades = userStats.losingTrades.plus(BigInt.fromI32(1));
  }

  // Update win rate
  let totalPnLTrades = userStats.winningTrades.plus(userStats.losingTrades);
  if (totalPnLTrades.gt(BigInt.fromI32(0))) {
    userStats.winRate = userStats.winningTrades
      .toBigDecimal()
      .div(totalPnLTrades.toBigDecimal());
  }
}

export function handleMarketCreated(event: MarketCreatedEvent): void {
  // 이벤트 엔티티 저장
  let entity = new MarketCreated(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.marketId = event.params.marketId;
  entity.minTick = event.params.minTick;
  entity.maxTick = event.params.maxTick;
  entity.tickSpacing = event.params.tickSpacing;
  entity.startTimestamp = event.params.startTimestamp;
  entity.endTimestamp = event.params.endTimestamp;
  entity.numBins = event.params.numBins;
  entity.liquidityParameter = event.params.liquidityParameter;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();

  // 마켓 상태 엔티티 생성
  let market = new Market(event.params.marketId.toString());
  market.marketId = event.params.marketId;
  market.minTick = event.params.minTick;
  market.maxTick = event.params.maxTick;
  market.tickSpacing = event.params.tickSpacing;
  market.startTimestamp = event.params.startTimestamp;
  market.endTimestamp = event.params.endTimestamp;
  market.numBins = event.params.numBins;
  market.liquidityParameter = event.params.liquidityParameter;
  market.isSettled = false;
  market.lastUpdated = event.block.timestamp;
  market.save();

  // 마켓 통계 엔티티 초기화
  let marketStats = getOrCreateMarketStats(event.params.marketId.toString());
  marketStats.lastUpdated = event.block.timestamp;
  marketStats.save();

  // ========================================
  // BIN STATE 초기화 (Segment Tree 기반)
  // ========================================

  let binFactorsWad: Array<string> = [];
  let binVolumes: Array<string> = [];
  let tickRanges: Array<string> = [];

  // 모든 bin 초기화 (0-based 인덱스)
  for (let binIndex = 0; binIndex < event.params.numBins.toI32(); binIndex++) {
    // bin이 커버하는 실제 틱 범위 계산
    let lowerTick = event.params.minTick.plus(
      BigInt.fromI32(binIndex).times(event.params.tickSpacing)
    );
    let upperTick = lowerTick.plus(event.params.tickSpacing);

    // BinState 엔티티 생성
    let binId = event.params.marketId.toString() + "-" + binIndex.toString();
    let binState = new BinState(binId);
    binState.market = market.id;
    binState.binIndex = BigInt.fromI32(binIndex);
    binState.lowerTick = lowerTick;
    binState.upperTick = upperTick;
    binState.currentFactor = BigInt.fromString("1000000000000000000"); // 초기값 1.0 in WAD
    binState.lastUpdated = event.block.timestamp;
    binState.updateCount = BigInt.fromI32(0);
    binState.totalVolume = BigInt.fromI32(0);
    binState.save();

    // 배열 데이터 구성 (WAD 기준)
    binFactorsWad.push("1000000000000000000"); // WAD 형태 그대로
    binVolumes.push("0");
    tickRanges.push(lowerTick.toString() + "-" + upperTick.toString());
  }

  // ========================================
  // MARKET DISTRIBUTION 초기화
  // ========================================

  let distribution = new MarketDistribution(event.params.marketId.toString());
  distribution.market = market.id;
  distribution.totalBins = event.params.numBins;

  // LMSR 계산용 데이터 (WAD 기준 - 초기값: 모든 bin이 1.0 WAD이므로 총합 = numBins * 1e18)
  distribution.totalSum = event.params.numBins.times(
    BigInt.fromString("1000000000000000000")
  );

  // 분포 통계 (초기값 - 모든 bin이 1.0 WAD)
  let wadOne = BigInt.fromString("1000000000000000000");
  distribution.minFactor = wadOne;
  distribution.maxFactor = wadOne;
  distribution.avgFactor = wadOne;
  distribution.totalVolume = BigInt.fromI32(0);

  // 배열 형태 데이터
  distribution.binFactors = binFactorsWad;
  distribution.binVolumes = binVolumes;
  distribution.tickRanges = tickRanges;

  // 메타데이터
  distribution.lastSnapshotAt = event.block.timestamp;
  distribution.distributionHash = "init-" + event.block.timestamp.toString();
  distribution.version = BigInt.fromI32(1);
  distribution.save();
}

export function handleMarketSettled(event: MarketSettledEvent): void {
  // 이벤트 엔티티 저장
  let entity = new MarketSettled(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.marketId = event.params.marketId;
  entity.settlementTick = event.params.settlementTick;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();

  // 마켓 상태 업데이트
  let market = Market.load(event.params.marketId.toString());
  if (market != null) {
    market.isSettled = true;
    market.settlementTick = event.params.settlementTick;
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

  // ========================================
  // PnL TRACKING: FINALIZE USER POSITION WITH CLAIM PAYOUT
  // ========================================

  // Update UserPosition
  let userPosition = UserPosition.load(event.params.positionId.toString());
  if (userPosition != null) {
    let payoutDecimal = event.params.payout
      .toBigDecimal()
      .div(BigDecimal.fromString("1000000"));
    let claimedQuantity = userPosition.currentQuantity;

    // Calculate final realized PnL from claim
    // The realized PnL is the payout minus the total cost basis
    let finalRealizedPnL = event.params.payout.minus(
      userPosition.totalCostBasis
    );

    // Update position data - position is now claimed and closed
    userPosition.currentQuantity = BigInt.fromI32(0);
    userPosition.totalProceeds = userPosition.totalProceeds.plus(
      event.params.payout
    );
    // Set final realized PnL (includes any previous partial realizations)
    userPosition.realizedPnL = finalRealizedPnL;
    userPosition.isActive = false;
    userPosition.lastUpdated = event.block.timestamp;
    userPosition.save();

    // Update user stats active position count
    let userStats = getOrCreateUserStats(event.params.trader);
    if (userStats.activePositionsCount.gt(BigInt.fromI32(0))) {
      userStats.activePositionsCount = userStats.activePositionsCount.minus(
        BigInt.fromI32(1)
      );
    }

    // Create Trade record for claim
    let trade = new Trade(
      event.transaction.hash.concatI32(event.logIndex.toI32())
    );
    trade.userPosition = userPosition.id;
    trade.user = event.params.trader;
    trade.market = userPosition.market;
    trade.positionId = event.params.positionId;
    trade.type = "CLAIM";
    trade.lowerTick = userPosition.lowerTick;
    trade.upperTick = userPosition.upperTick;
    trade.quantity = BigInt.fromI32(0); // No quantity change, just claim
    trade.costOrProceeds = event.params.payout;

    // B-2 fix: Calculate claim price as payout per total quantity bought
    trade.price = userPosition.totalQuantityBought.equals(BigInt.fromI32(0))
      ? BigInt.fromI32(0)
      : event.params.payout
          .times(BigInt.fromString("1000000"))
          .div(userPosition.totalQuantityBought);

    trade.gasUsed = event.receipt ? event.receipt!.gasUsed : BigInt.fromI32(0);
    trade.gasPrice = event.transaction.gasPrice;
    trade.timestamp = event.block.timestamp;
    trade.blockNumber = event.block.number;
    trade.transactionHash = event.transaction.hash;
    trade.save();

    // Update UserStats - claim has no quantity/cost but affects total realized PnL
    userStats.totalRealizedPnL = userStats.totalRealizedPnL.plus(
      userPosition.realizedPnL
    );
    userStats.lastTradeAt = event.block.timestamp;

    // B-5 fix: Calculate avgTradeSize and use proper win/loss tracking
    if (userStats.totalTrades.gt(BigInt.fromI32(0))) {
      userStats.avgTradeSize = userStats.totalVolume.div(userStats.totalTrades);
    }

    // Update win/loss based on market settlement (only for settled markets)
    updateWinLossStats(userStats, userPosition, userPosition.realizedPnL);

    userStats.save();

    // Update MarketStats
    let marketStats = getOrCreateMarketStats(userPosition.market);
    marketStats.lastUpdated = event.block.timestamp;
    marketStats.save();

    // Note: Position claimed - no additional snapshot needed
  }
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

  // ========================================
  // PnL TRACKING: CLOSE USER POSITION & CALCULATE FINAL REALIZED PnL
  // ========================================

  // Update UserPosition
  let userPosition = UserPosition.load(event.params.positionId.toString());
  if (userPosition != null) {
    let proceedsDecimal = event.params.proceeds
      .toBigDecimal()
      .div(BigDecimal.fromString("1000000"));
    let closedQuantity = userPosition.currentQuantity;

    // Simplified calculation - realized PnL = proceeds - cost basis
    let tradeRealizedPnL = event.params.proceeds.minus(
      userPosition.totalCostBasis
    );

    // Update position data - closing entire position
    userPosition.currentQuantity = BigInt.fromI32(0);
    userPosition.totalQuantitySold =
      userPosition.totalQuantitySold.plus(closedQuantity);
    userPosition.totalProceeds = userPosition.totalProceeds.plus(
      event.params.proceeds
    );
    userPosition.realizedPnL = tradeRealizedPnL;
    userPosition.isActive = false;
    userPosition.lastUpdated = event.block.timestamp;
    userPosition.save();

    // Update user stats active position count
    let userStats = getOrCreateUserStats(event.params.trader);
    if (userStats.activePositionsCount.gt(BigInt.fromI32(0))) {
      userStats.activePositionsCount = userStats.activePositionsCount.minus(
        BigInt.fromI32(1)
      );
    }

    // Create Trade record (negative quantity for sell)
    let trade = new Trade(
      event.transaction.hash.concatI32(event.logIndex.toI32())
    );
    trade.userPosition = userPosition.id;
    trade.user = event.params.trader;
    trade.market = userPosition.market;
    trade.positionId = event.params.positionId;
    trade.type = "CLOSE";
    trade.lowerTick = userPosition.lowerTick;
    trade.upperTick = userPosition.upperTick;
    trade.quantity = closedQuantity.times(BigInt.fromI32(-1)); // Negative for sell
    trade.costOrProceeds = event.params.proceeds;

    // B-2 fix: Calculate close price as proceeds per closed quantity
    trade.price = closedQuantity.equals(BigInt.fromI32(0))
      ? BigInt.fromI32(0)
      : event.params.proceeds
          .times(BigInt.fromString("1000000"))
          .div(closedQuantity);

    trade.gasUsed = event.receipt ? event.receipt!.gasUsed : BigInt.fromI32(0);
    trade.gasPrice = event.transaction.gasPrice;
    trade.timestamp = event.block.timestamp;
    trade.blockNumber = event.block.number;
    trade.transactionHash = event.transaction.hash;
    trade.save();

    // Update UserStats - close position
    userStats.totalTrades = userStats.totalTrades.plus(BigInt.fromI32(1));
    userStats.totalVolume = userStats.totalVolume.plus(event.params.proceeds);
    userStats.totalProceeds = userStats.totalProceeds.plus(
      event.params.proceeds
    );
    userStats.totalRealizedPnL = userStats.totalRealizedPnL.plus(
      userPosition.realizedPnL
    );
    userStats.lastTradeAt = event.block.timestamp;

    // B-5 fix: Calculate avgTradeSize and use proper win/loss tracking for close
    if (userStats.totalTrades.gt(BigInt.fromI32(0))) {
      userStats.avgTradeSize = userStats.totalVolume.div(userStats.totalTrades);
    }

    userStats.save();

    // Update MarketStats
    let marketStats = getOrCreateMarketStats(userPosition.market);
    marketStats.totalVolume = marketStats.totalVolume.plus(
      event.params.proceeds
    );
    marketStats.totalTrades = marketStats.totalTrades.plus(BigInt.fromI32(1));
    marketStats.currentPrice = trade.price;
    marketStats.lastUpdated = event.block.timestamp;

    // Update price bounds
    if (trade.price.gt(marketStats.highestPrice)) {
      marketStats.highestPrice = trade.price;
    }
    if (trade.price.lt(marketStats.lowestPrice)) {
      marketStats.lowestPrice = trade.price;
    }

    marketStats.save();

    // Note: Position closed - tracked in UserPosition and Trade entities
  }
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

  // ========================================
  // PnL TRACKING: UPDATE USER POSITION & CALCULATE REALIZED PnL
  // ========================================

  // Update UserPosition
  let userPosition = UserPosition.load(event.params.positionId.toString());
  if (userPosition != null) {
    // Simplified realized PnL calculation (proceeds - cost basis)
    let tradeRealizedPnL = event.params.proceeds.minus(
      userPosition.totalCostBasis
        .times(event.params.sellQuantity)
        .div(userPosition.currentQuantity.plus(event.params.sellQuantity))
    );

    // Update position data
    userPosition.currentQuantity = event.params.newQuantity;
    userPosition.totalQuantitySold = userPosition.totalQuantitySold.plus(
      event.params.sellQuantity
    );
    userPosition.totalProceeds = userPosition.totalProceeds.plus(
      event.params.proceeds
    );
    userPosition.realizedPnL = userPosition.realizedPnL.plus(tradeRealizedPnL);

    // If position is closed completely, mark as inactive and update win/loss
    if (event.params.newQuantity.equals(BigInt.fromI32(0))) {
      userPosition.isActive = false;

      // Update user stats active position count
      let userStats = getOrCreateUserStats(event.params.trader);
      if (userStats.activePositionsCount.gt(BigInt.fromI32(0))) {
        userStats.activePositionsCount = userStats.activePositionsCount.minus(
          BigInt.fromI32(1)
        );
      }

      userStats.save();
    }

    userPosition.lastUpdated = event.block.timestamp;
    userPosition.save();

    // Create Trade record (negative quantity for sell)
    let trade = new Trade(
      event.transaction.hash.concatI32(event.logIndex.toI32())
    );
    trade.userPosition = userPosition.id;
    trade.user = event.params.trader;
    trade.market = userPosition.market;
    trade.positionId = event.params.positionId;
    trade.type = "DECREASE";
    trade.lowerTick = userPosition.lowerTick;
    trade.upperTick = userPosition.upperTick;
    trade.quantity = event.params.sellQuantity.times(BigInt.fromI32(-1)); // Negative for sell
    trade.costOrProceeds = event.params.proceeds;
    trade.price = calculateRawPrice(
      event.params.proceeds,
      event.params.sellQuantity
    );
    trade.gasUsed = event.receipt ? event.receipt!.gasUsed : BigInt.fromI32(0);
    trade.gasPrice = event.transaction.gasPrice;
    trade.timestamp = event.block.timestamp;
    trade.blockNumber = event.block.number;
    trade.transactionHash = event.transaction.hash;
    trade.save();

    // Update bin volumes (매도량도 거래량에 포함)
    updateBinVolumes(
      BigInt.fromString(userPosition.market),
      userPosition.lowerTick,
      userPosition.upperTick,
      event.params.proceeds
    );

    // Update UserStats - decrease position
    let userStats = getOrCreateUserStats(event.params.trader);
    userStats.totalTrades = userStats.totalTrades.plus(BigInt.fromI32(1));
    userStats.totalVolume = userStats.totalVolume.plus(event.params.proceeds);
    userStats.totalProceeds = userStats.totalProceeds.plus(
      event.params.proceeds
    );
    userStats.lastTradeAt = event.block.timestamp;
    userStats.save();

    // Update MarketStats
    let marketStats = getOrCreateMarketStats(userPosition.market);
    // 🚨 FIX: 마켓 볼륨도 실제 거래 금액(매도는 proceeds)으로 계산
    marketStats.totalVolume = marketStats.totalVolume.plus(
      event.params.proceeds
    );
    marketStats.totalTrades = marketStats.totalTrades.plus(BigInt.fromI32(1));
    marketStats.currentPrice = trade.price;
    marketStats.lastUpdated = event.block.timestamp;

    // Update price bounds
    if (trade.price.gt(marketStats.highestPrice)) {
      marketStats.highestPrice = trade.price;
    }
    if (trade.price.lt(marketStats.lowestPrice)) {
      marketStats.lowestPrice = trade.price;
    }

    marketStats.save();
  }
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

  // ========================================
  // PnL TRACKING: UPDATE USER POSITION & CREATE TRADE
  // ========================================

  // Update UserPosition
  let userPosition = UserPosition.load(event.params.positionId.toString());
  if (userPosition != null) {
    let additionalCostDecimal = event.params.cost
      .toBigDecimal()
      .div(BigDecimal.fromString("1000000"));

    // Update cost basis and calculate new average entry price
    userPosition.totalCostBasis = userPosition.totalCostBasis.plus(
      event.params.cost
    );
    userPosition.totalQuantityBought = userPosition.totalQuantityBought.plus(
      event.params.additionalQuantity
    );
    userPosition.currentQuantity = event.params.newQuantity;

    // Simplified average entry price calculation
    if (!userPosition.totalQuantityBought.equals(BigInt.fromI32(0))) {
      userPosition.averageEntryPrice = userPosition.totalCostBasis
        .times(BigInt.fromString("1000000"))
        .div(userPosition.totalQuantityBought);
    }

    userPosition.lastUpdated = event.block.timestamp;
    userPosition.save();

    // Create Trade record
    let trade = new Trade(
      event.transaction.hash.concatI32(event.logIndex.toI32())
    );
    trade.userPosition = userPosition.id;
    trade.user = event.params.trader;
    trade.market = userPosition.market;
    trade.positionId = event.params.positionId;
    trade.type = "INCREASE";
    trade.lowerTick = userPosition.lowerTick;
    trade.upperTick = userPosition.upperTick;
    trade.quantity = event.params.additionalQuantity;
    trade.costOrProceeds = event.params.cost;
    trade.price = calculateRawPrice(
      event.params.cost,
      event.params.additionalQuantity
    );
    trade.gasUsed = event.receipt ? event.receipt!.gasUsed : BigInt.fromI32(0);
    trade.gasPrice = event.transaction.gasPrice;
    trade.timestamp = event.block.timestamp;
    trade.blockNumber = event.block.number;
    trade.transactionHash = event.transaction.hash;
    trade.save();

    // Update bin volumes
    updateBinVolumes(
      BigInt.fromString(userPosition.market),
      userPosition.lowerTick,
      userPosition.upperTick,
      event.params.cost
    );

    // Update UserStats - increase position
    let userStats = getOrCreateUserStats(event.params.trader);
    userStats.totalTrades = userStats.totalTrades.plus(BigInt.fromI32(1));
    userStats.totalVolume = userStats.totalVolume.plus(event.params.cost);
    userStats.totalCosts = userStats.totalCosts.plus(event.params.cost);
    userStats.lastTradeAt = event.block.timestamp;
    userStats.save();

    // Update MarketStats
    let marketStats = getOrCreateMarketStats(userPosition.market);
    marketStats.totalVolume = marketStats.totalVolume.plus(event.params.cost);
    marketStats.totalTrades = marketStats.totalTrades.plus(BigInt.fromI32(1));
    marketStats.currentPrice = trade.price;
    marketStats.lastUpdated = event.block.timestamp;

    // Update price bounds
    if (trade.price.gt(marketStats.highestPrice)) {
      marketStats.highestPrice = trade.price;
    }
    if (trade.price.lt(marketStats.lowestPrice)) {
      marketStats.lowestPrice = trade.price;
    }

    marketStats.save();
  }
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

  // 포지션 거래량은 BinState에서 추적됨 (TickRange 제거)

  // ========================================
  // PnL TRACKING: CREATE USER POSITION & TRADE
  // ========================================

  // Create UserPosition
  let userPosition = new UserPosition(event.params.positionId.toString());
  userPosition.positionId = event.params.positionId;
  userPosition.user = event.params.trader;
  userPosition.stats = event.params.trader; // UserStats 관계 설정
  userPosition.market = event.params.marketId.toString();
  userPosition.lowerTick = event.params.lowerTick;
  userPosition.upperTick = event.params.upperTick;

  // Raw 값 그대로 저장 (quantity/cost는 6 decimals)
  userPosition.currentQuantity = event.params.quantity;
  userPosition.totalCostBasis = event.params.cost;
  userPosition.averageEntryPrice = calculateRawPrice(
    event.params.cost,
    event.params.quantity
  );
  userPosition.totalQuantityBought = event.params.quantity;
  userPosition.totalQuantitySold = BigInt.fromI32(0);
  userPosition.totalProceeds = BigInt.fromI32(0);
  userPosition.realizedPnL = BigInt.fromI32(0);
  userPosition.isActive = true;
  userPosition.createdAt = event.block.timestamp;
  userPosition.lastUpdated = event.block.timestamp;
  userPosition.save();

  // Create Trade record
  let trade = new Trade(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  trade.userPosition = userPosition.id;
  trade.user = event.params.trader;
  trade.market = event.params.marketId.toString();
  trade.positionId = event.params.positionId;
  trade.type = "OPEN";
  trade.lowerTick = event.params.lowerTick;
  trade.upperTick = event.params.upperTick;
  trade.quantity = event.params.quantity; // Raw 값 그대로
  trade.costOrProceeds = event.params.cost; // Raw 값 그대로
  trade.price = userPosition.averageEntryPrice;
  trade.gasUsed = event.receipt ? event.receipt!.gasUsed : BigInt.fromI32(0);
  trade.gasPrice = event.transaction.gasPrice;
  trade.timestamp = event.block.timestamp;
  trade.blockNumber = event.block.number;
  trade.transactionHash = event.transaction.hash;
  trade.save();

  // Update bin volumes with raw quantity
  updateBinVolumes(
    event.params.marketId,
    event.params.lowerTick,
    event.params.upperTick,
    event.params.cost
  );

  // Update UserStats
  let userStatsResult = getOrCreateUserStatsWithFlag(event.params.trader);
  let userStats = userStatsResult.userStats;
  userStats.activePositionsCount = userStats.activePositionsCount.plus(
    BigInt.fromI32(1)
  );
  // Update UserStats - open position
  userStats.totalTrades = userStats.totalTrades.plus(BigInt.fromI32(1));
  // 🚨 FIX: 볼륨은 실제 베팅 금액(cost)으로 계산
  userStats.totalVolume = userStats.totalVolume.plus(event.params.cost);
  userStats.totalCosts = userStats.totalCosts.plus(event.params.cost);
  userStats.lastTradeAt = event.block.timestamp;
  if (userStats.firstTradeAt.equals(BigInt.fromI32(0))) {
    userStats.firstTradeAt = event.block.timestamp;
  }

  // 🚨 FIX: avgTradeSize도 cost 기반으로 계산
  if (userStats.totalTrades.gt(BigInt.fromI32(0))) {
    userStats.avgTradeSize = userStats.totalVolume.div(userStats.totalTrades);
  }

  userStats.save();

  // Update MarketStats
  let marketStats = getOrCreateMarketStats(event.params.marketId.toString());
  // 🚨 FIX: 마켓 볼륨도 실제 베팅 금액(cost)으로 계산
  marketStats.totalVolume = marketStats.totalVolume.plus(event.params.cost);
  marketStats.totalTrades = marketStats.totalTrades.plus(BigInt.fromI32(1));

  // 신규 유저인 경우 totalUsers 증가
  if (userStatsResult.isNew) {
    // Note: totalUsers field removed from schema
  }

  marketStats.currentPrice = userPosition.averageEntryPrice;
  marketStats.lastUpdated = event.block.timestamp;

  // Update price bounds
  if (userPosition.averageEntryPrice.gt(marketStats.highestPrice)) {
    marketStats.highestPrice = userPosition.averageEntryPrice;
  }
  if (userPosition.averageEntryPrice.lt(marketStats.lowestPrice)) {
    marketStats.lowestPrice = userPosition.averageEntryPrice;
  }

  marketStats.save();
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

    // Factor는 이미 WAD 형식이므로 그대로 사용
    let factorWad = event.params.factor;

    // ========================================
    // BIN STATE 업데이트 (틱 범위를 bin 인덱스로 변환)
    // ========================================

    // 틱 범위를 bin 인덱스 범위로 변환
    let lowerBinIndex = event.params.lo
      .minus(market.minTick)
      .div(market.tickSpacing)
      .toI32();
    let upperBinIndex =
      event.params.hi.minus(market.minTick).div(market.tickSpacing).toI32() - 1;

    // 영향받은 bin들의 factor 업데이트
    for (let binIndex = lowerBinIndex; binIndex <= upperBinIndex; binIndex++) {
      let binState = BinState.load(market.id + "-" + binIndex.toString());
      if (binState != null) {
        // WAD * WAD = WAD*2이므로 WAD로 나누어야 함
        binState.currentFactor = binState.currentFactor
          .times(factorWad)
          .div(BigInt.fromString("1000000000000000000"));
        binState.lastUpdated = event.block.timestamp;
        binState.updateCount = binState.updateCount.plus(BigInt.fromI32(1));
        binState.save();
      }
    }

    // ========================================
    // MARKET DISTRIBUTION 재계산 (모든 bin 스캔)
    // ========================================
    let distribution = MarketDistribution.load(market.id);
    if (distribution != null) {
      let totalSumWad = BigInt.fromI32(0);
      let minFactorWad = BigInt.fromString("999999999999999999999999999999"); // 매우 큰 값으로 초기화
      let maxFactorWad = BigInt.fromI32(0);
      let binFactorsWad: Array<string> = [];
      let binVolumes: Array<string> = [];

      // 모든 bin을 순회하여 통계 재계산
      for (let i = 0; i < market.numBins.toI32(); i++) {
        let binState = BinState.load(market.id + "-" + i.toString());
        if (binState != null) {
          totalSumWad = totalSumWad.plus(binState.currentFactor);

          // 통계값 계산
          if (binState.currentFactor.lt(minFactorWad)) {
            minFactorWad = binState.currentFactor;
          }
          if (binState.currentFactor.gt(maxFactorWad)) {
            maxFactorWad = binState.currentFactor;
          }

          // String 배열로 저장
          binFactorsWad.push(binState.currentFactor.toString());
          binVolumes.push(binState.totalVolume.toString());
        }
      }

      // 평균 계산 (WAD 기준)
      let avgFactorWad = totalSumWad.div(market.numBins);

      // 분포 업데이트 (WAD 기준)
      distribution.totalSum = totalSumWad;
      distribution.minFactor = minFactorWad;
      distribution.maxFactor = maxFactorWad;
      distribution.avgFactor = avgFactorWad;
      distribution.binFactors = binFactorsWad;
      distribution.binVolumes = binVolumes;
      distribution.version = distribution.version.plus(BigInt.fromI32(1));
      distribution.lastSnapshotAt = event.block.timestamp;
      distribution.save();
    }
  }
}
