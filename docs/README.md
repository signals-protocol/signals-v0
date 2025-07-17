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
- **틱**: 확률 범위를 나타내는 단위 (0-100% 사이의 구간)
- **포지션**: 특정 틱 범위에 대한 베팅 (항상 연속된 2개 틱)
- **팩터**: 각 틱의 현재 가격/확률을 결정하는 값

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
CLMSRMarketCore: 0x73908E35F9b5747f6183111cA417462E8e39c09B (검증됨)
USDC (테스트용):  0x78070bF4525A5A5600Ff97220139a6F77F840A96 (검증됨)
CLMSRPosition:   0x35c3C4FA2F14544dA688e41118edAc953cc48cDa (검증됨)
```

**모든 컨트랙트는 Arbiscan에서 검증 완료되어 소스코드 확인 가능합니다.**

### 서브그래프 엔드포인트

```
Production: https://api.studio.thegraph.com/query/116469/signals-v-0/version/latest
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

**⚠️ 중요**: 현재 서브그래프는 **이벤트 로그 기반**으로 구성되어 있습니다.

##### 1. 마켓 관련 엔티티

```graphql
# 마켓 생성 이벤트
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

# 실시간 마켓 상태 (업데이트됨)
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

##### 2. 포지션 거래 이벤트

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

##### 3. 계산된 상태 엔티티

```graphql
type TickState @entity(immutable: false) {
  id: String! # marketId-tickNumber
  market: Market!
  tickNumber: BigInt!
  currentFactor: BigDecimal!
  lastUpdated: BigInt!
  updateCount: BigInt!
}

type TickRange @entity(immutable: false) {
  id: String! # marketId-lowerTick-upperTick
  market: Market!
  lowerTick: BigInt!
  upperTick: BigInt!
  currentFactor: BigDecimal!
  lastUpdated: BigInt!
  updateCount: BigInt!
  totalVolume: BigDecimal!
}
```

### 3. 필수 쿼리 예제

#### 마켓 목록 조회

```graphql
query GetMarkets {
  markets(orderBy: lastUpdated, orderDirection: desc, first: 10) {
    id
    marketId
    numTicks
    liquidityParameter
    isSettled
    startTimestamp
    endTimestamp
    lastUpdated
  }
}
```

#### 특정 마켓의 현재 분포 조회

```graphql
query GetMarketDistribution($marketId: String!) {
  market(id: $marketId) {
    id
    marketId
    numTicks
    isSettled
  }

  tickStates(
    where: { market: $marketId }
    orderBy: tickNumber
    orderDirection: asc
    first: 1000
  ) {
    tickNumber
    currentFactor
    lastUpdated
    updateCount
  }
}
```

#### 거래 가능한 구간들 조회

```graphql
query GetTradableRanges($marketId: String!) {
  tickRanges(
    where: { market: $marketId }
    orderBy: lowerTick
    orderDirection: asc
    first: 100
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

#### 최근 거래 활동 조회

```graphql
query GetRecentActivity($marketId: BigInt!) {
  positionOpeneds(
    where: { marketId: $marketId }
    orderBy: blockTimestamp
    orderDirection: desc
    first: 50
  ) {
    id
    trader
    lowerTick
    upperTick
    quantity
    cost
    blockTimestamp
    transactionHash
  }

  rangeFactorApplieds(
    where: { marketId: $marketId }
    orderBy: blockTimestamp
    orderDirection: desc
    first: 20
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
  "0x73908E35F9b5747f6183111cA417462E8e39c09B",
  CLMSRMarketCoreABI,
  signer
);

const usdcContract = new ethers.Contract(
  "0x78070bF4525A5A5600Ff97220139a6F77F840A96",
  ERC20ABI,
  signer
);
```

### 2. 주요 읽기 함수들

#### 마켓 정보 조회

```typescript
// 마켓 기본 정보
const marketInfo = await coreContract.markets(marketId);
// 반환: [startTimestamp, endTimestamp, numTicks, liquidityParameter]

// 마켓 상태
const isActive = await coreContract.isMarketActive(marketId);
const isSettled = await coreContract.isMarketSettled(marketId);
```

#### 현재 가격 조회

```typescript
// 특정 구간의 현재 가격
const price = await coreContract.getPrice(
  marketId,
  lowerTick,
  upperTick,
  quantity
);

// 여러 구간의 가격을 한번에 조회
const prices = await coreContract.getPrices(
  marketId,
  [lowerTick1, lowerTick2],
  [upperTick1, upperTick2],
  [quantity1, quantity2]
);
```

#### 포지션 정보 조회

```typescript
// 사용자의 포지션 조회
const positionIds = await coreContract.getPositionIds(userAddress);

// 특정 포지션 정보
const positionInfo = await coreContract.positions(positionId);
// 반환: [marketId, trader, lowerTick, upperTick, quantity]
```

### 3. 거래 함수들

#### 포지션 열기 (구매)

```typescript
// 1. USDC 승인 (최초 1회)
await usdcContract.approve(coreContract.address, ethers.MaxUint256);

// 2. 포지션 열기
const tx = await coreContract.openPosition(
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
const tx = await coreContract.claimPosition(positionId);
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

### 1. 가격 차트 컴포넌트

```typescript
interface PriceDistribution {
  tick: number;
  probability: number;
  factor: string;
}

const useMarketDistribution = (marketId: string) => {
  const [distribution, setDistribution] = useState<PriceDistribution[]>([]);

  const { data, loading, subscribeToMore } = useQuery(GET_MARKET_DISTRIBUTION, {
    variables: { marketId },
    pollInterval: 5000, // 5초마다 폴링
  });

  useEffect(() => {
    if (data?.tickStates) {
      const dist = data.tickStates.map((tick: any) => ({
        tick: parseInt(tick.tickNumber),
        probability:
          (parseInt(tick.tickNumber) / parseInt(data.market.numTicks)) * 100,
        factor: tick.currentFactor,
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
      const tx = await contract.openPosition(
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

#### 3. 가격 계산 오류

```typescript
// 안전한 가격 계산
const safeCalculatePrice = async (
  marketId: number,
  lowerTick: number,
  upperTick: number,
  quantity: string
) => {
  try {
    // 입력값 검증
    if (upperTick !== lowerTick + 1) {
      throw new Error("CLMSR은 연속된 틱만 지원합니다");
    }

    const price = await coreContract.getPrice(
      marketId,
      lowerTick,
      upperTick,
      quantity
    );
    return price;
  } catch (error) {
    console.error("가격 계산 실패:", error);
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
