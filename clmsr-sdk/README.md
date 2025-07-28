# CLMSR TypeScript SDK

> 📈 **CLMSR (Conditional Liquidity Market Maker)** TypeScript SDK for prediction market systems

## 🎯 Overview

TypeScript SDK for CLMSR (Constant Logarithmic Market Scoring Rule) prediction market calculations.

**v1.4.1** provides significantly improved scaling handling, chunking support, and layered separation architecture.

## 🚀 Key Features

- **Pure functional calculations**: TypeScript implementation of contract view functions
- **Large trade support**: Handles large quantities safely with safeExp chunking
- **Precise scaling**: Perfect WAD(18 decimal) ↔ USDC(6 decimal) support
- **Layer separation**: SDK for pure calculations, data parsing in adapters
- **Inverse function calculation**: Mathematical inverse function to calculate quantity from target cost
- **High-precision arithmetic**: Accurate fixed-point operations based on Big.js
- **LMSR compliant**: Implements all LMSR mathematical properties
- **Comprehensive testing**: 21 test cases validating all functionality

## 📦 Installation

```bash
npm install @whworjs7946/clmsr-v0
```

## 🏁 Quick Start

### 1. Basic Usage

```typescript
import {
  CLMSRSDK,
  toWAD,
  toUSDC,
  mapMarket,
  mapDistribution,
} from "@whworjs7946/clmsr-v0";

// SDK instance creation
const sdk = new CLMSRSDK();

// Market configuration (converted from raw data)
const rawMarket = {
  liquidityParameter: "1000000000000000000000", // 1000 * 1e18 (WAD)
  minTick: 100000, // $1000.00
  maxTick: 140000, // $1400.00
  tickSpacing: 100, // $1.00 increments
};
const market = mapMarket(rawMarket);

// Distribution data (raw data from GraphQL)
const rawDistribution = {
  totalSum: "400", // decimal for display
  totalSumWad: "400000000000000000000", // WAD for calculation
  binFactors: ["1.0", "1.0" /* ... 400 items */], // for display
  binFactorsWad: ["1000000000000000000", "1000000000000000000" /* ... */], // WAD for calculation
};
const distribution = mapDistribution(rawDistribution);

// Calculate cost for betting 50 USDC on [$1150-$1250] range
const result = sdk.calculateOpenCost(
  115000, // lowerTick ($1150.00)
  125000, // upperTick ($1250.00)
  toUSDC("50"), // 50 USDC
  distribution,
  market
);

console.log(`Cost: ${result.cost.toString()} USDC`);
console.log(`Average price: ${result.averagePrice.toString()}`);
```

### 2. Large Trade Support (Chunking)

```typescript
// Large quantities are handled safely (internal safeExp chunking)
const largeResult = sdk.calculateOpenCost(
  115000,
  125000,
  toUSDC("1000"), // 1000 USDC (large quantity)
  distribution,
  market
); // ✅ No ValidationError, processes normally
```

### 3. Inverse Function Calculation

```typescript
// Calculate how much can be bet with target cost of 300 USDC
const targetCost = toUSDC("300");
const inverse = sdk.calculateQuantityFromCost(
  115000,
  125000,
  targetCost,
  distribution,
  market
);

console.log(`Quantity: ${inverse.quantity.toString()}`);
console.log(`Actual cost: ${inverse.actualCost.toString()}`);
```

## 📖 API Reference

### Data Types

#### Raw Types (Received from GraphQL/Indexer)

```typescript
interface MarketDistributionRaw {
  totalSum: string; // "400"
  totalSumWad: string; // "400000000000000000000"
  binFactors: string[]; // ["1.0", "2.0", ...]
  binFactorsWad: string[]; // ["1000000000000000000", ...]
}

interface MarketRaw {
  liquidityParameter: string; // "1000000000000000000000"
  minTick: number;
  maxTick: number;
  tickSpacing: number;
}
```

#### SDK Calculation Types (Big Objects)

```typescript
interface MarketDistribution {
  totalSumWad: WADAmount; // Big object
  binFactorsWad: WADAmount[]; // Big[] array
}

interface Market {
  liquidityParameter: WADAmount; // Big object
  minTick: number;
  maxTick: number;
  tickSpacing: number;
}
```

### Adapter Functions

#### mapDistribution()

```typescript
function mapDistribution(raw: MarketDistributionRaw): MarketDistribution;

// Usage example
const dist = mapDistribution(await fetchFromGraphQL(marketId));
```

#### mapMarket()

```typescript
function mapMarket(raw: MarketRaw): Market;

// Usage example
const market = mapMarket(await fetchMarketFromGraphQL(marketId));
```

### Core Calculation Functions

#### calculateOpenCost()

Calculate cost to open new position

```typescript
calculateOpenCost(
  lowerTick: number,
  upperTick: number,
  quantity: USDCAmount,
  distribution: MarketDistribution,
  market: Market
): OpenCostResult
```

#### calculateDecreaseProceeds()

Calculate proceeds when decreasing position

```typescript
calculateDecreaseProceeds(
  position: Position,
  sellQuantity: USDCAmount,
  distribution: MarketDistribution,
  market: Market
): DecreaseProceedsResult
```

#### calculateQuantityFromCost()

Calculate quantity from target cost (inverse function)

```typescript
calculateQuantityFromCost(
  lowerTick: number,
  upperTick: number,
  targetCost: USDCAmount,
  distribution: MarketDistribution,
  market: Market
): QuantityFromCostResult
```

#### calculateClaimAmount()

Calculate claim amount after settlement

```typescript
calculateClaimAmount(
  position: Position,
  settlementLowerTick: number,
  settlementUpperTick: number
): ClaimResult
```

### Utility Functions

#### Scale Conversion

```typescript
toWAD(amount: string | number): WADAmount    // 6 decimal → 18 decimal
toUSDC(amount: string | number): USDCAmount  // general number → 6 decimal
```

## 🏗️ Architecture

### Layer Separation Design

```
┌─────────────────┐    ┌──────────────┐    ┌─────────────┐
│   GraphQL/API   │───▶│   Adapter    │───▶│ SDK Calc    │
│ (string data)   │    │ (parse/conv) │    │ (Big ops)   │
└─────────────────┘    └──────────────┘    └─────────────┘
     string[]              mapXXX()           pure funcs
```

- **GraphQL Layer**: Provides raw string-format data
- **Adapter Layer**: Handles string → Big object conversion
- **SDK Layer**: Performs pure mathematical calculations only

### Scaling Handling

- **USDC**: 6 decimal (micro-USDC units)
- **WAD**: 18 decimal (contract standard)
- **Auto conversion**: Adapters handle scale differences automatically

### Chunking Support

```typescript
// Internal safeExp use makes large values safe
// Auto chunk splitting when quantity/α > 0.13
const result = sdk.calculateOpenCost(
  lowerTick,
  upperTick,
  toUSDC("10000"), // very large quantity
  distribution,
  market
); // ✅ Processes normally
```

## 🧪 Testing

```bash
npm test
```

21 test cases:

- ✅ Price impact (non-linearity)
- ✅ Range effects
- ✅ Mathematical consistency (pure functions)
- ✅ Inverse function accuracy
- ✅ Claim logic
- ✅ Error handling
- ✅ Scaling & Chunking

## 📋 Type Definitions

```typescript
type WADAmount = Big; // 18 decimal
type USDCAmount = Big; // 6 decimal
type Quantity = Big; // 6 decimal
type Tick = number; // tick value

interface Position {
  lowerTick: Tick;
  upperTick: Tick;
  quantity: Quantity;
}
```

## 🔗 Related Links

- **Subgraph API**: [CLMSR Subgraph Documentation](https://github.com/whworjs/signals-v0/blob/main/docs/SUBGRAPH_API.md)
- **Contract Integration**: [Contract Integration Guide](https://github.com/whworjs/signals-v0/blob/main/docs/CONTRACT_INTEGRATION.md)
- **Quick Start**: [Quick Start Guide](https://github.com/whworjs/signals-v0/blob/main/docs/QUICK_START.md)
- **Complete Documentation**: [Main Documentation](https://github.com/whworjs/signals-v0/blob/main/docs/README.md)
