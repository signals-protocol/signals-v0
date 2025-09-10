import { CLMSRMarketCore, PointsGranter, BigDecimal } from "generated";

const WAD = 1000000000000000000n;
const ONE_E6 = 1000000n;

function toId(value: bigint): string {
  return value.toString();
}

function makeTradeId(txHash: string, logIndex: bigint): string {
  return `${txHash}-${logIndex.toString()}`;
}

// ===== create-or-get helpers =====
async function getOrCreateUserStats(context: any, user: string) {
  const found = await context.UserStats.get(user);
  if (found) return found;
  const zero = 0n;
  const created = {
    id: user,
    user,
    totalTrades: zero,
    totalVolume: zero,
    totalCosts: zero,
    totalProceeds: zero,
    totalRealizedPnL: zero,
    totalGasFees: zero,
    netPnL: zero,
    activePositionsCount: zero,
    winningTrades: zero,
    losingTrades: zero,
    winRate: new BigDecimal(0),
    avgTradeSize: zero,
    firstTradeAt: zero,
    lastTradeAt: zero,
    totalPoints: zero,
    activityPoints: zero,
    performancePoints: zero,
    riskBonusPoints: zero,
    activityPointsToday: zero,
    lastActivityDay: zero,
  };
  context.UserStats.set(created);
  return created;
}

async function getOrCreateMarketStats(context: any, marketId: string) {
  const found = await context.MarketStats.get(marketId);
  if (found) return found;
  const zero = 0n;
  const created = {
    id: marketId,
    market_id: marketId,
    totalVolume: zero,
    totalTrades: zero,
    totalFees: zero,
    highestPrice: zero,
    lowestPrice: 999999999999999n,
    currentPrice: zero,
    priceChange24h: new BigDecimal(0),
    volume24h: zero,
    lastUpdated: zero,
    totalBetReceived: zero,
    totalBetPaidOut: zero,
    bettingNetIncome: zero,
    totalSettlementPayout: zero,
    totalClaimedPayout: zero,
    unclaimedPayout: zero,
    totalMarketPnL: zero,
    realizedMarketPnL: zero,
  };
  context.MarketStats.set(created);
  return created;
}

function calculateRawPrice(cost: bigint, quantity: bigint): bigint {
  if (quantity === 0n) return 0n;
  return (cost * ONE_E6) / quantity;
}

function updateMarketPnL(stats: any) {
  stats.bettingNetIncome = stats.totalBetReceived - stats.totalBetPaidOut;
  stats.unclaimedPayout =
    stats.totalSettlementPayout - stats.totalClaimedPayout;
  stats.totalMarketPnL = stats.bettingNetIncome - stats.totalSettlementPayout;
  stats.realizedMarketPnL = stats.bettingNetIncome - stats.totalClaimedPayout;
}

async function updateBinVolumes(
  context: any,
  marketId: string,
  lowerTick: bigint,
  upperTick: bigint,
  volume: bigint
) {
  const market = await context.Market.get(marketId);
  if (!market) return;

  let lowerBinBig = (lowerTick - market.minTick) / market.tickSpacing;
  let upperBinBig = (upperTick - market.minTick) / market.tickSpacing - 1n;

  const maxIdx = Number(market.numBins - 1n);
  let lo = Number(lowerBinBig);
  let hi = Number(upperBinBig);
  if (lo < 0) lo = 0;
  if (hi < 0) hi = 0;
  if (lo > maxIdx) lo = maxIdx;
  if (hi > maxIdx) hi = maxIdx;

  for (let i = lo; i <= hi; i++) {
    const binId = `${marketId}-${i}`;
    const existing = await context.BinState.get(binId);
    if (!existing) {
      const lowerTickBin = market.minTick + BigInt(i) * market.tickSpacing;
      const upperTickBin = lowerTickBin + market.tickSpacing;
      context.BinState.set({
        id: binId,
        market_id: marketId,
        binIndex: BigInt(i),
        lowerTick: lowerTickBin,
        upperTick: upperTickBin,
        currentFactor: WAD,
        lastUpdated: market.lastUpdated,
        updateCount: 0n,
        totalVolume: 0n,
      });
    }
    const latest = await context.BinState.getOrThrow(binId);
    context.BinState.set({
      ...latest,
      totalVolume: latest.totalVolume + volume,
    });
  }
}

// ===== Points helpers =====
function getUtcDay(timestamp: bigint): bigint {
  return timestamp / 86400n;
}

function checkActivityLimit(userStats: any, timestamp: bigint): boolean {
  const currentDay = getUtcDay(timestamp);
  if (userStats.lastActivityDay < currentDay) {
    userStats.activityPointsToday = 0n;
    userStats.lastActivityDay = currentDay;
  }
  return userStats.activityPointsToday < 3n;
}

function calcActivityPoints(cost: bigint): bigint {
  return cost / 10n;
}

function calcPerformancePoints(realizedPnL: bigint): bigint {
  return realizedPnL > 0n ? realizedPnL : 0n;
}

function calcRiskBonusPoints(
  activityPoints: bigint,
  userRange: bigint,
  marketRange: bigint,
  holdingSeconds: bigint
): bigint {
  if (holdingSeconds < 3600n) return 0n;
  let rangeDiff = marketRange - userRange;
  if (rangeDiff < 0n) rangeDiff = 0n;
  let multiplier = 1000000n + (rangeDiff * 1000000n) / marketRange;
  if (multiplier > 2000000n) multiplier = 2000000n;
  let risk = (((activityPoints * 300000n) / 1000000n) * multiplier) / 1000000n;
  const maxRisk = activityPoints * 2n;
  return risk > maxRisk ? maxRisk : risk;
}

function addActivityPoints(userStats: any, amount: bigint) {
  userStats.totalPoints = userStats.totalPoints + amount;
  userStats.activityPoints = userStats.activityPoints + amount;
  userStats.activityPointsToday = userStats.activityPointsToday + 1n;
}

function addPerformancePoints(userStats: any, amount: bigint) {
  userStats.totalPoints = userStats.totalPoints + amount;
  userStats.performancePoints = userStats.performancePoints + amount;
}

function addRiskBonusPoints(userStats: any, amount: bigint) {
  userStats.totalPoints = userStats.totalPoints + amount;
  userStats.riskBonusPoints = userStats.riskBonusPoints + amount;
}

// ===== Event Handlers =====
CLMSRMarketCore.MarketCreated.handler(async ({ event, context }) => {
  const marketId = toId(event.params.marketId);
  const exist = await context.Market.get(marketId);
  if (!exist) {
    context.Market.set({
      id: marketId,
      marketId: event.params.marketId,
      minTick: event.params.minTick,
      maxTick: event.params.maxTick,
      tickSpacing: event.params.tickSpacing,
      startTimestamp: event.params.startTimestamp,
      endTimestamp: event.params.endTimestamp,
      numBins: event.params.numBins,
      liquidityParameter: event.params.liquidityParameter,
      isSettled: false,
      settlementValue: undefined,
      settlementTick: undefined,
      lastUpdated: event.block.timestamp,
    });
  } else {
    context.Market.set({
      ...exist,
      minTick: event.params.minTick,
      maxTick: event.params.maxTick,
      tickSpacing: event.params.tickSpacing,
      startTimestamp: event.params.startTimestamp,
      endTimestamp: event.params.endTimestamp,
      numBins: event.params.numBins,
      liquidityParameter: event.params.liquidityParameter,
      isSettled: false,
      settlementValue: undefined,
      settlementTick: undefined,
      lastUpdated: event.block.timestamp,
    });
  }

  const stats = await getOrCreateMarketStats(context, marketId);
  context.MarketStats.set({ ...stats, lastUpdated: event.block.timestamp });

  for (let i = 0; i < Number(event.params.numBins); i++) {
    const lowerTick =
      event.params.minTick + BigInt(i) * event.params.tickSpacing;
    const upperTick = lowerTick + event.params.tickSpacing;
    context.BinState.set({
      id: `${marketId}-${i}`,
      market_id: marketId,
      binIndex: BigInt(i),
      lowerTick,
      upperTick,
      currentFactor: WAD,
      lastUpdated: event.block.timestamp,
      updateCount: 0n,
      totalVolume: 0n,
    });
  }
});

CLMSRMarketCore.MarketSettled.handler(async ({ event, context }) => {
  const id = toId(event.params.marketId);
  const market = await context.Market.get(id);
  if (!market) return;
  context.Market.set({
    ...market,
    isSettled: true,
    settlementTick: event.params.settlementTick,
    settlementValue: event.params.settlementTick * ONE_E6,
    lastUpdated: event.block.timestamp,
  });
});

CLMSRMarketCore.MarketSettlementValueSubmitted.handler(
  async ({ event, context }) => {
    const id = toId(event.params.marketId);
    const market = await context.Market.get(id);
    if (!market) return;
    context.Market.set({
      ...market,
      settlementValue: event.params.settlementValue,
      lastUpdated: event.block.timestamp,
    });
  }
);

CLMSRMarketCore.MarketReopened.handler(async ({ event, context }) => {
  const id = toId(event.params.marketId);
  const market = await context.Market.get(id);
  if (!market) return;
  context.Market.set({
    ...market,
    isSettled: false,
    settlementTick: undefined,
    settlementValue: undefined,
    lastUpdated: event.block.timestamp,
  });
  const stats = await getOrCreateMarketStats(context, id);
  context.MarketStats.set({ ...stats, lastUpdated: event.block.timestamp });
});

CLMSRMarketCore.PositionOpened.handler(async ({ event, context }) => {
  const posId = toId(event.params.positionId);
  const marketId = toId(event.params.marketId);
  const averageEntryPrice = calculateRawPrice(
    event.params.cost,
    event.params.quantity
  );

  context.UserPosition.set({
    id: posId,
    positionId: event.params.positionId,
    user: event.params.trader,
    stats_id: event.params.trader,
    market_id: marketId,
    lowerTick: event.params.lowerTick,
    upperTick: event.params.upperTick,
    currentQuantity: event.params.quantity,
    totalCostBasis: event.params.cost,
    averageEntryPrice,
    totalQuantityBought: event.params.quantity,
    totalQuantitySold: 0n,
    totalProceeds: 0n,
    realizedPnL: 0n,
    outcome: "OPEN",
    isClaimed: false,
    createdAt: event.block.timestamp,
    lastUpdated: event.block.timestamp,
    activityRemaining: 0n,
    weightedEntryTime: event.block.timestamp,
  });

  const userStats = await getOrCreateUserStats(context, event.params.trader);
  let activityPt = 0n;
  if (checkActivityLimit(userStats, event.block.timestamp)) {
    activityPt = calcActivityPoints(event.params.cost);
    addActivityPoints(userStats, activityPt);
  }

  context.Trade.set({
    id: makeTradeId(event.transaction.hash, event.logIndex),
    userPosition: posId,
    user: event.params.trader,
    market_id: marketId,
    positionId: event.params.positionId,
    tradeType: "OPEN",
    lowerTick: event.params.lowerTick,
    upperTick: event.params.upperTick,
    quantity: event.params.quantity,
    costOrProceeds: event.params.cost,
    price: averageEntryPrice,
    gasUsed: 0n,
    gasPrice: 0n,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
    transactionHash: event.transaction.hash,
    activityPt,
    performancePt: 0n,
    riskBonusPt: 0n,
  });

  const createdPos = await context.UserPosition.getOrThrow(posId);
  context.UserPosition.set({
    ...createdPos,
    activityRemaining: createdPos.activityRemaining + activityPt,
  });

  await updateBinVolumes(
    context,
    marketId,
    event.params.lowerTick,
    event.params.upperTick,
    event.params.cost
  );

  userStats.activePositionsCount = userStats.activePositionsCount + 1n;
  userStats.totalTrades = userStats.totalTrades + 1n;
  userStats.totalVolume = userStats.totalVolume + event.params.cost;
  userStats.totalCosts = userStats.totalCosts + event.params.cost;
  userStats.lastTradeAt = event.block.timestamp;
  if (userStats.firstTradeAt === 0n)
    userStats.firstTradeAt = event.block.timestamp;
  userStats.avgTradeSize =
    userStats.totalTrades === 0n
      ? 0n
      : userStats.totalVolume / userStats.totalTrades;
  context.UserStats.set(userStats);

  const marketStats = await getOrCreateMarketStats(context, marketId);
  marketStats.totalBetReceived =
    marketStats.totalBetReceived + event.params.cost;
  updateMarketPnL(marketStats);
  marketStats.totalVolume = marketStats.totalVolume + event.params.cost;
  marketStats.totalTrades = marketStats.totalTrades + 1n;
  marketStats.currentPrice = averageEntryPrice;
  marketStats.lastUpdated = event.block.timestamp;
  if (averageEntryPrice > marketStats.highestPrice)
    marketStats.highestPrice = averageEntryPrice;
  if (averageEntryPrice < marketStats.lowestPrice)
    marketStats.lowestPrice = averageEntryPrice;
  context.MarketStats.set(marketStats);
});

CLMSRMarketCore.PositionIncreased.handler(async ({ event, context }) => {
  const userPosition = await context.UserPosition.get(
    toId(event.params.positionId)
  );
  if (!userPosition) return;

  const newTotalCost = userPosition.totalCostBasis + event.params.cost;
  const newTotalQtyBought =
    userPosition.totalQuantityBought + event.params.additionalQuantity;
  const newQuantity = event.params.newQuantity;

  const currentTime = event.block.timestamp;
  const oldQuantity =
    userPosition.currentQuantity - event.params.additionalQuantity;
  const weightedEntryTime =
    userPosition.currentQuantity === 0n
      ? currentTime
      : (userPosition.weightedEntryTime * oldQuantity +
          currentTime * event.params.additionalQuantity) /
        newQuantity;

  const updatedPos = {
    ...userPosition,
    totalCostBasis: newTotalCost,
    totalQuantityBought: newTotalQtyBought,
    currentQuantity: newQuantity,
    averageEntryPrice: calculateRawPrice(newTotalCost, newTotalQtyBought),
    weightedEntryTime,
    lastUpdated: event.block.timestamp,
  };
  context.UserPosition.set(updatedPos);

  const userStats = await getOrCreateUserStats(context, event.params.trader);
  let activityPt = 0n;
  if (checkActivityLimit(userStats, event.block.timestamp)) {
    activityPt = calcActivityPoints(event.params.cost);
    addActivityPoints(userStats, activityPt);
  }

  context.Trade.set({
    id: makeTradeId(event.transaction.hash, event.logIndex),
    userPosition: userPosition.id,
    user: event.params.trader,
    market_id: userPosition.market_id,
    positionId: event.params.positionId,
    tradeType: "INCREASE",
    lowerTick: userPosition.lowerTick,
    upperTick: userPosition.upperTick,
    quantity: event.params.additionalQuantity,
    costOrProceeds: event.params.cost,
    price: calculateRawPrice(
      event.params.cost,
      event.params.additionalQuantity
    ),
    gasUsed: 0n,
    gasPrice: 0n,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
    transactionHash: event.transaction.hash,
    activityPt,
    performancePt: 0n,
    riskBonusPt: 0n,
  });

  updatedPos.activityRemaining = updatedPos.activityRemaining + activityPt;
  context.UserPosition.set(updatedPos);

  await updateBinVolumes(
    context,
    userPosition.market_id,
    userPosition.lowerTick,
    userPosition.upperTick,
    event.params.cost
  );

  userStats.totalTrades = userStats.totalTrades + 1n;
  userStats.totalVolume = userStats.totalVolume + event.params.cost;
  userStats.totalCosts = userStats.totalCosts + event.params.cost;
  userStats.lastTradeAt = event.block.timestamp;
  context.UserStats.set(userStats);

  const marketStats = await getOrCreateMarketStats(
    context,
    userPosition.market_id
  );
  marketStats.totalBetReceived =
    marketStats.totalBetReceived + event.params.cost;
  updateMarketPnL(marketStats);
  marketStats.totalVolume = marketStats.totalVolume + event.params.cost;
  marketStats.totalTrades = marketStats.totalTrades + 1n;
  marketStats.currentPrice = updatedPos.averageEntryPrice;
  marketStats.lastUpdated = event.block.timestamp;
  if (updatedPos.averageEntryPrice > marketStats.highestPrice)
    marketStats.highestPrice = updatedPos.averageEntryPrice;
  if (updatedPos.averageEntryPrice < marketStats.lowestPrice)
    marketStats.lowestPrice = updatedPos.averageEntryPrice;
  context.MarketStats.set(marketStats);
});

CLMSRMarketCore.PositionDecreased.handler(async ({ event, context }) => {
  const userPosition = await context.UserPosition.get(
    toId(event.params.positionId)
  );
  if (!userPosition) return;
  const oldQuantity = userPosition.currentQuantity;
  if (oldQuantity === 0n) return;

  const costPortion =
    (userPosition.totalCostBasis * event.params.sellQuantity) / oldQuantity;
  const tradeRealizedPnL = event.params.proceeds - costPortion;

  const newQuantity = event.params.newQuantity;
  const activityPortion =
    (userPosition.activityRemaining * event.params.sellQuantity) / oldQuantity;
  let nextOutcome = userPosition.outcome;
  let nextWeightedEntryTime = userPosition.weightedEntryTime;
  if (newQuantity === 0n) {
    nextOutcome = "CLOSED";
    nextWeightedEntryTime = 0n;
    const userStats = await getOrCreateUserStats(context, event.params.trader);
    userStats.activePositionsCount = userStats.activePositionsCount - 1n;
    context.UserStats.set(userStats);
  }

  const updatedPos = {
    ...userPosition,
    currentQuantity: newQuantity,
    totalCostBasis: userPosition.totalCostBasis - costPortion,
    totalQuantitySold:
      userPosition.totalQuantitySold + event.params.sellQuantity,
    totalProceeds: userPosition.totalProceeds + event.params.proceeds,
    realizedPnL: userPosition.realizedPnL + tradeRealizedPnL,
    activityRemaining: userPosition.activityRemaining - activityPortion,
    outcome: nextOutcome,
    weightedEntryTime: nextWeightedEntryTime,
    lastUpdated: event.block.timestamp,
  };
  context.UserPosition.set(updatedPos);

  const userStats = await getOrCreateUserStats(context, event.params.trader);
  const market = await context.Market.get(userPosition.market_id);
  if (!market) return;
  const userRange = userPosition.upperTick - userPosition.lowerTick;
  const marketRange = market.maxTick - market.minTick;
  const holdingSeconds = event.block.timestamp - userPosition.weightedEntryTime;

  const performancePt = calcPerformancePoints(tradeRealizedPnL);
  if (performancePt > 0n) addPerformancePoints(userStats, performancePt);
  const riskBonusPt = calcRiskBonusPoints(
    activityPortion,
    userRange,
    marketRange,
    holdingSeconds
  );
  if (riskBonusPt > 0n) addRiskBonusPoints(userStats, riskBonusPt);

  const price = calculateRawPrice(
    event.params.proceeds,
    event.params.sellQuantity
  );

  context.Trade.set({
    id: makeTradeId(event.transaction.hash, event.logIndex),
    userPosition: userPosition.id,
    user: event.params.trader,
    market_id: userPosition.market_id,
    positionId: event.params.positionId,
    tradeType: "DECREASE",
    lowerTick: userPosition.lowerTick,
    upperTick: userPosition.upperTick,
    quantity: event.params.sellQuantity * -1n,
    costOrProceeds: event.params.proceeds,
    price,
    gasUsed: 0n,
    gasPrice: 0n,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
    transactionHash: event.transaction.hash,
    activityPt: 0n,
    performancePt,
    riskBonusPt,
  });

  userStats.totalTrades = userStats.totalTrades + 1n;
  userStats.totalVolume = userStats.totalVolume + event.params.proceeds;
  userStats.totalProceeds = userStats.totalProceeds + event.params.proceeds;
  userStats.lastTradeAt = event.block.timestamp;
  context.UserStats.set(userStats);

  await updateBinVolumes(
    context,
    userPosition.market_id,
    userPosition.lowerTick,
    userPosition.upperTick,
    event.params.proceeds
  );

  const marketStats = await getOrCreateMarketStats(
    context,
    userPosition.market_id
  );
  marketStats.totalBetPaidOut =
    marketStats.totalBetPaidOut + event.params.proceeds;
  updateMarketPnL(marketStats);
  marketStats.totalVolume = marketStats.totalVolume + event.params.proceeds;
  marketStats.totalTrades = marketStats.totalTrades + 1n;
  marketStats.currentPrice = price;
  marketStats.lastUpdated = event.block.timestamp;
  if (price > marketStats.highestPrice) marketStats.highestPrice = price;
  if (price < marketStats.lowestPrice) marketStats.lowestPrice = price;
  context.MarketStats.set(marketStats);
});

CLMSRMarketCore.PositionClosed.handler(async ({ event, context }) => {
  const userPosition = await context.UserPosition.get(
    toId(event.params.positionId)
  );
  if (!userPosition) return;
  const closedQuantity = userPosition.currentQuantity;
  const tradeRealizedPnL = event.params.proceeds - userPosition.totalCostBasis;

  const originalActivityRemaining = userPosition.activityRemaining;
  const originalWeightedEntryTime = userPosition.weightedEntryTime;

  const updatedPosition = {
    ...userPosition,
    currentQuantity: 0n,
    totalQuantitySold: userPosition.totalQuantitySold + closedQuantity,
    totalProceeds: userPosition.totalProceeds + event.params.proceeds,
    realizedPnL: tradeRealizedPnL,
    outcome: "CLOSED" as const,
    activityRemaining: 0n,
    weightedEntryTime: 0n,
    lastUpdated: event.block.timestamp,
  };
  context.UserPosition.set(updatedPosition);

  const userStats = await getOrCreateUserStats(context, event.params.trader);
  userStats.activePositionsCount = userStats.activePositionsCount - 1n;

  const market = await context.Market.get(userPosition.market_id);
  if (!market) return;
  const userRange = userPosition.upperTick - userPosition.lowerTick;
  const marketRange = market.maxTick - market.minTick;
  const holdingSeconds = event.block.timestamp - originalWeightedEntryTime;

  const performancePt = calcPerformancePoints(tradeRealizedPnL);
  if (performancePt > 0n) addPerformancePoints(userStats, performancePt);
  const riskBonusPt = calcRiskBonusPoints(
    originalActivityRemaining,
    userRange,
    marketRange,
    holdingSeconds
  );
  if (riskBonusPt > 0n) addRiskBonusPoints(userStats, riskBonusPt);

  const price =
    closedQuantity === 0n
      ? 0n
      : (event.params.proceeds * ONE_E6) / closedQuantity;

  context.Trade.set({
    id: makeTradeId(event.transaction.hash, event.logIndex),
    userPosition: userPosition.id,
    user: event.params.trader,
    market_id: userPosition.market_id,
    positionId: event.params.positionId,
    tradeType: "CLOSE",
    lowerTick: userPosition.lowerTick,
    upperTick: userPosition.upperTick,
    quantity: closedQuantity * -1n,
    costOrProceeds: event.params.proceeds,
    price,
    gasUsed: 0n,
    gasPrice: 0n,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
    transactionHash: event.transaction.hash,
    activityPt: 0n,
    performancePt,
    riskBonusPt,
  });

  userStats.totalTrades = userStats.totalTrades + 1n;
  userStats.totalVolume = userStats.totalVolume + event.params.proceeds;
  userStats.totalProceeds = userStats.totalProceeds + event.params.proceeds;
  userStats.totalRealizedPnL =
    userStats.totalRealizedPnL + updatedPosition.realizedPnL;
  userStats.lastTradeAt = event.block.timestamp;
  userStats.avgTradeSize =
    userStats.totalTrades === 0n
      ? 0n
      : userStats.totalVolume / userStats.totalTrades;
  context.UserStats.set(userStats);

  await updateBinVolumes(
    context,
    userPosition.market_id,
    userPosition.lowerTick,
    userPosition.upperTick,
    event.params.proceeds
  );

  const marketStats = await getOrCreateMarketStats(
    context,
    userPosition.market_id
  );
  marketStats.totalBetPaidOut =
    marketStats.totalBetPaidOut + event.params.proceeds;
  updateMarketPnL(marketStats);
  marketStats.totalVolume = marketStats.totalVolume + event.params.proceeds;
  marketStats.totalTrades = marketStats.totalTrades + 1n;
  marketStats.currentPrice = price;
  marketStats.lastUpdated = event.block.timestamp;
  if (price > marketStats.highestPrice) marketStats.highestPrice = price;
  if (price < marketStats.lowestPrice) marketStats.lowestPrice = price;
  context.MarketStats.set(marketStats);
});

function applySettlementOnce(
  context: any,
  positionId: bigint,
  trader: string,
  payout: bigint,
  ts: bigint,
  txHash: string,
  logIndex: bigint
) {
  return (async () => {
    const userPosition = await context.UserPosition.get(toId(positionId));
    if (!userPosition) return;
    if (userPosition.outcome !== "OPEN") return;

    const updatedPos = {
      ...userPosition,
      outcome: payout > 0n ? "WIN" : "LOSS",
      realizedPnL: payout - userPosition.totalCostBasis,
      totalProceeds: userPosition.totalProceeds + payout,
      isClaimed: false,
      lastUpdated: ts,
      activityRemaining: 0n,
      weightedEntryTime: 0n,
    };
    context.UserPosition.set(updatedPos);

    const market = await context.Market.get(userPosition.market_id);
    if (!market) return;
    const holdingSeconds = ts - userPosition.weightedEntryTime;
    const userRange = userPosition.upperTick - userPosition.lowerTick;
    const marketRange = market.maxTick - market.minTick;

    const userStats = await getOrCreateUserStats(context, trader);
    const performancePt = calcPerformancePoints(updatedPos.realizedPnL);
    if (performancePt > 0n) addPerformancePoints(userStats, performancePt);
    const riskBonusPt = calcRiskBonusPoints(
      updatedPos.activityRemaining,
      userRange,
      marketRange,
      holdingSeconds
    );
    if (riskBonusPt > 0n) addRiskBonusPoints(userStats, riskBonusPt);
    context.UserStats.set(userStats);

    context.Trade.set({
      id: makeTradeId(txHash, logIndex),
      userPosition: userPosition.id,
      user: trader,
      market_id: userPosition.market_id,
      positionId,
      tradeType: "SETTLE",
      lowerTick: userPosition.lowerTick,
      upperTick: userPosition.upperTick,
      quantity: 0n,
      costOrProceeds: payout,
      price: 0n,
      gasUsed: 0n,
      gasPrice: 0n,
      timestamp: ts,
      blockNumber: 0n,
      transactionHash: txHash,
      activityPt: 0n,
      performancePt,
      riskBonusPt,
    });

    const marketStats = await getOrCreateMarketStats(
      context,
      userPosition.market_id
    );
    marketStats.totalSettlementPayout =
      marketStats.totalSettlementPayout + payout;
    updateMarketPnL(marketStats);
    marketStats.lastUpdated = ts;
    context.MarketStats.set(marketStats);
  })();
}

CLMSRMarketCore.PositionSettled.handler(async ({ event, context }) => {
  await applySettlementOnce(
    context,
    event.params.positionId,
    event.params.trader,
    event.params.payout,
    event.block.timestamp,
    event.transaction.hash,
    event.logIndex
  );
});

CLMSRMarketCore.PositionClaimed.handler(async ({ event, context }) => {
  const current = await context.UserPosition.get(toId(event.params.positionId));
  if (!current) return;
  if (current.outcome === "OPEN") {
    await applySettlementOnce(
      context,
      event.params.positionId,
      event.params.trader,
      event.params.payout,
      event.block.timestamp,
      event.transaction.hash,
      event.logIndex
    );
  }
  const updated = await context.UserPosition.getOrThrow(
    toId(event.params.positionId)
  );
  context.UserPosition.set({
    ...updated,
    isClaimed: true,
    lastUpdated: event.block.timestamp,
  });

  const marketStats = await getOrCreateMarketStats(context, updated.market_id);
  marketStats.totalClaimedPayout =
    marketStats.totalClaimedPayout + event.params.payout;
  updateMarketPnL(marketStats);
  marketStats.lastUpdated = event.block.timestamp;
  context.MarketStats.set(marketStats);
});

CLMSRMarketCore.RangeFactorApplied.handler(async ({ event, context }) => {
  const market = await context.Market.get(toId(event.params.marketId));
  if (!market) return;

  let lo = Number((event.params.lo - market.minTick) / market.tickSpacing);
  let hi = Number((event.params.hi - market.minTick) / market.tickSpacing - 1n);
  const maxIdx = Number(market.numBins - 1n);
  if (lo < 0) lo = 0;
  if (hi < 0) hi = 0;
  if (lo > maxIdx) lo = maxIdx;
  if (hi > maxIdx) hi = maxIdx;

  for (let i = lo; i <= hi; i++) {
    const id = `${market.id}-${i}`;
    const bin = await context.BinState.get(id);
    if (!bin) {
      const lowerTickBin = market.minTick + BigInt(i) * market.tickSpacing;
      const upperTickBin = lowerTickBin + market.tickSpacing;
      context.BinState.set({
        id,
        market_id: market.id,
        binIndex: BigInt(i),
        lowerTick: lowerTickBin,
        upperTick: upperTickBin,
        currentFactor: WAD,
        lastUpdated: event.block.timestamp,
        updateCount: 0n,
        totalVolume: 0n,
      });
    }
    const latest = await context.BinState.getOrThrow(id);
    context.BinState.set({
      ...latest,
      currentFactor: (latest.currentFactor * event.params.factor) / WAD,
      lastUpdated: event.block.timestamp,
      updateCount: latest.updateCount + 1n,
    });
  }

  context.Market.set({ ...market, lastUpdated: event.block.timestamp });
});

PointsGranter.PointsGranted.handler(async ({ event, context }) => {
  const ts =
    event.params.contextTs !== 0n
      ? event.params.contextTs
      : event.block.timestamp;
  const userStats = await getOrCreateUserStats(context, event.params.user);

  userStats.totalPoints = userStats.totalPoints + event.params.amount;
  if (event.params.reason === 1n) {
    userStats.activityPoints = userStats.activityPoints + event.params.amount;
  } else if (event.params.reason === 2n) {
    userStats.performancePoints =
      userStats.performancePoints + event.params.amount;
  } else if (event.params.reason === 3n) {
    userStats.riskBonusPoints = userStats.riskBonusPoints + event.params.amount;
  }
  context.UserStats.set(userStats);
});
