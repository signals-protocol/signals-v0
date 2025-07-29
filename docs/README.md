# CLMSR Market System Developer Guide

> **🚀 v1.6.2**: Complete development guide for CLMSR (Conditional Liquidity Market Maker) prediction market system

## 📋 Table of Contents

- [System Overview](#system-overview)
- [Quick Start](#quick-start)
- [SDK Usage](#sdk-usage)
- [Subgraph API](#subgraph-api)
- [Integrated Development Workflow](#integrated-development-workflow)
- [Contract Integration](#contract-integration)
- [Practical Examples](#practical-examples)

---

## 🎯 System Overview

### Core Concepts

**CLMSR** is an automated market maker for prediction markets:

- **Market**: Prediction market for specific events (e.g., "Probability that BTC exceeds $100,000")
- **Tick**: Units representing price points (e.g., 115000 = $1,150.00)
- **Range**: Continuous interval defined by two ticks (lowerTick, upperTick)
- **Position**: Bet on a specific price range
- **Distribution**: Current probability/weight for each price range

### Architecture Structure

```
┌─────────────────┐    ┌──────────────┐    ┌─────────────┐
│   Frontend      │───▶│   Adapter    │───▶│ SDK Calc    │
│                 │    │ (parse only) │    │ (raw scale) │
└─────────────────┘    └──────────────┘    └─────────────┘
         │                       │                   │
         ▼                       ▼                   ▼
┌─────────────────┐    ┌──────────────┐    ┌─────────────┐
│   GraphQL       │    │  Subgraph    │    │  Contract   │
│ (BigInt→string) │    │ (raw values) │    │ (on-chain)  │
└─────────────────┘    └──────────────┘    └─────────────┘
```

### Layer Responsibilities

1. **SDK Layer**: Pure mathematical calculations (Big.js-based high-precision operations using raw contract scales)
2. **Adapter Layer**: Simple string → Big object conversion (no scaling)
3. **Subgraph Layer**: Raw-scale BigInt data indexing and provision
4. **Contract Layer**: On-chain transaction execution

### Scaling Architecture

- **Factors**: WAD format (18 decimals) - used for LMSR calculations
- **USDC Amounts**: Raw 6 decimals - quantity, cost, proceeds
- **No normalization**: All values maintain contract-native scales across all layers

### Network Information

```
Network: Arbitrum Sepolia
Chain ID: 421614
RPC: https://sepolia-rollup.arbitrum.io/rpc
```

### Latest Deployment Information

**SDK**

```bash
npm install @whworjs7946/clmsr-v0@1.6.2
```

**Subgraph**

```
Endpoint: https://api.studio.thegraph.com/query/116469/signals-v-0/1.3.2
Name: signals-v-0
```

**Contracts**

```
CLMSRMarketCore: 0x59bDE8c7bc4bF23465B549052f2D7f586B88550e
USDC (Test):     0x5b3EE16Ce3CD3B46509C3fd824366B1306bA1ed9
CLMSRPosition:   0x3786e87B983470a0676F2367ce7337f66C19EB21
```

---

## 🚀 Quick Start

### 1. Installation

```bash
# SDK installation
npm install @whworjs7946/clmsr-v0@1.6.2

# GraphQL client (optional)
npm install @apollo/client graphql
```

### 2. Basic Usage

```typescript
import {
  CLMSRSDK,
  toWAD,
  toUSDC,
  mapDistribution,
  mapMarket,
} from "@whworjs7946/clmsr-v0";

// 1. SDK initialization
const sdk = new CLMSRSDK();

// 2. Query data from subgraph
const subgraphUrl =
  "https://api.studio.thegraph.com/query/116469/signals-v-0/1.3.2";

async function getOpenCost(marketId: string, quantity: string) {
  // Query raw data from subgraph
  const rawData = await fetchFromSubgraph(marketId);

  // Convert to SDK compatible format with adapters
  const market = mapMarket(rawData.market);
  const distribution = mapDistribution(rawData.distribution);

  // Calculate with SDK
  const result = sdk.calculateOpenCost(
    115000, // $1,150.00
    125000, // $1,250.00
    toUSDC(quantity),
    distribution,
    market
  );

  return {
    cost: result.cost.toString(),
    averagePrice: result.averagePrice.toString(),
  };
}
```

### 3. Real-time Data Integration

```typescript
// Real-time distribution data updates
const pollDistribution = async (marketId: string) => {
  const query = `
    query GetDistribution($marketId: String!) {
      marketDistribution(id: $marketId) {
        totalSumWad
        binFactorsWad
        version
      }
    }
  `;

  const response = await fetch(subgraphUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { marketId } }),
  });

  return response.json();
};

// Check for updates every 5 seconds
setInterval(async () => {
  const latest = await pollDistribution("1");
  if (latest.data.marketDistribution.version > currentVersion) {
    updateUI(latest.data.marketDistribution);
  }
}, 5000);
```

---

## 🧮 SDK Usage

### Main Functions

#### 1. Position Opening Cost Calculation

```typescript
const cost = sdk.calculateOpenCost(
  lowerTick: number,    // lower bound tick
  upperTick: number,    // upper bound tick
  quantity: USDCAmount, // bet amount
  distribution: MarketDistribution,
  market: Market
);
// Returns: { cost: USDCAmount, averagePrice: USDCAmount }
```

#### 2. Position Decrease Proceeds Calculation

```typescript
const proceeds = sdk.calculateDecreaseProceeds(
  position: Position,
  sellQuantity: USDCAmount,
  distribution: MarketDistribution,
  market: Market
);
// Returns: { proceeds: USDCAmount, averagePrice: USDCAmount }
```

#### 3. Inverse Function Calculation (Derive quantity from target cost)

```typescript
const quantity = sdk.calculateQuantityFromCost(
  lowerTick: number,
  upperTick: number,
  targetCost: USDCAmount,
  distribution: MarketDistribution,
  market: Market
);
// Returns: { quantity: USDCAmount, actualCost: USDCAmount }
```

#### 4. Claim Amount Calculation

```typescript
const claim = sdk.calculateClaim(
  position: Position,
  settlementTick: number
);
// Returns: { payout: USDCAmount }
```

### Special Features

#### Large Trade Support

```typescript
// Large quantities also handled safely with safeExp chunking
const result = sdk.calculateOpenCost(
  115000,
  125000,
  toUSDC("10000"), // very large quantity
  distribution,
  market
); // ✅ Processes normally without ValidationError
```

#### Utility Functions

```typescript
// Scale conversion
const wadAmount = toWAD("100"); // 18 decimal
const usdcAmount = toUSDC("100"); // 6 decimal

// Data adapters
const market = mapMarket(rawMarketData);
const distribution = mapDistribution(rawDistributionData);
```

---

## 📊 Subgraph API

### Endpoint Information

```
GraphQL: https://api.studio.thegraph.com/query/116469/signals-v-0/1.3.2
Studio: https://thegraph.com/studio/subgraph/signals-v-0
```

### Core Schema

#### MarketDistribution (SDK Compatible)

```graphql
type MarketDistribution {
  id: String!
  totalSum: BigDecimal! # for display
  totalSumWad: BigInt! # for SDK calculation (WAD format)
  binFactors: [String!]! # for display ["1.0", "2.0", ...]
  binFactorsWad: [String!]! # for SDK calculation ["1000000000000000000", ...]
  version: BigInt! # for update tracking
}
```

### Essential Queries

#### 1. Distribution Data for SDK Calculation

```graphql
query GetDistributionForSDK($marketId: String!) {
  marketDistribution(id: $marketId) {
    totalSumWad
    binFactorsWad
    version
  }
}
```

#### 2. User Position Status

```graphql
query GetUserPositions($userAddress: Bytes!) {
  userPositions(where: { user: $userAddress, isActive: true }) {
    id
    lowerTick
    upperTick
    quantity
    totalCost
    realizedPnL
    unrealizedPnL
  }
}
```

#### 3. Trading History

```graphql
query GetTradeHistory($userAddress: Bytes!) {
  trades(
    where: { trader: $userAddress }
    orderBy: timestamp
    orderDirection: desc
  ) {
    type
    quantity
    costOrProceeds
    lowerTick
    upperTick
    timestamp
  }
}
```

---

## 🔄 Integrated Development Workflow

### Complete Integration Class

```typescript
import {
  CLMSRSDK,
  mapDistribution,
  mapMarket,
  toUSDC,
} from "@whworjs7946/clmsr-v0";

export class CLMSRIntegration {
  private sdk = new CLMSRSDK();
  private subgraphUrl =
    "https://api.studio.thegraph.com/query/116469/signals-v-0/1.3.0";

  async calculateOpenCost(
    marketId: string,
    lowerTick: number,
    upperTick: number,
    quantity: string
  ) {
    try {
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
        success: true,
        cost: result.cost.toString(),
        averagePrice: result.averagePrice.toString(),
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
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

  private async queryMarket(marketId: string) {
    const query = `
      query GetMarket($marketId: String!) {
        market(id: $marketId) {
          liquidityParameter
          minTick
          maxTick
          tickSpacing
        }
      }
    `;

    const response = await fetch(this.subgraphUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables: { marketId } }),
    });

    const data = await response.json();
    return data.data.market;
  }
}
```

### React Hook Example

```typescript
import { useState, useEffect } from "react";
import { CLMSRIntegration } from "./clmsr-integration";

export const useCLMSR = (marketId: string) => {
  const [integration] = useState(() => new CLMSRIntegration());
  const [distribution, setDistribution] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDistribution = async () => {
      setLoading(true);
      try {
        const data = await integration.queryDistribution(marketId);
        setDistribution(data);
      } catch (error) {
        console.error("Failed to fetch distribution:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDistribution();

    // Real-time updates (every 5 seconds)
    const interval = setInterval(fetchDistribution, 5000);
    return () => clearInterval(interval);
  }, [marketId]);

  const calculateCost = async (
    lowerTick: number,
    upperTick: number,
    quantity: string
  ) => {
    return integration.calculateOpenCost(
      marketId,
      lowerTick,
      upperTick,
      quantity
    );
  };

  return {
    distribution,
    loading,
    calculateCost,
  };
};
```

---

## 🏗️ Contract Integration

### Basic Setup

```typescript
import { ethers } from "ethers";

const CONTRACT_ADDRESS = "0x59bDE8c7bc4bF23465B549052f2D7f586B88550e";
const USDC_ADDRESS = "0x5b3EE16Ce3CD3B46509C3fd824366B1306bA1ed9";

// Create contract instances
const provider = new ethers.providers.JsonRpcProvider(
  "https://sepolia-rollup.arbitrum.io/rpc"
);
const signer = provider.getSigner();
const market = new ethers.Contract(CONTRACT_ADDRESS, MARKET_ABI, signer);
const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, signer);
```

### Transaction Execution

```typescript
// 1. USDC approval
const approveTx = await usdc.approve(CONTRACT_ADDRESS, costInUSDC);
await approveTx.wait();

// 2. Open position
const openTx = await market.openPosition(lowerTick, upperTick, quantityInUSDC);
await openTx.wait();

console.log("Position opened successfully!");
```

---

## 🎯 Practical Examples

### Complete Betting UI Implementation

```typescript
import React, { useState } from "react";
import { useCLMSR } from "./hooks/useCLMSR";

export const BettingInterface = ({ marketId }: { marketId: string }) => {
  const { calculateCost, loading } = useCLMSR(marketId);
  const [quantity, setQuantity] = useState("");
  const [lowerTick, setLowerTick] = useState(115000);
  const [upperTick, setUpperTick] = useState(125000);
  const [result, setResult] = useState(null);

  const handleCalculate = async () => {
    if (!quantity) return;

    const cost = await calculateCost(lowerTick, upperTick, quantity);
    setResult(cost);
  };

  return (
    <div className="betting-interface">
      <h3>Betting Calculator</h3>

      <div>
        <label>Price Range:</label>
        <input
          type="number"
          value={lowerTick}
          onChange={(e) => setLowerTick(Number(e.target.value))}
          placeholder="Lower tick"
        />
        <input
          type="number"
          value={upperTick}
          onChange={(e) => setUpperTick(Number(e.target.value))}
          placeholder="Upper tick"
        />
      </div>

      <div>
        <label>Bet Amount (USDC):</label>
        <input
          type="number"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder="Enter amount"
        />
      </div>

      <button onClick={handleCalculate} disabled={loading}>
        Calculate Cost
      </button>

      {result && (
        <div className="result">
          <p>Expected Cost: {result.cost} USDC</p>
          <p>Average Price: {result.averagePrice}</p>
        </div>
      )}
    </div>
  );
};
```

### Real-time Distribution Chart

```typescript
import React, { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer } from "recharts";

export const DistributionChart = ({ marketId }: { marketId: string }) => {
  const [chartData, setChartData] = useState([]);

  useEffect(() => {
    const fetchDistribution = async () => {
      const query = `
        query GetVisualization($marketId: String!) {
          marketDistribution(id: $marketId) {
            binFactors
            tickRanges
          }
        }
      `;

      const response = await fetch(SUBGRAPH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables: { marketId } }),
      });

      const data = await response.json();
      const distribution = data.data.marketDistribution;

      const chartData = distribution.binFactors.map(
        (factor: string, index: number) => ({
          tick: distribution.tickRanges[index],
          factor: parseFloat(factor),
          index,
        })
      );

      setChartData(chartData);
    };

    fetchDistribution();
    const interval = setInterval(fetchDistribution, 10000);
    return () => clearInterval(interval);
  }, [marketId]);

  return (
    <div className="distribution-chart">
      <h3>Price Distribution</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData}>
          <XAxis dataKey="tick" />
          <YAxis />
          <Line type="monotone" dataKey="factor" stroke="#8884d8" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
```

---

## 🔗 Additional Resources

- **[SDK Detailed Documentation](https://github.com/whworjs/signals-v0/blob/main/clmsr-sdk/README.md)**: SDK API reference
- **[Subgraph API Documentation](https://github.com/whworjs/signals-v0/blob/main/docs/SUBGRAPH_API.md)**: GraphQL schema and queries
- **[Contract Integration Guide](https://github.com/whworjs/signals-v0/blob/main/docs/CONTRACT_INTEGRATION.md)**: On-chain transaction integration
- **[Quick Start Guide](https://github.com/whworjs/signals-v0/blob/main/docs/QUICK_START.md)**: Step-by-step implementation guide

## 🐛 Troubleshooting

### Common Issues

1. **SDK calculation errors**: Check adapter function usage (`mapDistribution`, `mapMarket`)
2. **Subgraph connection failure**: Verify endpoint URL and network
3. **Scale errors**: Use `toWAD`, `toUSDC` functions
4. **Precision issues**: Maintain Big.js operations, avoid Number casting

### Support

- **GitHub Issues**: Bug reports and feature requests
- **Documentation**: Refer to detailed guides for each component

---

## 🔧 Core Libraries

### LazyMulSegmentTree

Advanced data structure optimizing CLMSR factor calculations with lazy propagation.

#### Key Features

- **Lazy Propagation**: Range multiplication without immediate node updates
- **Batch Operations**: Multiple updates in single transaction
- **O(log n) Operations**: Efficient range queries and updates
- **Gas Optimization**: Minimal storage writes and tree traversals

#### batchUpdate() Function

```solidity
function batchUpdate(
    uint32[] memory indices,
    uint256[] memory values
) external
```

**Benefits:**

- **Gas Savings**: Single root sum update vs. multiple individual updates
- **Atomic Updates**: All changes committed together
- **Flexible Order**: Supports unsorted indices and duplicates

**Use Cases:**

- Market initialization with multiple factor values
- Bulk position settlements
- Efficient distribution rebalancing

#### Gas Comparison

| Operation   | Single Updates | batchUpdate | Savings |
| ----------- | -------------- | ----------- | ------- |
| 10 updates  | ~180k gas      | ~120k gas   | **33%** |
| 50 updates  | ~850k gas      | ~400k gas   | **53%** |
| 100 updates | ~1.7M gas      | ~750k gas   | **56%** |

---
