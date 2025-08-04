import { BigInt, BigDecimal, Bytes } from "@graphprotocol/graph-ts";
import {
  PositionOpened as PositionOpenedEvent,
  PositionIncreased as PositionIncreasedEvent,
  PositionDecreased as PositionDecreasedEvent,
  PositionClosed as PositionClosedEvent,
  PositionClaimed as PositionClaimedEvent,
  PositionSettled as PositionSettledEvent,
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
  PositionSettled,
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
    userStats.totalPoints = BigInt.fromI32(0); // 포인트 초기화
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
    userStats.totalPoints = BigInt.fromI32(0); // 포인트 초기화
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

function calcActivityPoints(cost: BigInt): BigInt {
  return cost.div(BigInt.fromI32(10));
} // A = cost / 10

function calcPerformancePoints(realizedPnL: BigInt): BigInt {
  return realizedPnL.gt(BigInt.fromI32(0)) ? realizedPnL : BigInt.fromI32(0);
}

// Risk 보너스 포인트 계산 (보유시간 >= 1시간일 때만) (6 decimals)
// R = min(A × 0.3 × (1 + (marketRange - userRange)/marketRange), 2A)
function calcRiskBonusPoints(
  activityPoints: BigInt,
  userRange: BigInt,
  marketRange: BigInt,
  holdingSeconds: BigInt
): BigInt {
  // 1시간(3600초) 미만이면 0 포인트
  if (holdingSeconds.lt(BigInt.fromI32(3600))) {
    return BigInt.fromI32(0);
  }

  // 범위 차이 계산
  let rangeDiff = marketRange.minus(userRange);
  if (rangeDiff.lt(BigInt.fromI32(0))) rangeDiff = BigInt.fromI32(0);

  // multiplier = 1 + rangeDiff/marketRange (최대 2.0으로 제한)
  let multiplier = BigInt.fromI32(1000000).plus(
    rangeDiff.times(BigInt.fromI32(1000000)).div(marketRange)
  ); // 10000 = 100%
  if (multiplier.gt(BigInt.fromI32(2000000)))
    multiplier = BigInt.fromI32(2000000); // 최대 200%

  // R = A × 0.3 × multiplier = A × 3000 / 10000
  let risk = activityPoints
    .times(BigInt.fromI32(300000))
    .div(BigInt.fromI32(1000000))
    .times(multiplier)
    .div(BigInt.fromI32(1000000));

  // min(R, 2A)
  let maxRisk = activityPoints.times(BigInt.fromI32(2));
  return risk.gt(maxRisk) ? maxRisk : risk;
}

// ============= 기존 헬퍼 함수들 =============

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

  let marketStats = getOrCreateMarketStats(event.params.marketId.toString());
  marketStats.lastUpdated = event.block.timestamp;
  marketStats.save();

  let binFactorsWad: Array<string> = [];
  let binVolumes: Array<string> = [];
  let tickRanges: Array<string> = [];

  for (let binIndex = 0; binIndex < event.params.numBins.toI32(); binIndex++) {
    let lowerTick = event.params.minTick.plus(
      BigInt.fromI32(binIndex).times(event.params.tickSpacing)
    );
    let upperTick = lowerTick.plus(event.params.tickSpacing);

    let binId = event.params.marketId.toString() + "-" + binIndex.toString();
    let binState = new BinState(binId);
    binState.market = market.id;
    binState.binIndex = BigInt.fromI32(binIndex);
    binState.lowerTick = lowerTick;
    binState.upperTick = upperTick;
    binState.currentFactor = BigInt.fromString("1000000000000000000");
    binState.lastUpdated = event.block.timestamp;
    binState.updateCount = BigInt.fromI32(0);
    binState.totalVolume = BigInt.fromI32(0);
    binState.save();

    binFactorsWad.push("1000000000000000000");
    binVolumes.push("0");
    tickRanges.push(lowerTick.toString() + "-" + upperTick.toString());
  }

  let distribution = new MarketDistribution(event.params.marketId.toString());
  distribution.market = market.id;
  distribution.totalBins = event.params.numBins;

  distribution.totalSum = event.params.numBins.times(
    BigInt.fromString("1000000000000000000")
  );

  distribution.minFactor = BigInt.fromString("1000000000000000000");
  distribution.maxFactor = BigInt.fromString("1000000000000000000");
  distribution.avgFactor = BigInt.fromString("1000000000000000000");
  distribution.totalVolume = BigInt.fromI32(0);

  distribution.binFactors = binFactorsWad;
  distribution.binVolumes = binVolumes;
  distribution.tickRanges = tickRanges;

  distribution.lastSnapshotAt = event.block.timestamp;
  distribution.distributionHash = "init-" + event.block.timestamp.toString();
  distribution.version = BigInt.fromI32(1);
  distribution.save();
}

export function handleMarketSettled(event: MarketSettledEvent): void {
  let entity = new MarketSettled(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.marketId = event.params.marketId;
  entity.settlementTick = event.params.settlementTick;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();

  let market = Market.load(event.params.marketId.toString())!;
  market.isSettled = true;
  market.settlementTick = event.params.settlementTick;
  market.lastUpdated = event.block.timestamp;
  market.save();
}

export function handlePositionSettled(event: PositionSettledEvent): void {
  let entity = new PositionSettled(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  entity.positionId = event.params.positionId;
  entity.trader = event.params.trader;
  entity.payout = event.params.payout;
  entity.isWin = event.params.isWin;

  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  entity.transactionHash = event.transaction.hash;

  entity.save();

  let userPosition = UserPosition.load(event.params.positionId.toString())!;
  userPosition.outcome = event.params.isWin ? "WIN" : "LOSS";

  let calculatedPnL = event.params.payout.minus(userPosition.totalCostBasis);
  userPosition.realizedPnL = calculatedPnL;
  userPosition.totalProceeds = userPosition.totalProceeds.plus(
    event.params.payout
  );
  userPosition.isClaimed = false;
  userPosition.lastUpdated = event.block.timestamp;

  let holdingSeconds = event.block.timestamp.minus(
    userPosition.weightedEntryTime
  );
  let userRange = userPosition.upperTick.minus(userPosition.lowerTick);

  let performancePoints = calcPerformancePoints(calculatedPnL);

  let market = Market.load(userPosition.market)!;
  let marketRange = market.maxTick.minus(market.minTick);
  let riskBonusPoints = calcRiskBonusPoints(
    userPosition.activityRemaining,
    userRange,
    marketRange,
    holdingSeconds
  );

  userPosition.activityRemaining = BigInt.fromI32(0);
  userPosition.weightedEntryTime = BigInt.fromI32(0);
  userPosition.save();

  let userStats = getOrCreateUserStats(event.params.trader);
  userStats.totalRealizedPnL = userStats.totalRealizedPnL.plus(calculatedPnL);

  if (event.params.isWin) {
    userStats.winningTrades = userStats.winningTrades.plus(BigInt.fromI32(1));
  } else {
    userStats.losingTrades = userStats.losingTrades.plus(BigInt.fromI32(1));
  }

  let totalSettlementPoints = performancePoints.plus(riskBonusPoints);
  userStats.totalPoints = userStats.totalPoints.plus(totalSettlementPoints);
  userStats.save();

  let trade = new Trade(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  trade.userPosition = userPosition.id;
  trade.user = event.params.trader;
  trade.market = userPosition.market;
  trade.positionId = event.params.positionId;
  trade.type = "SETTLE";
  trade.lowerTick = userPosition.lowerTick;
  trade.upperTick = userPosition.upperTick;
  trade.quantity = BigInt.fromI32(0);
  trade.costOrProceeds = event.params.payout;
  trade.price = BigInt.fromI32(0);
  trade.gasUsed = event.receipt ? event.receipt!.gasUsed : BigInt.fromI32(0);
  trade.gasPrice = event.transaction.gasPrice;
  trade.timestamp = event.block.timestamp;
  trade.blockNumber = event.block.number;
  trade.transactionHash = event.transaction.hash;

  trade.activityPt = BigInt.fromI32(0);
  trade.performancePt = performancePoints;
  trade.riskBonusPt = riskBonusPoints;
  trade.save();
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

  let userPosition = UserPosition.load(event.params.positionId.toString())!;
  userPosition.isClaimed = true;
  userPosition.lastUpdated = event.block.timestamp;
  userPosition.save();
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

  let userPosition = UserPosition.load(event.params.positionId.toString())!;
  let closedQuantity = userPosition.currentQuantity;
  let tradeRealizedPnL = event.params.proceeds.minus(
    userPosition.totalCostBasis
  );

  userPosition.currentQuantity = BigInt.fromI32(0);
  userPosition.totalQuantitySold =
    userPosition.totalQuantitySold.plus(closedQuantity);
  userPosition.totalProceeds = userPosition.totalProceeds.plus(
    event.params.proceeds
  );
  userPosition.realizedPnL = tradeRealizedPnL;
  userPosition.outcome = "CLOSED";
  userPosition.activityRemaining = BigInt.fromI32(0);
  userPosition.weightedEntryTime = BigInt.fromI32(0);
  userPosition.lastUpdated = event.block.timestamp;
  userPosition.save();

  let userStats = getOrCreateUserStats(event.params.trader);
  userStats.activePositionsCount = userStats.activePositionsCount.minus(
    BigInt.fromI32(1)
  );

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
  trade.quantity = closedQuantity.times(BigInt.fromI32(-1));
  trade.costOrProceeds = event.params.proceeds;
  trade.price = event.params.proceeds
    .times(BigInt.fromString("1000000"))
    .div(closedQuantity);
  trade.gasUsed = event.receipt ? event.receipt!.gasUsed : BigInt.fromI32(0);
  trade.gasPrice = event.transaction.gasPrice;
  trade.timestamp = event.block.timestamp;
  trade.blockNumber = event.block.number;
  trade.transactionHash = event.transaction.hash;

  let performancePoints = calcPerformancePoints(tradeRealizedPnL);
  let holdingSeconds = event.block.timestamp.minus(
    userPosition.weightedEntryTime
  );
  let userRange = userPosition.upperTick.minus(userPosition.lowerTick);

  let market = Market.load(userPosition.market)!;
  let marketRange = market.maxTick.minus(market.minTick);
  let riskBonusPoints = calcRiskBonusPoints(
    userPosition.activityRemaining,
    userRange,
    marketRange,
    holdingSeconds
  );

  trade.activityPt = BigInt.fromI32(0);
  trade.performancePt = performancePoints;
  trade.riskBonusPt = riskBonusPoints;
  trade.save();

  userStats.totalTrades = userStats.totalTrades.plus(BigInt.fromI32(1));
  userStats.totalVolume = userStats.totalVolume.plus(event.params.proceeds);
  userStats.totalProceeds = userStats.totalProceeds.plus(event.params.proceeds);
  userStats.totalRealizedPnL = userStats.totalRealizedPnL.plus(
    userPosition.realizedPnL
  );
  userStats.lastTradeAt = event.block.timestamp;
  userStats.avgTradeSize = userStats.totalVolume.div(userStats.totalTrades);

  let totalEarnedPoints = performancePoints.plus(riskBonusPoints);
  userStats.totalPoints = userStats.totalPoints.plus(totalEarnedPoints);
  userStats.save();

  updateBinVolumes(
    BigInt.fromString(userPosition.market),
    userPosition.lowerTick,
    userPosition.upperTick,
    event.params.proceeds
  );

  let marketStats = getOrCreateMarketStats(userPosition.market);
  marketStats.totalVolume = marketStats.totalVolume.plus(event.params.proceeds);
  marketStats.totalTrades = marketStats.totalTrades.plus(BigInt.fromI32(1));
  marketStats.currentPrice = trade.price;
  marketStats.lastUpdated = event.block.timestamp;

  if (trade.price.gt(marketStats.highestPrice)) {
    marketStats.highestPrice = trade.price;
  }
  if (trade.price.lt(marketStats.lowestPrice)) {
    marketStats.lowestPrice = trade.price;
  }
  marketStats.save();
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

  let userPosition = UserPosition.load(event.params.positionId.toString())!;
  let oldQuantity = userPosition.currentQuantity;
  let costPortion = userPosition.totalCostBasis
    .times(event.params.sellQuantity)
    .div(oldQuantity);

  let tradeRealizedPnL = event.params.proceeds.minus(costPortion);

  userPosition.currentQuantity = event.params.newQuantity;
  userPosition.totalCostBasis = userPosition.totalCostBasis.minus(costPortion);
  userPosition.totalQuantitySold = userPosition.totalQuantitySold.plus(
    event.params.sellQuantity
  );
  userPosition.totalProceeds = userPosition.totalProceeds.plus(
    event.params.proceeds
  );
  userPosition.realizedPnL = userPosition.realizedPnL.plus(tradeRealizedPnL);

  let activityPortion = userPosition.activityRemaining
    .times(event.params.sellQuantity)
    .div(oldQuantity);

  userPosition.activityRemaining =
    userPosition.activityRemaining.minus(activityPortion);

  if (event.params.newQuantity.equals(BigInt.fromI32(0))) {
    userPosition.outcome = "CLOSED";
    userPosition.weightedEntryTime = BigInt.fromI32(0);

    let userStats = getOrCreateUserStats(event.params.trader);
    userStats.activePositionsCount = userStats.activePositionsCount.minus(
      BigInt.fromI32(1)
    );
    userStats.save();
  }

  userPosition.lastUpdated = event.block.timestamp;
  userPosition.save();

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
  trade.quantity = event.params.sellQuantity.times(BigInt.fromI32(-1));
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

  let performancePoints = calcPerformancePoints(tradeRealizedPnL);
  let holdingSeconds = event.block.timestamp.minus(
    userPosition.weightedEntryTime
  );
  let userRange = userPosition.upperTick.minus(userPosition.lowerTick);

  let market = Market.load(userPosition.market)!;
  let marketRange = market.maxTick.minus(market.minTick);
  let riskBonusPoints = calcRiskBonusPoints(
    activityPortion,
    userRange,
    marketRange,
    holdingSeconds
  );

  trade.activityPt = BigInt.fromI32(0);
  trade.performancePt = performancePoints;
  trade.riskBonusPt = riskBonusPoints;

  trade.save();

  updateBinVolumes(
    BigInt.fromString(userPosition.market),
    userPosition.lowerTick,
    userPosition.upperTick,
    event.params.proceeds
  );

  let userStats = getOrCreateUserStats(event.params.trader);
  userStats.totalTrades = userStats.totalTrades.plus(BigInt.fromI32(1));
  userStats.totalVolume = userStats.totalVolume.plus(event.params.proceeds);
  userStats.totalProceeds = userStats.totalProceeds.plus(event.params.proceeds);
  userStats.lastTradeAt = event.block.timestamp;

  let totalEarnedPoints = performancePoints.plus(riskBonusPoints);
  userStats.totalPoints = userStats.totalPoints.plus(totalEarnedPoints);
  userStats.save();

  let marketStats = getOrCreateMarketStats(userPosition.market);
  marketStats.totalVolume = marketStats.totalVolume.plus(event.params.proceeds);
  marketStats.totalTrades = marketStats.totalTrades.plus(BigInt.fromI32(1));
  marketStats.currentPrice = trade.price;
  marketStats.lastUpdated = event.block.timestamp;

  if (trade.price.gt(marketStats.highestPrice)) {
    marketStats.highestPrice = trade.price;
  }
  if (trade.price.lt(marketStats.lowestPrice)) {
    marketStats.lowestPrice = trade.price;
  }
  marketStats.save();
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
  let userPosition = UserPosition.load(event.params.positionId.toString())!;

  userPosition.totalCostBasis = userPosition.totalCostBasis.plus(
    event.params.cost
  );
  userPosition.totalQuantityBought = userPosition.totalQuantityBought.plus(
    event.params.additionalQuantity
  );
  userPosition.currentQuantity = event.params.newQuantity;

  userPosition.averageEntryPrice = userPosition.totalCostBasis
    .times(BigInt.fromString("1000000"))
    .div(userPosition.totalQuantityBought);

  let currentTime = event.block.timestamp;
  let oldQuantity = userPosition.currentQuantity.minus(
    event.params.additionalQuantity
  );
  userPosition.weightedEntryTime = userPosition.weightedEntryTime
    .times(oldQuantity)
    .plus(currentTime.times(event.params.additionalQuantity))
    .div(userPosition.currentQuantity);

  userPosition.lastUpdated = event.block.timestamp;
  userPosition.save();

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

  let activityPoints = calcActivityPoints(event.params.cost);
  trade.activityPt = activityPoints;
  trade.performancePt = BigInt.fromI32(0);
  trade.riskBonusPt = BigInt.fromI32(0);
  trade.save();

  userPosition.activityRemaining =
    userPosition.activityRemaining.plus(activityPoints);
  userPosition.save();

  updateBinVolumes(
    BigInt.fromString(userPosition.market),
    userPosition.lowerTick,
    userPosition.upperTick,
    event.params.cost
  );

  let userStats = getOrCreateUserStats(event.params.trader);
  userStats.totalTrades = userStats.totalTrades.plus(BigInt.fromI32(1));
  userStats.totalVolume = userStats.totalVolume.plus(event.params.cost);
  userStats.totalCosts = userStats.totalCosts.plus(event.params.cost);
  userStats.lastTradeAt = event.block.timestamp;

  userStats.totalPoints = userStats.totalPoints.plus(activityPoints);
  userStats.save();

  let marketStats = getOrCreateMarketStats(userPosition.market);
  marketStats.totalVolume = marketStats.totalVolume.plus(event.params.cost);
  marketStats.totalTrades = marketStats.totalTrades.plus(BigInt.fromI32(1));
  marketStats.currentPrice = trade.price;
  marketStats.lastUpdated = event.block.timestamp;

  if (trade.price.gt(marketStats.highestPrice)) {
    marketStats.highestPrice = trade.price;
  }
  if (trade.price.lt(marketStats.lowestPrice)) {
    marketStats.lowestPrice = trade.price;
  }
  marketStats.save();
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

  let userPosition = new UserPosition(event.params.positionId.toString());
  userPosition.positionId = event.params.positionId;
  userPosition.user = event.params.trader;
  userPosition.stats = event.params.trader;
  userPosition.market = event.params.marketId.toString();
  userPosition.lowerTick = event.params.lowerTick;
  userPosition.upperTick = event.params.upperTick;

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
  userPosition.outcome = "OPEN";
  userPosition.isClaimed = false;
  userPosition.createdAt = event.block.timestamp;
  userPosition.lastUpdated = event.block.timestamp;
  userPosition.activityRemaining = BigInt.fromI32(0);
  userPosition.weightedEntryTime = event.block.timestamp;
  userPosition.save();

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
  trade.quantity = event.params.quantity;
  trade.costOrProceeds = event.params.cost;
  trade.price = userPosition.averageEntryPrice;
  trade.gasUsed = event.receipt ? event.receipt!.gasUsed : BigInt.fromI32(0);
  trade.gasPrice = event.transaction.gasPrice;
  trade.timestamp = event.block.timestamp;
  trade.blockNumber = event.block.number;
  trade.transactionHash = event.transaction.hash;

  let activityPoints = calcActivityPoints(event.params.cost);
  trade.activityPt = activityPoints;
  trade.performancePt = BigInt.fromI32(0);
  trade.riskBonusPt = BigInt.fromI32(0);
  trade.save();

  userPosition.activityRemaining = activityPoints;
  userPosition.save();

  updateBinVolumes(
    event.params.marketId,
    event.params.lowerTick,
    event.params.upperTick,
    event.params.cost
  );

  let userStatsResult = getOrCreateUserStatsWithFlag(event.params.trader);
  let userStats = userStatsResult.userStats;
  userStats.activePositionsCount = userStats.activePositionsCount.plus(
    BigInt.fromI32(1)
  );
  userStats.totalTrades = userStats.totalTrades.plus(BigInt.fromI32(1));
  userStats.totalVolume = userStats.totalVolume.plus(event.params.cost);
  userStats.totalCosts = userStats.totalCosts.plus(event.params.cost);
  userStats.lastTradeAt = event.block.timestamp;
  if (userStats.firstTradeAt.equals(BigInt.fromI32(0))) {
    userStats.firstTradeAt = event.block.timestamp;
  }

  userStats.avgTradeSize = userStats.totalVolume.div(userStats.totalTrades);
  userStats.totalPoints = userStats.totalPoints.plus(activityPoints);
  userStats.save();

  let marketStats = getOrCreateMarketStats(event.params.marketId.toString());
  marketStats.totalVolume = marketStats.totalVolume.plus(event.params.cost);
  marketStats.totalTrades = marketStats.totalTrades.plus(BigInt.fromI32(1));
  marketStats.currentPrice = userPosition.averageEntryPrice;
  marketStats.lastUpdated = event.block.timestamp;

  if (userPosition.averageEntryPrice.gt(marketStats.highestPrice)) {
    marketStats.highestPrice = userPosition.averageEntryPrice;
  }
  if (userPosition.averageEntryPrice.lt(marketStats.lowestPrice)) {
    marketStats.lowestPrice = userPosition.averageEntryPrice;
  }
  marketStats.save();
}

export function handleRangeFactorApplied(event: RangeFactorAppliedEvent): void {
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

  let market = Market.load(event.params.marketId.toString())!;
  market.lastUpdated = event.block.timestamp;
  market.save();

  let lowerBinIndex = event.params.lo
    .minus(market.minTick)
    .div(market.tickSpacing)
    .toI32();
  let upperBinIndex =
    event.params.hi.minus(market.minTick).div(market.tickSpacing).toI32() - 1;

  for (let binIndex = lowerBinIndex; binIndex <= upperBinIndex; binIndex++) {
    let binState = BinState.load(market.id + "-" + binIndex.toString())!;
    binState.currentFactor = binState.currentFactor
      .times(event.params.factor)
      .div(BigInt.fromString("1000000000000000000"));
    binState.lastUpdated = event.block.timestamp;
    binState.updateCount = binState.updateCount.plus(BigInt.fromI32(1));
    binState.save();
  }

  let distribution = MarketDistribution.load(market.id)!;
  let totalSumWad = BigInt.fromI32(0);
  let minFactorWad = BigInt.fromString("999999999999999999999999999999");
  let maxFactorWad = BigInt.fromI32(0);
  let binFactorsWad: Array<string> = [];
  let binVolumes: Array<string> = [];

  for (let i = 0; i < market.numBins.toI32(); i++) {
    let binState = BinState.load(market.id + "-" + i.toString())!;
    totalSumWad = totalSumWad.plus(binState.currentFactor);

    if (binState.currentFactor.lt(minFactorWad)) {
      minFactorWad = binState.currentFactor;
    }
    if (binState.currentFactor.gt(maxFactorWad)) {
      maxFactorWad = binState.currentFactor;
    }

    binFactorsWad.push(binState.currentFactor.toString());
    binVolumes.push(binState.totalVolume.toString());
  }

  let avgFactorWad = totalSumWad.div(market.numBins);

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
