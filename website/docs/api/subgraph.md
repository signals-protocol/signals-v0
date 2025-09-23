# Subgraph API

Signals publishes a Goldsky subgraph that mirrors the on-chain CLMSR state. Use it to query markets, distributions, trades, and points without calling the contracts directly.

## Endpoints

| Environment | URL |
| --- | --- |
| Production (Citrea) | `https://api.goldsky.com/api/public/project_cme6kru6aowuy01tb4c9xbdrj/subgraphs/signals-v0-citrea-prod/latest/gn` |
| Development (Citrea) | `https://api.goldsky.com/api/public/project_cme6kru6aowuy01tb4c9xbdrj/subgraphs/signals-v0-citrea-dev/latest/gn` |

The schema is sourced from `clmsr-subgraph/schema.graphql`. Key entities are summarised below.

## Core Entities

### Market

```graphql
type Market {
  id: String!
  marketId: BigInt!
  minTick: BigInt!
  maxTick: BigInt!
  tickSpacing: BigInt!
  startTimestamp: BigInt!
  endTimestamp: BigInt!
  settlementTimestamp: BigInt
  numBins: BigInt!
  liquidityParameter: BigInt!
  isSettled: Boolean!
  settlementValue: BigInt
  settlementTick: BigInt
  lastUpdated: BigInt!
  bins: [BinState!]!
}
```

### BinState

Tracks the exponential factors per tick.

```graphql
type BinState {
  id: String!
  market: Market!
  binIndex: BigInt!
  lowerTick: BigInt!
  upperTick: BigInt!
  currentFactor: BigInt!
  lastUpdated: BigInt!
  updateCount: BigInt!
  totalVolume: BigInt!
}
```

### UserPosition

```graphql
type UserPosition {
  id: String!
  positionId: BigInt!
  user: Bytes!
  stats: UserStats!
  market: Market!
  lowerTick: BigInt!
  upperTick: BigInt!
  currentQuantity: BigInt!
  totalCostBasis: BigInt!
  averageEntryPrice: BigInt!
  totalQuantityBought: BigInt!
  totalQuantitySold: BigInt!
  totalProceeds: BigInt!
  realizedPnL: BigInt!
  outcome: PositionOutcome!
  isClaimed: Boolean!
  createdAt: BigInt!
  lastUpdated: BigInt!
  activityRemaining: BigInt!
  weightedEntryTime: BigInt!
}
```

### Trade

Represents OPEN/INCREASE/DECREASE/CLOSE/SETTLE events. Includes per-trade points.

### UserStats & MarketStats

Aggregate per-user and per-market metrics (totals, win rates, points, PnL, gas usage, etc.). Common fields include:

| Entity.field | Description |
| --- | --- |
| `MarketStats.unclaimedPayout` | Outstanding SUSD after settlement batches. |
| `MarketStats.totalVolume` | Aggregate traded quantity (6 decimals). |
| `UserStats.realizedPnL` | Settled profit or loss per trader (6 decimals). |
| `UserStats.performancePt` | Lifetime performance points granted by `PointsGranter`. |

## Example Queries

**Fetch a market snapshot with distribution and recent trades:**

```graphql
query GetMarket($marketId: String!) {
  market(id: $marketId) {
    marketId
    minTick
    maxTick
    tickSpacing
    isSettled
    settlementTick
    liquidityParameter
    bins(first: 10, orderBy: binIndex) {
      binIndex
      lowerTick
      upperTick
      currentFactor
    }
  }
  trades(first: 20, orderBy: timestamp, orderDirection: desc, where: { market: $marketId }) {
    id
    type
    quantity
    costOrProceeds
    activityPt
    performancePt
    riskBonusPt
    timestamp
  }
}
```

**List active positions for a user:**

```graphql
query GetPositions($user: Bytes!) {
  userPositions(where: { user: $user, outcome: OPEN }) {
    positionId
    market {
      marketId
      isSettled
    }
    lowerTick
    upperTick
    currentQuantity
    totalCostBasis
    realizedPnL
  }
}
```

## Usage Tips

- All monetary values are raw 6-decimal integers. Convert using the helpers in the SDK (`toWAD`, `fromWadRoundUp`).
- Bin factors are WAD values. Divide by `1e18` to display or feed into the SDK.
- `MarketStats.unclaimedPayout` shows how much remains to be claimed after settlement batches run.
- The `PositionSettled` entity (derived from events) is useful for reconciling claims and settlement progress.

The Goldsky dashboard offers built-in playgrounds for the endpoints above. For local testing, run `yarn workspace clmsr-subgraph codegen` to generate TypeScript bindings from the same schema.
