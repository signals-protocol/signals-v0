# 서브그래프 API

Signals는 온체인 CLMSR 상태를 그대로 반영하는 Goldsky 서브그래프를 운영합니다. 시장, 분포, 거래, 포인트 데이터를 컨트랙트를 직접 호출하지 않고도 조회할 수 있습니다.

## 엔드포인트

| 환경 | URL |
| --- | --- |
| 프로덕션 (Citrea) | `https://api.goldsky.com/api/public/project_cme6kru6aowuy01tb4c9xbdrj/subgraphs/signals-v0-citrea-prod/latest/gn` |
| 개발 (Citrea) | `https://api.goldsky.com/api/public/project_cme6kru6aowuy01tb4c9xbdrj/subgraphs/signals-v0-citrea-dev/latest/gn` |

스키마는 `clmsr-subgraph/schema.graphql`에서 가져오며, 핵심 엔티티는 아래와 같습니다.

## 핵심 엔티티

### Market

시장 구성과 정산 상태를 추적합니다.

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

틱별 지수 팩터와 거래량을 저장합니다.

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

사용자 포지션과 비용/수익 합계를 제공합니다.

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

### Trade / UserStats / MarketStats

- `Trade`는 OPEN/INCREASE/DECREASE/CLOSE/SETTLE 이벤트를 하나의 엔티티로 정규화하며, 거래별 포인트를 포함합니다.
- `UserStats`, `MarketStats`는 누적 수익률, 포인트, 미청구 금액 등을 집계합니다.

| 필드 | 설명 |
| --- | --- |
| `MarketStats.unclaimedPayout` | 정산 배치 이후 남아 있는 SUSD 금액 |
| `MarketStats.totalVolume` | 누적 거래량 (6 소수) |
| `UserStats.realizedPnL` | 정산된 손익 (6 소수) |
| `UserStats.performancePt` | `PointsGranter`가 부여한 성과 포인트 합계 |

## 예시 쿼리

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

## 활용 팁

- 금액 관련 필드는 모두 6소수 정수입니다. SDK 헬퍼(`toWAD`, `fromWadRoundUp`)로 변환하세요.
- Bin 팩터는 WAD(18소수) 값이므로 `1e18`로 나눈 뒤 사용합니다.
- `MarketStats.unclaimedPayout`으로 정산 후 미청구 잔액을 추적할 수 있습니다.
- `PositionSettled` 데이터는 청구 진행상황을 조정할 때 유용합니다.

Goldsky 대시보드에서 위 엔드포인트를 바로 테스트할 수 있으며, 로컬 개발 시 `yarn workspace clmsr-subgraph codegen`으로 동일 스키마의 TypeScript 바인딩을 생성할 수 있습니다.
