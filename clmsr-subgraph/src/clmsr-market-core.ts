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
  UserPosition,
  Trade,
  UserStats,
  PriceSnapshot,
  MarketStats,
  BinState,
  MarketDistribution,
} from "../generated/schema";
import { BigDecimal, BigInt, Bytes } from "@graphprotocol/graph-ts";

// ========================================
// HELPER FUNCTIONS FOR PnL TRACKING
// ========================================

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
    userStats.totalVolume = BigDecimal.fromString("0");
    userStats.totalCosts = BigDecimal.fromString("0");
    userStats.totalProceeds = BigDecimal.fromString("0");
    userStats.totalRealizedPnL = BigDecimal.fromString("0");
    userStats.totalGasFees = BigDecimal.fromString("0");
    userStats.netPnL = BigDecimal.fromString("0");
    userStats.activePositionsCount = BigInt.fromI32(0);
    userStats.winningTrades = BigInt.fromI32(0);
    userStats.losingTrades = BigInt.fromI32(0);
    userStats.winRate = BigDecimal.fromString("0");
    userStats.avgTradeSize = BigDecimal.fromString("0");
    userStats.firstTradeAt = BigInt.fromI32(0);
    userStats.lastTradeAt = BigInt.fromI32(0);
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
    userStats.totalVolume = BigDecimal.fromString("0");
    userStats.totalCosts = BigDecimal.fromString("0");
    userStats.totalProceeds = BigDecimal.fromString("0");
    userStats.totalRealizedPnL = BigDecimal.fromString("0");
    userStats.totalGasFees = BigDecimal.fromString("0");
    userStats.netPnL = BigDecimal.fromString("0");
    userStats.activePositionsCount = BigInt.fromI32(0);
    userStats.winningTrades = BigInt.fromI32(0);
    userStats.losingTrades = BigInt.fromI32(0);
    userStats.winRate = BigDecimal.fromString("0");
    userStats.avgTradeSize = BigDecimal.fromString("0");
    userStats.firstTradeAt = BigInt.fromI32(0);
    userStats.lastTradeAt = BigInt.fromI32(0);
    isNew = true;
  } else {
    // 기존 유저지만 첫 거래인 경우도 신규로 간주 (시장별 고유 사용자 카운팅용)
    if (userStats.totalTrades.equals(BigInt.fromI32(0))) {
      isNew = true;
    }
  }

  return new UserStatsResult(userStats, isNew);
}

function getOrCreateMarketStats(marketId: string): MarketStats {
  let marketStats = MarketStats.load(marketId);

  if (marketStats == null) {
    marketStats = new MarketStats(marketId);
    marketStats.market = marketId;
    marketStats.totalVolume = BigDecimal.fromString("0");
    marketStats.totalTrades = BigInt.fromI32(0);
    marketStats.totalUsers = BigInt.fromI32(0);
    marketStats.totalFees = BigDecimal.fromString("0");
    marketStats.highestPrice = BigDecimal.fromString("0");
    marketStats.lowestPrice = BigDecimal.fromString("999999999");
    marketStats.currentPrice = BigDecimal.fromString("0");
    marketStats.priceChange24h = BigDecimal.fromString("0");
    marketStats.volume24h = BigDecimal.fromString("0");
    marketStats.lastUpdated = BigInt.fromI32(0);
  }

  return marketStats;
}

function calculatePrice(costOrProceeds: BigInt, quantity: BigInt): BigDecimal {
  if (quantity.equals(BigInt.fromI32(0))) {
    return BigDecimal.fromString("0");
  }

  // Convert to 6-decimal and calculate price
  let costDecimal = costOrProceeds
    .toBigDecimal()
    .div(BigDecimal.fromString("1000000"));
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
  volume: BigDecimal
): void {
  let market = Market.load(marketId.toString());
  if (market == null) return;

  // Convert tick range to bin indices
  let lowerBinIndex = lowerTick
    .minus(market.minTick)
    .div(market.tickSpacing)
    .toI32();
  let upperBinIndex =
    upperTick.minus(market.minTick).div(market.tickSpacing).toI32() - 1; // 오프바이원 수정: upperTick는 inclusive

  // 안전장치: bin 인덱스 범위 제한 (AssemblyScript f64 캐스팅 이슈 방지)
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
        let currentVolume = BigDecimal.fromString(binVolumes[binIndex]);
        binVolumes[binIndex] = currentVolume.plus(volume).toString();
      }
    }
    distribution.binVolumes = binVolumes;
    distribution.save();
  }
}

function updateUserStats(
  userStats: UserStats,
  trade: Trade,
  isPositionClosed: boolean = false
): void {
  userStats.totalTrades = userStats.totalTrades.plus(BigInt.fromI32(1));
  userStats.lastTradeAt = trade.timestamp;

  if (userStats.firstTradeAt.equals(BigInt.fromI32(0))) {
    userStats.firstTradeAt = trade.timestamp;
  }

  let quantityAbs = trade.quantity.lt(BigDecimal.fromString("0"))
    ? trade.quantity.times(BigDecimal.fromString("-1"))
    : trade.quantity;

  userStats.totalVolume = userStats.totalVolume.plus(quantityAbs);

  if (trade.type == "OPEN" || trade.type == "INCREASE") {
    userStats.totalCosts = userStats.totalCosts.plus(trade.costOrProceeds);
  } else if (trade.type == "DECREASE" || trade.type == "CLOSE") {
    userStats.totalProceeds = userStats.totalProceeds.plus(
      trade.costOrProceeds
    );
  }

  // Calculate average trade size
  if (!userStats.totalTrades.equals(BigInt.fromI32(0))) {
    userStats.avgTradeSize = userStats.totalVolume.div(
      userStats.totalTrades.toBigDecimal()
    );
  }

  // Calculate gas fees (approximate)
  let gasFee = trade.gasUsed
    .toBigDecimal()
    .times(trade.gasPrice.toBigDecimal())
    .div(BigDecimal.fromString("1000000000000000000"));
  userStats.totalGasFees = userStats.totalGasFees.plus(gasFee);

  // Update realized PnL and win/lose tracking when position is closed or decreased
  if (trade.type == "DECREASE" || trade.type == "CLOSE") {
    let userPosition = UserPosition.load(trade.userPosition);
    if (userPosition != null) {
      userStats.totalRealizedPnL = userStats.totalRealizedPnL.plus(
        userPosition.realizedPnL
      );

      // Track winning/losing trades
      if (userPosition.realizedPnL.gt(BigDecimal.fromString("0"))) {
        userStats.winningTrades = userStats.winningTrades.plus(
          BigInt.fromI32(1)
        );
      } else if (userPosition.realizedPnL.lt(BigDecimal.fromString("0"))) {
        userStats.losingTrades = userStats.losingTrades.plus(BigInt.fromI32(1));
      }
    }
  }

  // Calculate win rate
  let totalClosedTrades = userStats.winningTrades.plus(userStats.losingTrades);
  if (!totalClosedTrades.equals(BigInt.fromI32(0))) {
    userStats.winRate = userStats.winningTrades
      .toBigDecimal()
      .div(totalClosedTrades.toBigDecimal());
  }

  // Calculate net PnL
  userStats.netPnL = userStats.totalRealizedPnL.minus(userStats.totalGasFees);

  userStats.save();
}

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

  let binFactors: Array<string> = [];
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
    binState.currentFactor = BigDecimal.fromString("1.0"); // 초기값 1.0
    binState.lastUpdated = event.block.timestamp;
    binState.updateCount = BigInt.fromI32(0);
    binState.totalVolume = BigDecimal.fromString("0");
    binState.save();

    // 배열 데이터 구성 - String으로 저장
    binFactors.push("1.0");
    binVolumes.push("0");
    tickRanges.push(lowerTick.toString() + "-" + upperTick.toString());
  }

  // ========================================
  // MARKET DISTRIBUTION 초기화
  // ========================================

  let distribution = new MarketDistribution(event.params.marketId.toString());
  distribution.market = market.id;
  distribution.totalBins = event.params.numBins;

  // LMSR 계산용 데이터 (초기값: 모든 bin이 1.0이므로 총합 = numBins)
  distribution.totalSum = BigDecimal.fromString(
    event.params.numBins.toString()
  );
  distribution.totalSumWad = event.params.numBins.times(
    BigInt.fromString("1000000000000000000")
  ); // numBins * 1e18

  // 분포 통계 (초기값)
  distribution.minFactor = BigDecimal.fromString("1.0");
  distribution.maxFactor = BigDecimal.fromString("1.0");
  distribution.avgFactor = BigDecimal.fromString("1.0");
  distribution.totalVolume = BigDecimal.fromString("0");

  // 배열 형태 데이터
  distribution.binFactors = binFactors;
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
    // For claims, the "realized PnL" is payout minus original cost basis
    let claimRealizedPnL = payoutDecimal.minus(userPosition.totalCostBasis);

    // Update position data - position is now claimed and closed
    userPosition.currentQuantity = BigDecimal.fromString("0");
    userPosition.totalProceeds = userPosition.totalProceeds.plus(payoutDecimal);
    userPosition.realizedPnL = claimRealizedPnL; // Final realized PnL
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
    trade.quantity = BigDecimal.fromString("0"); // No quantity change, just claim
    trade.costOrProceeds = payoutDecimal;

    // For claims, price represents payout per original quantity
    trade.price = userPosition.totalQuantityBought.equals(
      BigDecimal.fromString("0")
    )
      ? BigDecimal.fromString("0")
      : payoutDecimal.div(userPosition.totalQuantityBought);

    trade.gasUsed = event.receipt ? event.receipt!.gasUsed : BigInt.fromI32(0);
    trade.gasPrice = event.transaction.gasPrice;
    trade.timestamp = event.block.timestamp;
    trade.blockNumber = event.block.number;
    trade.transactionHash = event.transaction.hash;
    trade.save();

    // Update UserStats
    updateUserStats(userStats, trade, true);

    // Update MarketStats
    let marketStats = getOrCreateMarketStats(userPosition.market);
    marketStats.totalTrades = marketStats.totalTrades.plus(BigInt.fromI32(1));
    marketStats.lastUpdated = event.block.timestamp;
    marketStats.save();

    // Create PriceSnapshot for claim
    let snapshotId =
      userPosition.market +
      "-" +
      userPosition.lowerTick.toString() +
      "-" +
      userPosition.upperTick.toString() +
      "-" +
      event.block.number.toString();
    let priceSnapshot = new PriceSnapshot(snapshotId);
    priceSnapshot.market = userPosition.market;
    priceSnapshot.lowerTick = userPosition.lowerTick;
    priceSnapshot.upperTick = userPosition.upperTick;
    priceSnapshot.price = trade.price;
    priceSnapshot.timestamp = event.block.timestamp;
    priceSnapshot.blockNumber = event.block.number;
    priceSnapshot.totalSupply = BigDecimal.fromString("0"); // Position claimed
    priceSnapshot.marketCap = BigDecimal.fromString("0");
    priceSnapshot.save();
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

    // Calculate cost basis of entire remaining position
    let remainingPortionCost = closedQuantity.times(
      userPosition.averageEntryPrice
    );

    // Calculate realized PnL for this close trade
    let tradeRealizedPnL = proceedsDecimal.minus(remainingPortionCost);

    // Update position data - closing entire position
    userPosition.currentQuantity = BigDecimal.fromString("0");
    userPosition.totalQuantitySold =
      userPosition.totalQuantitySold.plus(closedQuantity);
    userPosition.totalProceeds =
      userPosition.totalProceeds.plus(proceedsDecimal);
    userPosition.realizedPnL = userPosition.realizedPnL.plus(tradeRealizedPnL);
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
    trade.quantity = closedQuantity.times(BigDecimal.fromString("-1")); // Negative for sell
    trade.costOrProceeds = proceedsDecimal;

    // Calculate effective price based on proceeds and closed quantity
    trade.price = closedQuantity.equals(BigDecimal.fromString("0"))
      ? BigDecimal.fromString("0")
      : proceedsDecimal.div(closedQuantity);

    trade.gasUsed = event.receipt ? event.receipt!.gasUsed : BigInt.fromI32(0);
    trade.gasPrice = event.transaction.gasPrice;
    trade.timestamp = event.block.timestamp;
    trade.blockNumber = event.block.number;
    trade.transactionHash = event.transaction.hash;
    trade.save();

    // Update UserStats
    updateUserStats(userStats, trade, true);

    // Update MarketStats
    let marketStats = getOrCreateMarketStats(userPosition.market);
    marketStats.totalVolume = marketStats.totalVolume.plus(closedQuantity);
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

    // Create PriceSnapshot
    let snapshotId =
      userPosition.market +
      "-" +
      userPosition.lowerTick.toString() +
      "-" +
      userPosition.upperTick.toString() +
      "-" +
      event.block.number.toString();
    let priceSnapshot = new PriceSnapshot(snapshotId);
    priceSnapshot.market = userPosition.market;
    priceSnapshot.lowerTick = userPosition.lowerTick;
    priceSnapshot.upperTick = userPosition.upperTick;
    priceSnapshot.price = trade.price;
    priceSnapshot.timestamp = event.block.timestamp;
    priceSnapshot.blockNumber = event.block.number;
    priceSnapshot.totalSupply = BigDecimal.fromString("0"); // Position closed
    priceSnapshot.marketCap = BigDecimal.fromString("0");
    priceSnapshot.save();
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
    let sellQuantityDecimal = event.params.sellQuantity
      .toBigDecimal()
      .div(BigDecimal.fromString("1000000"));
    let proceedsDecimal = event.params.proceeds
      .toBigDecimal()
      .div(BigDecimal.fromString("1000000"));
    let newQuantityDecimal = event.params.newQuantity
      .toBigDecimal()
      .div(BigDecimal.fromString("1000000"));

    // Calculate cost basis of sold portion
    let soldPortionCost = sellQuantityDecimal.times(
      userPosition.averageEntryPrice
    );

    // Calculate realized PnL for this trade
    let tradeRealizedPnL = proceedsDecimal.minus(soldPortionCost);

    // Update position data
    userPosition.currentQuantity = newQuantityDecimal;
    userPosition.totalQuantitySold =
      userPosition.totalQuantitySold.plus(sellQuantityDecimal);
    userPosition.totalProceeds =
      userPosition.totalProceeds.plus(proceedsDecimal);
    userPosition.realizedPnL = userPosition.realizedPnL.plus(tradeRealizedPnL);

    // If position is closed completely, mark as inactive
    if (newQuantityDecimal.equals(BigDecimal.fromString("0"))) {
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
    trade.quantity = sellQuantityDecimal.times(BigDecimal.fromString("-1")); // Negative for sell
    trade.costOrProceeds = proceedsDecimal;
    trade.price = calculatePrice(
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
      sellQuantityDecimal
    );

    // Update UserStats
    let userStats = getOrCreateUserStats(event.params.trader);
    updateUserStats(userStats, trade);

    // Update MarketStats
    let marketStats = getOrCreateMarketStats(userPosition.market);
    marketStats.totalVolume = marketStats.totalVolume.plus(sellQuantityDecimal);
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

    // Create PriceSnapshot
    let snapshotId =
      userPosition.market +
      "-" +
      userPosition.lowerTick.toString() +
      "-" +
      userPosition.upperTick.toString() +
      "-" +
      event.block.number.toString();
    let priceSnapshot = new PriceSnapshot(snapshotId);
    priceSnapshot.market = userPosition.market;
    priceSnapshot.lowerTick = userPosition.lowerTick;
    priceSnapshot.upperTick = userPosition.upperTick;
    priceSnapshot.price = trade.price;
    priceSnapshot.timestamp = event.block.timestamp;
    priceSnapshot.blockNumber = event.block.number;
    priceSnapshot.totalSupply = newQuantityDecimal; // Updated total supply
    priceSnapshot.marketCap = trade.price.times(newQuantityDecimal);
    priceSnapshot.save();
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
    let additionalQuantityDecimal = event.params.additionalQuantity
      .toBigDecimal()
      .div(BigDecimal.fromString("1000000"));
    let additionalCostDecimal = event.params.cost
      .toBigDecimal()
      .div(BigDecimal.fromString("1000000"));
    let newQuantityDecimal = event.params.newQuantity
      .toBigDecimal()
      .div(BigDecimal.fromString("1000000"));

    // Update cost basis and calculate new average entry price
    userPosition.totalCostBasis = userPosition.totalCostBasis.plus(
      additionalCostDecimal
    );
    userPosition.totalQuantityBought = userPosition.totalQuantityBought.plus(
      additionalQuantityDecimal
    );
    userPosition.currentQuantity = newQuantityDecimal;

    // Recalculate average entry price
    if (!userPosition.totalQuantityBought.equals(BigDecimal.fromString("0"))) {
      userPosition.averageEntryPrice = userPosition.totalCostBasis.div(
        userPosition.totalQuantityBought
      );
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
    trade.quantity = additionalQuantityDecimal;
    trade.costOrProceeds = additionalCostDecimal;
    trade.price = calculatePrice(
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
      additionalQuantityDecimal
    );

    // Update UserStats
    let userStats = getOrCreateUserStats(event.params.trader);
    updateUserStats(userStats, trade);

    // Update MarketStats
    let marketStats = getOrCreateMarketStats(userPosition.market);
    marketStats.totalVolume = marketStats.totalVolume.plus(
      additionalQuantityDecimal
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

    // Create PriceSnapshot
    let snapshotId =
      userPosition.market +
      "-" +
      userPosition.lowerTick.toString() +
      "-" +
      userPosition.upperTick.toString() +
      "-" +
      event.block.number.toString();
    let priceSnapshot = new PriceSnapshot(snapshotId);
    priceSnapshot.market = userPosition.market;
    priceSnapshot.lowerTick = userPosition.lowerTick;
    priceSnapshot.upperTick = userPosition.upperTick;
    priceSnapshot.price = trade.price;
    priceSnapshot.timestamp = event.block.timestamp;
    priceSnapshot.blockNumber = event.block.number;
    priceSnapshot.totalSupply = newQuantityDecimal; // Updated total supply
    priceSnapshot.marketCap = trade.price.times(newQuantityDecimal);
    priceSnapshot.save();
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

  let quantityDecimal = event.params.quantity
    .toBigDecimal()
    .div(BigDecimal.fromString("1000000"));
  let costDecimal = event.params.cost
    .toBigDecimal()
    .div(BigDecimal.fromString("1000000"));

  userPosition.currentQuantity = quantityDecimal;
  userPosition.totalCostBasis = costDecimal;
  userPosition.averageEntryPrice = calculatePrice(
    event.params.cost,
    event.params.quantity
  );
  userPosition.totalQuantityBought = quantityDecimal;
  userPosition.totalQuantitySold = BigDecimal.fromString("0");
  userPosition.totalProceeds = BigDecimal.fromString("0");
  userPosition.realizedPnL = BigDecimal.fromString("0");
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
  trade.quantity = quantityDecimal;
  trade.costOrProceeds = costDecimal;
  trade.price = userPosition.averageEntryPrice;
  trade.gasUsed = event.receipt ? event.receipt!.gasUsed : BigInt.fromI32(0);
  trade.gasPrice = event.transaction.gasPrice;
  trade.timestamp = event.block.timestamp;
  trade.blockNumber = event.block.number;
  trade.transactionHash = event.transaction.hash;
  trade.save();

  // Update bin volumes
  updateBinVolumes(
    event.params.marketId,
    event.params.lowerTick,
    event.params.upperTick,
    quantityDecimal
  );

  // Update UserStats
  let userStatsResult = getOrCreateUserStatsWithFlag(event.params.trader);
  let userStats = userStatsResult.userStats;
  userStats.activePositionsCount = userStats.activePositionsCount.plus(
    BigInt.fromI32(1)
  );
  updateUserStats(userStats, trade);

  // Update MarketStats
  let marketStats = getOrCreateMarketStats(event.params.marketId.toString());
  marketStats.totalVolume = marketStats.totalVolume.plus(quantityDecimal);
  marketStats.totalTrades = marketStats.totalTrades.plus(BigInt.fromI32(1));

  // 신규 유저인 경우 totalUsers 증가
  if (userStatsResult.isNew) {
    marketStats.totalUsers = marketStats.totalUsers.plus(BigInt.fromI32(1));
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

  // Create PriceSnapshot
  let snapshotId =
    event.params.marketId.toString() +
    "-" +
    event.params.lowerTick.toString() +
    "-" +
    event.params.upperTick.toString() +
    "-" +
    event.block.number.toString();
  let priceSnapshot = new PriceSnapshot(snapshotId);
  priceSnapshot.market = event.params.marketId.toString();
  priceSnapshot.lowerTick = event.params.lowerTick;
  priceSnapshot.upperTick = event.params.upperTick;
  priceSnapshot.price = userPosition.averageEntryPrice;
  priceSnapshot.timestamp = event.block.timestamp;
  priceSnapshot.blockNumber = event.block.number;
  priceSnapshot.totalSupply = quantityDecimal; // Initial supply for this range
  priceSnapshot.marketCap =
    userPosition.averageEntryPrice.times(quantityDecimal);
  priceSnapshot.save();
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

    // Factor를 BigDecimal로 변환 (WAD에서 decimal로)
    let factorDecimal = event.params.factor
      .toBigDecimal()
      .div(BigDecimal.fromString("1000000000000000000"));

    // ========================================
    // BIN STATE 업데이트 (틱 범위를 bin 인덱스로 변환)
    // ========================================

    // 틱 범위를 bin 인덱스 범위로 변환
    let lowerBinIndex = event.params.lo
      .minus(market.minTick)
      .div(market.tickSpacing)
      .toI32();
    let upperBinIndex =
      event.params.hi.minus(market.minTick).div(market.tickSpacing).toI32() - 1; // 오프바이원 버그 수정: hi는 inclusive이므로 -1

    // 영향받은 bin들의 factor 업데이트
    for (let binIndex = lowerBinIndex; binIndex <= upperBinIndex; binIndex++) {
      let binState = BinState.load(market.id + "-" + binIndex.toString());
      if (binState != null) {
        binState.currentFactor = binState.currentFactor.times(factorDecimal);
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
      let totalSum = BigDecimal.fromString("0");
      let minFactor = BigDecimal.fromString("999999999"); // 매우 큰 값으로 초기화
      let maxFactor = BigDecimal.fromString("0");
      let binFactors: Array<string> = [];
      let binVolumes: Array<string> = [];

      // 모든 bin을 순회하여 통계 재계산
      for (let i = 0; i < market.numBins.toI32(); i++) {
        let binState = BinState.load(market.id + "-" + i.toString());
        if (binState != null) {
          totalSum = totalSum.plus(binState.currentFactor);

          if (binState.currentFactor.lt(minFactor)) {
            minFactor = binState.currentFactor;
          }
          if (binState.currentFactor.gt(maxFactor)) {
            maxFactor = binState.currentFactor;
          }

          // String 배열로 저장
          binFactors.push(binState.currentFactor.toString());
          binVolumes.push(binState.totalVolume.toString());
        }
      }

      // 평균 계산
      let avgFactor = totalSum.div(market.numBins.toBigDecimal());

      // WAD 형식 변환 (소수점 제거 후 BigInt 변환)
      let totalSumDecimal = totalSum.times(
        BigDecimal.fromString("1000000000000000000")
      );
      let totalSumString = totalSumDecimal.toString();
      // 소수점이 있으면 정수 부분만 추출
      let dotIndex = totalSumString.indexOf(".");
      if (dotIndex >= 0) {
        totalSumString = totalSumString.substring(0, dotIndex);
      }
      let totalSumWad = BigInt.fromString(totalSumString);

      // 분포 업데이트
      distribution.totalSum = totalSum;
      distribution.totalSumWad = totalSumWad;
      distribution.minFactor = minFactor;
      distribution.maxFactor = maxFactor;
      distribution.avgFactor = avgFactor;
      distribution.binFactors = binFactors;
      distribution.binVolumes = binVolumes;
      distribution.version = distribution.version.plus(BigInt.fromI32(1));
      distribution.lastSnapshotAt = event.block.timestamp;
      distribution.save();
    }

    // TickRange 엔티티 제거 - BinState와 MarketDistribution으로 대체됨
  }
}
