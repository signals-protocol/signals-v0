# CLMSR Subgraph API Documentation

> **🚀 v1.4.0**: Enhanced UserStats accuracy, volume calculation fixes, proper win/loss tracking

## 🎯 Overview

The CLMSR subgraph tracks all CLMSR market data in real-time, optimized for **distribution visualization**, **position history**, **PnL tracking**, and **SDK calculations** with unified raw-scale architecture.

## 🔗 Endpoint Information

- **GraphQL Endpoint**: `https://api.studio.thegraph.com/query/116469/signals-v-0/1.4.0`
- **Subgraph Name**: `signals-v-0`
- **Studio Link**: `https://thegraph.com/studio/subgraph/signals-v-0`

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
  totalVolume: BigInt! # total trading volume (raw 6 decimals USDC)
  # Array data
  binFactors: [String!]! # WAD format factor array ["1000000000000000000", ...]
  binVolumes: [String!]! # raw USDC volume array ["1000000", "2000000", ...]
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
  totalVolume: BigInt! # total trading volume in this bin (raw 6 decimals USDC)
}
```

### **UserPosition** - Real-time Position Status

```graphql
type UserPosition {
  id: String! # user-marketId-positionId
  user: Bytes! # user address
  market: Market!
  positionId: BigInt! # on-chain position ID
  lowerTick: BigInt! # position lower bound tick
  upperTick: BigInt! # position upper bound tick
  # Current state (raw 6 decimals USDC)
  currentQuantity: BigInt! # current holding quantity
  totalCostBasis: BigInt! # total cost basis
  totalQuantityBought: BigInt! # total quantity bought
  totalQuantitySold: BigInt! # total quantity sold
  totalProceeds: BigInt! # total proceeds from sales
  averageEntryPrice: BigInt! # average entry price (raw 6 decimals)
  realizedPnL: BigInt! # realized profit and loss (raw 6 decimals, signed)
  # Status
  isActive: Boolean! # whether position is active
  isClaimed: Boolean! # whether position is claimed
  openedAt: BigInt! # position opened timestamp
  lastUpdatedAt: BigInt! # last update timestamp
  # Relations
  stats: UserStats!
  trades: [Trade!]! @derivedFrom(field: "userPosition")
}
```

### **Trade** - Individual Trade Records

```graphql
type Trade {
  id: Bytes! # transactionHash-logIndex
  userPosition: String! # UserPosition ID
  user: Bytes! # user address
  market: Market!
  positionId: BigInt!
  type: TradeType! # OPEN, INCREASE, DECREASE, CLOSE, CLAIM
  lowerTick: BigInt! # int256
  upperTick: BigInt! # int256
  quantity: BigInt! # trade quantity (raw 6 decimals USDC, DECREASE/CLOSE are negative)
  costOrProceeds: BigInt! # cost or proceeds (raw 6 decimals USDC)
  price: BigInt! # unit price (raw 6 decimals USDC)
  gasUsed: BigInt! # gas used
  gasPrice: BigInt! # gas price
  timestamp: BigInt!
  blockNumber: BigInt!
  transactionHash: Bytes!
}

enum TradeType {
  OPEN
  INCREASE
  DECREASE
  CLOSE
  CLAIM
}
```

### **UserStats** - Comprehensive User Statistics

```graphql
type UserStats {
  id: Bytes! # user address
  user: Bytes! # user address
  totalTrades: BigInt! # total number of trades (OPEN, INCREASE, DECREASE, CLOSE only, excludes CLAIM)
  totalVolume: BigInt! # total trading amount (buy: cost, sell: proceeds) (raw 6 decimals USDC)
  totalCosts: BigInt! # total cost invested (raw 6 decimals USDC)
  totalProceeds: BigInt! # total proceeds (raw 6 decimals USDC)
  totalRealizedPnL: BigInt! # total realized profit and loss (raw 6 decimals, signed)
  totalGasFees: BigInt! # total gas fees (wei units)
  netPnL: BigInt! # net profit and loss after fees (raw 6 decimals, signed)
  # Performance metrics
  activePositionsCount: BigInt! # number of active positions
  winningTrades: BigInt! # number of winning trades (only positions held until settlement)
  losingTrades: BigInt! # number of losing trades (only positions held until settlement)
  winRate: BigDecimal! # win rate (0.0 ~ 1.0, calculated only from settled positions)
  avgTradeSize: BigInt! # average trade amount (total volume / total trades) (raw 6 decimals USDC)
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
  totalVolume: BigInt! # total trading amount (buy: cost, sell: proceeds) (raw 6 decimals USDC)
  totalFees: BigInt! # total fees collected (raw 6 decimals USDC)
  totalTrades: BigInt! # total number of trades (OPEN, INCREASE, DECREASE, CLOSE only, excludes CLAIM)
  uniqueTraders: BigInt! # number of unique traders
  # Price metrics (raw 6 decimals USDC)
  highestPrice: BigInt! # highest price recorded
  lowestPrice: BigInt! # lowest price recorded
  currentPrice: BigInt! # current price
  # Time-based metrics
  volume24h: BigInt! # 24-hour volume (raw 6 decimals USDC)
  priceChange24h: BigDecimal! # 24-hour price change percentage
  firstTradeAt: BigInt! # first trade timestamp
  lastTradeAt: BigInt! # last trade timestamp
}
```

## 🔧 Scaling Architecture

### **Data Scale Standards**

- **Factor Values**: WAD format (18 decimals, BigInt) - `1000000000000000000` = 1.0
- **USDC Values**: Raw 6 decimals (BigInt) - `1000000` = 1.0 USDC
- **Percentages**: BigDecimal format - `0.85` = 85%

### **No Normalization Philosophy**

All values maintain contract-native scales:

- ✅ Factors stored as raw WAD BigInt
- ✅ USDC amounts stored as raw 6-decimal BigInt
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
    totalVolume # raw 6 decimals USDC
    binFactors # WAD format array for SDK
    binVolumes # raw USDC array
    tickRanges # tick range strings
  }
}
```

### **2. User Positions with PnL**

```graphql
query GetUserPositions($user: Bytes!) {
  userPositions(where: { user: $user, isActive: true }) {
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
    totalVolume # raw 6 decimals USDC
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

## 🎯 SDK Integration

### **Perfect Compatibility**

The subgraph data format perfectly matches SDK expectations:

```typescript
// Raw data from subgraph
const rawDistribution = {
  totalSum: "400000000000000000000", // WAD
  binFactors: ["1000000000000000000", "1500000000000000000"], // WAD
  totalVolume: "50000000", // raw USDC (6 decimals)
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

// Raw USDC to decimal
const displayUSDC = rawUSDC / 1e6;

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

## 📊 UserStats Accuracy Improvements (v1.4.0)

### **Volume Calculation Enhancement**

**Previous Behavior (v1.3.x)**:

- Volume calculated using `quantity` field
- Did not reflect actual trading amounts

**New Behavior (v1.4.0)**:

- **Buy trades** (OPEN, INCREASE): Volume = `cost` (actual money spent)
- **Sell trades** (DECREASE, CLOSE): Volume = `proceeds` (actual money received)
- **Settlement** (CLAIM): No volume impact (settlement, not trading)

### **Win/Loss Tracking Enhancement**

**Previous Behavior (v1.3.x)**:

- Incorrectly counted early closes as losses
- Win/loss determined before market settlement

**New Behavior (v1.4.0)**:

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

- **v1.4.0**: Enhanced UserStats accuracy - proper volume calculation (cost/proceeds based), win/loss tracking only for settled positions, trade type clarification
- **v1.3.1**: Unified scaling, comprehensive bug fixes, accuracy improvements
- **v1.3.0**: Enhanced scaling support, binFactorsWad field
- **v1.2.x**: Basic functionality implementation
