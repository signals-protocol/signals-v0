import {
  BigInt,
  BigDecimal,
  Bytes,
  dataSource,
  log,
} from "@graphprotocol/graph-ts";
import {
  loadMarketOrSkip,
  loadPosOrSkip,
  loadDistOrSkip,
  loadBinOrSkip,
} from "./_safeload";
import {
  checkActivityLimit,
  calcActivityPoints,
  calcPerformancePoints,
  calcRiskBonusPoints,
  addActivityPoints,
  addPerformancePoints,
  addRiskBonusPoints,
} from "./points";
import {
  PositionOpened as PositionOpenedEvent,
  PositionIncreased as PositionIncreasedEvent,
  PositionDecreased as PositionDecreasedEvent,
  PositionClosed as PositionClosedEvent,
  PositionClaimed as PositionClaimedEvent,
  PositionSettled as PositionSettledEvent,
  MarketCreated as MarketCreatedEvent,
  MarketSettled as MarketSettledEvent,
  MarketSettlementValueSubmitted as MarketSettlementValueSubmittedEvent,
  RangeFactorApplied as RangeFactorAppliedEvent,
} from "../generated/CLMSRMarketCore/CLMSRMarketCore";

import {
  Market,
  UserPosition,
  Trade,
  UserStats,
  MarketStats,
  BinState,
  MarketDistribution,
} from "../generated/schema";

// ============= ID HELPER FUNCTIONS =============

/**
 * 공통 ID 생성 헬퍼 함수
 */
export function buildId(raw: BigInt): string {
  return raw.toString();
}

/**
 * MarketId 기반 ID 생성 (Market, MarketStats, MarketDistribution 용)
 */
export function buildMarketId(marketId: BigInt): string {
  return buildId(marketId);
}

/**
 * PositionId 기반 ID 생성 (UserPosition 용)
 */
export function buildPositionId(positionId: BigInt): string {
  return buildId(positionId);
}

/**
 * BinState ID 생성 (marketId-binIndex 형식)
 */
export function buildBinStateId(marketId: BigInt, binIndex: i32): string {
  let marketIdStr = buildMarketId(marketId);
  return marketIdStr + "-" + binIndex.toString();
}

/**
 * Market ID 문자열에서 raw BigInt 추출
 */
export function extractRawMarketId(marketIdStr: string): BigInt {
  return BigInt.fromString(marketIdStr);
}

export function getOrCreateUserStats(userAddress: Bytes): UserStats {
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
    userStats.totalPoints = BigInt.fromI32(0);
    userStats.activityPoints = BigInt.fromI32(0);
    userStats.performancePoints = BigInt.fromI32(0);
    userStats.riskBonusPoints = BigInt.fromI32(0);
    userStats.activityPointsToday = BigInt.fromI32(0); // 새 필드 초기화
    userStats.lastActivityDay = BigInt.fromI32(0); // 새 필드 초기화
    userStats.save();
  }

  return userStats;
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

    // PnL 필드 초기화
    marketStats.totalBetReceived = BigInt.fromI32(0);
    marketStats.totalBetPaidOut = BigInt.fromI32(0);
    marketStats.bettingNetIncome = BigInt.fromI32(0);
    marketStats.totalSettlementPayout = BigInt.fromI32(0);
    marketStats.totalClaimedPayout = BigInt.fromI32(0);
    marketStats.unclaimedPayout = BigInt.fromI32(0);
    marketStats.totalMarketPnL = BigInt.fromI32(0);
    marketStats.realizedMarketPnL = BigInt.fromI32(0);

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

// Helper function to update market PnL calculations
function updateMarketPnL(marketStats: MarketStats): void {
  // 베팅 단계 순수익 = 받은 금액 - 지급한 금액
  marketStats.bettingNetIncome = marketStats.totalBetReceived.minus(
    marketStats.totalBetPaidOut
  );

  // 아직 청구되지 않은 금액 = 정산 예정 금액 - 실제 청구된 금액
  marketStats.unclaimedPayout = marketStats.totalSettlementPayout.minus(
    marketStats.totalClaimedPayout
  );

  // 전체 마켓 손익 = 베팅 순수익 - 정산 예정 금액 (최종 예상 손익)
  marketStats.totalMarketPnL = marketStats.bettingNetIncome.minus(
    marketStats.totalSettlementPayout
  );

  // 실현된 마켓 손익 = 베팅 순수익 - 실제 청구된 금액 (현재까지 실현된 손익)
  marketStats.realizedMarketPnL = marketStats.bettingNetIncome.minus(
    marketStats.totalClaimedPayout
  );
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

// ============= 기존 헬퍼 함수들 =============

// Helper function to update bin volumes for given tick range
function updateBinVolumes(
  marketId: BigInt,
  lowerTick: BigInt,
  upperTick: BigInt,
  volume: BigInt
): void {
  let market = loadMarketOrSkip(buildMarketId(marketId), "updateBinVolumes");
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
    let binStateId = buildBinStateId(marketId, binIndex);
    let binState = loadBinOrSkip(binStateId, "updateBinVolumes");
    if (binState != null) {
      binState.totalVolume = binState.totalVolume.plus(volume);
      binState.save();
    }
  }

  // Update MarketDistribution's binVolumes array
  let distribution = loadDistOrSkip(
    buildMarketId(marketId),
    "updateBinVolumes"
  );
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

export function handleMarketCreated(event: MarketCreatedEvent): void {
  let marketIdStr = buildMarketId(event.params.marketId);
  let market = new Market(marketIdStr);
  market.marketId = event.params.marketId;
  market.minTick = event.params.minTick;
  market.maxTick = event.params.maxTick;
  market.tickSpacing = event.params.tickSpacing;
  market.startTimestamp = event.params.startTimestamp;
  market.endTimestamp = event.params.endTimestamp;
  market.numBins = event.params.numBins;
  market.liquidityParameter = event.params.liquidityParameter;
  market.isSettled = false;
  market.settlementValue = null;
  market.settlementTick = null;
  market.lastUpdated = event.block.timestamp;
  market.save();

  let marketStats = getOrCreateMarketStats(marketIdStr);
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

    let binId = buildBinStateId(event.params.marketId, binIndex);
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

  let distribution = new MarketDistribution(marketIdStr);
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
  const marketId = buildMarketId(event.params.marketId);
  const market = loadMarketOrSkip(marketId, "handleMarketSettled");
  if (market == null) return;
  market.isSettled = true;
  market.settlementTick = event.params.settlementTick;
  // Calculate settlementValue by appending 6 zeros (multiply by 1,000,000)
  market.settlementValue = event.params.settlementTick.times(
    BigInt.fromI32(1000000)
  );
  market.lastUpdated = event.block.timestamp;
  market.save();
}

export function handleMarketSettlementValueSubmitted(
  event: MarketSettlementValueSubmittedEvent
): void {
  const market = loadMarketOrSkip(
    buildMarketId(event.params.marketId),
    "handleMarketSettlementValueSubmitted"
  );
  if (market == null) return;
  market.settlementValue = event.params.settlementValue;
  market.lastUpdated = event.block.timestamp;
  market.save();
}

function applySettlementOnce(
  positionId: BigInt,
  trader: Bytes,
  payout: BigInt,
  ts: BigInt,
  txHash: Bytes,
  logIndex: BigInt
): void {
  const userPosition = loadPosOrSkip(
    buildPositionId(positionId),
    "applySettlementOnce"
  );
  if (userPosition == null) return;
  if (userPosition.outcome != "OPEN") return;

  userPosition.outcome = payout.gt(BigInt.fromI32(0)) ? "WIN" : "LOSS";
  let calculatedPnL = payout.minus(userPosition.totalCostBasis);
  userPosition.realizedPnL = calculatedPnL;
  userPosition.totalProceeds = userPosition.totalProceeds.plus(payout);
  userPosition.isClaimed = false;
  userPosition.lastUpdated = ts;

  let holdingSeconds = ts.minus(userPosition.weightedEntryTime);
  let userRange = userPosition.upperTick.minus(userPosition.lowerTick);
  let market = loadMarketOrSkip(userPosition.market, "applySettlementOnce");
  if (market == null) return;
  let marketRange = market.maxTick.minus(market.minTick);

  let userStats = getOrCreateUserStats(trader);
  let performancePt = calcPerformancePoints(calculatedPnL);
  if (performancePt.gt(BigInt.fromI32(0)))
    addPerformancePoints(userStats, performancePt);

  let riskBonusPt = calcRiskBonusPoints(
    userPosition.activityRemaining,
    userRange,
    marketRange,
    holdingSeconds
  );
  if (riskBonusPt.gt(BigInt.fromI32(0)))
    addRiskBonusPoints(userStats, riskBonusPt);

  userPosition.activityRemaining = BigInt.fromI32(0);
  userPosition.weightedEntryTime = BigInt.fromI32(0);
  userPosition.save();

  userStats.totalRealizedPnL = userStats.totalRealizedPnL.plus(calculatedPnL);
  if (payout.gt(BigInt.fromI32(0))) {
    userStats.winningTrades = userStats.winningTrades.plus(BigInt.fromI32(1));
  } else {
    userStats.losingTrades = userStats.losingTrades.plus(BigInt.fromI32(1));
  }
  userStats.save();

  let trade = new Trade(txHash.concatI32(logIndex.toI32()));
  trade.userPosition = userPosition.id;
  trade.user = trader;
  trade.market = userPosition.market;
  trade.positionId = positionId;
  trade.type = "SETTLE";
  trade.lowerTick = userPosition.lowerTick;
  trade.upperTick = userPosition.upperTick;
  trade.quantity = BigInt.fromI32(0);
  trade.costOrProceeds = payout;
  trade.price = BigInt.fromI32(0);
  trade.gasUsed = BigInt.fromI32(0);
  trade.gasPrice = BigInt.fromI32(0);
  trade.timestamp = ts;
  trade.blockNumber = BigInt.fromI32(0);
  trade.transactionHash = txHash;
  trade.activityPt = BigInt.fromI32(0);
  trade.performancePt = performancePt;
  trade.riskBonusPt = riskBonusPt;
  trade.save();

  let marketStats = getOrCreateMarketStats(userPosition.market);
  marketStats.totalSettlementPayout =
    marketStats.totalSettlementPayout.plus(payout);
  updateMarketPnL(marketStats);
  marketStats.lastUpdated = ts;
  marketStats.save();
}

export function handlePositionSettled(event: PositionSettledEvent): void {
  applySettlementOnce(
    event.params.positionId,
    event.params.trader,
    event.params.payout,
    event.block.timestamp,
    event.transaction.hash,
    event.logIndex
  );
}

export function handlePositionClaimed(event: PositionClaimedEvent): void {
  // 보강: 과거 "클레임만 있고 정산 이벤트가 없던" 케이스도 복구
  const current = loadPosOrSkip(
    buildPositionId(event.params.positionId),
    "handlePositionClaimed"
  );
  if (current == null) return;
  if (current.outcome == "OPEN") {
    applySettlementOnce(
      event.params.positionId,
      event.params.trader,
      event.params.payout,
      event.block.timestamp,
      event.transaction.hash,
      event.logIndex
    );
  }
  // Reload to avoid overwriting settlement fields updated above
  const updated = loadPosOrSkip(
    buildPositionId(event.params.positionId),
    "handlePositionClaimed:reload"
  );
  if (updated == null) return;
  updated.isClaimed = true;
  updated.lastUpdated = event.block.timestamp;
  updated.save();

  // 마켓 PnL 업데이트 - PositionClaimed에서 실제 청구된 금액 추가
  let marketStats = getOrCreateMarketStats(updated.market);
  marketStats.totalClaimedPayout = marketStats.totalClaimedPayout.plus(
    event.params.payout
  );
  updateMarketPnL(marketStats);
  marketStats.lastUpdated = event.block.timestamp;
  marketStats.save();
}

export function handlePositionClosed(event: PositionClosedEvent): void {
  const userPosition = loadPosOrSkip(
    buildPositionId(event.params.positionId),
    "handlePositionClosed"
  );
  if (userPosition == null) return;
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
  // Store values before resetting for risk calculation
  let originalActivityRemaining = userPosition.activityRemaining;
  let originalWeightedEntryTime = userPosition.weightedEntryTime;

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

  // Performance & Risk Bonus Points 처리
  let userRange = userPosition.upperTick.minus(userPosition.lowerTick);
  let market = loadMarketOrSkip(userPosition.market, "handlePositionClosed");
  if (market == null) return;
  let marketRange = market.maxTick.minus(market.minTick);
  let holdingSeconds = event.block.timestamp.minus(originalWeightedEntryTime);

  // Performance Points 계산 및 적립
  let performancePt = calcPerformancePoints(tradeRealizedPnL);
  if (performancePt.gt(BigInt.fromI32(0))) {
    addPerformancePoints(userStats, performancePt);
  }

  // Risk Bonus Points 계산 및 적립
  let riskBonusPt = calcRiskBonusPoints(
    originalActivityRemaining,
    userRange,
    marketRange,
    holdingSeconds
  );
  if (riskBonusPt.gt(BigInt.fromI32(0))) {
    addRiskBonusPoints(userStats, riskBonusPt);
  }

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
  // 분모 0 가드
  let price = BigInt.fromI32(0);
  if (!closedQuantity.equals(BigInt.fromI32(0))) {
    price = event.params.proceeds
      .times(BigInt.fromString("1000000"))
      .div(closedQuantity);
  } else {
    log.warning(
      "[handlePositionClosed] closedQuantity is 0, skip price calc",
      []
    );
  }
  trade.price = price;
  trade.gasUsed = event.receipt ? event.receipt!.gasUsed : BigInt.fromI32(0);
  trade.gasPrice = event.transaction.gasPrice;
  trade.timestamp = event.block.timestamp;
  trade.blockNumber = event.block.number;
  trade.transactionHash = event.transaction.hash;

  trade.activityPt = BigInt.fromI32(0);
  trade.performancePt = performancePt;
  trade.riskBonusPt = riskBonusPt;
  trade.save();

  userStats.totalTrades = userStats.totalTrades.plus(BigInt.fromI32(1));
  userStats.totalVolume = userStats.totalVolume.plus(event.params.proceeds);
  userStats.totalProceeds = userStats.totalProceeds.plus(event.params.proceeds);
  userStats.totalRealizedPnL = userStats.totalRealizedPnL.plus(
    userPosition.realizedPnL
  );
  userStats.lastTradeAt = event.block.timestamp;
  userStats.avgTradeSize = userStats.totalVolume.div(userStats.totalTrades);
  userStats.save();

  updateBinVolumes(
    extractRawMarketId(userPosition.market),
    userPosition.lowerTick,
    userPosition.upperTick,
    event.params.proceeds
  );

  let marketStats = getOrCreateMarketStats(userPosition.market);

  // PnL 업데이트 - CLOSE에서 마켓이 proceeds를 지급
  marketStats.totalBetPaidOut = marketStats.totalBetPaidOut.plus(
    event.params.proceeds
  );
  updateMarketPnL(marketStats);

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
  const userPosition = loadPosOrSkip(
    buildPositionId(event.params.positionId),
    "handlePositionDecreased"
  );
  if (userPosition == null) return;
  let oldQuantity = userPosition.currentQuantity;
  // 분모 0 가드
  if (oldQuantity.equals(BigInt.fromI32(0))) {
    log.warning(
      "[handlePositionDecreased] oldQuantity is 0, skip portions",
      []
    );
    return;
  }
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

  // Store original weightedEntryTime before potentially resetting it
  let originalWeightedEntryTime = userPosition.weightedEntryTime;

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

  // Performance & Risk Bonus Points 처리
  let userStats = getOrCreateUserStats(event.params.trader);
  let userRange = userPosition.upperTick.minus(userPosition.lowerTick);
  let market = loadMarketOrSkip(userPosition.market, "handlePositionDecreased");
  if (market == null) return;
  let marketRange = market.maxTick.minus(market.minTick);
  let holdingSeconds = event.block.timestamp.minus(originalWeightedEntryTime);

  // Performance Points 계산 및 적립
  let performancePt = calcPerformancePoints(tradeRealizedPnL);
  if (performancePt.gt(BigInt.fromI32(0))) {
    addPerformancePoints(userStats, performancePt);
  }

  // Risk Bonus Points 계산 및 적립
  let riskBonusPt = calcRiskBonusPoints(
    activityPortion,
    userRange,
    marketRange,
    holdingSeconds
  );
  if (riskBonusPt.gt(BigInt.fromI32(0))) {
    addRiskBonusPoints(userStats, riskBonusPt);
  }

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

  trade.activityPt = BigInt.fromI32(0);
  trade.performancePt = performancePt;
  trade.riskBonusPt = riskBonusPt;
  trade.save();

  updateBinVolumes(
    extractRawMarketId(userPosition.market),
    userPosition.lowerTick,
    userPosition.upperTick,
    event.params.proceeds
  );

  userStats.totalTrades = userStats.totalTrades.plus(BigInt.fromI32(1));
  userStats.totalVolume = userStats.totalVolume.plus(event.params.proceeds);
  userStats.totalProceeds = userStats.totalProceeds.plus(event.params.proceeds);
  userStats.lastTradeAt = event.block.timestamp;
  userStats.save();

  let marketStats = getOrCreateMarketStats(userPosition.market);

  // PnL 업데이트 - DECREASE에서 마켓이 proceeds를 지급
  marketStats.totalBetPaidOut = marketStats.totalBetPaidOut.plus(
    event.params.proceeds
  );
  updateMarketPnL(marketStats);

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
  // ========================================
  // PnL TRACKING: UPDATE USER POSITION & CREATE TRADE
  // ========================================

  // Update UserPosition
  const userPosition = loadPosOrSkip(
    buildPositionId(event.params.positionId),
    "handlePositionIncreased"
  );
  if (userPosition == null) return;

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

  // Activity Points 처리 (하루 3번 제한)
  let userStats = getOrCreateUserStats(event.params.trader);
  let activityPt = BigInt.fromI32(0);

  if (checkActivityLimit(userStats, event.block.timestamp)) {
    activityPt = calcActivityPoints(event.params.cost);
    addActivityPoints(userStats, activityPt);
  }

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

  trade.activityPt = activityPt;
  trade.performancePt = BigInt.fromI32(0);
  trade.riskBonusPt = BigInt.fromI32(0);
  trade.save();

  userPosition.activityRemaining =
    userPosition.activityRemaining.plus(activityPt);
  userPosition.save();

  updateBinVolumes(
    extractRawMarketId(userPosition.market),
    userPosition.lowerTick,
    userPosition.upperTick,
    event.params.cost
  );

  userStats.totalTrades = userStats.totalTrades.plus(BigInt.fromI32(1));
  userStats.totalVolume = userStats.totalVolume.plus(event.params.cost);
  userStats.totalCosts = userStats.totalCosts.plus(event.params.cost);
  userStats.lastTradeAt = event.block.timestamp;
  userStats.save();

  let marketStats = getOrCreateMarketStats(userPosition.market);

  // PnL 업데이트 - INCREASE에서 마켓이 cost를 받음
  marketStats.totalBetReceived = marketStats.totalBetReceived.plus(
    event.params.cost
  );
  updateMarketPnL(marketStats);

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
  let userPosition = new UserPosition(buildPositionId(event.params.positionId));
  userPosition.positionId = event.params.positionId;
  userPosition.user = event.params.trader;
  userPosition.stats = event.params.trader;
  userPosition.market = buildMarketId(event.params.marketId);
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

  // Activity Points 처리 (하루 3번 제한)
  let userStats = getOrCreateUserStats(event.params.trader);
  let activityPt = BigInt.fromI32(0);

  if (checkActivityLimit(userStats, event.block.timestamp)) {
    activityPt = calcActivityPoints(event.params.cost);
    addActivityPoints(userStats, activityPt);
  }

  let trade = new Trade(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  trade.userPosition = userPosition.id;
  trade.user = event.params.trader;
  trade.market = buildMarketId(event.params.marketId);
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

  trade.activityPt = activityPt;
  trade.performancePt = BigInt.fromI32(0);
  trade.riskBonusPt = BigInt.fromI32(0);
  trade.save();

  userPosition.activityRemaining = activityPt;
  userPosition.save();

  updateBinVolumes(
    event.params.marketId,
    event.params.lowerTick,
    event.params.upperTick,
    event.params.cost
  );

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
  userStats.save();

  let marketStats = getOrCreateMarketStats(
    buildMarketId(event.params.marketId)
  );

  // PnL 업데이트 - OPEN에서 마켓이 cost를 받음
  marketStats.totalBetReceived = marketStats.totalBetReceived.plus(
    event.params.cost
  );
  updateMarketPnL(marketStats);

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
  const market = loadMarketOrSkip(
    buildMarketId(event.params.marketId),
    "handleRangeFactorApplied"
  );
  if (market == null) return;

  // 인덱스 계산 + 범위 클램프
  let lo = event.params.lo
    .minus(market.minTick)
    .div(market.tickSpacing)
    .toI32();
  let hi =
    event.params.hi.minus(market.minTick).div(market.tickSpacing).toI32() - 1;
  const maxIdx = market.numBins.toI32() - 1;
  if (lo < 0) lo = 0;
  if (hi < 0) hi = 0;
  if (lo > maxIdx) lo = maxIdx;
  if (hi > maxIdx) hi = maxIdx;

  for (let i = lo; i <= hi; i++) {
    const bin = loadBinOrSkip(
      buildBinStateId(event.params.marketId, i),
      "handleRangeFactorApplied"
    );
    if (bin == null) continue;
    bin.currentFactor = bin.currentFactor
      .times(event.params.factor)
      .div(BigInt.fromString("1000000000000000000"));
    bin.lastUpdated = event.block.timestamp;
    bin.updateCount = bin.updateCount.plus(BigInt.fromI32(1));
    bin.save();
  }

  const dist = loadDistOrSkip(market.id, "handleRangeFactorApplied");
  if (dist == null) return;

  // dist 재계산 루프에서 BinState가 null일 수 있으니 또 한번 체크
  let total = BigInt.fromI32(0);
  let min = BigInt.fromString("999999999999999999999999999999");
  let max = BigInt.fromI32(0);
  let factors: Array<string> = [];
  let vols: Array<string> = [];

  for (let i = 0; i < market.numBins.toI32(); i++) {
    const bin = loadBinOrSkip(
      buildBinStateId(event.params.marketId, i),
      "handleRangeFactorApplied"
    );
    if (bin == null) {
      factors.push("0");
      vols.push("0");
      continue;
    }
    total = total.plus(bin.currentFactor);
    if (bin.currentFactor.lt(min)) min = bin.currentFactor;
    if (bin.currentFactor.gt(max)) max = bin.currentFactor;
    factors.push(bin.currentFactor.toString());
    vols.push(bin.totalVolume.toString());
  }

  dist.totalSum = total;
  dist.minFactor = min;
  dist.maxFactor = max;
  dist.avgFactor = total.div(market.numBins);
  dist.binFactors = factors;
  dist.binVolumes = vols;
  dist.version = dist.version.plus(BigInt.fromI32(1));
  dist.lastSnapshotAt = event.block.timestamp;
  dist.save();

  market.lastUpdated = event.block.timestamp;
  market.save();
}
