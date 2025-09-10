/* TypeScript file generated from Entities.res by genType. */

/* eslint-disable */
/* tslint:disable */

import type {PositionOutcome_t as Enums_PositionOutcome_t} from './Enums.gen';

import type {TradeType_t as Enums_TradeType_t} from './Enums.gen';

import type {t as BigDecimal_t} from 'envio/src/bindings/BigDecimal.gen';

export type id = string;

export type whereOperations<entity,fieldType> = { readonly eq: (_1:fieldType) => Promise<entity[]>; readonly gt: (_1:fieldType) => Promise<entity[]> };

export type BinState_t = {
  readonly binIndex: bigint; 
  readonly currentFactor: bigint; 
  readonly id: id; 
  readonly lastUpdated: bigint; 
  readonly lowerTick: bigint; 
  readonly market_id: id; 
  readonly totalVolume: bigint; 
  readonly updateCount: bigint; 
  readonly upperTick: bigint
};

export type BinState_indexedFieldOperations = {};

export type Market_t = {
  readonly endTimestamp: bigint; 
  readonly id: id; 
  readonly isSettled: boolean; 
  readonly lastUpdated: bigint; 
  readonly liquidityParameter: bigint; 
  readonly marketId: bigint; 
  readonly maxTick: bigint; 
  readonly minTick: bigint; 
  readonly numBins: bigint; 
  readonly settlementTick: (undefined | bigint); 
  readonly settlementValue: (undefined | bigint); 
  readonly startTimestamp: bigint; 
  readonly tickSpacing: bigint
};

export type Market_indexedFieldOperations = {};

export type MarketDistribution_t = {
  readonly avgFactor: BigDecimal_t; 
  readonly binFactors: bigint[]; 
  readonly binVolumes: bigint[]; 
  readonly id: string; 
  readonly lastSnapshotAt: bigint; 
  readonly maxFactor: bigint; 
  readonly minFactor: bigint; 
  readonly totalSum: bigint; 
  readonly version: string
};

export type MarketDistribution_indexedFieldOperations = {};

export type MarketStats_t = {
  readonly bettingNetIncome: bigint; 
  readonly currentPrice: bigint; 
  readonly highestPrice: bigint; 
  readonly id: string; 
  readonly lastUpdated: bigint; 
  readonly lowestPrice: bigint; 
  readonly market_id: id; 
  readonly priceChange24h: BigDecimal_t; 
  readonly realizedMarketPnL: bigint; 
  readonly totalBetPaidOut: bigint; 
  readonly totalBetReceived: bigint; 
  readonly totalClaimedPayout: bigint; 
  readonly totalFees: bigint; 
  readonly totalMarketPnL: bigint; 
  readonly totalSettlementPayout: bigint; 
  readonly totalTrades: bigint; 
  readonly totalVolume: bigint; 
  readonly unclaimedPayout: bigint; 
  readonly volume24h: bigint
};

export type MarketStats_indexedFieldOperations = {};

export type Trade_t = {
  readonly activityPt: bigint; 
  readonly blockNumber: bigint; 
  readonly costOrProceeds: bigint; 
  readonly gasPrice: bigint; 
  readonly gasUsed: bigint; 
  readonly id: id; 
  readonly lowerTick: bigint; 
  readonly market_id: id; 
  readonly performancePt: bigint; 
  readonly positionId: bigint; 
  readonly price: bigint; 
  readonly quantity: bigint; 
  readonly riskBonusPt: bigint; 
  readonly timestamp: bigint; 
  readonly tradeType: Enums_TradeType_t; 
  readonly transactionHash: string; 
  readonly upperTick: bigint; 
  readonly user: string; 
  readonly userPosition: string
};

export type Trade_indexedFieldOperations = {};

export type UserPosition_t = {
  readonly activityRemaining: bigint; 
  readonly averageEntryPrice: bigint; 
  readonly createdAt: bigint; 
  readonly currentQuantity: bigint; 
  readonly id: id; 
  readonly isClaimed: boolean; 
  readonly lastUpdated: bigint; 
  readonly lowerTick: bigint; 
  readonly market_id: id; 
  readonly outcome: Enums_PositionOutcome_t; 
  readonly positionId: bigint; 
  readonly realizedPnL: bigint; 
  readonly stats_id: id; 
  readonly totalCostBasis: bigint; 
  readonly totalProceeds: bigint; 
  readonly totalQuantityBought: bigint; 
  readonly totalQuantitySold: bigint; 
  readonly upperTick: bigint; 
  readonly user: string; 
  readonly weightedEntryTime: bigint
};

export type UserPosition_indexedFieldOperations = {};

export type UserStats_t = {
  readonly activePositionsCount: bigint; 
  readonly activityPoints: bigint; 
  readonly activityPointsToday: bigint; 
  readonly avgTradeSize: bigint; 
  readonly firstTradeAt: bigint; 
  readonly id: id; 
  readonly lastActivityDay: bigint; 
  readonly lastTradeAt: bigint; 
  readonly losingTrades: bigint; 
  readonly netPnL: bigint; 
  readonly performancePoints: bigint; 
  readonly riskBonusPoints: bigint; 
  readonly totalCosts: bigint; 
  readonly totalGasFees: bigint; 
  readonly totalPoints: bigint; 
  readonly totalProceeds: bigint; 
  readonly totalRealizedPnL: bigint; 
  readonly totalTrades: bigint; 
  readonly totalVolume: bigint; 
  readonly user: string; 
  readonly winRate: BigDecimal_t; 
  readonly winningTrades: bigint
};

export type UserStats_indexedFieldOperations = {};
