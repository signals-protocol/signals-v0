# CLMSR TypeScript SDK

> 📈 **CLMSR (Conditional Liquidity Market Maker)** TypeScript SDK for prediction market systems

## 🎯 Overview

TypeScript SDK for CLMSR (Constant Logarithmic Market Scoring Rule) prediction market calculations.

**v1.7.0** provides critical scaling fixes, enhanced function consistency, and optimized precision management for production-ready CLMSR calculations.

## 🚀 Key Features

- **Pure functional calculations**: TypeScript implementation of contract view functions
- **Fixed quantity limits**: Corrected scaling for market-specific limits (α × 0.13 × 1000)
- **Large trade support**: Proper handling of quantities up to 26,000 USDC (α=200) with accurate calculations
- **Enhanced error handling**: Clear validation messages with correct limit display
- **Improved scaling**: Consistent MathUtils-based decimal handling for all conversions
- **Optimized type system**: Minimal required fields for better performance
- **Inverse function calculation**: Mathematical inverse function to calculate quantity from target cost
- **High-precision arithmetic**: Accurate fixed-point operations based on Big.js
- **LMSR compliant**: Implements all LMSR mathematical properties
- **Comprehensive testing**: 25+ test cases including large-scale trading scenarios

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
  toMicroUSDC,
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

// Distribution data (raw data from GraphQL - unified scaling)
const rawDistribution = {
  totalSum: "400000000000000000000", // WAD format (18 decimals)
  minFactor: "1000000000000000000", // WAD format (18 decimals)
  maxFactor: "2000000000000000000", // WAD format (18 decimals)
  avgFactor: "1500000000000000000", // WAD format (18 decimals)
  totalVolume: "50000000", // raw USDC (6 decimals) - 50 USDC
  binFactors: ["1000000000000000000", "1500000000000000000" /* ... */], // WAD
  binVolumes: ["1000000", "2000000" /* ... */], // raw USDC (6 decimals)
  tickRanges: ["100000-100100", "100100-100200" /* ... */],
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

### 2. Large Trade Support with Dynamic Limits

```typescript
// Market-specific maximum quantity (α × 0.13 × 1000)
// For α = 200: max = 26,000 USDC
// For α = 1000: max = 130,000 USDC

// Large quantities within limits are handled safely
const largeResult = sdk.calculateOpenCost(
  115000,
  125000,
  toUSDC("25000"), // 25,000 USDC (within α=200 limit)
  distribution,
  market
); // ✅ Processes normally with automatic chunking

// Exceeding market limits throws clear error
try {
  sdk.calculateOpenCost(115000, 125000, toUSDC("30000"), distribution, market);
} catch (error) {
  console.log(error.message);
  // "Quantity too large. Max per trade = 26000 USDC (market limit: α × 0.13 × 1000)"
}
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

#### Raw Types (Received from GraphQL/Subgraph)

```typescript
interface MarketDistributionRaw {
  // Required fields for calculations
  totalSum: string; // WAD format (18 decimals) - "400000000000000000000"
  binFactors: string[]; // WAD format array - ["1000000000000000000", ...]

  // Optional fields (informational only)
  minFactor?: string; // WAD format (18 decimals) - "1000000000000000000"
  maxFactor?: string; // WAD format (18 decimals) - "2000000000000000000"
  avgFactor?: string; // WAD format (18 decimals) - "1500000000000000000"
  totalVolume?: string; // raw USDC (6 decimals) - "50000000"
  binVolumes?: string[]; // raw USDC array - ["1000000", "2000000", ...]
  tickRanges?: string[]; // tick range array - ["100000-100100", ...]
}

interface MarketRaw {
  liquidityParameter: string; // WAD format - "1000000000000000000000"
  minTick: number;
  maxTick: number;
  tickSpacing: number;
}
```

#### SDK Calculation Types (Big Objects)

```typescript
interface MarketDistribution {
  // Required fields for calculations
  totalSum: WADAmount; // WAD calculation value (18 decimals) - core calculation
  binFactors: WADAmount[]; // WAD format bin factor array (18 decimals) - core calculation

  // Optional fields (informational only)
  minFactor?: WADAmount; // Minimum factor value (WAD, 18 decimals)
  maxFactor?: WADAmount; // Maximum factor value (WAD, 18 decimals)
  avgFactor?: WADAmount; // Average factor value (WAD, 18 decimals)
  totalVolume?: USDCAmount; // Total volume (raw 6 decimals) - informational
  binVolumes?: USDCAmount[]; // Bin volume array (raw 6 decimals) - informational
  tickRanges?: string[]; // Tick range string array
}

interface Market {
  liquidityParameter: WADAmount; // Big object (WAD)
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

#### calculateDecreaseProceeds() / calculateSellProceeds()

Calculate proceeds when decreasing position (both functions use unified internal logic)

```typescript
calculateDecreaseProceeds(
  position: Position,
  sellQuantity: USDCAmount,
  distribution: MarketDistribution,
  market: Market
): DecreaseProceedsResult

calculateSellProceeds(
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
toWAD(amount: string | number): WADAmount    // Convert to 18 decimal WAD
toUSDC(amount: string | number): USDCAmount  // Convert to 6 decimal USDC
```

## 🏗️ Architecture

### Unified Scaling Design

```
┌─────────────────┐    ┌──────────────┐    ┌─────────────┐
│  Subgraph API   │───▶│   Adapter    │───▶│ SDK Calc    │
│ (BigInt→string) │    │ (parse only) │    │ (Big ops)   │
└─────────────────┘    └──────────────┘    └─────────────┘
   Raw WAD/USDC          mapXXX()           raw scale
```

- **Subgraph Layer**: Provides raw-scale BigInt values converted to strings
- **Adapter Layer**: Simple string → Big object conversion (no scaling)
- **SDK Layer**: Performs calculations using raw contract scales

### Scaling Standards

- **Factors**: WAD format (18 decimals) - used for LMSR calculations
- **USDC Amounts**: Raw 6 decimals - quantity, cost, proceeds
- **No normalization**: All values maintain contract-native scales

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

25+ test cases including:

- ✅ Price impact (non-linearity)
- ✅ Range effects
- ✅ Mathematical consistency (pure functions)
- ✅ Inverse function accuracy
- ✅ Claim logic
- ✅ Error handling
- ✅ Large-scale trading (α=200 environment)
- ✅ Dynamic quantity limits
- ✅ Scaling & Chunking

## 📋 Type Definitions

```typescript
type WADAmount = Big; // 18 decimal (factor values)
type USDCAmount = Big; // 6 decimal (quantity/cost values)
type Quantity = Big; // 6 decimal
type Tick = number; // tick value

interface Position {
  lowerTick: Tick;
  upperTick: Tick;
  quantity: Quantity;
}
```

## 📝 Changelog

### v1.6.2 (Latest)

- **🔧 Error handling consistency**: Unified error types across SDK (ValidationError, CalculationError)
- **📊 Enhanced MathUtils integration**: Consistent use of MathUtils functions for all scaling operations
- **🎯 Refined decimal precision**: Improved Big.js usage for consistent decimal handling
- **⚡ Code consistency improvements**: Eliminated magic numbers, standardized conversion patterns

### v1.6.1

- **🔢 Fixed decimal scaling**: Corrected quantity limits and scaling issues
- **📈 Enhanced quantity limits**: Proper market-specific limit calculations (α × 0.13 × 1000)
- **🛠️ Improved error messages**: Clear validation messages with accurate limit display

## 🔗 Related Links

- **Subgraph API**: [CLMSR Subgraph Documentation](https://github.com/whworjs/signals-v0/blob/main/docs/SUBGRAPH_API.md)
- **Contract Integration**: [Contract Integration Guide](https://github.com/whworjs/signals-v0/blob/main/docs/CONTRACT_INTEGRATION.md)
- **Quick Start**: [Quick Start Guide](https://github.com/whworjs/signals-v0/blob/main/docs/QUICK_START.md)
- **Complete Documentation**: [Main Documentation](https://github.com/whworjs/signals-v0/blob/main/docs/README.md)
