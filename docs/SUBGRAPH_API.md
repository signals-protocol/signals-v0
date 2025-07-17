# CLMSR 서브그래프 API 상세 가이드

> **실시간 CLMSR 마켓 데이터**를 GraphQL로 조회하는 완전한 가이드입니다.

## 📋 목차

- [GraphQL 설정](#graphql-설정)
- [엔티티 구조](#엔티티-구조)
- [쿼리 패턴](#쿼리-패턴)
- [실시간 데이터 활용](#실시간-데이터-활용)
- [최적화 팁](#최적화-팁)

---

## 🔗 GraphQL 설정

### 기본 설정

```typescript
import { ApolloClient, InMemoryCache, gql } from "@apollo/client";

const client = new ApolloClient({
  uri: "https://api.studio.thegraph.com/query/116469/signals-v-0/version/latest",
  cache: new InMemoryCache(),
});
```

### 환경별 엔드포인트

```typescript
const SUBGRAPH_ENDPOINTS = {
  production:
    "https://api.studio.thegraph.com/query/116469/signals-v-0/version/latest",
  // 향후 확장 가능
};
```

---

## 📊 엔티티 구조

### 1. Market (마켓 정보)

```graphql
type Market @entity(immutable: false) {
  id: String! # marketId
  marketId: BigInt!
  startTimestamp: BigInt!
  endTimestamp: BigInt!
  numTicks: BigInt!
  liquidityParameter: BigInt!
  isSettled: Boolean!
  settlementLowerTick: BigInt
  settlementUpperTick: BigInt
  lastUpdated: BigInt!
  ticks: [TickState!]! @derivedFrom(field: "market")
}
```

### 2. TickState (개별 틱 상태)

```graphql
type TickState @entity(immutable: false) {
  id: String! # marketId-tickNumber
  market: Market!
  tickNumber: BigInt!
  currentFactor: BigDecimal! # 현재 누적 factor 값
  lastUpdated: BigInt!
  updateCount: BigInt! # 업데이트된 횟수
}
```

### 3. TickRange (거래 가능한 구간)

```graphql
type TickRange @entity(immutable: false) {
  id: String! # marketId-lowerTick-upperTick
  market: Market!
  lowerTick: BigInt!
  upperTick: BigInt!
  currentFactor: BigDecimal! # 현재 누적 factor 값
  lastUpdated: BigInt!
  updateCount: BigInt! # 업데이트된 횟수
  totalVolume: BigDecimal! # 총 거래량
}
```

### 4. 이벤트 엔티티들

#### MarketCreated

```graphql
type MarketCreated @entity(immutable: true) {
  id: Bytes!
  marketId: BigInt!
  startTimestamp: BigInt!
  endTimestamp: BigInt!
  numTicks: BigInt!
  liquidityParameter: BigInt!
  blockNumber: BigInt!
  blockTimestamp: BigInt!
  transactionHash: Bytes!
}
```

#### RangeFactorApplied

```graphql
type RangeFactorApplied @entity(immutable: true) {
  id: Bytes!
  marketId: BigInt!
  lo: BigInt! # 시작 틱
  hi: BigInt! # 끝 틱
  factor: BigInt! # 적용된 팩터
  blockNumber: BigInt!
  blockTimestamp: BigInt!
  transactionHash: Bytes!
}
```

#### 포지션 관련 이벤트

```graphql
type PositionOpened @entity(immutable: true) {
  id: Bytes!
  positionId: BigInt!
  trader: Bytes! # address
  marketId: BigInt!
  lowerTick: BigInt!
  upperTick: BigInt!
  quantity: BigInt!
  cost: BigInt!
  blockNumber: BigInt!
  blockTimestamp: BigInt!
  transactionHash: Bytes!
}

type PositionClosed @entity(immutable: true) {
  id: Bytes!
  positionId: BigInt!
  trader: Bytes! # address
  proceeds: BigInt!
  blockNumber: BigInt!
  blockTimestamp: BigInt!
  transactionHash: Bytes!
}
```

---

## 🔍 쿼리 패턴

### 1. 마켓 목록 조회

```graphql
query GetMarkets {
  markets(first: 10, orderBy: lastUpdated, orderDirection: desc) {
    id
    marketId
    startTimestamp
    endTimestamp
    numTicks
    isSettled
    lastUpdated
  }
}
```

**실제 응답 예시:**

```json
{
  "data": {
    "markets": [
      {
        "id": "0",
        "marketId": "0",
        "startTimestamp": "1752753954",
        "endTimestamp": "1753358754",
        "numTicks": "10000",
        "isSettled": false,
        "lastUpdated": "1752790042"
      }
    ]
  }
}
```

### 2. 특정 마켓의 실시간 틱 상태

```graphql
query GetMarketTickStates($marketId: String!) {
  market(id: $marketId) {
    id
    marketId
    numTicks
    isSettled
    ticks(orderBy: tickNumber, first: 100) {
      id
      tickNumber
      currentFactor
      lastUpdated
      updateCount
    }
  }
}
```

**실제 응답 예시:**

```json
{
  "data": {
    "market": {
      "id": "0",
      "marketId": "0",
      "numTicks": "10000",
      "isSettled": false,
      "ticks": [
        {
          "id": "0-0",
          "tickNumber": "0",
          "currentFactor": "1",
          "lastUpdated": "1752790042",
          "updateCount": "1"
        }
      ]
    }
  }
}
```

### 3. 거래 가능한 틱 범위 조회

```graphql
query GetTickRanges($marketId: String!) {
  tickRanges(
    where: { market: $marketId }
    orderBy: totalVolume
    orderDirection: desc
    first: 20
  ) {
    id
    lowerTick
    upperTick
    currentFactor
    totalVolume
    updateCount
    lastUpdated
  }
}
```

**실제 응답 예시:**

```json
{
  "data": {
    "tickRanges": [
      {
        "id": "0-1000-1100",
        "lowerTick": "1000",
        "upperTick": "1100",
        "currentFactor": "12.182493960703473",
        "totalVolume": "500",
        "updateCount": "3",
        "lastUpdated": "1752790042"
      }
    ]
  }
}
```

### 4. 최근 거래 활동 모니터링

```graphql
query GetRecentTrades($marketId: BigInt, $limit: Int = 50) {
  positionOpeneds(
    where: { marketId: $marketId }
    first: $limit
    orderBy: blockTimestamp
    orderDirection: desc
  ) {
    id
    positionId
    trader
    marketId
    lowerTick
    upperTick
    quantity
    cost
    blockTimestamp
    transactionHash
  }
}
```

### 5. 팩터 변화 추적

```graphql
query GetFactorChanges($marketId: BigInt!, $from: BigInt!) {
  rangeFactorApplieds(
    where: { marketId: $marketId, blockTimestamp_gte: $from }
    orderBy: blockTimestamp
    orderDirection: desc
  ) {
    id
    lo
    hi
    factor
    blockTimestamp
    transactionHash
  }
}
```

**실제 응답 예시:**

```json
{
  "data": {
    "rangeFactorApplieds": [
      {
        "id": "0x088c9586243e03366d7ae327cba2b6eecad083c281c6731d8b5720b3e672a5fa0a000000",
        "marketId": "0",
        "lo": "500",
        "hi": "599",
        "factor": "1138828383324654321",
        "blockTimestamp": "1752790042",
        "transactionHash": "0x088c9586243e03366d7ae327cba2b6eecad083c281c6731d8b5720b3e672a5fa0a"
      }
    ]
  }
}
```

---

## 📈 실시간 데이터 활용

### 1. 가격 분포 차트용 데이터

```typescript
interface PriceDistributionData {
  tickNumber: number;
  currentFactor: number;
  lastUpdated: number;
}

const getPriceDistribution = async (
  marketId: string
): Promise<PriceDistributionData[]> => {
  const { data } = await client.query({
    query: gql`
      query GetPriceDistribution($marketId: String!) {
        market(id: $marketId) {
          ticks(orderBy: tickNumber) {
            tickNumber
            currentFactor
            lastUpdated
          }
        }
      }
    `,
    variables: { marketId },
    fetchPolicy: "network-only", // 항상 최신 데이터
  });

  return (
    data.market?.ticks.map((tick) => ({
      tickNumber: parseInt(tick.tickNumber),
      currentFactor: parseFloat(tick.currentFactor),
      lastUpdated: parseInt(tick.lastUpdated),
    })) || []
  );
};
```

### 2. 실시간 폴링 설정

```typescript
import { useQuery } from "@apollo/client";

const useRealtimeMarketData = (marketId: string) => {
  const { data, loading, error } = useQuery(GET_MARKET_TICK_STATES, {
    variables: { marketId },
    pollInterval: 5000, // 5초마다 업데이트
    fetchPolicy: "cache-and-network",
    errorPolicy: "all",
  });

  return {
    tickStates: data?.market?.ticks || [],
    loading,
    error,
  };
};
```

### 3. 거래량 기반 인기 구간 찾기

```typescript
const getPopularRanges = async (marketId: string, limit: number = 10) => {
  const { data } = await client.query({
    query: gql`
      query GetPopularRanges($marketId: String!, $limit: Int!) {
        tickRanges(
          where: { market: $marketId }
          orderBy: totalVolume
          orderDirection: desc
          first: $limit
        ) {
          lowerTick
          upperTick
          currentFactor
          totalVolume
          updateCount
        }
      }
    `,
    variables: { marketId, limit },
  });

  return data.tickRanges;
};
```

---

## ⚡ 최적화 팁

### 1. 쿼리 최적화

```typescript
// ❌ 비효율적: 모든 필드 조회
query GetMarkets {
  markets {
    id
    marketId
    startTimestamp
    endTimestamp
    numTicks
    liquidityParameter
    isSettled
    settlementLowerTick
    settlementUpperTick
    lastUpdated
    ticks {
      id
      tickNumber
      currentFactor
      lastUpdated
      updateCount
    }
  }
}

// ✅ 효율적: 필요한 필드만 조회
query GetMarketsSummary {
  markets {
    id
    marketId
    isSettled
    lastUpdated
  }
}
```

### 2. 페이지네이션 활용

```typescript
const useMarketsWithPagination = (pageSize: number = 10) => {
  const [hasMore, setHasMore] = useState(true);

  const { data, loading, fetchMore } = useQuery(
    gql`
      query GetMarkets($first: Int!, $skip: Int!) {
        markets(
          first: $first
          skip: $skip
          orderBy: lastUpdated
          orderDirection: desc
        ) {
          id
          marketId
          isSettled
          lastUpdated
        }
      }
    `,
    {
      variables: { first: pageSize, skip: 0 },
    }
  );

  const loadMore = () => {
    fetchMore({
      variables: {
        skip: data?.markets?.length || 0,
      },
      updateQuery: (prev, { fetchMoreResult }) => {
        if (!fetchMoreResult?.markets?.length) {
          setHasMore(false);
          return prev;
        }
        return {
          markets: [...prev.markets, ...fetchMoreResult.markets],
        };
      },
    });
  };

  return { markets: data?.markets || [], loading, loadMore, hasMore };
};
```

### 3. 에러 처리

```typescript
const robustQuery = async (query: DocumentNode, variables: any) => {
  try {
    const { data } = await client.query({
      query,
      variables,
      errorPolicy: "all",
    });
    return { data, error: null };
  } catch (error) {
    console.error("GraphQL 쿼리 실패:", error);
    return { data: null, error };
  }
};
```

### 4. 캐싱 전략

```typescript
const client = new ApolloClient({
  uri: "https://api.studio.thegraph.com/query/116469/signals-v-0/version/latest",
  cache: new InMemoryCache({
    typePolicies: {
      Market: {
        fields: {
          ticks: {
            merge: false, // 항상 새 데이터로 교체
          },
        },
      },
      TickState: {
        keyFields: ["id"], // ID 기반 캐싱
      },
    },
  }),
});
```

---

## 🔧 유용한 유틸리티

### 1. 팩터를 확률로 변환

```typescript
const factorToProbability = (factor: string): number => {
  const factorNum = parseFloat(factor);
  // CLMSR 공식에 따른 확률 계산
  return factorNum / (1 + factorNum);
};
```

### 2. 타임스탬프 포맷팅

```typescript
const formatTimestamp = (timestamp: string): string => {
  return new Date(parseInt(timestamp) * 1000).toLocaleString();
};
```

### 3. 가격 변화율 계산

```typescript
const calculatePriceChange = (current: string, previous: string): number => {
  const curr = parseFloat(current);
  const prev = parseFloat(previous);
  return ((curr - prev) / prev) * 100;
};
```

---

이 API 가이드를 통해 CLMSR 서브그래프에서 실시간 데이터를 효과적으로 조회하고 활용할 수 있습니다!
