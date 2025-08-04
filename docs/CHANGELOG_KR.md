# CLMSR v1.1.0 주요 변경사항 📝

> **2025년 8월 5일** - 메이저 업데이트: 포인트 시스템, 포지션 결과 추적, Base 메인넷 마이그레이션

## 🚀 주요 업데이트 요약

이번 v1.1.0 업데이트는 CLMSR 시스템의 **가장 큰 변화**입니다. 단순한 베팅 시스템에서 **게이미피케이션이 적용된 포인트 기반 예측 플랫폼**으로 진화했습니다.

### ⭐ 핵심 변화 3가지

1. **🎯 포인트 시스템 도입** - Activity, Performance, Risk Bonus 포인트
2. **🏆 포지션 결과 추적** - WIN/LOSS 상태 및 자동 정산
3. **🌍 Base 메인넷 마이그레이션** - Arbitrum Sepolia → Base Mainnet

---

## 🎯 1. 포인트 시스템 (NEW!)

### 개요

사용자의 거래 활동과 성과에 따라 **3가지 포인트**를 제공하는 시스템이 도입되었습니다.

### 포인트 종류

#### 🔥 Activity Points (활동 포인트)

- **획득 조건**: 포지션 오픈 및 증량 시
- **계산 공식**: `A = cost ÷ 10` (6 decimals)
- **예시**: 1000 SUSD 투자 → 100 Activity Points
- **용도**: 기본 활동 보상
- **코드**: `return cost.div(BigInt.fromI32(10));`

#### 🏆 Performance Points (성과 포인트)

- **획득 조건**: 포지션 감량, 종료, 정산 시 수익 발생
- **계산 공식**: `P = max(realizedPnL, 0)` (6 decimals)
- **예시**: 500 SUSD 수익 → 500 Performance Points, 손실 → 0 Points
- **용도**: 성과 기반 보상 (손실 시 0포인트)
- **코드**: `return realizedPnL.gt(0) ? realizedPnL : 0;`

#### 💎 Risk Bonus Points (리스크 보너스)

- **획득 조건**: 1시간(3600초) 이상 포지션 보유 필수
- **계산 공식**:
  ```
  R = A × 0.3 × (1 + (marketRange - userRange) / marketRange)
  최종 = min(R, 2A)
  ```
- **상세 로직**:
  1. **보유시간 체크**: `holdingSeconds < 3600` → 0 포인트
  2. **범위 위험도**: 포지션 범위가 좁을수록(고위험) 보너스 증가
  3. **기본 배율**: Activity Points × 30%
  4. **위험 배율**: 1.0 ~ 2.0 (포지션 범위에 따라)
  5. **최대값 제한**: Activity Points × 2배 초과 불가
- **예시**:
  - A=100, 1시간 보유, 시장 범위 대비 50% 범위 → R = 100 × 0.3 × 1.5 = 45 Points
  - A=100, 30분 보유 → 0 Points (시간 조건 미충족)
- **용도**: 장기 보유 및 고위험(좁은 범위) 포지션 인센티브

### 서브그래프 추가 필드

```graphql
# Trade 엔티티에 추가
type Trade {
  activityPt: BigInt! # Activity 포인트 (6 decimals)
  performancePt: BigInt! # Performance 포인트 (6 decimals)
  riskBonusPt: BigInt! # Risk Bonus 포인트 (6 decimals)
  # ... 기존 필드들
}

# UserStats 엔티티에 추가
type UserStats {
  totalPoints: BigInt! # 누적 포인트 잔고 (6 decimals)
  # ... 기존 필드들
}

# UserPosition 엔티티에 추가
type UserPosition {
  activityRemaining: BigInt! # 남은 Activity Points (OPEN/INCREASE 누적 - DECREASE/CLOSE 차감)
  weightedEntryTime: BigInt! # 가중 평균 진입 시각 (Risk Bonus 보유시간 계산용)
  # ... 기존 필드들
}

# activityRemaining 계산 로직:
# - OPEN/INCREASE: += cost ÷ 10
# - DECREASE/CLOSE: -= (감소수량 ÷ 총수량) × activityRemaining
# - SETTLE: = 0 (리셋)

# weightedEntryTime 계산 로직:
# - INCREASE: (기존시간 × 기존수량 + 현재시간 × 추가수량) ÷ 총수량
# - DECREASE: 부분매도 시 유지, 전량매도 시 0으로 리셋
# - SETTLE: = 0 (리셋)
```

---

## 🏆 2. 포지션 결과 시스템 (NEW!)

### 개요

기존의 단순한 `isActive` 필드를 **4가지 상태의 outcome 시스템**으로 대체했습니다.

### PositionOutcome 상태

#### 🟢 OPEN

- **의미**: 포지션이 현재 열려있고 거래 가능한 상태
- **조건**: 마켓이 활성화되고 포지션이 완전히 종료되지 않음
- **가능한 액션**: INCREASE, DECREASE, CLOSE

#### 🔵 CLOSED

- **의미**: 사용자가 마켓 종료 전에 수동으로 포지션을 완전 종료
- **조건**: CLOSE 거래로 수량을 0으로 만듦
- **특징**: 승부 결과와 무관하게 일찍 빠진 상태

#### 🟡 WIN

- **의미**: 마켓 정산 시 포지션이 승리한 상태
- **조건**: 정산 틱이 포지션 범위 `[lowerTick, upperTick)` 내에 있음
- **보상**: 포지션 수량만큼 SUSD 지급 (1:1)

#### 🔴 LOSS

- **의미**: 마켓 정산 시 포지션이 패배한 상태
- **조건**: 정산 틱이 포지션 범위를 벗어남
- **보상**: 없음 (0 SUSD)

### 서브그래프 변경사항

```graphql
# 변경 전 (v1.0.x)
type UserPosition {
  isActive: Boolean! # 단순 활성화 여부
}

# 변경 후 (v1.1.0)
type UserPosition {
  outcome: PositionOutcome! # OPEN/CLOSED/WIN/LOSS
  isClaimed: Boolean! # 승리 포지션 수령 여부
}

enum PositionOutcome {
  OPEN # 포지션 열림
  CLOSED # 수동 종료
  WIN # 승리
  LOSS # 패배
}
```

---

## 📡 3. PositionSettled 이벤트 시스템 (NEW!)

### 개요

마켓 정산 시 **모든 포지션의 승부 결과를 자동으로 판정**하고 기록하는 시스템이 추가되었습니다.

### 자동 정산 프로세스

1. **마켓 정산**: `settleMarket(marketId, settlementTick)` 호출
2. **포지션 판정**: 모든 포지션의 승부 자동 계산
   - `lowerTick ≤ settlementTick < upperTick` → WIN (payout = quantity)
   - 그 외 → LOSS (payout = 0)
3. **이벤트 발생**: 각 포지션별로 `PositionSettled` 이벤트 발생
4. **서브그래프 처리**: `handlePositionSettled()` 함수 실행
   - ✅ **PositionSettled 엔티티 생성**
   - ✅ **포지션 상태 업데이트**: `outcome = WIN/LOSS`, `isClaimed = false`
   - ✅ **PnL 계산**: `realizedPnL = payout - totalCostBasis`
   - ✅ **포인트 계산**: Performance Points + Risk Bonus Points
   - ✅ **보유시간 계산**: `holdingSeconds = 현재시간 - weightedEntryTime`
   - ✅ **통계 업데이트**: `UserStats` 승패 기록, 포인트 누적
   - ✅ **SETTLE 거래 기록**: Trade 엔티티 생성 (type: SETTLE)
   - ✅ **필드 리셋**: `activityRemaining = 0`, `weightedEntryTime = 0`

### 새로운 컨트랙트 이벤트

```solidity
event PositionSettled(
    uint256 indexed positionId,
    address indexed trader,
    uint256 payout,
    bool isWin
);
```

### 새로운 서브그래프 엔티티

```graphql
type PositionSettled {
  id: Bytes! # transactionHash-logIndex
  positionId: BigInt! # 정산된 포지션 ID
  trader: Bytes! # 트레이더 주소
  payout: BigInt! # 지급액 (6 decimals SUSD)
  isWin: Boolean! # 승리 여부
  blockNumber: BigInt!
  blockTimestamp: BigInt!
  transactionHash: Bytes!
}
```

### TradeType 변경

```graphql
# 변경 전
enum TradeType {
  OPEN
  INCREASE
  DECREASE
  CLOSE
  CLAIM
}

# 변경 후
enum TradeType {
  OPEN
  INCREASE
  DECREASE
  CLOSE
  SETTLE # CLAIM → SETTLE
}
```

---

## 🌍 4. 네트워크 마이그레이션

### Base Mainnet

#### 새로운 컨트랙트 주소

```typescript
const CONTRACTS = {
  CLMSRMarketCore: "0xE3d019db1E1987D05bBC8cc578BB78aa92761dce",
  SUSD: "0x9a0dAb48676D20ed08cd2eE390d869961d4C98Cd",
  CLMSRPosition: "0x1Cb2e3ffd25b93a454290FAae4dBcF253c3927e1",
};
```

---

## 💰 5. 토큰 변경: USDC → SUSD

### 변경 이유

- **브랜딩 일관성**: "Signals USD"로 플랫폼 정체성 강화
- **독립성**: 외부 스테이블코인 의존도 감소
- **확장성**: 향후 토큰 기능 확장 가능

### 기술적 변경사항

```typescript
// 모든 문서 및 코드에서 변경
"USDC" → "SUSD"
"USD Coin" → "Signals USD"
"0x5b3E..." → "0x9a0d..." // 새로운 컨트랙트 주소
```

### 사용자 영향

- **기능 동일**: 6 decimals, 1:1 USD 페깅 유지
- **UI 표시**: "USDC" → "SUSD"로 표시 변경
- **지갑 설정**: 새로운 토큰 주소로 추가 필요

---

## 📊 6. 서브그래프 API 변경사항

### 엔드포인트 업데이트

```
변경 전: https://api.studio.thegraph.com/query/116469/signals-v-0/1.0.2
변경 후: https://api.studio.thegraph.com/query/116469/signals-v-0/1.1.0
```

### 주요 쿼리 변경

#### 포지션 조회 시 필터 변경

```graphql
# 변경 전
query GetUserPositions($user: Bytes!) {
  userPositions(where: { user: $user, isActive: true }) {
    # ...
  }
}

# 변경 후
query GetUserPositions($user: Bytes!) {
  userPositions(where: { user: $user, outcome: OPEN }) {
    positionId
    outcome          # NEW!
    isClaimed        # NEW!
    activityRemaining # NEW!
    weightedEntryTime # NEW!
    # ...
  }
}
```

#### 포인트 데이터 조회

```graphql
# 새로운 쿼리: 사용자 포인트 조회
query GetUserPoints($user: Bytes!) {
  userStats(id: $user) {
    totalPoints # 누적 포인트 잔고 (6 decimals)
  }

  trades(where: { user: $user }, orderBy: timestamp, orderDirection: desc) {
    id
    type
    activityPt # 활동 포인트 (6 decimals)
    performancePt # 성과 포인트 (6 decimals)
    riskBonusPt # 리스크 보너스 (6 decimals)
    timestamp
    positionId
  }
}
```

#### 정산 이벤트 조회

```graphql
# 새로운 쿼리: 포지션 정산 결과 조회
query GetSettlementResults($trader: Bytes!) {
  positionSettleds(
    where: { trader: $trader }
    orderBy: blockTimestamp
    orderDirection: desc
  ) {
    id
    positionId
    trader
    payout # 지급액 (6 decimals SUSD)
    isWin # 승리 여부
    blockNumber
    blockTimestamp
    transactionHash
  }
}
```

---

## 🔧 7. 개발자 가이드

### 마이그레이션 체크리스트

#### 프론트엔드 개발자

- [ ] 네트워크 설정을 Base Mainnet으로 변경
- [ ] 컨트랙트 주소 업데이트
- [ ] USDC → SUSD 토큰 표시 변경
- [ ] 새로운 서브그래프 엔드포인트 사용
- [ ] 포인트 시스템 UI 구현
- [ ] outcome 상태 표시 추가

#### 백엔드 개발자

- [ ] 서브그래프 쿼리 업데이트
- [ ] PositionSettled 이벤트 처리 로직 추가
- [ ] 포인트 계산 로직 구현
- [ ] 정산 결과 데이터 저장

#### 스마트 컨트랙트 개발자

- [ ] PositionSettled 이벤트 리스너 구현
- [ ] 새로운 네트워크 배포 스크립트 준비
- [ ] 포인트 시스템 검증 로직 구현

### 새로운 기능 구현 예시

#### 1. 포인트 시스템 통합

```typescript
// 포인트 데이터 조회
interface UserPointsResult {
  userStats: {
    totalPoints: string; // BigInt as string
  } | null;
  trades: Array<{
    id: string;
    type: "OPEN" | "INCREASE" | "DECREASE" | "CLOSE" | "SETTLE";
    activityPt: string;
    performancePt: string;
    riskBonusPt: string;
    timestamp: string;
    positionId: string;
  }>;
}

const getUserPoints = async (
  userAddress: string
): Promise<UserPointsResult> => {
  const query = `
    query GetUserPoints($user: Bytes!) {
      userStats(id: $user) {
        totalPoints
      }
      trades(where: { user: $user }, first: 100, orderBy: timestamp, orderDirection: desc) {
        id
        type
        activityPt
        performancePt
        riskBonusPt
        timestamp
        positionId
      }
    }
  `;

  const result = await subgraphClient.query({
    query,
    variables: { user: userAddress },
  });

  return result.data;
};
```

#### 2. 포지션 결과 추적

```typescript
// 포지션 상태별 조회
type PositionOutcome = "OPEN" | "CLOSED" | "WIN" | "LOSS";

interface PositionResult {
  userPositions: Array<{
    id: string;
    positionId: string;
    totalCostBasis: string;
    realizedPnL: string;
    outcome: PositionOutcome;
    isClaimed: boolean;
    activityRemaining: string;
    weightedEntryTime: string;
    currentQuantity: string;
    createdAt: string;
    lastUpdated: string;
  }>;
}

const getPositionsByOutcome = async (
  userAddress: string,
  outcome: PositionOutcome
): Promise<PositionResult> => {
  const query = `
    query GetPositionsByOutcome($user: Bytes!, $outcome: PositionOutcome!) {
      userPositions(
        where: { user: $user, outcome: $outcome }
        orderBy: createdAt
        orderDirection: desc
      ) {
        id
        positionId
        totalCostBasis
        realizedPnL
        outcome
        isClaimed
        activityRemaining
        weightedEntryTime
        currentQuantity
        createdAt
        lastUpdated
      }
    }
  `;

  const result = await subgraphClient.query({
    query,
    variables: { user: userAddress, outcome },
  });

  return result.data;
};
```

#### 3. 정산 결과 조회

```typescript
// 정산 이벤트 조회
interface SettlementResult {
  positionSettleds: Array<{
    id: string;
    positionId: string;
    trader: string;
    payout: string; // BigInt as string (6 decimals SUSD)
    isWin: boolean;
    blockNumber: string;
    blockTimestamp: string;
    transactionHash: string;
  }>;
}

const getSettlementHistory = async (
  userAddress: string
): Promise<SettlementResult> => {
  const query = `
    query GetSettlements($trader: Bytes!) {
      positionSettleds(
        where: { trader: $trader }
        orderBy: blockTimestamp
        orderDirection: desc
        first: 100
      ) {
        id
        positionId
        trader
        payout
        isWin
        blockNumber
        blockTimestamp
        transactionHash
      }
    }
  `;

  const result = await subgraphClient.query({
    query,
    variables: { trader: userAddress },
  });

  return result.data;
};

// 포인트 계산 헬퍼 함수들
export const calculateTotalPoints = (
  trades: Array<{
    activityPt: string;
    performancePt: string;
    riskBonusPt: string;
  }>
): string => {
  return trades
    .reduce((total, trade) => {
      const activity = BigInt(trade.activityPt);
      const performance = BigInt(trade.performancePt);
      const risk = BigInt(trade.riskBonusPt);
      return total + activity + performance + risk;
    }, BigInt(0))
    .toString();
};

export const formatSUSD = (amount: string): string => {
  return (Number(amount) / 1e6).toFixed(2) + " SUSD";
};
```

---

## ⚠️ 8. 호환성 및 주의사항

### Breaking Changes

1. **서브그래프 스키마**: 모든 기존 쿼리 수정 필요
2. **네트워크**: 완전히 다른 체인으로 이동
3. **토큰**: USDC → SUSD 변경으로 토큰 주소 업데이트 필요
4. **API 응답**: 새로운 필드들 추가로 응답 구조 변경

### 마이그레이션 가이드

1. **서브그래프**: 새로운 엔드포인트로 전환
2. **지갑**: Base Mainnet 네트워크 추가
3. **토큰**: SUSD 토큰 임포트
4. **쿼리**: outcome 기반 필터링으로 변경

### 이전 버전과의 비교

```typescript
// v1.0.x (이전)
interface OldUserPosition {
  isActive: boolean;
  // 포인트 시스템 없음
  // 정산 결과 추적 없음
}

// v1.1.0 (현재)
interface NewUserPosition {
  outcome: "OPEN" | "CLOSED" | "WIN" | "LOSS";
  isClaimed: boolean;
  activityRemaining: string;
  weightedEntryTime: string;
}
```

---

## 🎉 9. 향후 계획

### 단기 (1-2주)

- [ ] 포인트 리더보드 시스템 구축
- [ ] 승부 예측 정확도 통계 추가
- [ ] 사용자 성과 대시보드 구현

### 중기 (1-2개월)

- [ ] 포인트 기반 보상 시스템 도입
- [ ] NFT 배지 시스템 연동
- [ ] 소셜 기능 (친구 대결, 랭킹 등)

### 장기 (3-6개월)

- [ ] 다중 체인 지원 (Ethereum, Polygon 등)
- [ ] 고급 분석 도구 제공
- [ ] 기관 투자자 기능 추가

---

## 📞 10. 지원 및 문의

### 기술 지원

- **Discord**: [signals-v0 채널](https://discord.gg/signals-v0)
- **GitHub Issues**: [GitHub Repository](https://github.com/signals-v0/clmsr)
- **문서**: [docs.signals-v0.io](https://docs.signals-v0.io)

### 개발자 리소스

- **API 문서**: [SUBGRAPH_API.md](./SUBGRAPH_API.md)
- **통합 가이드**: [CONTRACT_INTEGRATION.md](./CONTRACT_INTEGRATION.md)
- **빠른 시작**: [QUICK_START.md](./QUICK_START.md)

---

**마지막 업데이트**: 2025년 8월 5일  
**버전**: v1.1.0  
**작성자**: CLMSR 개발팀
