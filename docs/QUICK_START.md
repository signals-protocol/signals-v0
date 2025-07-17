# CLMSR 빠른 시작 가이드

> 5분 만에 CLMSR 시스템과 연동하기

## ⚡ 빠른 설정 (복사 & 붙여넣기)

### 1. 환경 설정

```typescript
// config.ts
export const CONFIG = {
  // 네트워크 설정
  ARBITRUM_SEPOLIA: {
    chainId: 421614,
    rpcUrl: "https://sepolia-rollup.arbitrum.io/rpc",
    name: "Arbitrum Sepolia",
  },

  // 컨트랙트 주소들
  CONTRACTS: {
    CLMSRMarketCore: "0x73908E35F9b5747f6183111cA417462E8e39c09B",
    USDC: "0x78070bF4525A5A5600Ff97220139a6F77F840A96",
    CLMSRPosition: "0x35c3C4FA2F14544dA688e41118edAc953cc48cDa",
  },

  // 서브그래프 엔드포인트
  SUBGRAPH_URL:
    "https://api.studio.thegraph.com/query/116469/signals-v-0/version/latest",
};
```

### 2. 기본 의존성 설치

```bash
npm install ethers @apollo/client graphql
```

### 3. 실시간 차트 컴포넌트 (완성본)

```tsx
import React, { useEffect, useState } from "react";
import { ApolloClient, InMemoryCache, gql, useQuery } from "@apollo/client";

// Apollo 클라이언트 설정
const client = new ApolloClient({
  uri: "https://api.studio.thegraph.com/query/116469/signals-v-0/version/latest",
  cache: new InMemoryCache(),
});

// GraphQL 쿼리
const GET_MARKET_TICKS = gql`
  query GetMarketTicks($marketId: String!) {
    market(id: $marketId) {
      id
      numTicks
      isSettled
      ticks(orderBy: tickNumber) {
        tickNumber
        currentFactor
        lastUpdated
      }
    }
  }
`;

interface TickData {
  tickNumber: number;
  currentFactor: number;
  lastUpdated: number;
}

interface PriceChartProps {
  marketId: string;
}

const PriceChart: React.FC<PriceChartProps> = ({ marketId }) => {
  const { data, loading, error } = useQuery(GET_MARKET_TICKS, {
    variables: { marketId },
    pollInterval: 5000, // 5초마다 업데이트
    client,
  });

  if (loading) return <div>차트 로딩 중...</div>;
  if (error) return <div>오류 발생: {error.message}</div>;
  if (!data?.market) return <div>마켓을 찾을 수 없습니다.</div>;

  const ticks: TickData[] = data.market.ticks.map((tick: any) => ({
    tickNumber: parseInt(tick.tickNumber),
    currentFactor: parseFloat(tick.currentFactor),
    lastUpdated: parseInt(tick.lastUpdated),
  }));

  return (
    <div className="price-chart">
      <h3>마켓 {marketId} 가격 분포</h3>
      <div className="chart-container">
        {ticks.map((tick) => (
          <div
            key={tick.tickNumber}
            className="tick-bar"
            style={{
              height: `${Math.min(tick.currentFactor * 100, 200)}px`,
              backgroundColor: tick.currentFactor > 1 ? "#4CAF50" : "#f44336",
            }}
            title={`틱 ${tick.tickNumber}: ${tick.currentFactor.toFixed(4)}`}
          />
        ))}
      </div>
      <p>마지막 업데이트: {new Date().toLocaleTimeString()}</p>
    </div>
  );
};

export default PriceChart;
```

### 4. 포지션 거래 컴포넌트 (완성본)

```tsx
import React, { useState } from "react";
import { ethers } from "ethers";
import { CONFIG } from "./config";

// 컨트랙트 ABI (필수 함수들만)
const CORE_ABI = [
  "function calculateOpenCost(uint256 marketId, uint32 lowerTick, uint32 upperTick, uint128 quantity) view returns (uint256)",
  "function openPosition(address trader, uint256 marketId, uint32 lowerTick, uint32 upperTick, uint128 quantity, uint256 maxCost) returns (uint256)",
];

const USDC_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
];

interface TradingPanelProps {
  marketId: number;
}

const TradingPanel: React.FC<TradingPanelProps> = ({ marketId }) => {
  const [lowerTick, setLowerTick] = useState<number>(0);
  const [upperTick, setUpperTick] = useState<number>(1);
  const [quantity, setQuantity] = useState<string>("1000000"); // 1 USDC (6 decimals)
  const [estimatedCost, setEstimatedCost] = useState<string>("0");
  const [loading, setLoading] = useState(false);

  // 가격 추정
  const estimatePrice = async () => {
    if (!window.ethereum) return;

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const contract = new ethers.Contract(
        CONFIG.CONTRACTS.CLMSRMarketCore,
        CORE_ABI,
        provider
      );

      const cost = await contract.calculateOpenCost(
        marketId,
        lowerTick,
        upperTick,
        quantity
      );

      setEstimatedCost(ethers.formatUnits(cost, 6)); // USDC는 6 decimals
    } catch (error) {
      console.error("가격 추정 실패:", error);
    }
  };

  // 포지션 구매
  const buyPosition = async () => {
    if (!window.ethereum) {
      alert("MetaMask를 연결해주세요.");
      return;
    }

    setLoading(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const userAddress = await signer.getAddress();

      // 1. USDC 승인
      const usdcContract = new ethers.Contract(
        CONFIG.CONTRACTS.USDC,
        USDC_ABI,
        signer
      );
      const costWei = ethers.parseUnits(estimatedCost, 6);

      console.log("USDC 승인 중...");
      const approveTx = await usdcContract.approve(
        CONFIG.CONTRACTS.CLMSRMarketCore,
        costWei
      );
      await approveTx.wait();

      // 2. 포지션 구매
      const coreContract = new ethers.Contract(
        CONFIG.CONTRACTS.CLMSRMarketCore,
        CORE_ABI,
        signer
      );

      console.log("포지션 구매 중...");
      const buyTx = await coreContract.openPosition(
        userAddress,
        marketId,
        lowerTick,
        upperTick,
        quantity,
        costWei // maxCost와 동일하게 설정
      );

      const receipt = await buyTx.wait();
      console.log("포지션 구매 완료:", receipt.hash);
      alert(`포지션 구매 성공! 트랜잭션: ${receipt.hash}`);
    } catch (error) {
      console.error("포지션 구매 실패:", error);
      alert("포지션 구매에 실패했습니다. 콘솔을 확인해주세요.");
    } finally {
      setLoading(false);
    }
  };

  // upperTick 자동 설정 (CLMSR은 연속된 2개 틱만 허용)
  const handleLowerTickChange = (value: number) => {
    setLowerTick(value);
    setUpperTick(value + 1);
  };

  return (
    <div className="trading-panel">
      <h3>포지션 거래</h3>

      <div className="input-group">
        <label>시작 틱:</label>
        <input
          type="number"
          value={lowerTick}
          onChange={(e) => handleLowerTickChange(parseInt(e.target.value))}
          min="0"
        />
      </div>

      <div className="input-group">
        <label>종료 틱:</label>
        <input
          type="number"
          value={upperTick}
          disabled
          title="CLMSR에서는 연속된 틱만 지원됩니다"
        />
      </div>

      <div className="input-group">
        <label>수량 (micro USDC):</label>
        <input
          type="text"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder="1000000 = 1 USDC"
        />
      </div>

      <div className="button-group">
        <button onClick={estimatePrice}>가격 추정</button>
        <button onClick={buyPosition} disabled={loading}>
          {loading ? "처리 중..." : "포지션 구매"}
        </button>
      </div>

      {estimatedCost !== "0" && (
        <div className="price-info">
          <p>예상 비용: {estimatedCost} USDC</p>
          <p>
            틱 범위: {lowerTick} ~ {upperTick}
          </p>
        </div>
      )}
    </div>
  );
};

export default TradingPanel;
```

---

## 📊 데이터 조회 (5분)

### 1. GraphQL 클라이언트 설정

```typescript
// lib/apollo.ts
import { ApolloClient, InMemoryCache } from "@apollo/client";
import { CLMSR_CONFIG } from "../config/constants";

export const apolloClient = new ApolloClient({
  uri: CLMSR_CONFIG.subgraphUrl,
  cache: new InMemoryCache(),
});
```

### 2. 마켓 목록 조회

```typescript
// components/MarketList.tsx
import { useQuery, gql } from "@apollo/client";

const GET_MARKETS = gql`
  query GetMarkets {
    markets(first: 10, orderBy: lastUpdated, orderDirection: desc) {
      id
      marketId
      numTicks
      isSettled
      lastUpdated
    }
  }
`;

export const MarketList = () => {
  const { data, loading, error } = useQuery(GET_MARKETS);

  if (loading) return <div>로딩 중...</div>;
  if (error) return <div>오류: {error.message}</div>;

  return (
    <div>
      <h2>마켓 목록</h2>
      {data?.markets?.map((market: any) => (
        <div key={market.id} className="market-card">
          <h3>마켓 #{market.marketId}</h3>
          <p>틱 개수: {market.numTicks}</p>
          <p>상태: {market.isSettled ? "정산완료" : "활성"}</p>
        </div>
      ))}
    </div>
  );
};
```

### 3. 실시간 가격 분포 조회

```typescript
// components/PriceDistribution.tsx
import { useQuery, gql } from "@apollo/client";
import { Line } from "react-chartjs-2";

const GET_TICK_STATES = gql`
  query GetTickStates($marketId: String!) {
    tickStates(
      where: { market: $marketId }
      orderBy: tickNumber
      orderDirection: asc
      first: 1000
    ) {
      tickNumber
      currentFactor
      lastUpdated
    }
  }
`;

interface PriceDistributionProps {
  marketId: string;
}

export const PriceDistribution = ({ marketId }: PriceDistributionProps) => {
  const { data, loading } = useQuery(GET_TICK_STATES, {
    variables: { marketId },
    pollInterval: 3000, // 3초마다 업데이트 (서브그래프 인덱서에서 데이터 조회)
  });

  if (loading) return <div>가격 데이터 로딩 중...</div>;

  // 서브그래프에서 받은 데이터를 차트용으로 변환
  const chartData = {
    labels:
      data?.tickStates?.map(
        (tick: any) =>
          `틱 ${tick.tickNumber} (${(
            (tick.tickNumber / (data.market?.numTicks || 100)) *
            100
          ).toFixed(1)}%)`
      ) || [],
    datasets: [
      {
        label: "현재 팩터",
        data:
          data?.tickStates?.map((tick: any) =>
            parseFloat(tick.currentFactor)
          ) || [],
        borderColor: "rgb(75, 192, 192)",
        backgroundColor: "rgba(75, 192, 192, 0.2)",
        tension: 0.1,
      },
    ],
  };

  return (
    <div>
      <h3>마켓 #{marketId} 실시간 가격 분포</h3>
      <p>📊 서브그래프(인덱서)에서 실시간 데이터 조회</p>
      <Line data={chartData} />
    </div>
  );
};
```

---

## 💰 거래 기능 (10분)

### 1. 지갑 연결

```typescript
// components/WalletConnect.tsx
import { useState, useEffect } from "react";
import { ethers } from "ethers";

export const WalletConnect = () => {
  const [account, setAccount] = useState<string>("");
  const [isConnected, setIsConnected] = useState(false);

  const connectWallet = async () => {
    if (typeof window.ethereum !== "undefined") {
      try {
        const accounts = await window.ethereum.request({
          method: "eth_requestAccounts",
        });
        setAccount(accounts[0]);
        setIsConnected(true);

        // 네트워크 확인
        await ensureCorrectNetwork();
      } catch (error) {
        console.error("지갑 연결 실패:", error);
      }
    }
  };

  const ensureCorrectNetwork = async () => {
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x66eee" }], // Arbitrum Sepolia
      });
    } catch (error: any) {
      if (error.code === 4902) {
        // 네트워크 추가
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: "0x66eee",
              chainName: "Arbitrum Sepolia",
              rpcUrls: ["https://sepolia-rollup.arbitrum.io/rpc"],
              nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
            },
          ],
        });
      }
    }
  };

  return (
    <div>
      {isConnected ? (
        <div>
          <p>
            연결됨: {account.slice(0, 6)}...{account.slice(-4)}
          </p>
        </div>
      ) : (
        <button onClick={connectWallet}>지갑 연결</button>
      )}
    </div>
  );
};
```

### 2. 포지션 구매 컴포넌트

```typescript
// components/BuyPosition.tsx
import { useState } from "react";
import { ethers } from "ethers";
import { useContracts } from "../hooks/useContracts";

interface BuyPositionProps {
  marketId: number;
  numTicks: number;
}

export const BuyPosition = ({ marketId, numTicks }: BuyPositionProps) => {
  const [lowerTick, setLowerTick] = useState(0);
  const [quantity, setQuantity] = useState("1");
  const [loading, setLoading] = useState(false);
  const [estimatedCost, setEstimatedCost] = useState<string>("");

  const contracts = useContracts();

  // 실시간 가격 계산
  const updatePrice = async () => {
    if (!contracts) return;

    try {
      const cost = await contracts.core.getPrice(
        marketId,
        lowerTick,
        lowerTick + 1, // CLMSR은 항상 연속된 틱
        ethers.parseEther(quantity)
      );
      setEstimatedCost(ethers.formatUnits(cost, 6));
    } catch (error) {
      console.error("가격 계산 실패:", error);
    }
  };

  const buyPosition = async () => {
    if (!contracts) return;

    setLoading(true);
    try {
      // 💰 컨트랙트 직접 호출로 거래 실행

      // 1. USDC 승인 확인 및 사용자 주소 획득
      const signer = await contracts.core.runner;
      const userAddress = await signer.getAddress();
      const allowance = await contracts.usdc.allowance(
        userAddress,
        contracts.core.target
      );

      const maxCost = ethers.parseUnits(
        (parseFloat(estimatedCost) * 1.05).toString(),
        6
      ); // 5% 슬리피지

      if (allowance < maxCost) {
        console.log("USDC 승인 중...");
        const approveTx = await contracts.usdc.approve(
          contracts.core.target,
          ethers.MaxUint256
        );
        await approveTx.wait();
      }

      // 2. 포지션 구매 (블록체인에 직접 트랜잭션 전송)
      const tx = await contracts.core.openPosition(
        userAddress, // trader 주소 (첫 번째 파라미터)
        marketId,
        lowerTick,
        lowerTick + 1, // CLMSR은 항상 연속된 2개 틱
        ethers.parseEther(quantity),
        maxCost
      );

      const receipt = await tx.wait();
      console.log("포지션 구매 완료:", receipt.hash);

      alert("포지션 구매가 완료되었습니다!");
    } catch (error: any) {
      console.error("포지션 구매 실패:", error);
      alert(`구매 실패: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="buy-position">
      <h3>포지션 구매</h3>

      <div>
        <label>
          틱 번호 (0-{numTicks - 2}):
          <input
            type="number"
            min="0"
            max={numTicks - 2}
            value={lowerTick}
            onChange={(e) => setLowerTick(parseInt(e.target.value))}
            onBlur={updatePrice}
          />
        </label>
      </div>

      <div>
        <label>
          수량:
          <input
            type="number"
            step="0.1"
            min="0.1"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            onBlur={updatePrice}
          />
        </label>
      </div>

      <div>
        <p>
          예상 범위: {lowerTick}-{lowerTick + 1}
        </p>
        <p>
          확률 범위: {((lowerTick / numTicks) * 100).toFixed(1)}% -{" "}
          {(((lowerTick + 1) / numTicks) * 100).toFixed(1)}%
        </p>
        <p>예상 비용: ${estimatedCost} USDC</p>
      </div>

      <button onClick={buyPosition} disabled={loading || !estimatedCost}>
        {loading ? "구매 중..." : "포지션 구매"}
      </button>
    </div>
  );
};
```

### 3. 내 포지션 조회

```typescript
// components/MyPositions.tsx
import { useQuery, gql } from "@apollo/client";
import { useContracts } from "../hooks/useContracts";

const GET_USER_POSITIONS = gql`
  query GetUserPositions($trader: Bytes!) {
    positionOpeneds(
      where: { trader: $trader }
      orderBy: blockTimestamp
      orderDirection: desc
    ) {
      positionId
      marketId
      lowerTick
      upperTick
      quantity
      cost
      blockTimestamp
    }
  }
`;

interface MyPositionsProps {
  userAddress: string;
}

export const MyPositions = ({ userAddress }: MyPositionsProps) => {
  const { data, loading } = useQuery(GET_USER_POSITIONS, {
    variables: { trader: userAddress.toLowerCase() },
    skip: !userAddress,
  });

  const contracts = useContracts();

  const sellPosition = async (positionId: string) => {
    if (!contracts) return;

    try {
      // 현재 포지션 정보 조회
      const positionData = await contracts.core.positions(positionId);
      const [marketId, , lowerTick, upperTick, quantity] = positionData;

      // 현재 판매 가격 계산
      const proceeds = await contracts.core.getPrice(
        marketId,
        lowerTick,
        upperTick,
        -quantity // 음수로 판매 가격 계산
      );

      const minProceeds = (proceeds * BigInt(95)) / BigInt(100); // 5% 슬리피지

      const tx = await contracts.core.closePosition(positionId, minProceeds);
      await tx.wait();

      alert("포지션 판매 완료!");
    } catch (error: any) {
      alert(`판매 실패: ${error.message}`);
    }
  };

  if (loading) return <div>포지션 로딩 중...</div>;

  return (
    <div>
      <h3>내 포지션</h3>
      {data?.positionOpeneds?.map((position: any) => (
        <div key={position.positionId} className="position-card">
          <h4>포지션 #{position.positionId}</h4>
          <p>마켓: #{position.marketId}</p>
          <p>
            범위: {position.lowerTick}-{position.upperTick}
          </p>
          <p>수량: {ethers.formatEther(position.quantity)}</p>
          <p>구매가: ${ethers.formatUnits(position.cost, 6)}</p>
          <button onClick={() => sellPosition(position.positionId)}>
            판매
          </button>
        </div>
      )) || <p>포지션이 없습니다.</p>}
    </div>
  );
};
```

---

## 🧩 완성된 앱 예제

```typescript
// App.tsx
import { ApolloProvider } from "@apollo/client";
import { apolloClient } from "./lib/apollo";
import { WalletConnect } from "./components/WalletConnect";
import { MarketList } from "./components/MarketList";
import { PriceDistribution } from "./components/PriceDistribution";
import { BuyPosition } from "./components/BuyPosition";
import { MyPositions } from "./components/MyPositions";

function App() {
  const [selectedMarket, setSelectedMarket] = useState("0");
  const [userAddress, setUserAddress] = useState("");

  return (
    <ApolloProvider client={apolloClient}>
      <div className="app">
        <header>
          <h1>CLMSR 예측 마켓</h1>
          <WalletConnect onConnect={setUserAddress} />
        </header>

        <main>
          <div className="left-panel">
            <MarketList onSelectMarket={setSelectedMarket} />
          </div>

          <div className="center-panel">
            <PriceDistribution marketId={selectedMarket} />
          </div>

          <div className="right-panel">
            <BuyPosition marketId={parseInt(selectedMarket)} numTicks={100} />
            {userAddress && <MyPositions userAddress={userAddress} />}
          </div>
        </main>
      </div>
    </ApolloProvider>
  );
}
```

---

## 🎨 기본 스타일링

```css
/* styles.css */
.app {
  display: grid;
  grid-template-rows: auto 1fr;
  height: 100vh;
}

header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  background: #f8f9fa;
  border-bottom: 1px solid #dee2e6;
}

main {
  display: grid;
  grid-template-columns: 300px 1fr 300px;
  gap: 1rem;
  padding: 1rem;
  overflow: hidden;
}

.market-card,
.position-card {
  border: 1px solid #dee2e6;
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 1rem;
}

.buy-position {
  background: white;
  border: 1px solid #dee2e6;
  border-radius: 8px;
  padding: 1rem;
}

.buy-position label {
  display: block;
  margin-bottom: 0.5rem;
}

.buy-position input {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  margin-top: 0.25rem;
}

button {
  background: #007bff;
  color: white;
  border: none;
  padding: 0.75rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  width: 100%;
  margin-top: 1rem;
}

button:disabled {
  background: #6c757d;
  cursor: not-allowed;
}

button:hover:not(:disabled) {
  background: #0056b3;
}
```

---

## 🚀 다음 단계

1. **고급 시각화**: Chart.js, D3.js로 더 정교한 가격 분포 차트
2. **실시간 업데이트**: 서브그래프 폴링 최적화 또는 WebSocket 연동
3. **거래 UX 개선**: 슬리피지 설정, 가격 임팩트 계산, 거래 시뮬레이션
4. **에러 핸들링**: Toast 알림, 트랜잭션 상태 추적
5. **모바일 대응**: 반응형 디자인, PWA 지원
6. **테스팅**: Jest, Cypress를 통한 자동화 테스트

## 🎯 아키텍처 요약

- **데이터 조회**: 서브그래프(인덱서) → GraphQL → 실시간 차트
- **거래 실행**: React → Ethers.js → 컨트랙트 → 블록체인

## 📚 추가 리소스

- [전체 API 가이드](./SUBGRAPH_API.md)
- [컨트랙트 연동 상세 가이드](./CONTRACT_INTEGRATION.md)
- [메인 README](./README.md)

---

**이제 시작하세요!** 🎉

위 코드를 복사-붙여넣기하여 5분 만에 기본적인 CLMSR 앱을 만들 수 있습니다.
