# CLMSR Subgraph API Documentation

> **🚀 v1.2.0**: Major upgrade with Batch Position Event Emission, Points System, Position Outcomes, and Citrea Testnet deployment

## 🎯 Overview

The CLMSR subgraph tracks all CLMSR market data in real-time, optimized for **distribution visualization**, **position history**, **PnL tracking**, **points system tracking**, and **SDK calculations** with unified raw-scale architecture.

## 🔗 Endpoint Information

- **GraphQL Endpoint (Production)**: `https://api.goldsky.com/api/public/project_cme6kru6aowuy01tb4c9xbdrj/subgraphs/signals-v0-citrea-prod/1.0.0/gn`
- **GraphQL Endpoint (Development)**: `https://api.goldsky.com/api/public/project_cme6kru6aowuy01tb4c9xbdrj/subgraphs/signals-v0-citrea-dev/1.0.0/gn`
- **Subgraph Platform**: `Goldsky`
- **Network**: `Citrea Testnet`

## 📊 Core Entities

### **MarketDistribution** - SDK Calculation + Distribution Visualization

```graphql
type MarketDistribution {
  id: String! # marketId
  market: Market!
  totalBins: BigInt! # total number of bins
  # LMSR calculation data (WAD format, 18 decimals)
  totalSum: BigInt! # total segment tree sum (raw WAD for SDK)
  # Distribution statistics (WAD format, 18 decimals)
  minFactor: BigInt! # minimum factor value (raw WAD)
  maxFactor: BigInt! # maximum factor value (raw WAD)
  avgFactor: BigInt! # average factor value (raw WAD)
  totalVolume: BigInt! # total trading volume (raw 6 decimals SUSD)
  # Array data
  binFactors: [String!]! # WAD format factor array ["1000000000000000000", ...]
  binVolumes: [String!]! # raw SUSD volume array ["1000000", "2000000", ...]
  tickRanges: [String!]! # tick range array ["100000-100100", "100100-100200", ...]
  # Metadata
  lastSnapshotAt: BigInt! # last snapshot timestamp
  distributionHash: String! # distribution data hash (for change detection)
  version: BigInt! # version number (for update tracking)
}
```

### **BinState** - Individual Bin State Tracking

```graphql
type BinState {
  id: String! # marketId-binIndex
  market: Market!
  binIndex: BigInt! # 0-based segment tree index
  lowerTick: BigInt! # actual tick range start
  upperTick: BigInt! # actual tick range end (exclusive)
  currentFactor: BigInt! # current accumulated factor value (raw WAD)
  lastUpdated: BigInt!
  updateCount: BigInt! # number of updates
  totalVolume: BigInt! # total trading volume in this bin (raw 6 decimals SUSD)
}
```

### **UserPosition** - Real-time Position Status

```graphql
type UserPosition {
  id: String! # positionId
  user: Bytes! # user address
  market: Market!
  positionId: BigInt! # on-chain position ID
  lowerTick: BigInt! # position lower bound tick
  upperTick: BigInt! # position upper bound tick
  # Current state (raw 6 decimals SUSD)
  currentQuantity: BigInt! # current holding quantity
  totalCostBasis: BigInt! # total cost basis
  totalQuantityBought: BigInt! # total quantity bought
  totalQuantitySold: BigInt! # total quantity sold
  totalProceeds: BigInt! # total proceeds from sales
  averageEntryPrice: BigInt! # average entry price (raw 6 decimals)
  realizedPnL: BigInt! # realized profit and loss (raw 6 decimals, signed)
  # Position status and outcome
  outcome: PositionOutcome! # position state (OPEN/CLOSED/WIN/LOSS)
  isClaimed: Boolean! # whether winning position payout is claimed
  # Points system tracking
  activityRemaining: BigInt! # remaining activity points (6 decimals)
  weightedEntryTime: BigInt! # weighted average entry time for remaining quantity
  # Timestamps
  createdAt: BigInt! # position creation timestamp
  lastUpdated: BigInt! # last update timestamp
  # Relations
  stats: UserStats!
  trades: [Trade!]! @derivedFrom(field: "userPosition")
}

enum PositionOutcome {
  OPEN # Position is still open and tradeable
  CLOSED # Position was manually closed before settlement
  WIN # Position won after market settlement
  LOSS # Position lost after market settlement
}
```

### **Trade** - Individual Trade Records

```graphql
type Trade {
  id: Bytes! # transactionHash-logIndex
  userPosition: UserPosition!
  user: Bytes! # user address
  market: Market!
  positionId: BigInt!
  type: TradeType! # OPEN, INCREASE, DECREASE, CLOSE, SETTLE
  lowerTick: BigInt! # int256
  upperTick: BigInt! # int256
  quantity: BigInt! # trade quantity (raw 6 decimals SUSD)
  costOrProceeds: BigInt! # cost or proceeds (raw 6 decimals SUSD)
  price: BigInt! # unit price (raw 6 decimals SUSD)
  gasUsed: BigInt! # gas used
  gasPrice: BigInt! # gas price
  # Points system
  activityPt: BigInt! # Activity points earned from OPEN/INCREASE (6 decimals)
  performancePt: BigInt! # Performance points from PnL on DECREASE/CLOSE/SETTLE (6 decimals)
  riskBonusPt: BigInt! # Risk bonus points from holding conditions (6 decimals)
  # Metadata
  timestamp: BigInt!
  blockNumber: BigInt!
  transactionHash: Bytes!
}

enum TradeType {
  OPEN # Open new position
  INCREASE # Increase existing position
  DECREASE # Partially close position
  CLOSE # Fully close position manually
  SETTLE # Position settled after market resolution
}
```

### **UserStats** - Comprehensive User Statistics

```graphql
type UserStats {
  id: Bytes! # user address
  user: Bytes! # user address
  totalTrades: BigInt! # total number of trades (OPEN, INCREASE, DECREASE, CLOSE only, excludes SETTLE)
  totalVolume: BigInt! # total trading amount (buy: cost, sell: proceeds) (raw 6 decimals SUSD)
  totalCosts: BigInt! # total cost invested (raw 6 decimals SUSD)
  totalProceeds: BigInt! # total proceeds (raw 6 decimals SUSD)
  totalRealizedPnL: BigInt! # total realized profit and loss (raw 6 decimals, signed)
  totalGasFees: BigInt! # total gas fees (wei units)
  netPnL: BigInt! # net profit and loss after fees (raw 6 decimals, signed)
  # Points system
  totalPoints: BigInt! # accumulated points balance (6 decimals)
  # Performance metrics
  activePositionsCount: BigInt! # number of active positions
  winningTrades: BigInt! # number of winning trades (only positions held until settlement)
  losingTrades: BigInt! # number of losing trades (only positions held until settlement)
  winRate: BigDecimal! # win rate (0.0 ~ 1.0, calculated only from settled positions)
  avgTradeSize: BigInt! # average trade amount (total volume / total trades) (raw 6 decimals SUSD)
  firstTradeAt: BigInt! # first trade timestamp
  lastTradeAt: BigInt! # last trade timestamp
  # Relations
  positions: [UserPosition!]! @derivedFrom(field: "stats")
}
```

### **MarketStats** - Market-level Statistics

```graphql
type MarketStats {
  id: String! # marketId
  market: Market!
  totalVolume: BigInt! # total trading amount (buy: cost, sell: proceeds) (raw 6 decimals SUSD)
  totalFees: BigInt! # total fees collected (raw 6 decimals SUSD)
  totalTrades: BigInt! # total number of trades (OPEN, INCREASE, DECREASE, CLOSE only, excludes SETTLE)
  uniqueTraders: BigInt! # number of unique traders
  # Price metrics (raw 6 decimals SUSD)
  highestPrice: BigInt! # highest price recorded
  lowestPrice: BigInt! # lowest price recorded
  currentPrice: BigInt! # current price
  # Time-based metrics
  volume24h: BigInt! # 24-hour volume (raw 6 decimals SUSD)
  priceChange24h: BigDecimal! # 24-hour price change percentage
  firstTradeAt: BigInt! # first trade timestamp
  lastTradeAt: BigInt! # last trade timestamp
}
```

### **PositionSettled** - Settlement Event Records

```graphql
type PositionSettled {
  id: Bytes! # transactionHash-logIndex
  positionId: BigInt! # position ID that was settled
  trader: Bytes! # trader address
  payout: BigInt! # settlement payout amount (raw 6 decimals SUSD)
  isWin: Boolean! # whether position won (settlement tick within position range)
  blockNumber: BigInt!
  blockTimestamp: BigInt!
  transactionHash: Bytes!
}
```

This entity captures automatic settlement events when markets resolve. Unlike manual `CLOSE` trades, settlements determine the final win/loss outcome based on whether the settlement tick falls within the position's range.

### **PositionEventsProgress** - Batch Settlement Progress Tracking

```graphql
type PositionEventsProgress {
  id: Bytes! # transactionHash-logIndex
  marketId: BigInt! # market ID being processed
  fromIndex: BigInt! # starting position index in batch
  toIndex: BigInt! # ending position index in batch
  isComplete: Boolean! # whether all positions have been processed
  blockNumber: BigInt!
  blockTimestamp: BigInt!
  transactionHash: Bytes!
}
```

This entity tracks the progress of batch position settlement event emission. When markets settle, position events are emitted in batches to avoid gas limit issues. Each batch emits a `PositionEventsProgress` event to track completion status.

**Usage Scenarios:**

- **Frontend Progress Bars**: Monitor batch settlement completion
- **Backend Automation**: Trigger next batch when `isComplete: false`
- **Analytics**: Track settlement processing performance

## 🔧 Scaling Architecture

### **Data Scale Standards**

- **Factor Values**: WAD format (18 decimals, BigInt) - `1000000000000000000` = 1.0
- **SUSD Values**: Raw 6 decimals (BigInt) - `1000000` = 1.0 SUSD
- **Percentages**: BigDecimal format - `0.85` = 85%

### **No Normalization Philosophy**

All values maintain contract-native scales:

- ✅ Factors stored as raw WAD BigInt
- ✅ SUSD amounts stored as raw 6-decimal BigInt
- ✅ Direct SDK compatibility without conversion
- ❌ No display normalization in subgraph layer

## 📈 Query Examples

### **1. Market Distribution for SDK**

```graphql
query GetMarketDistribution($marketId: String!) {
  marketDistribution(id: $marketId) {
    totalSum # WAD format for SDK calculation
    minFactor # WAD format
    maxFactor # WAD format
    avgFactor # WAD format
    totalVolume # raw 6 decimals SUSD
    binFactors # WAD format array for SDK
    binVolumes # raw SUSD array
    tickRanges # tick range strings
  }
}
```

### **2. User Positions with PnL**

```graphql
query GetUserPositions($user: Bytes!) {
  userPositions(where: { user: $user, outcome: OPEN }) {
    positionId
    lowerTick
    upperTick
    currentQuantity # raw 6 decimals
    totalCostBasis # raw 6 decimals
    averageEntryPrice # raw 6 decimals
    realizedPnL # raw 6 decimals, signed
    openedAt
    market {
      liquidityParameter
      minTick
      maxTick
    }
  }
}
```

### **3. User Statistics (Enhanced)**

```graphql
query GetUserStats($user: Bytes!) {
  userStats(id: $user) {
    totalTrades # excludes CLAIM operations
    totalVolume # actual trading amounts (cost + proceeds)
    totalCosts # total money invested
    totalProceeds # total money received from sales
    totalRealizedPnL # profit/loss from completed trades
    netPnL # after gas fees
    winRate # only from positions held until settlement
    winningTrades # count of profitable settled positions
    losingTrades # count of unprofitable settled positions
    avgTradeSize # actual average trading amount
    activePositionsCount
  }
}
```

### **4. Trade History**

```graphql
query GetTradeHistory($user: Bytes!, $marketId: BigInt!) {
  trades(
    where: { user: $user, market: $marketId }
    orderBy: timestamp
    orderDirection: desc
  ) {
    id
    type
    quantity # raw 6 decimals (negative for DECREASE/CLOSE)
    costOrProceeds # raw 6 decimals
    price # raw 6 decimals
    timestamp
    gasUsed
  }
}
```

### **5. Market Statistics**

```graphql
query GetMarketStats($marketId: String!) {
  marketStats(id: $marketId) {
    totalVolume # raw 6 decimals SUSD
    totalTrades
    uniqueTraders
    highestPrice # raw 6 decimals
    lowestPrice # raw 6 decimals
    currentPrice # raw 6 decimals
    volume24h # raw 6 decimals
    priceChange24h # BigDecimal percentage
  }
}
```

### **6. Batch Settlement Progress**

```graphql
query GetBatchProgress($marketId: BigInt!) {
  positionEventsProgresses(
    where: { marketId: $marketId }
    orderBy: blockTimestamp
    orderDirection: desc
    first: 10
  ) {
    id
    marketId
    fromIndex
    toIndex
    isComplete
    blockTimestamp
    transactionHash
  }
}
```

### **7. Settlement Event History**

```graphql
query GetSettlements($trader: Bytes!, $marketId: BigInt) {
  positionSettleds(
    where: { trader: $trader, marketId: $marketId }
    orderBy: blockTimestamp
    orderDirection: desc
    first: 50
  ) {
    id
    positionId
    trader
    payout # raw 6 decimals SUSD
    isWin
    blockTimestamp
    transactionHash
  }
}
```

## 🎯 SDK Integration

### **Perfect Compatibility**

The subgraph data format perfectly matches SDK expectations:

```typescript
// Raw data from subgraph
const rawDistribution = {
  totalSum: "400000000000000000000", // WAD
  binFactors: ["1000000000000000000", "1500000000000000000"], // WAD
  totalVolume: "50000000", // raw SUSD (6 decimals)
  // ... other fields
};

// Direct SDK usage (no conversion needed)
const distribution = mapDistribution(rawDistribution);
const result = sdk.calculateOpenCost(
  lowerTick,
  upperTick,
  quantity,
  distribution,
  market
);
```

### **Scale Conversion Helpers**

For frontend display purposes:

```typescript
// WAD to decimal
const displayFactor = wadValue / 1e18;

// Raw SUSD to decimal
const displaySUSD = rawSUSD / 1e6;

// Percentage display
const displayPercentage = bigDecimalValue * 100; // 0.85 → 85%
```

## 🔄 Real-time Updates

### **Event-Driven Architecture**

All entities update in real-time based on contract events:

- **PositionOpened** → UserPosition, UserStats, Trade creation
- **PositionIncreased** → UserPosition, UserStats, Trade updates
- **PositionDecreased** → UserPosition, UserStats, Trade updates
- **PositionClosed** → UserPosition, UserStats, Trade updates
- **PositionClaimed** → UserPosition, UserStats, Trade updates
- **RangeFactorApplied** → MarketDistribution, BinState updates

### **Data Consistency**

- ✅ All new entities immediately saved (B-1 fix)
- ✅ Correct price calculations for CLOSE/CLAIM trades (B-2 fix)
- ✅ Proper gas usage tracking with null checks (B-3 fix)
- ✅ Safe PnL calculations with division-by-zero protection (B-4 fix)
- ✅ Accurate winRate and avgTradeSize calculations (B-5 fix)
- ✅ Overflow protection for bin index calculations (B-6 fix)

## 📊 UserStats Accuracy

### **Volume Calculation Enhancement**

**Previous Behavior**:

- Volume calculated using `quantity` field
- Did not reflect actual trading amounts

**Current Behavior**:

- **Buy trades** (OPEN, INCREASE): Volume = `cost` (actual money spent)
- **Sell trades** (DECREASE, CLOSE): Volume = `proceeds` (actual money received)
- **Settlement** (CLAIM): No volume impact (settlement, not trading)

### **Win/Loss Tracking Enhancement**

**Previous Behavior**:

- Incorrectly counted early closes as losses
- Win/loss determined before market settlement

**Current Behavior**:

- **Only positions held until settlement** are counted for win/loss
- `CLOSE` operations (early exits) do not affect win rate
- `CLAIM` operations determine win/loss based on settlement outcome
- Accurate win rate calculation: `winningTrades / (winningTrades + losingTrades)`

### **Trade Type Clarification**

| Trade Type   | Description                             | Volume Impact | Win/Loss Impact |
| ------------ | --------------------------------------- | ------------- | --------------- |
| **OPEN**     | New position creation                   | ✅ Cost       | ❌ No           |
| **INCREASE** | Add to existing position                | ✅ Cost       | ❌ No           |
| **DECREASE** | Partial position sale                   | ✅ Proceeds   | ❌ No           |
| **CLOSE**    | Full position sale (before settlement)  | ✅ Proceeds   | ❌ No           |
| **CLAIM**    | Settlement claim (after market settles) | ❌ No         | ✅ Yes          |

### **Example Scenarios**

**Scenario 1: Early Exit (CLOSE)**

```
1. OPEN position: cost = $100 → totalVolume += $100
2. CLOSE position: proceeds = $120 → totalVolume += $120
Result: Total volume = $220, No win/loss count (early exit)
```

**Scenario 2: Hold Until Settlement (CLAIM)**

```
1. OPEN position: cost = $100 → totalVolume += $100
2. CLAIM position: payout = $150 → totalVolume unchanged
Result: Total volume = $100, winningTrades += 1 (position was in winning range)
```

## 🚀 Version History

- **v1.2.0**: Enhanced UserStats accuracy - proper volume calculation (cost/proceeds based), win/loss tracking only for settled positions, trade type clarification, Batch Position Event Emission
- **v1.3.1**: Unified scaling, comprehensive bug fixes, accuracy improvements
- **v1.3.0**: Enhanced scaling support, binFactorsWad field
- **v1.2.x**: Basic functionality implementation
