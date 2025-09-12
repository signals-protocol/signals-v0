# CLMSR Quick Start Guide

> Connect with CLMSR system in 5 minutes

## ⚡ Quick Setup (Copy & Paste)

### 1. Environment Setup

```typescript
// config.ts
export const CONFIG = {
  // Network settings - Citrea Testnet
  CITREA_TESTNET: {
    chainId: 5115,
    rpcUrl: "https://rpc.testnet.citrea.xyz",
    name: "Citrea Testnet",
    explorer: "https://explorer.testnet.citrea.xyz",
  },

  // Contract addresses (Citrea Production)
  CONTRACTS_PROD: {
    CLMSRMarketCore: "0xE480ca1C63B6dd929af1EeA4D3de1073942F3cEf",
    SUSD: "0xE32527F8b3f142a69278f22CdA334d70644b9743",
    CLMSRPosition: "0xB4c33Df898F8139D784ADE1aDCa9B5979898fE03",
  },

  // Contract addresses (Citrea Development)
  CONTRACTS_DEV: {
    CLMSRMarketCore: "0x971F9bcE130743BB3eFb37aeAC2050cD44d7579a",
    SUSD: "0xE32527F8b3f142a69278f22CdA334d70644b9743",
    CLMSRPosition: "0xe163497F304ad4b7482C84Bc82079d46050c6e93",
  },

  // Subgraph endpoints (Goldsky)
  SUBGRAPH_URL_PROD:
    "https://api.goldsky.com/api/public/project_cme6kru6aowuy01tb4c9xbdrj/subgraphs/signals-v0-citrea-prod/1.0.0/gn",
  SUBGRAPH_URL_DEV:
    "https://api.goldsky.com/api/public/project_cme6kru6aowuy01tb4c9xbdrj/subgraphs/signals-v0-citrea-dev/1.0.0/gn",
};
```

### 2. Basic Dependencies

```bash
npm install ethers@^6.0.0 @apollo/client graphql
```

### 3. Real-time Chart Component (Complete)

```tsx
import React, { useEffect, useState } from "react";
import { ApolloClient, InMemoryCache, gql, useQuery } from "@apollo/client";

// Apollo client setup (Production)
const client = new ApolloClient({
  uri: "https://api.goldsky.com/api/public/project_cme6kru6aowuy01tb4c9xbdrj/subgraphs/signals-v0-citrea-prod/1.0.0/gn",
  cache: new InMemoryCache(),
});

// GraphQL query - new bin system
const GET_MARKET_DISTRIBUTION = gql`
  query GetMarketDistribution($marketId: String!) {
    marketDistribution(id: $marketId) {
      id
      totalBins
      totalSum
      minFactor
      maxFactor
      avgFactor
      totalVolume
      binFactors
      binVolumes
      tickRanges # "[tick, tick+spacing)" strings
      lastSnapshotAt
      distributionHash
      version
    }
  }
`;

interface MarketChartProps {
  marketId: string;
}

export const MarketChart: React.FC<MarketChartProps> = ({ marketId }) => {
  const { loading, error, data } = useQuery(GET_MARKET_DISTRIBUTION, {
    variables: { marketId },
    pollInterval: 5000, // Update every 5 seconds
    client,
  });

  if (loading) return <div>Loading chart...</div>;
  if (error) return <div>Error: {error.message}</div>;
  if (!data?.marketDistribution) {
    return <div>Market not found.</div>;
  }

  // Convert data for visualization
  const chartData = data.marketDistribution.binFactors.map(
    (factor: string, index: number) => ({
      x: index,
      factor: parseFloat(factor),
      volume: parseFloat(data.marketDistribution.binVolumes[index]),
      range: data.marketDistribution.tickRanges[index], // "[tick, tick+spacing)"
    })
  );

  return (
    <div style={{ padding: "20px", border: "1px solid #ccc" }}>
      <h3>Market {marketId} Distribution Visualization</h3>
      <div>
        <p>Total bins: {data.marketDistribution.totalBins}</p>
        <p>
          Total sum: {parseFloat(data.marketDistribution.totalSum).toFixed(4)}
        </p>
        <p>
          Min/Max factor: {data.marketDistribution.minFactor} /{" "}
          {data.marketDistribution.maxFactor}
        </p>
      </div>

      {/* Simple chart visualization */}
      <div style={{ display: "flex", height: "200px", alignItems: "end" }}>
        {chartData.map((point, i) => (
          <div
            key={i}
            style={{
              width: "20px",
              height: `${
                (point.factor / parseFloat(data.marketDistribution.maxFactor)) *
                180
              }px`,
              backgroundColor: "#3498db",
              margin: "0 1px",
              position: "relative",
            }}
            title={`Range: ${point.range}, Factor: ${point.factor}, Volume: ${point.volume}`}
          />
        ))}
      </div>
      <p>Last update: {new Date().toLocaleTimeString()}</p>
    </div>
  );
};
```

### 4. Position Trading Component (Complete)

```tsx
import React, { useState, useEffect } from "react";
import { ethers } from "ethers";

// Contract ABI (essential functions only) - matching actual contract types
const MARKET_ABI = [
  "function openPosition(address trader, uint256 marketId, int256 lowerTick, int256 upperTick, uint256 quantity, uint256 maxCost, uint256 deadline) external returns (uint256)",
  "function getOpenCost(uint256 marketId, int256 lowerTick, int256 upperTick, uint256 quantity) external view returns (uint256)",
  "function markets(uint256) external view returns (bool isActive, bool settled, uint64 startTimestamp, uint64 endTimestamp, int256 settlementTick, int256 minTick, int256 maxTick, int256 tickSpacing, uint32 numBins, uint256 liquidityParameter)",
];

const SUSD_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
];

interface PositionTraderProps {
  marketId: number;
}

export const PositionTrader: React.FC<PositionTraderProps> = ({ marketId }) => {
  const [lowerTick, setLowerTick] = useState<number>(0);
  const [upperTick, setUpperTick] = useState<number>(100);
  const [quantity, setQuantity] = useState<string>("1000000"); // 1 SUSD in micro units
  const [estimatedCost, setEstimatedCost] = useState<string>("0");
  const [loading, setLoading] = useState(false);

  // Price estimation
  const estimatePrice = async () => {
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const marketContract = new ethers.Contract(
        "0xE480ca1C63B6dd929af1EeA4D3de1073942F3cEf",
        MARKET_ABI,
        provider
      );

      const cost = await marketContract.getOpenCost(
        marketId,
        lowerTick,
        upperTick,
        ethers.parseUnits(quantity, 0)
      );

      setEstimatedCost(ethers.formatUnits(cost, 6)); // SUSD has 6 decimals
    } catch (error) {
      console.error("Price estimation failed:", error);
    }
  };

  // Buy position
  const buyPosition = async () => {
    try {
      if (!window.ethereum) {
        alert("Please connect MetaMask.");
        return;
      }

      setLoading(true);
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const userAddress = await signer.getAddress();

      const marketContract = new ethers.Contract(
        "0xE480ca1C63B6dd929af1EeA4D3de1073942F3cEf",
        MARKET_ABI,
        signer
      );
      const susdContract = new ethers.Contract(
        "0xE32527F8b3f142a69278f22CdA334d70644b9743",
        SUSD_ABI,
        signer
      );

      console.log("Approving SUSD...");
      const costWei = ethers.parseUnits(estimatedCost, 6);
      const approveTx = await susdContract.approve(
        "0xE480ca1C63B6dd929af1EeA4D3de1073942F3cEf",
        costWei
      );
      await approveTx.wait();

      // 2. Buy position
      const quantityWei = ethers.parseUnits(quantity, 0);
      const deadline = Math.floor(Date.now() / 1000) + 600; // 10 minutes

      console.log("Buying position...");
      const tx = await marketContract.openPosition(
        userAddress,
        marketId,
        lowerTick,
        upperTick,
        quantityWei,
        costWei // Set maxCost same as estimated cost
      );

      const receipt = await tx.wait();
      console.log("Position purchase completed:", receipt.hash);
      alert(`Position purchase successful! Transaction: ${receipt.hash}`);
    } catch (error) {
      console.error("Position purchase failed:", error);
      alert("Position purchase failed. Check console for details.");
    } finally {
      setLoading(false);
    }
  };

  // Auto-set upperTick (CLMSR only allows consecutive 2 ticks)
  useEffect(() => {
    setUpperTick(lowerTick + 100); // Assuming tickSpacing = 100
  }, [lowerTick]);

  return (
    <div style={{ padding: "20px", border: "1px solid #ddd" }}>
      <h3>Position Trading</h3>

      <div>
        <label>Start Tick:</label>
        <input
          type="number"
          value={lowerTick}
          onChange={(e) => setLowerTick(Number(e.target.value))}
          step="100"
        />
      </div>

      <div>
        <label>End Tick:</label>
        <input
          type="number"
          value={upperTick}
          readOnly
          title="CLMSR only supports consecutive ticks"
        />
      </div>

      <div>
        <label>Quantity (micro SUSD):</label>
        <input
          type="text"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
      </div>

      <div>
        <button onClick={estimatePrice}>Estimate Price</button>
        <button onClick={buyPosition} disabled={loading}>
          {loading ? "Processing..." : "Buy Position"}
        </button>
      </div>

      {estimatedCost !== "0" && (
        <div>
          <p>Estimated cost: {estimatedCost} SUSD</p>
          <p>
            Tick range: {lowerTick} ~ {upperTick}
          </p>
        </div>
      )}
    </div>
  );
};
```

## 📊 Data Queries (5 minutes)

### 1. GraphQL Client Setup

```typescript
import { ApolloClient, InMemoryCache, gql } from "@apollo/client";

const client = new ApolloClient({
  uri: "https://api.goldsky.com/api/public/project_cme6kru6aowuy01tb4c9xbdrj/subgraphs/signals-v0-citrea-prod/1.0.0/gn",
  cache: new InMemoryCache(),
});
```

### 2. Market List Query

```tsx
const GET_MARKETS = gql`
  query GetMarkets {
    markets(first: 10, orderBy: startTimestamp, orderDirection: desc) {
      id
      marketId
      isActive
      settled
      numBins
      minTick
      maxTick
      tickSpacing
      liquidityParameter
    }
  }
`;

const MarketList = () => {
  const { loading, error, data } = useQuery(GET_MARKETS);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      <h2>Market List</h2>
      {data.markets.map((market: any) => (
        <div key={market.id}>
          <h3>Market #{market.marketId}</h3>
          <p>Bin count: {market.numBins}</p>
          <p>
            Tick range: {market.minTick} ~ {market.maxTick}
          </p>
          <p>Tick spacing: {market.tickSpacing}</p>
          <p>Status: {market.settled ? "Settled" : "Active"}</p>
        </div>
      ))}
    </div>
  );
};
```

### 3. Real-time Distribution Visualization

```tsx
const GET_DISTRIBUTION = gql`
  query GetDistribution($marketId: String!) {
    marketDistribution(id: $marketId) {
      totalBins
      totalSum
      binFactors
      binVolumes
      tickRanges # "[tick, tick+spacing)" strings
    }
  }
`;

const DistributionChart = ({ marketId }: { marketId: string }) => {
  const { loading, error, data } = useQuery(GET_DISTRIBUTION, {
    variables: { marketId },
    pollInterval: 3000, // Update every 3 seconds (query data from subgraph indexer)
  });

  if (loading) return <div>Loading distribution data...</div>;

  // Convert data from subgraph for chart use
  const chartData =
    data?.marketDistribution?.binFactors?.map((factor: string, i: number) => ({
      index: i,
      factor: parseFloat(factor),
      volume: parseFloat(data.marketDistribution.binVolumes[i]),
      range: data.marketDistribution.tickRanges[i], // "[tick, tick+spacing)"
    })) || [];

  // Chart configuration (using Chart.js or similar)
  const chartConfig = {
    type: "bar",
    data: {
      labels: chartData.map((d: any) => d.range),
      datasets: [
        {
          label: "Factor",
          data: chartData.map((d: any) => d.factor),
          backgroundColor: "rgba(54, 162, 235, 0.8)",
        },
        {
          label: "Volume",
          data: chartData.map((d: any) => d.volume),
          backgroundColor: "rgba(255, 99, 132, 0.8)",
        },
      ],
    },
  };

  return (
    <div>
      <h3>Market #{marketId} Real-time Distribution Visualization</h3>
      <p>📊 Query bin-level Factor and Volume data from subgraph</p>
      <p>
        Total sum: {data?.marketDistribution?.totalSum} | Update: v
        {data?.marketDistribution?.version}
      </p>
      {/* Chart component here */}
    </div>
  );
};
```

## 💰 Trading Features (10 minutes)

### 1. Wallet Connection

```tsx
const WalletConnect = () => {
  const [account, setAccount] = useState<string>("");

  const connectWallet = async () => {
    if (window.ethereum) {
      try {
        await window.ethereum.request({ method: "eth_requestAccounts" });
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        const signer = provider.getSigner();
        const address = await signer.getAddress();
        setAccount(address);

        // Network verification
        await ensureCorrectNetwork();
      } catch (error) {
        console.error("Wallet connection failed:", error);
      }
    }
  };

  const ensureCorrectNetwork = async () => {
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x13FB" }], // Citrea Testnet
      });
    } catch (error: any) {
      if (error.code === 4902) {
        // Add network
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: "0x13FB",
              chainName: "Citrea Testnet",
              rpcUrls: ["https://rpc.testnet.citrea.xyz"],
              nativeCurrency: {
                name: "Citrea Bitcoin",
                symbol: "CBTC",
                decimals: 8,
              },
            },
          ],
        });
      }
    }
  };

  return (
    <div>
      {account ? (
        <p>
          Connected: {account.slice(0, 6)}...{account.slice(-4)}
        </p>
      ) : (
        <button onClick={connectWallet}>Connect Wallet</button>
      )}
    </div>
  );
};
```

### 2. Position Purchase Component

```tsx
const PositionBuyer = ({ marketId }: { marketId: number }) => {
  const [lowerTick, setLowerTick] = useState(0);
  const [upperTick, setUpperTick] = useState(100);
  const [quantity, setQuantity] = useState("1000000");
  const [estimatedCost, setEstimatedCost] = useState("0");
  const [loading, setLoading] = useState(false);

  // Market info query
  const [marketInfo, setMarketInfo] = useState({
    minTick: 0,
    maxTick: 10000,
    tickSpacing: 100,
  });

  // Real-time price calculation
  const calculatePrice = async () => {
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const contract = new ethers.Contract(
        "0xE480ca1C63B6dd929af1EeA4D3de1073942F3cEf",
        MARKET_ABI,
        provider
      );

      const cost = await contract.getOpenCost(
        marketId,
        lowerTick,
        upperTick,
        quantity
      );
      setEstimatedCost(ethers.formatUnits(cost, 6));
    } catch (error) {
      console.error("Price calculation failed:", error);
    }
  };

  const buyPosition = async () => {
    try {
      setLoading(true);
      // 💰 Execute trade with direct contract call
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      // 1. Check SUSD approval and get user address
      const signer = provider.getSigner();
      const userAddress = await signer.getAddress();

      const marketContract = new ethers.Contract(
        CONTRACT_ADDRESS,
        MARKET_ABI,
        signer
      );
      const susdContract = new ethers.Contract(SUSD_ADDRESS, SUSD_ABI, signer);

      const costWei = ethers.parseUnits(estimatedCost, 6);
      const maxCostWithSlippage = costWei.mul(105).div(100); // 5% slippage

      if (true) {
        console.log("Approving SUSD...");
        const approveTx = await susdContract.approve(
          CONTRACT_ADDRESS,
          maxCostWithSlippage
        );
        await approveTx.wait();
      }

      // 2. Buy position (send transaction directly to blockchain)
      const tx = await marketContract.openPosition(
        userAddress, // trader address (first parameter)
        marketId,
        lowerTick,
        upperTick, // user selected range
        quantity,
        maxCostWithSlippage,
        Math.floor(Date.now() / 1000) + 600 // 10 min deadline
      );

      const receipt = await tx.wait();
      console.log("Position purchase completed:", receipt.hash);

      alert("Position purchase completed!");
    } catch (error) {
      console.error("Position purchase failed:", error);
      alert(`Purchase failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h3>Buy Position</h3>

      <div>
        <label>
          Lower tick ({Number(minTick)}-{Number(maxTick - tickSpacing)}):
        </label>
        <input
          type="number"
          value={lowerTick}
          onChange={(e) => setLowerTick(Number(e.target.value))}
          min={marketInfo.minTick}
          max={marketInfo.maxTick - marketInfo.tickSpacing}
          step={marketInfo.tickSpacing}
        />
      </div>

      <div>
        <label>Upper tick:</label>
        <input
          type="number"
          value={upperTick}
          onChange={(e) => setUpperTick(Number(e.target.value))}
          min={lowerTick + marketInfo.tickSpacing}
          max={marketInfo.maxTick}
          step={marketInfo.tickSpacing}
        />
      </div>

      <div>
        <label>Quantity:</label>
        <input
          type="text"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
      </div>

      <div>
        <p>
          Selected tick range: {lowerTick} ~ {upperTick}
        </p>
        <p>
          Probability interpretation:{" "}
          {(
            ((upperTick - lowerTick) /
              (marketInfo.maxTick - marketInfo.minTick)) *
            100
          ).toFixed(2)}
          %
        </p>
      </div>

      <div>
        <button onClick={calculatePrice}>Calculate Price</button>
        <p>Estimated cost: ${estimatedCost} SUSD</p>
      </div>

      <button onClick={buyPosition} disabled={loading}>
        {loading ? "Purchasing..." : "Buy Position"}
      </button>
    </div>
  );
};
```

### 3. My Positions Query

```tsx
const GET_USER_POSITIONS = gql`
  query GetUserPositions($user: Bytes!) {
    userPositions(
      where: { user: $user, outcome: OPEN }
      orderBy: createdAt
      orderDirection: desc
    ) {
      id
      positionId
      marketId
      lowerTick
      upperTick
      currentQuantity
      totalCostBasis
      realizedPnL
      outcome
      isClaimed
      createdAt
      lastUpdated
    }
  }
`;

const MyPositions = ({ userAddress }: { userAddress: string }) => {
  const { loading, error, data } = useQuery(GET_USER_POSITIONS, {
    variables: { user: userAddress.toLowerCase() },
    pollInterval: 10000, // Update every 10 seconds
  });

  if (loading) return <div>Loading positions...</div>;
  if (error) return <div>Error: {error.message}</div>;

  const positions = data?.userPositions || [];

  return (
    <div>
      <h3>My Positions ({positions.length})</h3>
      {positions.map((position: any) => (
        <div
          key={position.id}
          style={{
            border: "1px solid #ccc",
            padding: "10px",
            margin: "10px 0",
          }}
        >
          <h4>Position #{position.positionId}</h4>
          <p>Market: #{position.marketId}</p>
          <p>
            Range: {position.lowerTick} ~ {position.upperTick}
          </p>
          <p>Quantity: {position.currentQuantity}</p>
          <p>
            Cost Basis: ${ethers.formatUnits(position.totalCostBasis, 6)} SUSD
          </p>
          <p>PnL: ${ethers.formatUnits(position.realizedPnL, 6)} SUSD</p>
          <p>Status: {position.outcome}</p>

          {/* Current position info query and sell price calculation
          <PositionActions positionId={position.positionId} /> */}
        </div>
      ))}
    </div>
  );
};
```

## 🎨 Frontend Architecture (Advanced)

### 1. State Management (Redux Toolkit)

```typescript
// store/marketSlice.ts
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";

export const fetchMarketData = createAsyncThunk(
  "market/fetchData",
  async (marketId: string) => {
    // GraphQL query execution
    const response = await client.query({
      query: GET_MARKET_DISTRIBUTION,
      variables: { marketId },
    });
    return response.data;
  }
);

const marketSlice = createSlice({
  name: "market",
  initialState: {
    distributions: {},
    loading: false,
    error: null,
  },
  reducers: {
    updateDistribution: (state, action) => {
      const { marketId, data } = action.payload;
      state.distributions[marketId] = data;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(fetchMarketData.fulfilled, (state, action) => {
      state.loading = false;
      // Update state with fetched data
    });
  },
});
```

### 2. Real-time Updates (WebSocket + Polling)

```typescript
// hooks/useRealtimeMarket.ts
import { useEffect, useState } from "react";

export const useRealtimeMarket = (marketId: string) => {
  const [data, setData] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(Date.now());

  useEffect(() => {
    // Polling strategy: query subgraph every 3 seconds
    const interval = setInterval(async () => {
      try {
        const result = await client.query({
          query: GET_MARKET_DISTRIBUTION,
          variables: { marketId },
          fetchPolicy: "network-only", // Always fetch fresh data
        });

        if (result.data?.marketDistribution) {
          setData(result.data.marketDistribution);
          setLastUpdate(Date.now());
        }
      } catch (error) {
        console.error("Real-time update failed:", error);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [marketId]);

  return { data, lastUpdate };
};
```

### 3. Advanced Chart (Chart.js Integration)

```tsx
// components/AdvancedChart.tsx
import React from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

interface AdvancedChartProps {
  marketData: any;
}

export const AdvancedChart: React.FC<AdvancedChartProps> = ({ marketData }) => {
  const chartData = {
    labels: marketData.tickRanges, // each = "[tick, tick+spacing)"
    datasets: [
      {
        label: "Factor (Probability)",
        data: marketData.binFactors.map((f: string) => parseFloat(f)),
        backgroundColor: "rgba(54, 162, 235, 0.6)",
        borderColor: "rgba(54, 162, 235, 1)",
        borderWidth: 1,
      },
      {
        label: "Volume (SUSD)",
        data: marketData.binVolumes.map((v: string) => parseFloat(v) / 1e6),
        backgroundColor: "rgba(255, 99, 132, 0.6)",
        borderColor: "rgba(255, 99, 132, 1)",
        borderWidth: 1,
        yAxisID: "y1",
      },
    ],
  };

  const options = {
    responsive: true,
    interaction: {
      mode: "index" as const,
      intersect: false,
    },
    plugins: {
      title: {
        display: true,
        text: `Market ${marketData.id} - Real-time Distribution`,
      },
      legend: {
        display: true,
      },
      tooltip: {
        callbacks: {
          label: function (context: any) {
            if (context.datasetIndex === 0) {
              return `Factor: ${context.parsed.y.toFixed(6)}`;
            } else {
              return `Volume: $${context.parsed.y.toFixed(2)} SUSD`;
            }
          },
        },
      },
    },
    scales: {
      x: {
        title: {
          display: true,
          text: "Tick Ranges",
        },
      },
      y: {
        type: "linear" as const,
        display: true,
        position: "left" as const,
        title: {
          display: true,
          text: "Factor Value",
        },
      },
      y1: {
        type: "linear" as const,
        display: true,
        position: "right" as const,
        title: {
          display: true,
          text: "Volume (SUSD)",
        },
        grid: {
          drawOnChartArea: false,
        },
      },
    },
  };

  return <Bar data={chartData} options={options} />;
};
```

### 4. Complete Trading Interface

```tsx
// components/TradingInterface.tsx
import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import { useAccount, useContractWrite, useContractRead } from "wagmi";

export const TradingInterface = ({ marketId }: { marketId: number }) => {
  const { address } = useAccount();
  const [tradeParams, setTradeParams] = useState({
    lowerTick: 0,
    upperTick: 100,
    quantity: "1000000",
    maxCost: "0",
  });

  // Read market information
  const { data: marketInfo } = useContractRead({
    address: "0xE480ca1C63B6dd929af1EeA4D3de1073942F3cEf",
    abi: MARKET_ABI,
    functionName: "markets",
    args: [marketId],
  });

  // Estimate cost
  const { data: estimatedCost } = useContractRead({
    address: "0xE480ca1C63B6dd929af1EeA4D3de1073942F3cEf",
    abi: MARKET_ABI,
    functionName: "getOpenCost",
    args: [
      marketId,
      tradeParams.lowerTick,
      tradeParams.upperTick,
      tradeParams.quantity,
    ],
    enabled: !!tradeParams.quantity,
  });

  // Contract write for buying position
  const { write: buyPosition, isLoading: isBuying } = useContractWrite({
    address: "0xE480ca1C63B6dd929af1EeA4D3de1073942F3cEf",
    abi: MARKET_ABI,
    functionName: "openPosition",
    onSuccess: (data) => {
      console.log("Position opened:", data);
      alert("Position successfully opened!");
    },
    onError: (error) => {
      console.error("Failed to open position:", error);
      alert("Failed to open position");
    },
  });

  const handleBuy = () => {
    if (!address) {
      alert("Please connect wallet");
      return;
    }

    buyPosition({
      args: [
        address,
        marketId,
        tradeParams.lowerTick,
        tradeParams.upperTick,
        tradeParams.quantity,
        estimatedCost,
        Math.floor(Date.now() / 1000) + 600, // 10 min deadline
      ],
    });
  };

  return (
    <div className="trading-interface">
      <h3>Trade Position - Market #{marketId}</h3>

      <div className="trade-inputs">
        <div>
          <label>Lower Tick:</label>
          <input
            type="number"
            value={tradeParams.lowerTick}
            onChange={(e) =>
              setTradeParams({
                ...tradeParams,
                lowerTick: Number(e.target.value),
              })
            }
          />
        </div>

        <div>
          <label>Upper Tick:</label>
          <input
            type="number"
            value={tradeParams.upperTick}
            onChange={(e) =>
              setTradeParams({
                ...tradeParams,
                upperTick: Number(e.target.value),
              })
            }
          />
        </div>

        <div>
          <label>Quantity:</label>
          <input
            type="text"
            value={tradeParams.quantity}
            onChange={(e) =>
              setTradeParams({
                ...tradeParams,
                quantity: e.target.value,
              })
            }
          />
        </div>
      </div>

      <div className="trade-info">
        <p>
          Estimated Cost:{" "}
          {estimatedCost ? ethers.formatUnits(estimatedCost, 6) : "0"} SUSD
        </p>
        <p>
          Probability Range: {tradeParams.lowerTick} ~ {tradeParams.upperTick}
        </p>
      </div>

      <button
        onClick={handleBuy}
        disabled={isBuying || !estimatedCost}
        className="buy-button"
      >
        {isBuying ? "Opening Position..." : "Open Position"}
      </button>
    </div>
  );
};
```

## 🚀 Production Deployment

### 1. Environment Configuration

```typescript
// config/environment.ts
export const getConfig = () => {
  const environment = process.env.NODE_ENV || "development";

  const configs = {
    development: {
      SUBGRAPH_URL:
        "https://api.goldsky.com/api/public/project_cme6kru6aowuy01tb4c9xbdrj/subgraphs/signals-v0-citrea-dev/1.0.0/gn",
      CONTRACTS: {
        CLMSRMarketCore: "0x971F9bcE130743BB3eFb37aeAC2050cD44d7579a",
        SUSD: "0xE32527F8b3f142a69278f22CdA334d70644b9743",
        CLMSRPosition: "0xe163497F304ad4b7482C84Bc82079d46050c6e93",
      },
    },
    production: {
      SUBGRAPH_URL:
        "https://api.goldsky.com/api/public/project_cme6kru6aowuy01tb4c9xbdrj/subgraphs/signals-v0-citrea-prod/1.0.0/gn",
      CONTRACTS: {
        CLMSRMarketCore: "0xE480ca1C63B6dd929af1EeA4D3de1073942F3cEf",
        SUSD: "0xE32527F8b3f142a69278f22CdA334d70644b9743",
        CLMSRPosition: "0xB4c33Df898F8139D784ADE1aDCa9B5979898fE03",
      },
    },
  };

  return configs[environment];
};
```

### 2. Build & Deploy

```bash
# Production build
npm run build

# Deploy to Vercel/Netlify
npm run deploy

# Environment variables
NEXT_PUBLIC_ENVIRONMENT=production
NEXT_PUBLIC_CHAIN_ID=5115
NEXT_PUBLIC_RPC_URL=https://rpc.testnet.citrea.xyz
```

## 📋 Development Checklist

1. **Setup**: ✅ Environment configuration, dependencies
2. **Data**: ✅ GraphQL queries, real-time updates
3. **UI**: ✅ Chart visualization, responsive design
4. **Trading**: ✅ Wallet connection, position management
5. **State**: ✅ Redux/Context, error handling
6. **Testing**: Automated testing with Jest and Cypress

## 🎯 Architecture Summary

- **Data Query**: Subgraph(Indexer) → GraphQL → Real-time charts
- **Trade Execution**: React → Ethers.js → Contract → Blockchain
- **State Management**: Redux Toolkit → Optimistic updates
- **Real-time**: Polling (3s) + WebSocket for instant notifications

---

**🚀 Ready to build production-grade CLMSR applications!**
