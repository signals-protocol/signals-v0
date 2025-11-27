import {
  BigInt,
  BigDecimal,
  Bytes,
  Address,
  dataSource,
  log,
} from "@graphprotocol/graph-ts";
import { loadMarketOrSkip, loadPosOrSkip, loadBinOrSkip } from "./_safeload";
import { wad, zero, one } from "./constants";
import { computeRangeFactorCorrection } from "./range-factor-correction";
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
  MarketReopened as MarketReopenedEvent,
  PositionSettled as PositionSettledEvent,
  MarketCreated as MarketCreatedEvent,
  MarketSettled as MarketSettledEvent,
  MarketSettlementValueSubmitted as MarketSettlementValueSubmittedEvent,
  MarketTimingUpdated as MarketTimingUpdatedEvent,
  SettlementTimestampUpdated as SettlementTimestampUpdatedEvent,
  RangeFactorApplied as RangeFactorAppliedEvent,
  MarketActivationUpdated as MarketActivationUpdatedEvent,
  MarketFeePolicySet as MarketFeePolicySetEvent,
  TradeFeeCharged as TradeFeeChargedEvent,
} from "../generated/CLMSRMarketCore/CLMSRMarketCore";

import {
  Market,
  UserPosition,
  Trade,
  UserStats,
  MarketStats,
  BinState,
} from "../generated/schema";
import { ICLMSRFeePolicy } from "../generated/CLMSRMarketCore/ICLMSRFeePolicy";

// ============= ID HELPER FUNCTIONS =============

/**
 * 공통 ID 생성 헬퍼 함수
 */
export function buildId(raw: BigInt): string {
  return raw.toString();
}

/**
 * MarketId 기반 ID 생성 (Market, MarketStats 용)
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
    userStats.totalFeesPaid = BigInt.fromI32(0);
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
    if (binState == null) {
      // get-or-create: create missing BinState with defaults
      let lowerTickBin = market.minTick.plus(
        BigInt.fromI32(binIndex).times(market.tickSpacing)
      );
      let upperTickBin = lowerTickBin.plus(market.tickSpacing);
      binState = new BinState(binStateId);
      binState.market = buildMarketId(marketId);
      binState.binIndex = BigInt.fromI32(binIndex);
      binState.lowerTick = lowerTickBin;
      binState.upperTick = upperTickBin;
      binState.currentFactor = BigInt.fromString("1000000000000000000");
      binState.lastUpdated = market.lastUpdated;
      binState.updateCount = BigInt.fromI32(0);
      binState.totalVolume = BigInt.fromI32(0);
    }
    binState.totalVolume = binState.totalVolume.plus(volume);
    binState.save();
  }

  // MarketDistribution 제거로 성능 최적화 - BinState만 업데이트
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
  market.settlementTimestamp = event.params.endTimestamp; // fallback for legacy compatibility
  market.numBins = event.params.numBins;
  market.liquidityParameter = event.params.liquidityParameter;
  market.isActive = false;
  market.isSettled = false;
  market.settlementValue = null;
  market.settlementTick = null;
  market.lastUpdated = event.block.timestamp;
  market.feePolicyAddress = Bytes.fromHexString(
    "0x0000000000000000000000000000000000000000"
  ) as Bytes;
  market.feePolicyDescriptor = null;
  market.save();

  let marketStats = getOrCreateMarketStats(marketIdStr);
  marketStats.lastUpdated = event.block.timestamp;
  marketStats.save();

  // 배열 제거로 성능 최적화 - BinState만 생성
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
  }

  // MarketDistribution 제거로 성능 최적화 - BinState만 생성
}

export function handleMarketSettled(event: MarketSettledEvent): void {
  const marketId = buildMarketId(event.params.marketId);
  const market = loadMarketOrSkip(marketId, "handleMarketSettled");
  if (market == null) return;
  market.isSettled = true;
  market.isActive = false;
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

export function handleMarketTimingUpdated(
  event: MarketTimingUpdatedEvent
): void {
  const market = loadMarketOrSkip(
    buildMarketId(event.params.marketId),
    "handleMarketTimingUpdated"
  );
  if (market == null) return;
  market.startTimestamp = event.params.newStartTimestamp;
  market.endTimestamp = event.params.newEndTimestamp;
  market.lastUpdated = event.block.timestamp;
  market.save();
}

export function handleSettlementTimestampUpdated(
  event: SettlementTimestampUpdatedEvent
): void {
  const market = loadMarketOrSkip(
    buildMarketId(event.params.marketId),
    "handleSettlementTimestampUpdated"
  );
  if (market == null) return;
  market.settlementTimestamp = event.params.settlementTimestamp;
  market.lastUpdated = event.block.timestamp;
  market.save();
}

export function handleMarketReopened(event: MarketReopenedEvent): void {
  const market = loadMarketOrSkip(
    buildMarketId(event.params.marketId),
    "handleMarketReopened"
  );
  if (market == null) return;
  // 재오픈 시 정산 상태 초기화 및 활성화
  market.isSettled = false;
  market.isActive = true;
  market.settlementTick = null;
  market.settlementValue = null;
  market.lastUpdated = event.block.timestamp;
  market.save();

  // MarketStats는 구조 자체를 초기화할 필요 없음. lastUpdated만 갱신
  const stats = getOrCreateMarketStats(market.id);
  stats.lastUpdated = event.block.timestamp;
  stats.save();
}

export function handleMarketActivationUpdated(
  event: MarketActivationUpdatedEvent
): void {
  const market = loadMarketOrSkip(
    buildMarketId(event.params.marketId),
    "handleMarketActivationUpdated"
  );
  if (market == null) return;
  market.isActive = event.params.isActive;
  market.lastUpdated = event.block.timestamp;
  market.save();

  const stats = getOrCreateMarketStats(market.id);
  stats.lastUpdated = event.block.timestamp;
  stats.save();
}

export function handleMarketFeePolicySet(event: MarketFeePolicySetEvent): void {
  const marketId = buildMarketId(event.params.marketId);
  const market = loadMarketOrSkip(marketId, "handleMarketFeePolicySet");
  if (market == null) return;
  const newPolicy = event.params.newPolicy;
  market.feePolicyAddress = newPolicy;

  // 성능 최적화: RPC 호출 제거 - descriptor는 필요시 클라이언트에서 조회
  // RPC 호출은 인덱싱 속도를 크게 저하시킴
  market.feePolicyDescriptor = null;

  market.lastUpdated = event.block.timestamp;
  market.save();

  const stats = getOrCreateMarketStats(marketId);
  stats.lastUpdated = event.block.timestamp;
  stats.save();
}

export function handleTradeFeeCharged(event: TradeFeeChargedEvent): void {
  const marketIdStr = buildMarketId(event.params.marketId);
  const logIndex = event.logIndex.toI32();
  let matched = false;

  // Search backwards for a matching trade within the same tx
  for (let offset = 1; offset <= 16 && logIndex - offset >= 0; offset++) {
    let candidateId = event.transaction.hash.concatI32(logIndex - offset);
    let trade = Trade.load(candidateId);
    if (trade == null) {
      continue;
    }

    if (trade.market != marketIdStr) {
      continue;
    }
    if (!trade.positionId.equals(event.params.positionId)) {
      continue;
    }
    if (!trade.feeAmount.equals(BigInt.fromI32(0))) {
      continue;
    }

    let isMatchingType = event.params.isBuy
      ? trade.type == "OPEN" || trade.type == "INCREASE"
      : trade.type == "DECREASE" || trade.type == "CLOSE";

    if (!isMatchingType) {
      continue;
    }

    trade.feeAmount = event.params.feeAmount;
    trade.feePolicyAddress = event.params.policy;
    trade.save();

    let userPosition = UserPosition.load(trade.userPosition);
    if (userPosition != null) {
      userPosition.totalFeesPaid = userPosition.totalFeesPaid.plus(
        event.params.feeAmount
      );
      userPosition.save();

      let userStats = getOrCreateUserStats(userPosition.user);
      userStats.totalFeesPaid = userStats.totalFeesPaid.plus(
        event.params.feeAmount
      );
      userStats.save();
    }

    matched = true;
    break;
  }

  if (!matched) {
    log.warning(
      "[handleTradeFeeCharged] Matching trade not found for tx {} log {}",
      [event.transaction.hash.toHex(), event.logIndex.toString()]
    );
  }

  let marketStats = getOrCreateMarketStats(marketIdStr);
  marketStats.totalFees = marketStats.totalFees.plus(event.params.feeAmount);
  marketStats.lastUpdated = event.block.timestamp;
  marketStats.save();
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
  userPosition.totalProceeds = userPosition.totalProceeds.plus(payout);
  // realizedPnL = totalProceeds - totalCosts
  let calculatedPnL = userPosition.totalProceeds.minus(userPosition.totalCosts);
  userPosition.realizedPnL = calculatedPnL;
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
  trade.feeAmount = BigInt.fromI32(0);
  trade.feePolicyAddress = Address.zero();
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
  let tradeRealizedPnL = event.params.proceeds.minus(userPosition.currentCost);

  userPosition.currentQuantity = BigInt.fromI32(0);
  userPosition.totalQuantitySold =
    userPosition.totalQuantitySold.plus(closedQuantity);
  userPosition.totalProceeds = userPosition.totalProceeds.plus(
    event.params.proceeds
  );
  // Store values before resetting for risk calculation
  let originalActivityRemaining = userPosition.activityRemaining;
  let originalWeightedEntryTime = userPosition.weightedEntryTime;

  // totalCosts는 유지 (절대 변경 안 함)
  userPosition.currentCost = BigInt.fromI32(0); // 현재 포지션 비용 0으로 리셋
  // realizedPnL = totalProceeds - totalCosts
  userPosition.realizedPnL = userPosition.totalProceeds.minus(
    userPosition.totalCosts
  );
  userPosition.outcome = "CLOSED";
  userPosition.activityRemaining = BigInt.fromI32(0);
  userPosition.weightedEntryTime = BigInt.fromI32(0);
  userPosition.averageEntryPrice = BigInt.fromI32(0);
  userPosition.lastUpdated = event.block.timestamp;
  userPosition.tradeCount = userPosition.tradeCount.plus(BigInt.fromI32(1));
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
  trade.feeAmount = BigInt.fromI32(0);
  trade.feePolicyAddress = Address.zero();

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
  let costPortion = userPosition.currentCost
    .times(event.params.sellQuantity)
    .div(oldQuantity);

  let tradeRealizedPnL = event.params.proceeds.minus(costPortion);

  userPosition.currentQuantity = event.params.newQuantity;
  // totalCosts는 유지 (절대 감소하지 않음)
  userPosition.currentCost = userPosition.currentCost.minus(costPortion); // 현재 포지션 비용만 비례 감소
  userPosition.totalQuantitySold = userPosition.totalQuantitySold.plus(
    event.params.sellQuantity
  );
  userPosition.totalProceeds = userPosition.totalProceeds.plus(
    event.params.proceeds
  );
  userPosition.realizedPnL = userPosition.realizedPnL.plus(tradeRealizedPnL);

  userPosition.averageEntryPrice = calculateRawPrice(
    userPosition.currentCost,
    userPosition.currentQuantity
  );

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

  userPosition.tradeCount = userPosition.tradeCount.plus(BigInt.fromI32(1));
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
  trade.feeAmount = BigInt.fromI32(0);
  trade.feePolicyAddress = Address.zero();

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

  userPosition.totalCosts = userPosition.totalCosts.plus(event.params.cost); // 총 매수 비용 누적
  userPosition.currentCost = userPosition.currentCost.plus(event.params.cost); // 현재 포지션 비용 증가
  userPosition.totalQuantityBought = userPosition.totalQuantityBought.plus(
    event.params.additionalQuantity
  );
  userPosition.currentQuantity = event.params.newQuantity;

  userPosition.averageEntryPrice = calculateRawPrice(
    userPosition.currentCost,
    userPosition.currentQuantity
  );

  let currentTime = event.block.timestamp;
  let oldQuantity = userPosition.currentQuantity.minus(
    event.params.additionalQuantity
  );
  userPosition.weightedEntryTime = userPosition.weightedEntryTime
    .times(oldQuantity)
    .plus(currentTime.times(event.params.additionalQuantity))
    .div(userPosition.currentQuantity);

  userPosition.tradeCount = userPosition.tradeCount.plus(BigInt.fromI32(1));
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
  trade.feeAmount = BigInt.fromI32(0);
  trade.feePolicyAddress = Address.zero();

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
  userPosition.totalCosts = event.params.cost; // 신규: 총 매수 비용 누적
  userPosition.currentCost = event.params.cost; // 신규: 현재 포지션 비용
  userPosition.averageEntryPrice = calculateRawPrice(
    event.params.cost,
    event.params.quantity
  );
  userPosition.totalQuantityBought = event.params.quantity;
  userPosition.totalQuantitySold = BigInt.fromI32(0);
  userPosition.totalProceeds = BigInt.fromI32(0);
  userPosition.totalFeesPaid = BigInt.fromI32(0);
  userPosition.realizedPnL = BigInt.fromI32(0);
  userPosition.tradeCount = BigInt.fromI32(1);
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
  trade.feeAmount = BigInt.fromI32(0);
  trade.feePolicyAddress = Address.zero();

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

  // Event lo/hi are TICK boundaries [lo, hi); convert to inclusive bin indices
  // and clamp to valid range
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

  const bins = new Array<BinState>();
  const values = new Array<BigInt>();

  for (let i = lo; i <= hi; i++) {
    const id = buildBinStateId(event.params.marketId, i);
    let bin = loadBinOrSkip(id, "handleRangeFactorApplied");
    let binState: BinState;
    if (bin == null) {
      const lowerTickBin = market.minTick.plus(
        BigInt.fromI32(i).times(market.tickSpacing)
      );
      const upperTickBin = lowerTickBin.plus(market.tickSpacing);
      binState = new BinState(id);
      binState.market = market.id;
      binState.binIndex = BigInt.fromI32(i);
      binState.lowerTick = lowerTickBin;
      binState.upperTick = upperTickBin;
      binState.currentFactor = wad();
      binState.lastUpdated = event.block.timestamp;
      binState.updateCount = zero();
      binState.totalVolume = zero();
    } else {
      binState = bin;
    }
    bins.push(binState);
    values.push(binState.currentFactor);
  }

  const correction = computeRangeFactorCorrection(values, event.params.factor);

  for (let i = 0; i < bins.length; i++) {
    const binState = bins[i];
    const nextValue = correction.correctedValues[i];
    binState.currentFactor = nextValue;
    binState.lastUpdated = event.block.timestamp;
    binState.updateCount = binState.updateCount.plus(one());
    binState.save();
  }

  // MarketDistribution 완전 제거로 성능 최적화 - 별도 처리 불필요

  market.lastUpdated = event.block.timestamp;
  market.save();
}
