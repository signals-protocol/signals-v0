# 서브그래프 API

Signals는 Goldsky 서브그래프를 통해 CLMSR 시장 데이터를 실시간으로 제공합니다. 컨트랙트 호출 없이 시장 분포, 포지션, 포인트, 통계를 조회하려면 아래 엔드포인트와 엔티티를 참고하세요.

## 엔드포인트

| 환경 | URL |
| --- | --- |
| 프로덕션 | `https://api.goldsky.com/api/public/project_cme6kru6aowuy01tb4c9xbdrj/subgraphs/signals-v0-citrea-prod/latest/gn` |
| 개발 | `https://api.goldsky.com/api/public/project_cme6kru6aowuy01tb4c9xbdrj/subgraphs/signals-v0-citrea-dev/latest/gn` |

모든 값은 온체인 스케일 그대로 유지됩니다. 지수 가중치는 18자리 WAD, 금액은 6자리 정수이며, 스키마는 `clmsr-subgraph/schema.graphql`에서 확인할 수 있습니다.

## 핵심 엔티티

- **Market** — 일일 시장의 구성과 정산 상태.
- **MarketDistribution** — SDK가 사용해 가격을 계산하는 세그먼트 트리 스냅샷 (`binFactors`, `tickRanges` 등).
- **BinState** — 틱별 가중치와 거래량. 차트나 히트맵에 활용.
- **UserPosition** — ERC-721 포지션과 파생 지표(`currentQuantity`, `realizedPnL`, `outcome`, 포인트 카운터 등).
- **Trade** — OPEN/INCREASE/DECREASE/CLOSE/SETTLE 이벤트. 가스 정보와 포인트 지급 내역 포함.
- **UserStats / MarketStats** — 거래량, 손익, 승률, 고유 트레이더 수 같은 집계 지표.
- **PositionSettled / PositionEventsProgress** — 배치 정산 진행 상황과 지급액을 추적. `isComplete`가 `true`가 되면 청구가 열립니다.

## 자주 쓰는 쿼리

### 시장 분포

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

결과 객체를 그대로 `mapDistribution`(SDK) 함수에 전달하면 비용/확률 계산이 가능합니다.

### 사용자 활성 포지션

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

### 특정 시장의 거래 내역

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

### 정산 진행 상황

```graphql
query SettlementProgress($marketId: BigInt!) {
  positionEventsProgresses(
    where: { marketId: $marketId }
    orderBy: blockNumber
    orderDirection: desc
    first: 1
  ) {
    fromIndex
    toIndex
    isComplete
  }
}
```

## 스케일 변환 요령

- 가중치(`binFactors`, `totalSum`)는 18자리 WAD → 표시할 때 `1e18`로 나눕니다.
- 금액(`quantity`, `costOrProceeds`, `totalVolume`)은 6자리 정수 → `1e6`으로 나눠 SUSD로 보여 줍니다.
- 비율(`winRate`, `priceChange24h`)은 소수 → 100을 곱해 퍼센트로 변환합니다.

SDK는 원본 값을 그대로 기대하므로 UI에 표시할 때만 변환하세요.

## 모니터링 팁

- 서브그래프 최신 블록과 Citrea 익스플로러 블록 높이를 비교해 지연 여부를 확인하세요.
- 정산 후에는 `PositionEventsProgress.isComplete`가 `true`인지 확인한 뒤 사용자에게 청구를 안내하세요.
- 대부분의 자동화 작업은 3~5초 간격 폴링이면 충분하며, 트래픽이 많다면 요청을 배치 처리하세요.

자세한 스키마는 Goldsky GraphQL 플레이그라운드 또는 `yarn workspace clmsr-subgraph codegen`으로 생성되는 TypeScript 바인딩에서 확인할 수 있습니다.
