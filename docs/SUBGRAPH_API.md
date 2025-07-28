# CLMSR Subgraph API Documentation

> **🚀 v1.3.0**: Enhanced scaling support, binFactorsWad field added, perfect SDK compatibility

## 🎯 Overview

The CLMSR subgraph tracks all CLMSR market data in real-time, optimized for **distribution visualization**, **position history**, **PnL tracking**, and **SDK calculations**.

## 🔗 Endpoint Information

- **GraphQL Endpoint**: `https://api.studio.thegraph.com/query/116469/signals-v-0/1.3.0`
- **Subgraph Name**: `signals-v-0`
- **Studio Link**: `https://thegraph.com/studio/subgraph/signals-v-0`

## 📊 Core Entities

### **MarketDistribution** - SDK Calculation + Distribution Visualization Integration

```graphql
type MarketDistribution {
  id: String! # marketId
  market: Market!
  totalBins: BigInt! # total number of bins
  # LMSR calculation data (SDK compatible)
  totalSum: BigDecimal! # decimal value for display
  totalSumWad: BigInt! # WAD value for SDK calculation (matches contract)
  # Distribution statistics
  minFactor: BigDecimal! # minimum factor value
  maxFactor: BigDecimal! # maximum factor value
  avgFactor: BigDecimal! # average factor value
  totalVolume: BigDecimal! # total trading volume
  # Dual format factor data (SDK + FE compatible)
  binFactors: [String!]! # decimal array for display ["1.0", "2.0", ...]
  binFactorsWad: [String!]! # WAD array for SDK calculation ["1000000000000000000", ...]
  binVolumes: [String!]! # volume array for all bins ["100", "200", ...]
  tickRanges: [String!]! # tick range array ["100500-100600", ...]
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
  currentFactor: BigDecimal! # current accumulated factor value
  lastUpdated: BigInt!
  updateCount: BigInt! # number of updates
  totalVolume: BigDecimal! # total trading volume in this bin
}
```

### **UserPosition** - Real-time Position Status

```graphql
type UserPosition {
  id: String! # positionId
  user: Bytes! # user address
  marketId: BigInt! # market ID
  lowerTick: BigInt! # position lower bound tick
  upperTick: BigInt! # position upper bound tick
  quantity: BigDecimal! # current holding quantity
  # PnL tracking
  totalCost: BigDecimal! # total cost invested (including fees)
  averageCost: BigDecimal! # average acquisition price
  realizedPnL: BigDecimal! # realized profit and loss
  unrealizedPnL: BigDecimal! # unrealized profit and loss (estimated)
  # Status
  isActive: Boolean! # whether position is active
  openedAt: BigInt! # position opened timestamp
  lastUpdatedAt: BigInt! # last update timestamp
}
```

### **UserStats** - Comprehensive User Statistics

```graphql
type UserStats {
  id: Bytes! # user address
  user: Bytes! # user address
  totalTrades: BigInt! # total number of trades
  totalVolume: BigDecimal! # total trading volume
  totalCosts: BigDecimal! # total cost invested
  totalProceeds: BigDecimal! # total proceeds
  totalRealizedPnL: BigDecimal! # total realized profit and loss
  totalGasFees: BigDecimal! # total gas fees
  netPnL: BigDecimal! # net profit and loss (after fees)
  # Performance metrics
  activePositionsCount: BigInt! # number of active positions
  winningTrades: BigInt! # number of winning trades
  losingTrades: BigInt! # number of losing trades
  winRate: BigDecimal! # win rate
  avgTradeSize: BigDecimal! # average trade size
  # Timing information
  firstTradeAt: BigInt! # first trade timestamp
  lastTradeAt: BigInt! # last trade timestamp
}
```

## 🔍 Key Query Patterns

### **1. SDK Compatible Distribution Data Query**

```graphql
query GetDistributionForSDK($marketId: String!) {
  marketDistribution(id: $marketId) {
    totalSum # for display
    totalSumWad # for SDK calculation
    binFactors # for display ["1.0", "2.0", ...]
    binFactorsWad # for SDK calculation ["1000000000000000000", ...]
    version
    lastSnapshotAt
  }
}
```

**TypeScript Usage Example:**

```typescript
import { mapDistribution } from "@whworjs7946/clmsr-v0";

const response = await fetch(SUBGRAPH_ENDPOINT, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    query: GET_DISTRIBUTION_QUERY,
    variables: { marketId: "1" },
  }),
});

const { marketDistribution } = await response.json();
const distribution = mapDistribution(marketDistribution); // Convert to SDK compatible format
```

### **2. Complete Visualization Data**

```graphql
query GetVisualizationData($marketId: String!) {
  marketDistribution(id: $marketId) {
    totalBins
    minFactor
    maxFactor
    avgFactor
    totalVolume
    binFactors # for chart display
    binVolumes # for volume overlay
    tickRanges # for X-axis labels
    lastSnapshotAt
  }
}
```

### **3. User Position Status**

```graphql
query GetUserPositions($userAddress: Bytes!, $marketId: BigInt) {
  userPositions(
    where: { user: $userAddress, marketId: $marketId, isActive: true }
    orderBy: openedAt
    orderDirection: desc
  ) {
    id
    lowerTick
    upperTick
    quantity
    totalCost
    averageCost
    realizedPnL
    unrealizedPnL
    openedAt
    lastUpdatedAt
  }
}
```

### **4. User Comprehensive Statistics**

```graphql
query GetUserStats($userAddress: Bytes!) {
  userStats(id: $userAddress) {
    totalTrades
    totalVolume
    totalRealizedPnL
    netPnL
    winRate
    avgTradeSize
    activePositionsCount
    firstTradeAt
    lastTradeAt
  }
}
```

### **5. Trading History**

```graphql
query GetTradeHistory($userAddress: Bytes, $marketId: BigInt) {
  trades(
    where: { trader: $userAddress, marketId: $marketId }
    orderBy: timestamp
    orderDirection: desc
    first: 100
  ) {
    id
    type # OPEN, INCREASE, DECREASE, CLOSE, CLAIM
    quantity
    costOrProceeds
    lowerTick
    upperTick
    timestamp
    gasUsed
    gasPrice
  }
}
```

### **6. Market Activity Monitoring**

```graphql
query GetMarketActivity($marketId: String!) {
  market(id: $marketId) {
    numBins
    liquidityParameter
    isSettled
    settlementLowerTick
    settlementUpperTick

    # Related statistics
    stats {
      totalTrades
      totalVolume
      uniqueUsers
      totalGasFees
      avgTradeSize
    }

    # Latest distribution
    distribution {
      totalSum
      totalSumWad
      version
      lastSnapshotAt
    }
  }
}
```

## 📈 Real-time Update Patterns

### **Polling vs Subscription**

#### 1. Distribution Data Polling (Recommended)

```typescript
// Check for distribution updates every 5 seconds
const pollDistribution = async () => {
  const result = await queryDistribution(marketId);
  if (result.version > currentVersion) {
    // Distribution updated - refresh chart
    updateChart(result);
    currentVersion = result.version;
  }
};

setInterval(pollDistribution, 5000);
```

#### 2. Real-time User Position Monitoring

```typescript
// Monitor position status via WebSocket or polling
const monitorPositions = async (userAddress: string) => {
  const positions = await queryUserPositions(userAddress);
  const activePositions = positions.filter((p) => p.isActive);

  // PnL calculation and alerts
  activePositions.forEach((pos) => {
    if (pos.unrealizedPnL < -threshold) {
      notifyStopLoss(pos);
    }
  });
};
```

## 🎯 Optimization Guide

### **1. Efficient Query Design**

```graphql
# ✅ Good example: Request only needed fields
query OptimizedDistribution($marketId: String!) {
  marketDistribution(id: $marketId) {
    binFactorsWad # only when needed for SDK calculation
    totalSumWad
  }
}

# ❌ Bad example: Request all fields
query UnoptimizedDistribution($marketId: String!) {
  marketDistribution(id: $marketId) {
    # ... all fields (unnecessary data transfer)
  }
}
```

### **2. Large Data Processing**

```typescript
// Process large market binFactors in chunks
const processLargeDistribution = (binFactorsWad: string[]) => {
  const CHUNK_SIZE = 100;
  const chunks = [];

  for (let i = 0; i < binFactorsWad.length; i += CHUNK_SIZE) {
    chunks.push(binFactorsWad.slice(i, i + CHUNK_SIZE));
  }

  return chunks.map((chunk) => processChunk(chunk));
};
```

### **3. Caching Strategy**

```typescript
// Cache distribution data based on version
const distributionCache = new Map();

const getCachedDistribution = async (marketId: string) => {
  const cached = distributionCache.get(marketId);
  const latest = await queryDistributionVersion(marketId);

  if (cached && cached.version === latest.version) {
    return cached.data;
  }

  // Update cache
  const fresh = await queryFullDistribution(marketId);
  distributionCache.set(marketId, { data: fresh, version: fresh.version });
  return fresh;
};
```

## 🔄 SDK Integration Workflow

### **Complete Integration Example**

```typescript
import {
  CLMSRSDK,
  mapDistribution,
  mapMarket,
  toUSDC,
} from "@whworjs7946/clmsr-v0";

class CLMSRIntegration {
  private sdk = new CLMSRSDK();
  private subgraphUrl =
    "https://api.studio.thegraph.com/query/116469/signals-v-0/1.3.0";

  async calculateCost(
    marketId: string,
    lowerTick: number,
    upperTick: number,
    quantity: string
  ) {
    // 1. Query latest data from subgraph
    const [rawMarket, rawDistribution] = await Promise.all([
      this.queryMarket(marketId),
      this.queryDistribution(marketId),
    ]);

    // 2. Convert to SDK compatible format
    const market = mapMarket(rawMarket);
    const distribution = mapDistribution(rawDistribution);

    // 3. Calculate with SDK
    const result = this.sdk.calculateOpenCost(
      lowerTick,
      upperTick,
      toUSDC(quantity),
      distribution,
      market
    );

    return {
      cost: result.cost.toString(),
      averagePrice: result.averagePrice.toString(),
    };
  }

  private async queryDistribution(marketId: string) {
    const query = `
      query GetDistribution($marketId: String!) {
        marketDistribution(id: $marketId) {
          totalSum
          totalSumWad
          binFactors
          binFactorsWad
        }
      }
    `;

    const response = await fetch(this.subgraphUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables: { marketId } }),
    });

    const data = await response.json();
    return data.data.marketDistribution;
  }
}
```

## 🔗 Related Links

- **SDK Documentation**: [CLMSR SDK](https://github.com/whworjs/signals-v0/blob/main/clmsr-sdk/README.md)
- **Contract Integration**: [Contract Integration](https://github.com/whworjs/signals-v0/blob/main/docs/CONTRACT_INTEGRATION.md)
- **Quick Start**: [Quick Start Guide](https://github.com/whworjs/signals-v0/blob/main/docs/QUICK_START.md)
