# CLMSR 컨트랙트 연동 가이드

> Arbitrum Sepolia에 배포된 CLMSR 컨트랙트들과의 상호작용 완전 가이드

## 🏗️ 컨트랙트 정보

### 배포된 주소들

```typescript
const CONTRACTS = {
  // 메인 컨트랙트 (최신 배포)
  CLMSRMarketCore: "0x59bDE8c7bc4bF23465B549052f2D7f586B88550e",
  CLMSRPosition: "0x3786e87B983470a0676F2367ce7337f66C19EB21",

  // 테스트용 토큰 (최신 배포)
  USDC: "0x5b3EE16Ce3CD3B46509C3fd824366B1306bA1ed9",

  // 라이브러리들 (최신 배포)
  FixedPointMathU: "0x79FD2c223601F625Bf5b5e8d09Cf839D52B16374",
  LazyMulSegmentTree: "0xA4cFb284e97B756fC2D38215b04C06cE4cA4F50c",
};

const NETWORK = {
  name: "Arbitrum Sepolia",
  chainId: 421614,
  rpc: "https://sepolia-rollup.arbitrum.io/rpc",
  explorer: "https://sepolia.arbiscan.io",
};

> **📅 Manager Contract Note**: CLMSRMarketCore requires a Manager contract address during deployment. Currently, the deployed instance uses a placeholder address. For production deployment, you'll need to:
> 1. Deploy a Manager contract first
> 2. Deploy CLMSRMarketCore with the Manager address
> 3. Update the Manager contract with the Core address if needed
```

### 컨트랙트 검증 상태

✅ 모든 컨트랙트가 Arbiscan에서 검증됨

- [CLMSRMarketCore](https://sepolia.arbiscan.io/address/0x59bDE8c7bc4bF23465B549052f2D7f586B88550e#code)
- [USDC](https://sepolia.arbiscan.io/address/0x5b3EE16Ce3CD3B46509C3fd824366B1306bA1ed9#code)
- [CLMSRPosition](https://sepolia.arbiscan.io/address/0x3786e87B983470a0676F2367ce7337f66C19EB21#code)

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

## 🎯 틱 시스템 이해

### 틱과 Bin의 관계

CLMSR 시스템에서는 두 가지 좌표 체계를 사용합니다:

- **틱(Tick)**: 실제 확률값을 나타내는 정수 (예: 100, 200, 300)
- **Bin**: 세그먼트 트리에서 사용하는 0-based 인덱스 (내부 구현)

### 마켓 파라미터

```typescript
interface MarketParams {
  minTick: number; // 최소 틱값 (예: 0)
  maxTick: number; // 최대 틱값 (예: 10000)
  tickSpacing: number; // 틱 간격 (예: 100)
}

// 예시: minTick=0, maxTick=10000, tickSpacing=100
// 유효한 틱: 0, 100, 200, 300, ..., 10000
// 유효한 구간: [0,100), [100,200), [200,300), ..., [9900,10000)
```

### 포지션 범위 규칙

1. **lowerTick < upperTick**: 반드시 하한이 상한보다 작아야 함
2. **tickSpacing 정렬**: `(upperTick - lowerTick) % tickSpacing === 0`
3. **동일 틱 금지**: `lowerTick !== upperTick`
4. **다중 구간 허용**: 여러 개의 연속된 구간도 가능

---

## 📖 읽기 함수들 (View Functions)

### 1. 마켓 정보 조회

#### 기본 마켓 정보

```typescript
// 방법 1: public markets 매핑 직접 접근 (간단)
const market = await coreContract.markets(marketId);

// 방법 2: getMarket 함수 호출 (더 안전 - 존재하지 않는 마켓에 대해 에러 발생)
const market = await coreContract.getMarket(marketId);

// 두 방법 모두 동일한 Market 구조체를 반환합니다
interface MarketInfo {
  isActive: boolean;
  settled: boolean;
  startTimestamp: bigint;
  endTimestamp: bigint;
  settlementLowerTick: bigint; // int256 in contract
  settlementUpperTick: bigint; // int256 in contract
  minTick: bigint; // int256 in contract
  maxTick: bigint; // int256 in contract
  tickSpacing: bigint; // int256 in contract
  numBins: number; // uint32 in contract, converted to number
  liquidityParameter: bigint;
}

const getMarketInfo = async (marketId: number): Promise<MarketInfo> => {
  // getMarket 함수 사용 (권장 - 마켓 존재 여부 자동 검증)
  const market = await coreContract.getMarket(marketId);

  return {
    isActive: market.isActive,
    settled: market.settled,
    startTimestamp: market.startTimestamp,
    endTimestamp: market.endTimestamp,
    settlementLowerTick: market.settlementLowerTick,
    settlementUpperTick: market.settlementUpperTick,
    minTick: market.minTick,
    maxTick: market.maxTick,
    tickSpacing: market.tickSpacing,
    numBins: Number(market.numBins),
    liquidityParameter: market.liquidityParameter,
  };
};

// 마켓 상태 확인
const getMarketStatus = async (marketId: number) => {
  // markets 매핑 직접 접근도 가능 (더 빠름)
  const market = await coreContract.markets(marketId);

  return {
    isActive: market.isActive,
    isSettled: market.settled,
  };
};
```

#### 마켓 조회 (배포 파일 기반)

```typescript
// 전체 마켓 조회 - 서브그래프나 이벤트 로그 사용 권장
const getAllMarkets = async (): Promise<MarketInfo[]> => {
  // 실제로는 서브그래프에서 조회하는 것이 효율적
  // 또는 MarketCreated 이벤트 로그를 파싱
  const filter = coreContract.filters.MarketCreated();
  const events = await coreContract.queryFilter(filter);

  const marketIds = events.map((event) => Number(event.args.marketId));

  const markets = await Promise.all(marketIds.map((id) => getMarketInfo(id)));

  return markets;
};
```

## 2. 가격 조회

### 포지션 비용 계산

```typescript
interface CostInfo {
  cost: bigint; // 6-decimal USDC
  effectivePrice: string; // 단위당 가격
}

const calculatePositionCost = async (
  marketId: number,
  lowerTick: number,
  upperTick: number,
  quantity: bigint
): Promise<CostInfo> => {
  // calculateOpenCost 함수 사용 (실제 존재하는 함수)
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
  owner: string; // msg.sender가 owner가 됨
}

const getUserPositions = async (
  userAddress: string
): Promise<UserPosition[]> => {
  const positionIds = await positionContract.getPositionsByOwner(userAddress);

  const positions = await Promise.all(
    positionIds.map(async (id: bigint) => {
      const positionData = await positionContract.getPosition(id);
      return {
        positionId: id,
        marketId: Number(positionData.marketId),
        owner: userAddress, // 조회한 사용자가 owner
        lowerTick: Number(positionData.lowerTick),
        upperTick: Number(positionData.upperTick),
        quantity: positionData.quantity,
      };
    })
  );

  return positions;
};
```

#### 포지션 가치 계산

```typescript
const getPositionValue = async (positionId: bigint): Promise<bigint> => {
  // 현재 판매 시 받을 수 있는 금액 계산
  return await coreContract.calculateCloseProceeds(positionId);
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

  // 마켓 정보 조회
  const market = await coreContract.markets(marketId);

  // 입력값 검증
  if ((upperTick - lowerTick) % Number(market.tickSpacing) !== 0) {
    throw new Error("틱 범위가 tickSpacing에 맞지 않습니다");
  }

  if (lowerTick >= upperTick) {
    throw new Error("올바르지 않은 틱 범위입니다 (lowerTick >= upperTick)");
  }

  if (lowerTick === upperTick) {
    throw new Error("같은 틱으로는 포지션을 열 수 없습니다");
  }

  // 예상 가격 확인
  const estimatedCost = await coreContract.calculateOpenCost(
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
  const userAddress = await coreContract.runner.getAddress();
  const allowance = await getUSDCAllowance(userAddress);
  if (allowance < maxCost) {
    console.log("USDC 승인이 필요합니다...");
    await approveUSDC();
  }

  // 2. Open position
  const openTx = await market.openPosition(
    marketId, // Market ID
    lowerTick, // Lower tick bound
    upperTick, // Upper tick bound
    quantity, // Position quantity
    maxCost // Maximum cost willing to pay
  );
  await openTx.wait();

  console.log("Position opened successfully!");
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
const claimPayout = async (positionId: bigint): Promise<void> => {
  // 마켓이 정산되었는지 확인
  const positionData = await positionContract.getPosition(positionId);
  const marketId = positionData.marketId;
  const market = await coreContract.markets(marketId);

  if (!market.settled) {
    throw new Error("마켓이 아직 정산되지 않았습니다");
  }

  const tx = await coreContract.claimPayout(positionId);
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
  (positionId, marketId, lowerTick, upperTick, quantity, cost) => {
    console.log("🆕 새 포지션 생성:", {
      positionId: positionId.toString(),
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
  const filter = coreContract.filters.PositionOpened(null, marketId);

  coreContract.on(
    filter,
    (positionId, marketId, lowerTick, upperTick, quantity, cost) => {
      console.log(`마켓 ${marketId}에 새 포지션:`, {
        positionId: positionId.toString(),
        range: `${lowerTick}-${upperTick}`,
        cost: ethers.formatUnits(cost, 6),
      });
    }
  );
};

// 특정 사용자의 활동만 감지 (트랜잭션 발신자 기준)
const listenToUser = (userAddress: string) => {
  // 모든 포지션 이벤트를 받아서 트랜잭션 발신자로 필터링
  coreContract.on(
    "PositionOpened",
    async (
      positionId,
      marketId,
      lowerTick,
      upperTick,
      quantity,
      cost,
      event
    ) => {
      // 트랜잭션 발신자 확인
      const tx = await event.getTransaction();
      if (tx.from.toLowerCase() === userAddress.toLowerCase()) {
        console.log(`사용자 ${userAddress}의 새 포지션:`, {
          positionId: positionId.toString(),
          marketId: marketId.toString(),
          range: `${lowerTick}-${upperTick}`,
        });
      }
    }
  );
};
```

### 3. 과거 이벤트 조회

```typescript
// 과거 포지션 생성 이벤트 조회
const getHistoricalPositions = async (marketId: number, fromBlock?: number) => {
  const filter = coreContract.filters.PositionOpened(null, marketId);
  const events = await coreContract.queryFilter(filter, fromBlock || -10000);

  return await Promise.all(
    events.map(async (event) => {
      // 트랜잭션 정보에서 발신자 주소 가져오기
      const tx = await event.getTransaction();
      return {
        positionId: event.args.positionId.toString(),
        trader: tx.from, // 트랜잭션 발신자가 실제 trader
        lowerTick: Number(event.args.lowerTick),
        upperTick: Number(event.args.upperTick),
        quantity: event.args.quantity.toString(),
        cost: ethers.formatUnits(event.args.cost, 6),
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash,
      };
    })
  );
};
```

---

## 🔧 유틸리티 함수들

### 1. 틱 시스템 도우미

```typescript
// 틱을 bin 인덱스로 변환
const tickToBinIndex = (
  tick: bigint,
  minTick: bigint,
  tickSpacing: bigint
): number => {
  return Number((tick - minTick) / tickSpacing);
};

// bin 인덱스를 틱으로 변환
const binIndexToTick = (
  binIndex: number,
  minTick: bigint,
  tickSpacing: bigint
): bigint => {
  return minTick + BigInt(binIndex) * tickSpacing;
};

// 틱 범위를 확률 범위로 해석 (단순 근사)
const tickRangeToProbabilityRange = (
  lowerTick: bigint,
  upperTick: bigint,
  minTick: bigint,
  maxTick: bigint
) => {
  const totalTicks = Number(maxTick - minTick);
  const lowerOffset = Number(lowerTick - minTick);
  const upperOffset = Number(upperTick - minTick);

  return {
    lower: (lowerOffset / totalTicks) * 100,
    upper: (upperOffset / totalTicks) * 100,
  };
};

// 유효한 틱 범위인지 확인
const isValidTickRange = (
  lowerTick: bigint,
  upperTick: bigint,
  minTick: bigint,
  maxTick: bigint,
  tickSpacing: bigint
): boolean => {
  return (
    lowerTick >= minTick &&
    upperTick <= maxTick &&
    lowerTick < upperTick &&
    (lowerTick - minTick) % tickSpacing === 0n &&
    (upperTick - minTick) % tickSpacing === 0n
  );
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
      case "MarketNotFound":
        return "마켓을 찾을 수 없습니다.";
      case "MarketNotActive":
        return "마켓이 비활성화되었습니다.";
      case "InvalidQuantity":
        return "수량이 잘못되었습니다.";
      case "InvalidTickRange":
        return "올바르지 않은 틱 범위입니다.";
      case "BinCountExceedsLimit":
        return "bin 개수가 제한을 초과했습니다.";
      case "ZeroAddress":
        return "주소가 올바르지 않습니다.";
      case "ContractPaused":
        return "컨트랙트가 일시 중지되었습니다.";
      case "UnauthorizedCaller":
        return "권한이 없는 호출자입니다.";
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
  const promises = marketIds.map((id) => coreContract.markets(id));

  const results = await Promise.all(promises);

  return results.map((market, index) => ({
    marketId: marketIds[index],
    startTimestamp: market.startTimestamp,
    endTimestamp: market.endTimestamp,
    settlementLowerTick: market.settlementLowerTick,
    settlementUpperTick: market.settlementUpperTick,
    minTick: market.minTick,
    maxTick: market.maxTick,
    tickSpacing: market.tickSpacing,
    numBins: Number(market.numBins),
    liquidityParameter: market.liquidityParameter,
    isActive: market.isActive,
    settled: market.settled,
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

  async calculateCost(
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

    const cost = await coreContract.calculateOpenCost(
      marketId,
      lowerTick,
      upperTick,
      quantity
    );
    this.priceCache.set(key, { price: cost, timestamp: Date.now() });

    return cost;
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
