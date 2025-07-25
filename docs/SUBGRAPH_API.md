# CLMSR Subgraph API Documentation

> ✅ **완전 구현**: 이 서브그래프는 **분포 시각화**, **복잡한 PnL 추적**, **사용자 통계**, **거래 히스토리** 등 모든 고급 기능이 완전히 구현되어 있습니다.

## 🎯 **Overview**

이 서브그래프는 CLMSR 마켓의 모든 데이터를 실시간으로 추적하며, 특히 **분포 시각화**, **포지션 히스토리**, **PnL 추적**에 최적화되어 있습니다.

## 📊 **Core Entities**

### **BinState** - Segment Tree Bin별 실시간 Factor 추적

```graphql
type BinState {
  id: String! # marketId-binIndex
  market: Market!
  binIndex: BigInt! # 0-based segment tree index
  lowerTick: BigInt! # 실제 틱 범위 시작
  upperTick: BigInt! # 실제 틱 범위 끝 (exclusive)
  currentFactor: BigDecimal! # 현재 누적 factor 값
  lastUpdated: BigInt!
  updateCount: BigInt!
  totalVolume: BigDecimal! # 이 bin에서 발생한 총 거래량
}
```

### **MarketDistribution** - LMSR 계산 + 분포 시각화용 통합 데이터

```graphql
type MarketDistribution {
  id: String! # marketId
  market: Market!
  totalBins: BigInt! # 총 빈 개수
  # LMSR 계산용 데이터
  totalSum: BigDecimal! # 전체 segment tree의 sum (Σ exp(q_i/α))
  totalSumWad: BigInt! # WAD 형식의 전체 sum (컨트랙트와 일치)
  # 분포 통계
  minFactor: BigDecimal! # 최소 factor 값
  maxFactor: BigDecimal! # 최대 factor 값
  avgFactor: BigDecimal! # 평균 factor 값
  totalVolume: BigDecimal! # 전체 거래량
  # 배열 형태 데이터 (FE 효율성용) - String으로 저장
  binFactors: [String!]! # 모든 bin의 factor 배열 ["1.0", "2.0", "1.5", ...]
  binVolumes: [String!]! # 모든 bin의 volume 배열 ["100", "200", "150", ...]
  tickRanges: [String!]! # 틱 범위 문자열 배열 ["100500-100600", ...]
  # 메타데이터
  lastSnapshotAt: BigInt! # 마지막 스냅샷 시점
  distributionHash: String! # 분포 데이터의 해시 (변화 감지용)
  version: BigInt! # 버전 번호 (업데이트 추적용)
}
```

## 🔍 **주요 쿼리 패턴**

### **1. 분포 시각화용 - 한번에 모든 빈 데이터 조회**

```graphql
query GetMarketDistribution($marketId: String!) {
  marketDistribution(id: $marketId) {
    totalBins
    totalSum # LMSR 계산용
    totalSumWad # 컨트랙트 호환용
    minFactor
    maxFactor
    avgFactor
    binFactors # [1.0, 1.2, 0.8, 1.5, ...] - 모든 빈의 factor
    binVolumes # [0, 100, 50, 200, ...] - 모든 빈의 거래량
    tickRanges # ["100500-100600", "100600-100700", ...]
    lastSnapshotAt
    version
  }
}
```

### **2. 개별 빈 상세 조회**

```graphql
query GetBinDetails($marketId: String!, $binIndex: BigInt!) {
  binState(id: "${marketId}-${binIndex}") {
    binIndex
    lowerTick
    upperTick
    currentFactor
    totalVolume
    updateCount
    lastUpdated
  }
}
```

### **3. 범위별 빈 조회**

```graphql
query GetBinsInRange($marketId: String!, $startBin: BigInt!, $endBin: BigInt!) {
  binStates(
    where: { market: $marketId, binIndex_gte: $startBin, binIndex_lte: $endBin }
    orderBy: binIndex
  ) {
    binIndex
    lowerTick
    upperTick
    currentFactor
    totalVolume
  }
}
```

### **4. 고급 포지션 및 PnL 추적 조회 (완전 구현됨)**

```graphql
# 사용자 포지션 현황 조회 (실시간 PnL 포함)
query GetUserPositions($userAddress: Bytes!) {
  userPositions(
    where: { user: $userAddress, isActive: true }
    orderBy: createdAt
    orderDirection: desc
  ) {
    id
    positionId
    market {
      id
      marketId
    }
    lowerTick
    upperTick
    currentQuantity
    totalCostBasis
    averageEntryPrice
    totalQuantityBought
    totalQuantitySold
    totalProceeds
    realizedPnL
    isActive
    createdAt
    lastUpdated
  }
}

# 사용자 거래 히스토리 조회 (상세 PnL 추적)
query GetUserTrades($userAddress: Bytes!) {
  trades(
    where: { user: $userAddress }
    orderBy: timestamp
    orderDirection: desc
    first: 100
  ) {
    id
    type
    lowerTick
    upperTick
    quantity
    costOrProceeds
    price
    gasUsed
    gasPrice
    timestamp
    transactionHash
    userPosition {
      id
      realizedPnL
    }
  }
}

# 사용자 통계 조회 (종합 성과 분석)
query GetUserStats($userAddress: Bytes!) {
  userStats(id: $userAddress) {
    totalTrades
    totalVolume
    totalCosts
    totalProceeds
    totalRealizedPnL
    totalGasFees
    netPnL
    activePositionsCount
    winningTrades
    losingTrades
    winRate
    avgTradeSize
    firstTradeAt
    lastTradeAt
  }
}
```

### **5. 시장별 통계 및 가격 히스토리**

```graphql
query GetMarketStats($marketId: String!) {
  market(id: $marketId) {
    marketId
    minTick
    maxTick
    tickSpacing
    numBins
    settled
  }

  marketStats(id: $marketId) {
    totalVolume
    totalTrades
    currentPrice
    highestPrice
    lowestPrice
    volume24h
  }

  priceSnapshots(
    where: { market: $marketId }
    orderBy: timestamp
    orderDirection: desc
    first: 100
  ) {
    lowerTick
    upperTick
    price
    timestamp
    totalSupply
    marketCap
  }
}
```

## 💻 **FE TypeScript 타입 정의**

```typescript
// 분포 시각화용 데이터 타입
export interface MarketDistributionData {
  totalBins: number;
  totalSum: number; // LMSR 계산용
  totalSumWad: string; // BigInt string
  minFactor: number;
  maxFactor: number;
  avgFactor: number;
  binFactors: string[]; // 모든 빈의 factor 값 (문자열 배열)
  binVolumes: string[]; // 모든 빈의 거래량 (문자열 배열)
  tickRanges: string[]; // ["100500-100600", ...]
  lastSnapshotAt: number;
  version: number;
}

// 개별 빈 데이터
export interface BinData {
  binIndex: number;
  lowerTick: number;
  upperTick: number;
  currentFactor: number;
  totalVolume: number;
  updateCount: number;
  lastUpdated: number;
}

// 포지션 이벤트 데이터 (실제 서브그래프 스키마 기반)
export interface PositionOpenedData {
  positionId: string;
  trader: string;
  marketId: string;
  lowerTick: number;
  upperTick: number;
  quantity: string;
  cost: string;
  blockTimestamp: number;
  transactionHash: string;
}

export interface PositionIncreasedData {
  positionId: string;
  trader: string;
  additionalQuantity: string;
  newQuantity: string;
  cost: string;
  blockTimestamp: number;
  transactionHash: string;
}

export interface PositionDecreasedData {
  positionId: string;
  trader: string;
  sellQuantity: string;
  newQuantity: string;
  proceeds: string;
  blockTimestamp: number;
  transactionHash: string;
}

// 완전 구현된 고급 PnL 추적 데이터 타입들
export interface UserPositionData {
  id: string;
  positionId: string;
  user: string;
  market: {
    id: string;
    marketId: string;
  };
  lowerTick: number;
  upperTick: number;
  currentQuantity: number;
  totalCostBasis: number;
  averageEntryPrice: number;
  totalQuantityBought: number;
  totalQuantitySold: number;
  totalProceeds: number;
  realizedPnL: number;
  isActive: boolean;
  createdAt: number;
  lastUpdated: number;
}

export interface TradeData {
  id: string;
  type: "OPEN" | "INCREASE" | "DECREASE" | "CLOSE" | "CLAIM";
  lowerTick: number;
  upperTick: number;
  quantity: number;
  costOrProceeds: number;
  price: number;
  gasUsed: string;
  gasPrice: string;
  timestamp: number;
  transactionHash: string;
  userPosition: {
    id: string;
    realizedPnL: number;
  };
}

export interface UserStatsData {
  totalTrades: number;
  totalVolume: number;
  totalCosts: number;
  totalProceeds: number;
  totalRealizedPnL: number;
  totalGasFees: number;
  netPnL: number;
  activePositionsCount: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  avgTradeSize: number;
  firstTradeAt: number;
  lastTradeAt: number;
}

export interface MarketStatsData {
  totalVolume: number;
  totalTrades: number;
  totalUsers: number;
  highestPrice: number;
  lowestPrice: number;
  currentPrice: number;
  priceChange24h: number;
  volume24h: number;
  lastUpdated: number;
}
```

## ⚡ **사용 예시**

### **React Hook 예시**

```typescript
const useMarketDistribution = (marketId: string) => {
  const [distribution, setDistribution] =
    useState<MarketDistributionData | null>(null);

  useEffect(() => {
    const query = `
      query GetMarketDistribution($marketId: String!) {
        marketDistribution(id: $marketId) {
          totalSum
          totalSumWad
          binFactors
          binVolumes
          tickRanges
          version
        }
      }
    `;

    // GraphQL 쿼리 실행
    fetchGraphQL(query, { marketId }).then(setDistribution);
  }, [marketId]);

  return distribution;
};

// 분포 차트 컴포넌트에서 사용
const DistributionChart = ({ marketId }: { marketId: string }) => {
  const distribution = useMarketDistribution(marketId);

  if (!distribution) return <div>Loading...</div>;

  // 모든 빈의 factor 값을 차트로 시각화
  const chartData = distribution.binFactors.map((factor, index) => ({
    binIndex: index,
    factor: parseFloat(factor), // 문자열을 숫자로 변환
    volume: parseFloat(distribution.binVolumes[index]),
    tickRange: distribution.tickRanges[index],
  }));

  return <FactorChart data={chartData} />;
};
```

## 🔄 **실시간 업데이트**

서브그래프는 다음 이벤트를 실시간으로 추적합니다:

1. **RangeFactorApplied**: BinState와 MarketDistribution 자동 업데이트
2. **PositionOpened/Increased/Decreased/Closed**: 기본 이벤트 기록
3. **MarketCreated**: 모든 BinState 초기화
4. **MarketSettled**: 최종 정산 정보 업데이트

모든 변경사항은 `version` 필드와 `
