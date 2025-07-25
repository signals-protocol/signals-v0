# CLMSR TypeScript SDK

> 📈 **CLMSR (Conditional Liquidity Market Maker)** 예측 마켓 시스템용 TypeScript SDK

## 📌 Latest Updates

### v1.3.0 - Settlement API 수정

- **Breaking Change**: `calculateClaimAmount` 함수가 이제 settlement 범위(`settlementLowerTick`, `settlementUpperTick`)를 받습니다
- 이전: `calculateClaimAmount(position, settlementTick)`
- 현재: `calculateClaimAmount(position, settlementLowerTick, settlementUpperTick)`
- 컨트랙트와 완전히 동일한 overlap 로직으로 수정

## 🎯 개요

TypeScript SDK for CLMSR (Constant Logarithmic Market Scoring Rule) prediction market calculations.

## 🚀 Features

- **Fast off-chain calculations**: All smart contract view functions implemented in TypeScript
- **Inverse function**: Calculate quantity from target cost using direct mathematical formula
- **High precision**: Uses Big.js for accurate fixed-point arithmetic (WAD/USDC format)
- **Stateless design**: Pure calculation functions - no market state management
- **LMSR compliance**: Implements proper LMSR mathematical properties
- **Comprehensive testing**: 17 test cases covering all LMSR characteristics

## 📦 Installation

This is a local SDK. Import from the source:

```typescript
import { CLMSRSDK, createCLMSRSDK, toWAD, toUSDC } from "./src";
```

## 🏁 Quick Start

```typescript
import { CLMSRSDK, createCLMSRSDK, toWAD, toUSDC } from "./src";

// Create SDK instance (two ways)
const sdk = new CLMSRSDK();
// or
const sdk = createCLMSRSDK();

// Market configuration
const market = {
  liquidityParameter: toWAD("1000"), // α = 1000 (liquidity parameter)
  minTick: 100000, // $1000.00
  maxTick: 140000, // $1400.00
  tickSpacing: 100, // $1.00 increments
};

// Market distribution (from subgraph/indexer)
const distribution = {
  totalSum: toWAD("400"), // Total sum of all bin factors
  binFactors: [
    toWAD("1.0"), // bin 0: [100000, 100100) = [$1000.00, $1001.00)
    toWAD("1.0"), // bin 1: [100100, 100200) = [$1001.00, $1002.00)
    // ... all 400 bins
    toWAD("1.0"), // bin 399: [139900, 140000) = [$1399.00, $1400.00)
  ],
};

// Calculate cost for betting 50 USDC on [$1150, $1250] range
const result = sdk.calculateOpenCost(
  115000, // lowerTick ($1150.00)
  125000, // upperTick ($1250.00)
  toUSDC("50"), // 50 USDC bet
  distribution,
  market
);

console.log(`Cost: ${result.cost} USDC`);
console.log(`Average price: ${result.averagePrice}`);
```

## 📖 API Reference

### Core Functions

#### calculateOpenCost

Calculate cost to open a new position.

```typescript
const result = sdk.calculateOpenCost(
  lowerTick: number,
  upperTick: number,
  quantity: USDCAmount,
  distribution: MarketDistribution,
  market: Market
): OpenCostResult;

// Returns: { cost: USDCAmount, averagePrice: USDCAmount }
```

#### calculateIncreaseCost

Calculate additional cost to increase existing position.

```typescript
const result = sdk.calculateIncreaseCost(
  position: Position,
  additionalQuantity: USDCAmount,
  distribution: MarketDistribution,
  market: Market
): IncreaseCostResult;

// Returns: { additionalCost: USDCAmount, newAveragePrice: USDCAmount }
```

#### calculateDecreaseProceeds

Calculate proceeds from reducing position size.

```typescript
const result = sdk.calculateDecreaseProceeds(
  lowerTick: number,
  upperTick: number,
  quantity: USDCAmount,
  distribution: MarketDistribution,
  market: Market
): DecreaseResult;

// Returns: { proceeds: USDCAmount, averagePrice: USDCAmount }
```

#### calculateCloseProceeds

Calculate proceeds from closing entire position.

```typescript
const result = sdk.calculateCloseProceeds(
  position: Position,
  distribution: MarketDistribution,
  market: Market
): CloseResult;

// Returns: { proceeds: USDCAmount, averagePrice: USDCAmount }
```

#### calculateClaimAmount

Calculate claim amount after market settlement.

```typescript
const result = sdk.calculateClaimAmount(
  position: Position,
  settlementLowerTick: number,
  settlementUpperTick: number
): ClaimResult;

// Returns: { claimAmount: USDCAmount, isWinning: boolean }
```

#### calculateQuantityFromCost (Inverse Function)

Calculate quantity you can get for a target cost.

```typescript
const result = sdk.calculateQuantityFromCost(
  lowerTick: number,
  upperTick: number,
  targetCost: USDCAmount,
  distribution: MarketDistribution,
  market: Market
): QuantityResult;

// Returns: { quantity: USDCAmount, averagePrice: USDCAmount }
```

### Helper Functions

#### toWAD / toUSDC

Convert to proper decimal formats.

```typescript
const wadAmount = toWAD("100"); // 100 * 10^18 for 18-decimal precision
const usdcAmount = toUSDC("100"); // 100 * 10^6 for 6-decimal USDC
```

## 💼 Data Types

### Market

```typescript
interface Market {
  liquidityParameter: WADAmount; // α (alpha) - higher = more liquidity
  minTick: number; // Minimum tick value
  maxTick: number; // Maximum tick value
  tickSpacing: number; // Distance between ticks
}
```

### MarketDistribution

```typescript
interface MarketDistribution {
  totalSum: WADAmount; // Sum of all bin factors
  binFactors: WADAmount[]; // Factor for each bin (0-indexed)
}
```

### Position

```typescript
interface Position {
  lowerTick: number; // Position lower bound
  upperTick: number; // Position upper bound
  quantity: USDCAmount; // Position size
}
```

## 🎯 Real-World Usage

### Example: Interactive Betting UI

```typescript
import { CLMSRSDK, toUSDC, toWAD } from "./src";

const sdk = new CLMSRSDK();

// User wants to bet on price range [$1100, $1200]
const lowerTick = 110000;
const upperTick = 120000;

// User input: "I want to spend $50"
const targetCost = toUSDC("50");

// Calculate how much they'll get
const quantityResult = sdk.calculateQuantityFromCost(
  lowerTick,
  upperTick,
  targetCost,
  distribution,
  market
);

console.log(`For $50, you get ${quantityResult.quantity} shares`);
console.log(`Average price: ${quantityResult.averagePrice}`);

// Or user input: "I want 100 shares"
const targetQuantity = toUSDC("100");

// Calculate how much it costs
const costResult = sdk.calculateOpenCost(
  lowerTick,
  upperTick,
  targetQuantity,
  distribution,
  market
);

console.log(`100 shares costs: ${costResult.cost} USDC`);
console.log(`Average price: ${costResult.averagePrice}`);
```

### Example: Position Management

```typescript
// Existing position: 50 USDC bet on [$1150, $1250]
const position = {
  lowerTick: 115000,
  upperTick: 125000,
  quantity: toUSDC("50"),
};

// Add 30 more USDC to position
const addResult = sdk.calculateIncreaseCost(
  position,
  toUSDC("30"),
  distribution,
  market
);

console.log(`Additional cost: ${addResult.additionalCost}`);

// Sell 20 USDC worth from position
const sellResult = sdk.calculateDecreaseProceeds(
  position.lowerTick,
  position.upperTick,
  toUSDC("20"),
  distribution,
  market
);

console.log(`Proceeds from selling 20: ${sellResult.proceeds}`);

// Close entire position
const closeResult = sdk.calculateCloseProceeds(position, distribution, market);
console.log(`Total proceeds: ${closeResult.proceeds}`);
```

### Example: Market Settlement

```typescript
// Market settles in range $1180-$1190 (tick 118000-119000)
const settlementLowerTick = 118000;
const settlementUpperTick = 119000;

// Position that overlaps with settlement range (wins)
const winningPosition = {
  lowerTick: 115000, // $1150
  upperTick: 125000, // $1250
  quantity: toUSDC("100"),
};

// Position that doesn't overlap with settlement range (loses)
const losingPosition = {
  lowerTick: 130000, // $1300
  upperTick: 135000, // $1350
  quantity: toUSDC("50"),
};

const winResult = sdk.calculateClaimAmount(
  winningPosition,
  settlementLowerTick,
  settlementUpperTick
);
const loseResult = sdk.calculateClaimAmount(
  losingPosition,
  settlementLowerTick,
  settlementUpperTick
);

console.log(`Winning position claims: ${winResult.claimAmount} USDC`);
console.log(`Losing position claims: ${loseResult.claimAmount} USDC`); // Should be 0
```

## 🧪 LMSR Properties

The SDK implements true LMSR characteristics:

### Price Impact

More betting increases average price:

```typescript
const small = sdk.calculateOpenCost(
  115000,
  125000,
  toUSDC("20"),
  distribution,
  market
);

const large = sdk.calculateOpenCost(
  115000,
  125000,
  toUSDC("100"),
  distribution,
  market
);

// large.averagePrice > small.averagePrice ✅
```

### Range Effect

Wider ranges have higher average price:

```typescript
const narrow = sdk.calculateOpenCost(
  118000,
  119000,
  toUSDC("50"),
  distribution,
  market
);

const wide = sdk.calculateOpenCost(
  115000,
  125000,
  toUSDC("50"),
  distribution,
  market
);

// wide.averagePrice > narrow.averagePrice ✅
```

### No Arbitrage

Buy-then-sell should have minimal loss:

```typescript
const buyResult = sdk.calculateOpenCost(
  115000,
  125000,
  toUSDC("50"),
  distribution,
  market
);

const sellResult = sdk.calculateDecreaseProceeds(
  115000,
  125000,
  toUSDC("50"),
  distribution,
  market
);

const loss =
  Number(buyResult.cost.toString()) - Number(sellResult.proceeds.toString());
// loss should be small (< 5% typically)
```

## ✅ Testing

The SDK includes comprehensive tests covering:

- **LMSR Mathematical Properties**: Price impact, range effects, no arbitrage
- **Edge Cases**: Zero quantities, boundary ticks, maximum values
- **Precision**: WAD/USDC conversion accuracy
- **Inverse Function**: Round-trip accuracy
- **Position Management**: Increase/decrease consistency
- **Market Settlement**: Winning/losing position claims

Run tests:

```bash
yarn test
```

## 📝 Notes

1. **Stateless**: SDK doesn't manage market state - you provide distribution data
2. **Pure Calculations**: No side effects, same inputs = same outputs
3. **High Precision**: Uses Big.js to avoid JavaScript floating point issues
4. **USDC Format**: All amounts use 6-decimal USDC format (micro-USDC)
5. **Contract Compliance**: Calculations match smart contract exactly

## 🔄 Data Flow

```
Subgraph/Indexer → MarketDistribution → SDK → UI
                                      ↓
Smart Contract ← User Transaction ← SDK Results
```

The SDK sits between your UI and both data sources, providing fast calculations while ensuring contract accuracy.
