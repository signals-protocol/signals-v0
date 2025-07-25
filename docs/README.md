# CLMSR 마켓 시스템 FE 개발자 가이드

> **CLMSR (Conditional Liquidity Market Maker)** 예측 마켓 시스템의 서브그래프와 컨트랙트 사용법을 안내합니다.

## 📋 목차

- [시스템 개요](#시스템-개요)
- [서브그래프 API 가이드](#서브그래프-api-가이드)
- [컨트랙트 연동 가이드](#컨트랙트-연동-가이드)
- [실시간 데이터 활용](#실시간-데이터-활용)
- [예제 코드](#예제-코드)
- [트러블슈팅](#트러블슈팅)

---

## 🎯 시스템 개요

### 핵심 개념

**CLMSR**은 예측 마켓을 위한 자동화된 마켓 메이커입니다:

- **마켓**: 특정 이벤트에 대한 예측 시장 (예: "A팀이 이길 확률")
- **틱(Tick)**: 실제 확률 값을 나타내는 단위 (예: 100, 200, 300 등의 정수값)
- **구간(Range)**: 2개의 틱으로 이루어진 연속 범위 (lowerTick, upperTick)
- **Bin**: 세그먼트 트리에서 사용하는 0-based 인덱스 단위 (내부 구현)
- **포지션**: 특정 틱 범위에 대한 베팅 (하나 이상의 구간 포함 가능)
- **팩터**: 각 틱의 현재 가격/확률을 결정하는 값

### 틱 시스템 구조

- **코어 로직**: 실제 틱값 기반으로 동작 (minTick, maxTick, tickSpacing)
- **라이브러리**: 0-based bin 인덱스로 세그먼트 트리 관리
- **변환**: 실제 틱값 ↔ bin 인덱스 자동 변환

### 데이터 흐름

- **시각화 데이터**: 서브그래프(인덱서)에서 실시간 조회 → 가격 분포 차트
- **거래 실행**: 컨트랙트 직접 호출 → 포지션 구매/판매

### 네트워크 정보

```
네트워크: Arbitrum Sepolia
Chain ID: 421614
RPC: https://sepolia-rollup.arbitrum.io/rpc
```

### 배포된 컨트랙트

```
CLMSRMarketCore: 0x03664F2e5eB92Ac39Ec712E9CE90d945d5C061e5 (최신 배포)
USDC (테스트용):  0x60b8E0C9AD5E8A894b044B89D2998Df71e6805BD (최신 배포)
CLMSRPosition:   0xf4eFFF5D5DF0E74b947b2e4E05D8b1CEBC7a9652 (최신 배포)
```

**모든 컨트랙트는 Arbiscan에서 검증 완료되어 소스코드 확인 가능합니다.**

### 서브그래프 엔드포인트

```
Production: https://api.studio.thegraph.com/query/116469/signals-v-0/1.1.9
Latest: https://api.studio.thegraph.com/query/116469/signals-v-0/version/latest
Explorer: https://thegraph.com/studio/subgraph/signals-v-0
```

---

## 📊 서브그래프 API 가이드

### 1. 기본 GraphQL 설정

```typescript
import { ApolloClient, InMemoryCache, gql } from "@apollo/client";

const client = new ApolloClient({
  uri: "https://api.studio.thegraph.com/query/116469/signals-v-0/version/latest",
  cache: new InMemoryCache(),
});
```

### 2. 주요 엔티티 구조

#### 실제 서브그래프 엔티티 구조

**⚠️ 중요**: 현재 서브그래프는 **분포 시각화**와 **포지션 히스토리** 추적에 최적화되어 있습니다.

##### 1. 마켓 관련 엔티티

```graphql
# 실시간 마켓 상태
type Market @entity(immutable: false) {
  id: String! # marketId
  marketId: BigInt!
  minTick: BigInt! # int256 - 최소 틱 값
  maxTick: BigInt! # int256 - 최대 틱 값
  tickSpacing: BigInt! # int256 - 틱 간격
  startTimestamp: BigInt!
  endTimestamp: BigInt!
  numBins: BigInt! # uint32 - 계산된 빈 개수
  liquidityParameter: BigInt!
  isSettled: Boolean!
  settlementLowerTick: BigInt # int256
  settlementUpperTick: BigInt # int256
  lastUpdated: BigInt!
  # 관계 필드들
  bins: [BinState!]! @derivedFrom(field: "market")
  distribution: MarketDistribution @derivedFrom(field: "market")
}
```

##### 2. Bin 상태 추적 (분포 시각화용)

````graphql
# Segment Tree의 각 bin별 현재 상태
type BinState @entity(immutable: false) {
  id: String! # marketId-binIndex
  market: Market!
  binIndex: BigInt! # uint32 - segment tree에서의 0-based 인덱스
  lowerTick: BigInt! # int256 - 이 bin이 커버하는 실제 틱 범위 시작
  upperTick: BigInt! # int256 - 이 bin이 커버하는 실제 틱 범위 끝 (exclusive)
  currentFactor: BigDecimal! # 현재 누적 factor 값 (WAD 형식에서 변환)
  lastUpdated: BigInt!
  updateCount: BigInt! # 업데이트된 횟수
  totalVolume: BigDecimal! # 이 bin에서 발생한 총 거래량
}

# 마켓별 전체 분포 데이터
type MarketDistribution @entity(immutable: false) {
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
  # 배열 형태 데이터 (FE 효율성용) - String으로 변경
  binFactors: [String!]! # 모든 bin의 factor 배열 ["1.0", "2.0", "1.5", ...]
  binVolumes: [String!]! # 모든 bin의 volume 배열 ["100", "200", "150", ...]
  tickRanges: [String!]! # 틱 범위 문자열 배열 ["100500-100600", "100600-100700", ...]
  # 메타데이터
  lastSnapshotAt: BigInt! # 마지막 스냅샷 시점
  distributionHash: String! # 분포 데이터의 해시 (변화 감지용)
  version: BigInt! # 버전 번호 (업데이트 추적용)
}
  lowerTick: BigInt! # int256 - 실제 틱 값
  upperTick: BigInt! # int256 - 실제 틱 값
}

##### 3. 고급 PnL 추적 및 사용자 통계 (완전 구현됨)

```graphql
# 사용자별 포지션 현황 (실시간 업데이트)
type UserPosition @entity(immutable: false) {
  id: String! # positionId
  positionId: BigInt!
  user: Bytes! # address
  stats: UserStats! # reference to UserStats
  market: Market!
  lowerTick: BigInt! # int256
  upperTick: BigInt! # int256
  currentQuantity: BigDecimal! # 현재 보유량
  totalCostBasis: BigDecimal! # 총 매수 비용 (accumulated cost)
  averageEntryPrice: BigDecimal! # 평균 진입가
  totalQuantityBought: BigDecimal! # 총 매수량 (누적)
  totalQuantitySold: BigDecimal! # 총 매도량 (누적)
  totalProceeds: BigDecimal! # 총 매도 수익
  realizedPnL: BigDecimal! # 실현 손익
  isActive: Boolean! # 포지션이 활성 상태인지
  createdAt: BigInt!
  lastUpdated: BigInt!
}

# 개별 거래 기록 (매수/매도)
type Trade @entity(immutable: true) {
  id: Bytes! # transactionHash-logIndex
  userPosition: String! # UserPosition ID
  user: Bytes! # address
  market: Market!
  positionId: BigInt!
  type: TradeType! # OPEN, INCREASE, DECREASE, CLOSE, CLAIM
  lowerTick: BigInt! # int256
  upperTick: BigInt! # int256
  quantity: BigDecimal! # 거래량 (DECREASE/CLOSE는 음수)
  costOrProceeds: BigDecimal! # 비용 또는 수익
  price: BigDecimal! # 단위당 가격
  gasUsed: BigInt! # 가스 사용량
  gasPrice: BigInt! # 가스 가격
  timestamp: BigInt!
  blockNumber: BigInt!
  transactionHash: Bytes!
}

# 사용자별 전체 통계 및 PnL
type UserStats @entity(immutable: false) {
  id: Bytes! # user address
  user: Bytes! # address
  totalTrades: BigInt! # 총 거래 횟수
  totalVolume: BigDecimal! # 총 거래량
  totalCosts: BigDecimal! # 총 매수 비용
  totalProceeds: BigDecimal! # 총 매도 수익
  totalRealizedPnL: BigDecimal! # 총 실현 손익
  totalGasFees: BigDecimal! # 총 가스 비용
  netPnL: BigDecimal! # 순 손익 (realizedPnL - gasFees)
  activePositionsCount: BigInt! # 활성 포지션 수
  winningTrades: BigInt! # 수익 거래 수
  losingTrades: BigInt! # 손실 거래 수
  winRate: BigDecimal! # 승률
  avgTradeSize: BigDecimal! # 평균 거래 크기
  firstTradeAt: BigInt! # 첫 거래 시점
  lastTradeAt: BigInt! # 마지막 거래 시점
}
```

### 3. 필수 쿼리 예제

#### 마켓 목록 조회

```graphql
query GetMarkets {
  markets(orderBy: lastUpdated, orderDirection: desc, first: 10) {
    id
    marketId
    numBins
    minTick
    maxTick
    tickSpacing
    liquidityParameter
    isSettled
    startTimestamp
    endTimestamp
    lastUpdated
  }
}
```

#### 마켓 분포 데이터 조회 (분포 시각화용)

```graphql
query GetMarketDistribution($marketId: String!) {
  marketDistribution(id: $marketId) {
    totalBins
    totalSum
    totalSumWad
    minFactor
    maxFactor
    avgFactor
    binFactors # 모든 bin의 factor 배열
    binVolumes # 모든 bin의 volume 배열
    tickRanges # 틱 범위 문자열 배열
    version
    lastSnapshotAt
  }
}
```

#### 특정 범위의 Bin 상태 조회

```graphql
query GetBinsInRange($marketId: String!, $startBin: BigInt!, $endBin: BigInt!) {
  binStates(
    where: { market: $marketId, binIndex_gte: $startBin, binIndex_lte: $endBin }
    orderBy: binIndex
    orderDirection: asc
  ) {
    binIndex
    lowerTick
    upperTick
    currentFactor
    totalVolume
    lastUpdated
    updateCount
  }
}
```

#### 사용자 포지션 조회

```graphql
query GetUserPositions($user: Bytes!, $marketId: String) {
  userPositions(
    where: { user: $user, market: $marketId, isActive: true }
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
    totalQuantityBought
    totalCostBasis
    averageEntryPrice
    realizedPnL
    createdAt
    lastUpdated
  }
}
```

#### 사용자 거래 히스토리 조회

```graphql
query GetUserTrades($user: Bytes!, $marketId: String) {
  trades(
    where: { user: $user, market: $marketId }
    orderBy: timestamp
    orderDirection: desc
    first: 50
  ) {
    id
    type
    lowerTick
    upperTick
    quantity
    costOrProceeds
    price
    timestamp
    transactionHash
  }
}
```

### 4. 실시간 구독 (Subscription)

```graphql
subscription WatchMarketUpdates($marketId: String!) {
  tickStates(
    where: { market: $marketId }
    orderBy: lastUpdated
    orderDirection: desc
    first: 10
  ) {
    tickNumber
    currentFactor
    lastUpdated
  }
}
```

---

## ⚡ 컨트랙트 연동 가이드

### 1. 기본 설정

```typescript
import { ethers } from "ethers";

// 네트워크 설정
const provider = new ethers.JsonRpcProvider(
  "https://sepolia-rollup.arbitrum.io/rpc"
);
const signer = new ethers.Wallet(PRIVATE_KEY, provider);

// 컨트랙트 연결
const coreContract = new ethers.Contract(
  "0x03664F2e5eB92Ac39Ec712E9CE90d945d5C061e5",
  CLMSRMarketCoreABI,
  signer
);

const usdcContract = new ethers.Contract(
  "0x60b8E0C9AD5E8A894b044B89D2998Df71e6805BD",
  ERC20ABI,
  signer
);
```

### 2. 주요 읽기 함수들

#### 마켓 정보 조회

```typescript
// 마켓 기본 정보
const market = await coreContract.markets(marketId);
// 반환: Market 구조체 { startTimestamp, endTimestamp, minTick, maxTick, tickSpacing, numBins, liquidityParameter, ... }

// 더 안전한 방법 (마켓 존재하지 않으면 에러 발생)
const market = await coreContract.getMarket(marketId);

// 마켓 상태
const isActive = market.isActive;
const isSettled = market.settled;

// 틱 시스템 정보
const minTick = market.minTick;
const maxTick = market.maxTick;
const tickSpacing = market.tickSpacing;
const numBins = market.numBins; // 세그먼트 트리 bin 개수
```

#### 포지션 비용 계산

```typescript
// 특정 구간의 포지션 오픈 비용
const cost = await coreContract.calculateOpenCost(
  marketId,
  lowerTick,
  upperTick,
  quantity
);

// 기존 포지션 증가 비용
const increaseCost = await coreContract.calculateIncreaseCost(
  positionId,
  additionalQuantity
);

// 포지션 닫기 시 수익
const proceeds = await coreContract.calculateCloseProceeds(positionId);
```

#### 포지션 정보 조회

```typescript
// 사용자의 포지션 조회
const positionIds = await positionContract.getPositionsByOwner(userAddress);

// 특정 포지션 정보
const positionInfo = await positionContract.getPosition(positionId);
// 반환: { marketId, trader, lowerTick, upperTick, quantity }
```

### 3. 거래 함수들

#### 포지션 열기 (구매)

```typescript
// 1. USDC 승인 (최초 1회)
await usdcContract.approve(coreContract.address, ethers.MaxUint256);

// 2. 포지션 열기 (trader 주소 필요)
const userAddress = await signer.getAddress();
const tx = await coreContract.openPosition(
  userAddress, // trader 주소 (첫 번째 파라미터)
  marketId,
  lowerTick,
  upperTick,
  quantity,
  maxCost // 슬리피지 보호
);

const receipt = await tx.wait();
console.log("포지션 ID:", receipt.logs[0].args.positionId);
```

#### 포지션 늘리기

```typescript
const tx = await coreContract.increasePosition(
  positionId,
  additionalQuantity,
  maxCost
);
```

#### 포지션 줄이기 (부분 판매)

```typescript
const tx = await coreContract.decreasePosition(
  positionId,
  sellQuantity,
  minProceeds // 슬리피지 보호
);
```

#### 포지션 닫기 (전체 판매)

```typescript
const tx = await coreContract.closePosition(positionId, minProceeds);
```

#### 정산 후 클레임

```typescript
// 마켓이 정산된 후 수익 회수
const tx = await coreContract.claimPayout(positionId);
```

### 4. 이벤트 리스닝

```typescript
// 새 포지션 생성 감지
coreContract.on(
  "PositionOpened",
  (positionId, trader, marketId, lowerTick, upperTick, quantity, cost) => {
    console.log("새 포지션:", {
      positionId: positionId.toString(),
      trader,
      marketId: marketId.toString(),
      range: `${lowerTick}-${upperTick}`,
      quantity: quantity.toString(),
      cost: ethers.formatUnits(cost, 6), // USDC는 6 decimals
    });
  }
);

// 가격 변동 감지
coreContract.on("RangeFactorApplied", (marketId, lo, hi, factor) => {
  console.log("가격 업데이트:", {
    marketId: marketId.toString(),
    range: `${lo}-${hi}`,
    factor: factor.toString(),
  });
});
```

---

## 📈 실시간 데이터 활용

### 1. 분포 시각화 컴포넌트

```typescript
interface BinDistribution {
  binIndex: number;
  tickRange: string;
  probability: number;
  factor: string;
  volume: string;
}

const useMarketDistribution = (marketId: string) => {
  const [distribution, setDistribution] = useState<BinDistribution[]>([]);

  const { data, loading, subscribeToMore } = useQuery(GET_MARKET_DISTRIBUTION, {
    variables: { marketId },
    pollInterval: 5000, // 5초마다 폴링
  });

  useEffect(() => {
    if (data?.marketDistribution) {
      const { binFactors, binVolumes, tickRanges, totalBins } =
        data.marketDistribution;

      const dist = binFactors.map((factor: string, index: number) => ({
        binIndex: index,
        tickRange: tickRanges[index],
        probability: (index / parseInt(totalBins)) * 100, // bin 기반 확률
        factor: factor,
        volume: binVolumes[index],
      }));
      setDistribution(dist);
    }
  }, [data]);

  return { distribution, loading };
};
```

### 2. 거래 인터페이스

```typescript
const useTradingContract = () => {
  const { signer } = useWallet();
  const contract = useMemo(
    () => new ethers.Contract(CLMSR_CORE_ADDRESS, ABI, signer),
    [signer]
  );

  const openPosition = async (
    marketId: number,
    lowerTick: number,
    upperTick: number,
    quantity: string,
    maxCost: string
  ) => {
    try {
      const signer = await contract.runner;
      const userAddress = await signer.getAddress();

      const tx = await contract.openPosition(
        userAddress, // trader 주소 (첫 번째 파라미터)
        marketId,
        lowerTick,
        upperTick,
        ethers.parseUnits(quantity, 18),
        ethers.parseUnits(maxCost, 6)
      );

      const receipt = await tx.wait();
      return receipt;
    } catch (error) {
      console.error("거래 실패:", error);
      throw error;
    }
  };

  return { openPosition };
};
```

### 3. 가격 계산 유틸리티

```typescript
// 팩터를 상대적 가중치로 해석 (확률 계산은 복잡함)
export const formatFactor = (factor: string): string => {
  const factorNum = parseFloat(factor);
  return factorNum.toFixed(6);
};

// 가격 표시용 포맷팅
export const formatPrice = (price: bigint): string => {
  return `$${(Number(price) / 1e6).toFixed(2)}`;
};

// 확률 표시용 포맷팅
export const formatProbability = (prob: number): string => {
  return `${prob.toFixed(1)}%`;
};
```

---

## 💡 예제 코드

### React Hook 예제

```typescript
// hooks/useMarketData.ts
import { useState, useEffect } from "react";
import { useQuery } from "@apollo/client";
import { GET_MARKET_DISTRIBUTION } from "../queries";

export const useMarketData = (marketId: string) => {
  const [realTimeData, setRealTimeData] = useState(null);

  const { data, loading, error } = useQuery(GET_MARKET_DISTRIBUTION, {
    variables: { marketId },
    pollInterval: 3000,
  });

  useEffect(() => {
    if (data) {
      // 데이터 가공 및 상태 업데이트
      const processedData = processMarketData(data);
      setRealTimeData(processedData);
    }
  }, [data]);

  return {
    marketData: realTimeData,
    loading,
    error,
  };
};
```

### 실시간 데이터 구독

```typescript
// hooks/useRealTimeMarket.ts
import { useState, useEffect } from "react";
import { useQuery } from "@apollo/client";
import { GET_MARKET_DISTRIBUTION } from "../queries";

export const useRealTimeMarket = (marketId: string) => {
  const [distribution, setDistribution] = useState([]);

  const { data, loading, error, startPolling, stopPolling } = useQuery(
    GET_MARKET_DISTRIBUTION,
    {
      variables: { marketId },
      pollInterval: 3000, // 3초마다 폴링
    }
  );

  useEffect(() => {
    if (data?.tickStates) {
      const processedData = data.tickStates.map((tick: any) => ({
        tick: parseInt(tick.tickNumber),
        factor: parseFloat(tick.currentFactor),
        probability:
          (parseInt(tick.tickNumber) / parseInt(data.market.numTicks)) * 100,
      }));
      setDistribution(processedData);
    }
  }, [data]);

  // 컴포넌트 언마운트시 폴링 중단
  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  return {
    distribution,
    loading,
    error,
    startPolling,
    stopPolling,
  };
};
```

---

## 🔧 트러블슈팅

### 자주 발생하는 문제들

#### 1. 서브그래프 연결 오류

```typescript
// 네트워크 연결 확인
const checkSubgraphHealth = async () => {
  try {
    const response = await fetch(SUBGRAPH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "{ _meta { block { number } } }",
      }),
    });

    const data = await response.json();
    console.log("서브그래프 상태:", data);
  } catch (error) {
    console.error("서브그래프 연결 실패:", error);
  }
};
```

#### 2. 트랜잭션 실패

```typescript
// 일반적인 오류 처리
const handleTransactionError = (error: any) => {
  if (error.code === "INSUFFICIENT_FUNDS") {
    return "잔액이 부족합니다.";
  } else if (error.code === "USER_REJECTED") {
    return "사용자가 트랜잭션을 취소했습니다.";
  } else if (error.reason) {
    return `트랜잭션 실패: ${error.reason}`;
  }
  return "알 수 없는 오류가 발생했습니다.";
};
```

#### 3. 비용 계산 오류

```typescript
// 안전한 비용 계산
const safeCalculateCost = async (
  marketId: number,
  lowerTick: number,
  upperTick: number,
  quantity: bigint
) => {
  try {
    // 입력값 검증 - CLMSR은 임의의 틱 범위 지원
    if (lowerTick >= upperTick) {
      throw new Error("올바르지 않은 틱 범위입니다");
    }

    const cost = await coreContract.calculateOpenCost(
      marketId,
      lowerTick,
      upperTick,
      quantity
    );
    return cost;
  } catch (error) {
    console.error("비용 계산 실패:", error);
    return null;
  }
};
```

### 성능 최적화 팁

1. **배치 쿼리 사용**: 여러 데이터를 한번에 조회
2. **적절한 폴링 간격**: 너무 짧으면 성능 저하, 너무 길면 실시간성 저하
3. **메모이제이션**: 동일한 쿼리 결과 캐싱
4. **선택적 필드**: 필요한 필드만 쿼리하여 대역폭 절약

---

## 📚 추가 리소스

- **컨트랙트 소스코드**: [GitHub Repository](https://github.com/your-repo)
- **서브그래프 Explorer**: [Graph Explorer](https://thegraph.com/studio/subgraph/signals-v-0)
- **Arbitrum Sepolia Faucet**: [Arbitrum Bridge](https://bridge.arbitrum.io)
- **테스트 USDC 발급**: 컨트랙트 `mint()` 함수 사용

---

## 📞 지원

문제가 발생하거나 추가 기능이 필요한 경우:

1. GitHub Issues에 문의
2. 개발팀 Discord 채널 참여
3. 기술 문서 업데이트 요청

**마지막 업데이트**: 2025년 1월
````
