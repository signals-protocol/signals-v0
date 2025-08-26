# GraphQL API

Query signals-v0 data using our GraphQL API powered by The Graph protocol.

## Endpoint

**Citrea Production**

```
https://api.goldsky.com/api/public/project_cme6kru6aowuy01tb4c9xbdrj/subgraphs/signals-v0-citrea-prod/latest/gn
```

## Core Entities

### Market

Query prediction markets and their properties.

```graphql
type Market {
  id: String!
  marketId: BigInt!
  minTick: BigInt!
  maxTick: BigInt!
  tickSpacing: Int!
  startTime: BigInt!
  endTime: BigInt!
  alpha: BigInt!
  settled: Boolean!
  settledTick: BigInt
  totalVolume: BigInt!
  activePositions: Int!
}
```

### Position

Query user positions and their details.

```graphql
type Position {
  id: String!
  tokenId: BigInt!
  market: Market!
  user: String!
  lowerTick: BigInt!
  upperTick: BigInt!
  shares: BigInt!
  opened: Boolean!
  settled: Boolean!
  claimedAmount: BigInt!
}
```

### User

Query user activity and statistics.

```graphql
type User {
  id: String!
  address: String!
  totalPositions: Int!
  activePositions: Int!
  totalVolume: BigInt!
  totalPnL: BigInt!
  positions: [Position!]!
}
```

## Example Queries

### Get All Markets

```graphql
query GetMarkets {
  markets(first: 10, orderBy: startTime, orderDirection: desc) {
    id
    marketId
    minTick
    maxTick
    tickSpacing
    startTime
    endTime
    alpha
    settled
    settledTick
    totalVolume
    activePositions
  }
}
```

### Get User Positions

```graphql
query GetUserPositions($userAddress: String!) {
  user(id: $userAddress) {
    id
    totalPositions
    activePositions
    totalVolume
    totalPnL
    positions(first: 20, orderBy: tokenId, orderDirection: desc) {
      tokenId
      market {
        marketId
        settled
        settledTick
      }
      lowerTick
      upperTick
      shares
      opened
      settled
      claimedAmount
    }
  }
}
```

### Get Market Details

```graphql
query GetMarketDetails($marketId: String!) {
  market(id: $marketId) {
    id
    marketId
    minTick
    maxTick
    tickSpacing
    startTime
    endTime
    alpha
    settled
    settledTick
    totalVolume
    activePositions
    positions(first: 50) {
      tokenId
      user
      lowerTick
      upperTick
      shares
      opened
      settled
    }
  }
}
```

### Get Recent Activity

```graphql
query GetRecentActivity {
  positionOpeneds(first: 10, orderBy: blockTimestamp, orderDirection: desc) {
    id
    market {
      marketId
    }
    user
    tokenId
    lowerTick
    upperTick
    shares
    blockTimestamp
    transactionHash
  }
}
```

## Data Updates

- **Indexing**: Real-time indexing of all contract events
- **Latency**: ~30 seconds from transaction confirmation
- **Start Block**: 14,176,879 (Citrea deployment block)

## Rate Limits

- **Queries per minute**: 1000
- **Max query complexity**: 1000
- **Max query depth**: 10

For high-volume applications, consider implementing appropriate caching strategies.




