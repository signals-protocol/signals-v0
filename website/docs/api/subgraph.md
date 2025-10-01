# Subgraph API

Signals exposes a Goldsky-hosted subgraph that tracks the CLMSR market in real time. This page shows the endpoint, key entities, and typical queries so you can build analytics, dashboards, or automation without hitting the contracts directly.

## Endpoints

| Environment | URL |
| --- | --- |
| Deployed | `https://api.goldsky.com/api/public/project_cme6kru6aowuy01tb4c9xbdrj/subgraphs/signals-v0-citrea-prod/latest/gn` |

All numbers maintain contract-native scales: factors are 18-decimal WAD values, monetary amounts are 6-decimal integers.

## Core entities

- **Market** — configuration and lifecycle of each daily market (`marketId`, `minTick`, `maxTick`, `isSettled`, `settlementTick`).
- **MarketDistribution** — segment tree snapshot for pricing; includes `totalSum`, `binFactors`, `tickRanges`, and metadata hashes so the SDK can detect updates.
- **BinState** — per-bin factors and volumes, useful for charts.
- **UserPosition** — ERC-721 range position with derived metrics such as `currentQuantity`, `totalCostBasis`, `realizedPnL`, and `outcome`.
- **Trade** — every OPEN/INCREASE/DECREASE/CLOSE/SETTLE action, including gas data for auditing.
- **UserStats / MarketStats** — aggregated totals (volume, winRate, realised PnL, unique traders, price extremes).
- **PositionSettled / PositionClaimed** — per-position results and claim records; useful for reconciling liabilities and verifying that automation finished cleanly.

## Useful queries

### Market distribution

```graphql
query Distribution($marketId: String!) {
  marketDistribution(id: $marketId) {
    totalSum
    binFactors
    binVolumes
    tickRanges
  }
}
```

Feed the result into `mapDistribution` from the SDK to price trades.

### Active positions for a user

```graphql
query Positions($user: Bytes!) {
  userPositions(where: { user: $user, outcome: OPEN }) {
    positionId
    lowerTick
    upperTick
    currentQuantity
    totalCostBasis
    realizedPnL
  }
}
```

### Trade history within a market

```graphql
query UserMarketTrades($user: Bytes!, $market: String!) {
  trades(
    where: { user: $user, market: $market }
    orderBy: timestamp
    orderDirection: desc
  ) {
    id
    type
    quantity
    costOrProceeds
    timestamp
  }
}
```

## Working with raw scales

- Divide WAD values (`binFactors`, `totalSum`) by `1e18` for display.
- Divide SUSD amounts (`quantity`, `costOrProceeds`, `totalVolume`) by `1e6` to show tokens.
- Percentages (`winRate`, `priceChange24h`) are decimals; multiply by 100 for human-readable percentages.

The SDK expects raw values, so only convert when rendering UI.

## Monitoring tips

- Compare the subgraph’s latest block with the Citrea explorer to detect lag.
- Queries every 3–5 seconds are usually sufficient; for heavier workloads consider batching requests.

For deeper schema exploration use Goldsky’s GraphQL playground or inspect the generated TypeScript bindings (`yarn workspace clmsr-subgraph codegen`).
