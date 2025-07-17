# CLMSR 컨트랙트 연동 가이드

> Arbitrum Sepolia에 배포된 CLMSR 컨트랙트들과의 상호작용 완전 가이드

## 🏗️ 컨트랙트 정보

### 배포된 주소들

```typescript
const CONTRACTS = {
  // 메인 컨트랙트
  CLMSRMarketCore: "0x73908E35F9b5747f6183111cA417462E8e39c09B",
  CLMSRPosition: "0x35c3C4FA2F14544dA688e41118edAc953cc48cDa",

  // 테스트용 토큰
  USDC: "0x78070bF4525A5A5600Ff97220139a6F77F840A96",

  // 라이브러리들
  FixedPointMathU: "0xD84379CEae14AA33C123Af12424A37803F885889",
  LazyMulSegmentTree: "0x2B0d36FACD61B71CC05ab8F3D2355ec3631C0dd5",
};

const NETWORK = {
  name: "Arbitrum Sepolia",
  chainId: 421614,
  rpc: "https://sepolia-rollup.arbitrum.io/rpc",
  explorer: "https://sepolia.arbiscan.io",
};
```

### 컨트랙트 검증 상태

✅ 모든 컨트랙트가 Arbiscan에서 검증됨

- [CLMSRMarketCore](https://sepolia.arbiscan.io/address/0x73908E35F9b5747f6183111cA417462E8e39c09B#code)
- [USDC](https://sepolia.arbiscan.io/address/0x78070bF4525A5A5600Ff97220139a6F77F840A96#code)
- [CLMSRPosition](https://sepolia.arbiscan.io/address/0x35c3C4FA2F14544dA688e41118edAc953cc48cDa#code)

---

## ⚙️ 기본 설정

### 1. Web3 Provider 설정

```typescript
import { ethers } from "ethers";

// MetaMask 등 지갑 연결
const getProvider = async () => {
  if (typeof window !== "undefined" && window.ethereum) {
    await window.ethereum.request({ method: "eth_requestAccounts" });
    return new ethers.BrowserProvider(window.ethereum);
  }

  // 또는 RPC 직접 연결
  return new ethers.JsonRpcProvider("https://sepolia-rollup.arbitrum.io/rpc");
};

// 네트워크 확인 및 자동 전환
const ensureCorrectNetwork = async (provider: ethers.BrowserProvider) => {
  const network = await provider.getNetwork();

  if (network.chainId !== 421614n) {
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x66eee" }], // 421614 in hex
      });
    } catch (error: any) {
      if (error.code === 4902) {
        // 네트워크가 없으면 추가
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: "0x66eee",
              chainName: "Arbitrum Sepolia",
              rpcUrls: ["https://sepolia-rollup.arbitrum.io/rpc"],
              nativeCurrency: {
                name: "ETH",
                symbol: "ETH",
                decimals: 18,
              },
              blockExplorerUrls: ["https://sepolia.arbiscan.io"],
            },
          ],
        });
      }
    }
  }
};
```

### 2. 컨트랙트 인스턴스 생성

```typescript
// ABI는 hardhat artifacts에서 가져오거나 etherscan에서 복사
import CLMSRMarketCoreABI from "./abis/CLMSRMarketCore.json";
import ERC20ABI from "./abis/ERC20.json";

const initializeContracts = async () => {
  const provider = await getProvider();
  const signer = await provider.getSigner();

  const coreContract = new ethers.Contract(
    CONTRACTS.CLMSRMarketCore,
    CLMSRMarketCoreABI,
    signer
  );

  const usdcContract = new ethers.Contract(CONTRACTS.USDC, ERC20ABI, signer);

  const positionContract = new ethers.Contract(
    CONTRACTS.CLMSRPosition,
    CLMSRPositionABI,
    signer
  );

  return { coreContract, usdcContract, positionContract };
};
```

---

## 📖 읽기 함수들 (View Functions)

### 1. 마켓 정보 조회

#### 기본 마켓 정보

```typescript
// 마켓 전체 정보 조회 (구조체)
interface MarketInfo {
  isActive: boolean;
  settled: boolean;
  startTimestamp: bigint;
  endTimestamp: bigint;
  settlementLowerTick: number;
  settlementUpperTick: number;
  numTicks: number;
  liquidityParameter: bigint;
}

const getMarketInfo = async (marketId: number): Promise<MarketInfo> => {
  const marketData = await coreContract.getMarket(marketId);
  return {
    isActive: marketData.isActive,
    settled: marketData.settled,
    startTimestamp: marketData.startTimestamp,
    endTimestamp: marketData.endTimestamp,
    settlementLowerTick: Number(marketData.settlementLowerTick),
    settlementUpperTick: Number(marketData.settlementUpperTick),
    numTicks: Number(marketData.numTicks),
    liquidityParameter: marketData.liquidityParameter,
  };
};

// 마켓 상태 확인
const getMarketStatus = async (marketId: number) => {
  const [isActive, isSettled] = await Promise.all([
    coreContract.isMarketActive(marketId),
    coreContract.isMarketSettled(marketId),
  ]);

  return { isActive, isSettled };
};
```

#### 마켓 카운터 조회

```typescript
// 전체 마켓 개수
const getTotalMarkets = async (): Promise<number> => {
  const counter = await coreContract.marketCounter();
  return Number(counter);
};

// 모든 마켓 ID 나열
const getAllMarketIds = async (): Promise<number[]> => {
  const total = await getTotalMarkets();
  return Array.from({ length: total }, (_, i) => i);
};
```

## 2. 가격 조회

### 단일 포지션 가격 조회

```typescript
interface PriceInfo {
  cost: bigint; // 6-decimal USDC
  effectivePrice: string; // ETH 기준 가격
}

const getPositionPrice = async (
  marketId: number,
  lowerTick: number,
  upperTick: number,
  quantity: bigint
): Promise<PriceInfo> => {
  // calculateOpenCost 함수 사용 (6-decimal 결과)
  const cost = await coreContract.calculateOpenCost(
    marketId,
    lowerTick,
    upperTick,
    quantity
  );

  const effectivePrice = (
    (Number(cost) / 1e6 / Number(quantity)) *
    1e18
  ).toFixed(6);

  return { cost, effectivePrice };
};
```

### 포지션 변경 비용 조회

```typescript
// 포지션 증가 비용
const getIncreaseCost = async (
  positionId: bigint,
  additionalQuantity: bigint
): Promise<bigint> => {
  return await coreContract.calculateIncreaseCost(
    positionId,
    additionalQuantity
  );
};

// 포지션 감소 수익
const getDecreaseProceeds = async (
  positionId: bigint,
  sellQuantity: bigint
): Promise<bigint> => {
  return await coreContract.calculateDecreaseProceeds(positionId, sellQuantity);
};

// 포지션 완전 청산 수익
const getCloseProceeds = async (positionId: bigint): Promise<bigint> => {
  return await coreContract.calculateCloseProceeds(positionId);
};

// 정산된 포지션 클레임 금액
const getClaimAmount = async (positionId: bigint): Promise<bigint> => {
  return await coreContract.calculateClaimAmount(positionId);
};
```

### 3. 포지션 조회

#### 사용자 포지션 목록

```typescript
interface UserPosition {
  positionId: bigint;
  marketId: number;
  lowerTick: number;
  upperTick: number;
  quantity: bigint;
  trader: string;
}

const getUserPositions = async (
  userAddress: string
): Promise<UserPosition[]> => {
  const positionIds = await coreContract.getPositionIds(userAddress);

  const positions = await Promise.all(
    positionIds.map(async (id: bigint) => {
      const positionData = await coreContract.positions(id);
      return {
        positionId: id,
        marketId: Number(positionData[0]),
        trader: positionData[1],
        lowerTick: Number(positionData[2]),
        upperTick: Number(positionData[3]),
        quantity: positionData[4],
      };
    })
  );

  return positions;
};
```

#### 포지션 가치 계산

```typescript
const getPositionValue = async (positionId: bigint): Promise<bigint> => {
  const positionData = await coreContract.positions(positionId);
  const [marketId, , lowerTick, upperTick, quantity] = positionData;

  // 현재 판매 시 받을 수 있는 금액 계산
  return await coreContract.getPrice(marketId, lowerTick, upperTick, -quantity);
};
```

### 4. 밸런스 및 어로우 조회

#### USDC 잔액

```typescript
const getUSDCBalance = async (userAddress: string): Promise<string> => {
  const balance = await usdcContract.balanceOf(userAddress);
  return ethers.formatUnits(balance, 6); // USDC는 6 decimals
};

// 컨트랙트에 대한 승인 확인
const getUSDCAllowance = async (userAddress: string): Promise<bigint> => {
  return await usdcContract.allowance(userAddress, CONTRACTS.CLMSRMarketCore);
};
```

---

## ✍️ 쓰기 함수들 (State-Changing Functions)

### 1. 초기 설정

#### USDC 승인

```typescript
const approveUSDC = async (amount?: bigint): Promise<void> => {
  // 무제한 승인 (권장) 또는 특정 금액 승인
  const approvalAmount = amount || ethers.MaxUint256;

  const tx = await usdcContract.approve(
    CONTRACTS.CLMSRMarketCore,
    approvalAmount
  );
  await tx.wait();

  console.log("USDC 승인 완료:", tx.hash);
};

// 테스트 USDC 발급 (테스트넷에서만)
const mintTestUSDC = async (amount: bigint): Promise<void> => {
  const tx = await usdcContract.mint(amount);
  await tx.wait();

  console.log(`${ethers.formatUnits(amount, 6)} USDC 발급 완료`);
};
```

### 2. 포지션 거래

#### 포지션 열기 (구매)

```typescript
interface OpenPositionParams {
  marketId: number;
  lowerTick: number;
  upperTick: number;
  quantity: bigint;
  maxCost: bigint; // 슬리피지 보호
  deadlineMinutes?: number; // 기본 10분
}

const openPosition = async (params: OpenPositionParams): Promise<bigint> => {
  const {
    marketId,
    lowerTick,
    upperTick,
    quantity,
    maxCost,
    deadlineMinutes = 10,
  } = params;

  // 입력값 검증
  if (upperTick !== lowerTick + 1) {
    throw new Error("CLMSR에서는 연속된 틱만 지원됩니다");
  }

  // 예상 가격 확인
  const estimatedCost = await coreContract.getPrice(
    marketId,
    lowerTick,
    upperTick,
    quantity
  );
  if (estimatedCost > maxCost) {
    throw new Error(
      `예상 비용이 최대 비용을 초과합니다: ${estimatedCost} > ${maxCost}`
    );
  }

  // USDC 승인 확인
  const allowance = await getUSDCAllowance(
    await coreContract.runner.getAddress()
  );
  if (allowance < maxCost) {
    console.log("USDC 승인이 필요합니다...");
    await approveUSDC();
  }

  // 포지션 열기 실행
  const tx = await coreContract.openPosition(
    userAddress, // trader 주소 (첫 번째 파라미터)
    marketId,
    lowerTick,
    upperTick,
    quantity,
    maxCost
  );

  const receipt = await tx.wait();

  // 이벤트에서 포지션 ID 추출
  const openEvent = receipt.logs.find(
    (log) =>
      log.topics[0] ===
      coreContract.interface.getEvent("PositionOpened").topicHash
  );

  if (openEvent) {
    const decoded = coreContract.interface.parseLog(openEvent);
    console.log("포지션 열기 완료:", {
      positionId: decoded.args.positionId.toString(),
      cost: ethers.formatUnits(decoded.args.cost, 6),
      txHash: tx.hash,
    });
    return decoded.args.positionId;
  }

  throw new Error("포지션 ID를 찾을 수 없습니다");
};
```

#### 포지션 늘리기

```typescript
const increasePosition = async (
  positionId: bigint,
  additionalQuantity: bigint,
  maxCost: bigint
): Promise<void> => {
  const tx = await coreContract.increasePosition(
    positionId,
    additionalQuantity,
    maxCost
  );
  const receipt = await tx.wait();

  console.log("포지션 증가 완료:", tx.hash);
};
```

#### 포지션 줄이기 (부분 판매)

```typescript
const decreasePosition = async (
  positionId: bigint,
  sellQuantity: bigint,
  minProceeds: bigint
): Promise<void> => {
  const tx = await coreContract.decreasePosition(
    positionId,
    sellQuantity,
    minProceeds
  );
  const receipt = await tx.wait();

  const decreaseEvent = receipt.logs.find(
    (log) =>
      log.topics[0] ===
      coreContract.interface.getEvent("PositionDecreased").topicHash
  );

  if (decreaseEvent) {
    const decoded = coreContract.interface.parseLog(decreaseEvent);
    console.log("포지션 감소 완료:", {
      proceeds: ethers.formatUnits(decoded.args.proceeds, 6),
      newQuantity: decoded.args.newQuantity.toString(),
      txHash: tx.hash,
    });
  }
};
```

#### 포지션 닫기 (전체 판매)

```typescript
const closePosition = async (
  positionId: bigint,
  minProceeds: bigint
): Promise<void> => {
  const tx = await coreContract.closePosition(positionId, minProceeds);
  const receipt = await tx.wait();

  console.log("포지션 닫기 완료:", tx.hash);
};
```

### 3. 정산 후 처리

#### 포지션 클레임 (정산 후)

```typescript
const claimPosition = async (positionId: bigint): Promise<void> => {
  // 마켓이 정산되었는지 확인
  const positionData = await coreContract.positions(positionId);
  const marketId = positionData[0];
  const isSettled = await coreContract.isMarketSettled(marketId);

  if (!isSettled) {
    throw new Error("마켓이 아직 정산되지 않았습니다");
  }

  const tx = await coreContract.claimPosition(positionId);
  const receipt = await tx.wait();

  const claimEvent = receipt.logs.find(
    (log) =>
      log.topics[0] ===
      coreContract.interface.getEvent("PositionClaimed").topicHash
  );

  if (claimEvent) {
    const decoded = coreContract.interface.parseLog(claimEvent);
    console.log("포지션 클레임 완료:", {
      payout: ethers.formatUnits(decoded.args.payout, 6),
      txHash: tx.hash,
    });
  }
};
```

---

## 🎧 이벤트 리스닝

### 1. 기본 이벤트 리스너

```typescript
// 새 포지션 생성 감지
coreContract.on(
  "PositionOpened",
  (positionId, trader, marketId, lowerTick, upperTick, quantity, cost) => {
    console.log("🆕 새 포지션 생성:", {
      positionId: positionId.toString(),
      trader,
      marketId: marketId.toString(),
      range: `${lowerTick}-${upperTick}`,
      quantity: quantity.toString(),
      cost: ethers.formatUnits(cost, 6),
    });
  }
);

// 가격 변동 감지
coreContract.on("RangeFactorApplied", (marketId, lo, hi, factor) => {
  console.log("💰 가격 업데이트:", {
    marketId: marketId.toString(),
    range: `${lo}-${hi}`,
    factor: factor.toString(),
  });
});

// 마켓 정산 감지
coreContract.on(
  "MarketSettled",
  (marketId, settlementLowerTick, settlementUpperTick) => {
    console.log("🏁 마켓 정산:", {
      marketId: marketId.toString(),
      winningRange: `${settlementLowerTick}-${settlementUpperTick}`,
    });
  }
);
```

### 2. 필터된 이벤트 리스닝

```typescript
// 특정 마켓만 감지
const listenToMarket = (marketId: number) => {
  const filter = coreContract.filters.PositionOpened(null, null, marketId);

  coreContract.on(
    filter,
    (positionId, trader, marketId, lowerTick, upperTick, quantity, cost) => {
      console.log(`마켓 ${marketId}에 새 포지션:`, {
        positionId: positionId.toString(),
        trader,
        range: `${lowerTick}-${upperTick}`,
        cost: ethers.formatUnits(cost, 6),
      });
    }
  );
};

// 특정 사용자의 활동만 감지
const listenToUser = (userAddress: string) => {
  const filter = coreContract.filters.PositionOpened(null, userAddress);

  coreContract.on(
    filter,
    (positionId, trader, marketId, lowerTick, upperTick, quantity, cost) => {
      console.log(`사용자 ${userAddress}의 새 포지션:`, {
        positionId: positionId.toString(),
        marketId: marketId.toString(),
        range: `${lowerTick}-${upperTick}`,
      });
    }
  );
};
```

### 3. 과거 이벤트 조회

```typescript
// 과거 포지션 생성 이벤트 조회
const getHistoricalPositions = async (marketId: number, fromBlock?: number) => {
  const filter = coreContract.filters.PositionOpened(null, null, marketId);
  const events = await coreContract.queryFilter(filter, fromBlock || -10000);

  return events.map((event) => ({
    positionId: event.args.positionId.toString(),
    trader: event.args.trader,
    lowerTick: Number(event.args.lowerTick),
    upperTick: Number(event.args.upperTick),
    quantity: event.args.quantity.toString(),
    cost: ethers.formatUnits(event.args.cost, 6),
    blockNumber: event.blockNumber,
    transactionHash: event.transactionHash,
  }));
};
```

---

## 🔧 유틸리티 함수들

### 1. 가격 계산 도우미

```typescript
// 틱을 확률로 변환
const tickToProbability = (tick: number, numTicks: number): number => {
  return (tick / numTicks) * 100;
};

// 확률을 틱으로 변환
const probabilityToTick = (probability: number, numTicks: number): number => {
  return Math.floor((probability / 100) * numTicks);
};

// 포지션의 확률 범위 계산
const getPositionProbabilityRange = (
  lowerTick: number,
  upperTick: number,
  numTicks: number
) => {
  return {
    lower: tickToProbability(lowerTick, numTicks),
    upper: tickToProbability(upperTick, numTicks),
  };
};
```

### 2. 슬리피지 계산

```typescript
// 슬리피지를 고려한 최대 비용 계산
const calculateMaxCost = (
  estimatedCost: bigint,
  slippagePercent: number
): bigint => {
  const slippageMultiplier = BigInt(Math.floor((100 + slippagePercent) * 100));
  return (estimatedCost * slippageMultiplier) / BigInt(10000);
};

// 슬리피지를 고려한 최소 수익 계산
const calculateMinProceeds = (
  estimatedProceeds: bigint,
  slippagePercent: number
): bigint => {
  const slippageMultiplier = BigInt(Math.floor((100 - slippagePercent) * 100));
  return (estimatedProceeds * slippageMultiplier) / BigInt(10000);
};
```

### 3. 포맷팅 함수들

```typescript
// 가격 포맷팅
const formatPrice = (price: bigint): string => {
  return `$${ethers.formatUnits(price, 6)}`;
};

// 수량 포맷팅
const formatQuantity = (quantity: bigint): string => {
  return ethers.formatEther(quantity);
};

// 확률 포맷팅
const formatProbability = (prob: number): string => {
  return `${prob.toFixed(1)}%`;
};

// 시간 포맷팅
const formatTimestamp = (timestamp: bigint): string => {
  return new Date(Number(timestamp) * 1000).toLocaleString();
};
```

---

## 🚨 에러 처리

### 1. 일반적인 에러들

```typescript
const handleContractError = (error: any): string => {
  // Revert 메시지 파싱
  if (error.reason) {
    switch (error.reason) {
      case "Market not active":
        return "마켓이 비활성화되었습니다.";
      case "Market already settled":
        return "마켓이 이미 정산되었습니다.";
      case "Insufficient quantity":
        return "수량이 부족합니다.";
      case "Cost exceeds max cost":
        return "비용이 최대 한도를 초과했습니다.";
      case "Proceeds below min proceeds":
        return "수익이 최소 한도를 밑돕니다.";
      case "Position not found":
        return "포지션을 찾을 수 없습니다.";
      case "Not position owner":
        return "포지션 소유자가 아닙니다.";
      default:
        return `컨트랙트 오류: ${error.reason}`;
    }
  }

  // 지갑 관련 오류
  if (error.code) {
    switch (error.code) {
      case 4001:
        return "사용자가 트랜잭션을 취소했습니다.";
      case -32000:
        return "가스가 부족합니다.";
      case -32002:
        return "이미 대기 중인 트랜잭션이 있습니다.";
      default:
        return `지갑 오류 (${error.code}): ${error.message}`;
    }
  }

  return `알 수 없는 오류: ${error.message}`;
};
```

### 2. 트랜잭션 재시도 로직

```typescript
const executeWithRetry = async <T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error: any) {
      console.warn(`시도 ${i + 1}/${maxRetries} 실패:`, error.message);

      if (i === maxRetries - 1) {
        throw error;
      }

      // 재시도 전 대기
      await new Promise((resolve) => setTimeout(resolve, delay * (i + 1)));
    }
  }

  throw new Error("최대 재시도 횟수 초과");
};
```

---

## ⚡ 성능 최적화

### 1. 배치 호출

```typescript
// 여러 마켓 정보를 한번에 조회
const getBatchMarketInfo = async (marketIds: number[]) => {
  const promises = marketIds.map((id) =>
    Promise.all([
      coreContract.markets(id),
      coreContract.isMarketActive(id),
      coreContract.isMarketSettled(id),
    ])
  );

  const results = await Promise.all(promises);

  return results.map(([marketData, isActive, isSettled], index) => ({
    marketId: marketIds[index],
    startTimestamp: marketData[0],
    endTimestamp: marketData[1],
    numTicks: Number(marketData[2]),
    liquidityParameter: marketData[3],
    isActive,
    isSettled,
  }));
};
```

### 2. 캐싱 전략

```typescript
class ContractCache {
  private marketInfoCache = new Map<number, any>();
  private priceCache = new Map<string, { price: bigint; timestamp: number }>();
  private cacheTimeout = 30000; // 30초

  async getMarketInfo(marketId: number) {
    if (this.marketInfoCache.has(marketId)) {
      return this.marketInfoCache.get(marketId);
    }

    const info = await coreContract.markets(marketId);
    this.marketInfoCache.set(marketId, info);

    // 1시간 후 캐시 제거
    setTimeout(() => this.marketInfoCache.delete(marketId), 3600000);

    return info;
  }

  async getPrice(
    marketId: number,
    lowerTick: number,
    upperTick: number,
    quantity: bigint
  ) {
    const key = `${marketId}-${lowerTick}-${upperTick}-${quantity}`;
    const cached = this.priceCache.get(key);

    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.price;
    }

    const price = await coreContract.getPrice(
      marketId,
      lowerTick,
      upperTick,
      quantity
    );
    this.priceCache.set(key, { price, timestamp: Date.now() });

    return price;
  }
}
```

---

## 🔗 참고 링크

- **컨트랙트 소스코드**: [contracts/core/CLMSRMarketCore.sol](../contracts/core/CLMSRMarketCore.sol)
- **Arbitrum Sepolia 익스플로러**: [sepolia.arbiscan.io](https://sepolia.arbiscan.io)
- **Ethers.js 문서**: [docs.ethers.org](https://docs.ethers.org)
- **CLMSR 논문**: [학술 자료 링크]

---

**마지막 업데이트**: 2025년 1월
