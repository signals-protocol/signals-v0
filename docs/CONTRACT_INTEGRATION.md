# CLMSR Contract Integration Guide

> Complete guide for interacting with CLMSR contracts deployed on Citrea Testnet

## 🏗️ Contract Information

### Deployed Addresses

```typescript
const CONTRACTS_PROD = {
  // Main contracts (Citrea Production)
  CLMSRMarketCore: "0xE480ca1C63B6dd929af1EeA4D3de1073942F3cEf",
  CLMSRPosition: "0xB4c33Df898F8139D784ADE1aDCa9B5979898fE03",

  // Signals USD token (Production deployment)
  SUSD: "0xE32527F8b3f142a69278f22CdA334d70644b9743",

  // Libraries (Production deployment)
  FixedPointMathU: "0x629E255320Ab520062A07F22A8a407CFbad62025",
  LazyMulSegmentTree: "0xA3574e839e675045c67956eC2AfCA15FC9b844d5",
};

const CONTRACTS_DEV = {
  // Main contracts (Citrea Development)
  CLMSRMarketCore: "0x971F9bcE130743BB3eFb37aeAC2050cD44d7579a",
  CLMSRPosition: "0xe163497F304ad4b7482C84Bc82079d46050c6e93",

  // Signals USD token (same)
  SUSD: "0xE32527F8b3f142a69278f22CdA334d70644b9743",

  // Libraries (Development deployment)
  FixedPointMathU: "0x38E8b884baEbC730d7129EF64dC0A0888dC5AcC1",
  LazyMulSegmentTree: "0x5fA54D601320691D57E4DAd0d8c0F4A96323727c",
};
```

### Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   CLMSRManager  │────│ CLMSRMarketCore │────│ CLMSRPosition   │
│   (Future)      │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                       ┌─────────────────┐
                       │      SUSD       │
                       │   (ERC-20)      │
                       └─────────────────┘
```

> **Note**: Current deployment order:
>
> 1. Deploy a Manager contract first
> 2. Deploy CLMSRMarketCore with the Manager address
> 3. Update the Manager contract with the Core address if needed

### Contract Verification Status

✅ All contracts verified on Citrea Explorer

**Production:**

- [CLMSRMarketCore](https://explorer.testnet.citrea.xyz/address/0xE480ca1C63B6dd929af1EeA4D3de1073942F3cEf#code)
- [SUSD](https://explorer.testnet.citrea.xyz/address/0xE32527F8b3f142a69278f22CdA334d70644b9743#code)
- [CLMSRPosition](https://explorer.testnet.citrea.xyz/address/0xB4c33Df898F8139D784ADE1aDCa9B5979898fE03#code)

**Development:**

- [CLMSRMarketCore](https://explorer.testnet.citrea.xyz/address/0x971F9bcE130743BB3eFb37aeAC2050cD44d7579a#code)
- [CLMSRPosition](https://explorer.testnet.citrea.xyz/address/0xe163497F304ad4b7482C84Bc82079d46050c6e93#code)

---

## ⚙️ Basic Setup

### 1. Web3 Provider Setup

```typescript
import { ethers } from "ethers";

// Connect wallet like MetaMask
const provider = new ethers.providers.Web3Provider(window.ethereum);
const signer = provider.getSigner();

// Or direct RPC connection
const provider = new ethers.providers.JsonRpcProvider(
  "https://rpc.testnet.citrea.xyz"
);

// Network verification and auto-switch
const switchToNetwork = async () => {
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x13FB" }], // Citrea Testnet
    });
  } catch (error: any) {
    if (error.code === 4902) {
      // Add network if not exists
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
```

### 2. Contract Instance Creation

```typescript
// Get ABI from hardhat artifacts or copy from etherscan
import { CLMSRMarketCoreABI, SUSDABI, CLMSRPositionABI } from "./abi";

const createContracts = (signer: ethers.Signer) => {
  const coreContract = new ethers.Contract(
    CONTRACTS_PROD.CLMSRMarketCore,
    CLMSRMarketCoreABI,
    signer
  );

  const susdContract = new ethers.Contract(
    CONTRACTS_PROD.SUSD,
    SUSDABI,
    signer
  );

  const positionContract = new ethers.Contract(
    CONTRACTS_PROD.CLMSRPosition,
    CLMSRPositionABI,
    signer
  );

  return { coreContract, susdContract, positionContract };
};
```

---

## 🎯 Understanding Tick System

### Tick and Bin Relationship

CLMSR system uses two coordinate systems:

- **Tick**: Integer representing actual probability value (e.g.: 100, 200, 300)
- **Bin**: 0-based index used in segment tree (internal implementation)

### Market Parameters

```typescript
interface MarketParams {
  minTick: number; // Minimum tick value (e.g.: 0)
  maxTick: number; // Maximum tick value (e.g.: 10000)
  tickSpacing: number; // Tick spacing (e.g.: 100)
}

// Example: minTick=0, maxTick=10000, tickSpacing=100
// Valid ticks: 0, 100, 200, 300, ..., 10000
// Valid ranges: [0,100), [100,200), [200,300), ..., [9900,10000)
```

### Position Range Rules

1. **lowerTick < upperTick**: Lower bound must be less than upper bound
2. **tickSpacing alignment**: `(upperTick - lowerTick) % tickSpacing === 0`
3. **No same tick**: `lowerTick !== upperTick`
4. **Multiple ranges allowed**: Multiple consecutive ranges are possible

---

## 📖 View Functions

### 1. Market Information Query

#### Basic Market Info

```typescript
// Method 1: Direct access to public markets mapping (simple)
const market = await coreContract.markets(marketId);

// Method 2: Call getMarket function (safer - throws error for non-existent markets)
const market = await coreContract.getMarket(marketId);

// Both methods return the same Market struct
interface Market {
  isActive: boolean;
  settled: boolean;
  startTimestamp: bigint;
  endTimestamp: bigint;
  settlementTick: bigint;
  minTick: bigint;
  maxTick: bigint;
  tickSpacing: bigint;
  numBins: number;
  liquidityParameter: bigint;
  positionEventsCursor: number;
  positionEventsEmitted: boolean;
}
```

#### Market Status Check

```typescript
const checkMarketStatus = async (marketId: number) => {
  // Use getMarket function (recommended - automatically verifies market existence)
  const market = await coreContract.getMarket(marketId);

  return {
    id: marketId,
    isActive: market.isActive,
    settled: market.settled,
    timeLeft: market.endTimestamp - BigInt(Math.floor(Date.now() / 1000)),
    tickRange: `${market.minTick} ~ ${market.maxTick}`,
    spacing: market.tickSpacing,
  };

  // Direct access to markets mapping also possible (faster)
  // const market = await coreContract.markets(marketId);
};
```

#### Market Query (Deployment File Based)

```typescript
// Full market query - recommend using subgraph or event logs
const getAllMarkets = async () => {
  // In practice, querying from subgraph is more efficient
  // Or parse MarketCreated event logs

  const markets = [];
  for (let i = 1; i <= 10; i++) {
    // Example range
    try {
      const market = await coreContract.getMarket(i);
      markets.push({ id: i, ...market });
    } catch (error) {
      break; // Market doesn't exist
    }
  }
  return markets;
};
```

### 2. Price Queries

#### Position Cost Calculation

```typescript
interface PriceInfo {
  cost: string; // Total cost in SUSD
  effectivePrice: string; // Price per unit
}

const getPositionCost = async (
  marketId: number,
  lowerTick: number,
  upperTick: number,
  quantity: bigint
): Promise<PriceInfo> => {
  // Use calculateOpenCost function (actual existing function)
  const cost = await coreContract.getOpenCost(
    marketId,
    lowerTick,
    upperTick,
    quantity
  );

  return {
    cost: ethers.formatUnits(cost, 6), // SUSD has 6 decimals
    effectivePrice: ethers.formatUnits((cost * BigInt(1e6)) / quantity, 6),
  };
};
```

#### Position Change Cost Query

```typescript
// Position increase cost
const getIncreaseCost = async (
  marketId: number,
  positionId: bigint,
  additionalQuantity: bigint
) => {
  return await coreContract.getIncreaseCost(
    marketId,
    positionId,
    additionalQuantity
  );
};

// Position decrease proceeds
const getDecreaseProceeds = async (
  marketId: number,
  positionId: bigint,
  decreaseQuantity: bigint
) => {
  return await coreContract.getDecreaseProceeds(
    marketId,
    positionId,
    decreaseQuantity
  );
};

// Complete position liquidation proceeds
const getCloseProceeds = async (marketId: number, positionId: bigint) => {
  return await coreContract.getCloseProceeds(marketId, positionId);
};

// Settled position claim amount
const getClaimAmount = async (positionId: bigint) => {
  return await coreContract.getClaimAmount(positionId);
};
```

### 3. Position Queries

#### User Position List

```typescript
interface UserPosition {
  positionId: bigint;
  marketId: number;
  lowerTick: number;
  upperTick: number;
  quantity: bigint;
  owner: string; // msg.sender becomes owner
}

const getUserPositions = async (
  userAddress: string
): Promise<UserPosition[]> => {
  // Get position IDs from Position contract
  const positionIds = await positionContract.getPositionsByOwner(userAddress);

  const positions = [];
  for (const positionId of positionIds) {
    const position = await positionContract.getPosition(positionId);
    positions.push({
      positionId,
      marketId: position.marketId,
      lowerTick: position.lowerTick,
      upperTick: position.upperTick,
      quantity: position.quantity,
      owner: userAddress, // Queried user is owner
    });
  }

  return positions;
};
```

#### Position Value Calculation

```typescript
const getPositionValue = async (positionId: bigint) => {
  // Calculate amount receivable when selling current position
  const position = await positionContract.getPosition(positionId);
  const marketId = position.marketId;

  return await coreContract.getCloseProceeds(marketId, positionId);
};
```

### 4. Balance and Allowance Queries

#### SUSD Balance

```typescript
const getSUSDBalance = async (userAddress: string): Promise<string> => {
  const balance = await susdContract.balanceOf(userAddress);
  return ethers.formatUnits(balance, 6); // SUSD has 6 decimals
};

// Check approval for contract
const getSUSDAllowance = async (userAddress: string): Promise<string> => {
  const allowance = await susdContract.allowance(
    userAddress,
    CONTRACTS_PROD.CLMSRMarketCore
  );
  return ethers.formatUnits(allowance, 6);
};
```

---

## ✍️ State-Changing Functions

### 1. Initial Setup

#### SUSD Approval

```typescript
const approveSUSD = async (amount?: bigint): Promise<void> => {
  // Unlimited approval (recommended) or specific amount approval
  const approvalAmount = amount || ethers.MaxUint256;

  const tx = await susdContract.approve(
    CONTRACTS_PROD.CLMSRMarketCore,
    approvalAmount
  );
  await tx.wait();

  console.log("SUSD approval completed:", tx.hash);
};

// Mint test SUSD (testnet only)
const mintTestSUSD = async (amount: bigint): Promise<void> => {
  const tx = await susdContract.mint(amount);
  await tx.wait();

  console.log(`${ethers.formatUnits(amount, 6)} SUSD minted successfully`);
};
```

### 2. Position Trading

#### Open Position (Purchase)

```typescript
interface OpenPositionParams {
  marketId: number;
  lowerTick: number;
  upperTick: number;
  quantity: bigint;
  maxCost: bigint; // Slippage protection
  deadlineMinutes?: number; // Default 10 minutes
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

  // Query market information
  const market = await coreContract.markets(marketId);

  // Input validation
  if ((upperTick - lowerTick) % Number(market.tickSpacing) !== 0) {
    throw new Error("Tick range doesn't match tickSpacing");
  }

  if (lowerTick >= upperTick) {
    throw new Error("Invalid tick range (lowerTick >= upperTick)");
  }

  if (lowerTick === upperTick) {
    throw new Error("Cannot open position with same tick");
  }

  // Check estimated price
  const estimatedCost = await coreContract.getOpenCost(
    marketId,
    lowerTick,
    upperTick,
    quantity
  );

  if (estimatedCost > maxCost) {
    throw new Error(
      `Estimated cost exceeds max cost: ${estimatedCost} > ${maxCost}`
    );
  }

  // Execute transaction
  const deadline = Math.floor(Date.now() / 1000) + deadlineMinutes * 60;
  const userAddress = await signer.getAddress();

  const tx = await coreContract.openPosition(
    userAddress,
    marketId,
    lowerTick,
    upperTick,
    quantity,
    maxCost,
    deadline
  );

  const receipt = await tx.wait();
  console.log("Position opened successfully:", receipt.hash);

  // Extract position ID from events
  const openEvent = receipt.events?.find(
    (event) => event.event === "PositionOpened"
  );

  return openEvent?.args?.positionId || 0n;
};
```

#### Increase Position

```typescript
const increasePosition = async (
  marketId: number,
  positionId: bigint,
  additionalQuantity: bigint,
  maxCost: bigint
): Promise<void> => {
  const deadline = Math.floor(Date.now() / 1000) + 600; // 10 minutes

  const tx = await coreContract.increasePosition(
    marketId,
    positionId,
    additionalQuantity,
    maxCost,
    deadline
  );

  await tx.wait();
  console.log("Position increased successfully:", tx.hash);
};
```

#### Decrease Position

```typescript
const decreasePosition = async (
  marketId: number,
  positionId: bigint,
  decreaseQuantity: bigint,
  minProceeds: bigint
): Promise<void> => {
  const deadline = Math.floor(Date.now() / 1000) + 600; // 10 minutes

  const tx = await coreContract.decreasePosition(
    marketId,
    positionId,
    decreaseQuantity,
    minProceeds,
    deadline
  );

  await tx.wait();
  console.log("Position decreased successfully:", tx.hash);
};
```

#### Close Position

```typescript
const closePosition = async (
  marketId: number,
  positionId: bigint,
  minProceeds: bigint
): Promise<void> => {
  const deadline = Math.floor(Date.now() / 1000) + 600; // 10 minutes

  const tx = await coreContract.closePosition(
    marketId,
    positionId,
    minProceeds,
    deadline
  );

  await tx.wait();
  console.log("Position closed successfully:", tx.hash);
};
```

### 3. Batch Position Settlement (v1.2.0)

Large-scale markets' gas limit issue solution using batch processing settlement system.

#### Market Settlement (Step 1)

```typescript
// Market settlement - only MarketSettled event emitted
const settleMarket = async (
  marketId: number,
  settlementTick: number
): Promise<void> => {
  const tx = await coreContract.settleMarket(marketId, settlementTick);
  await tx.wait();

  console.log("Market settlement completed - batch processing needed");
};
```

#### Batch Position Event Emission (Step 2)

```typescript
// Emit PositionSettled events in batches (owner only)
const emitPositionBatch = async (
  marketId: number,
  batchSize: number = 100
): Promise<void> => {
  const tx = await coreContract.emitPositionSettledBatch(marketId, batchSize);
  await tx.wait();

  console.log(
    `Batch processing completed - processed up to ${batchSize} positions`
  );
};

// Repeat execution for all position processing
const processAllPositions = async (marketId: number): Promise<void> => {
  let done = false;
  const batchSize = 100;

  while (!done) {
    const tx = await coreContract.emitPositionSettledBatch(marketId, batchSize);
    const receipt = await tx.wait();

    // Check completion status from PositionEventsProgress event
    const progressEvents = receipt.logs.filter(
      (log) =>
        log.topics[0] ===
        coreContract.interface.getEventTopic("PositionEventsProgress")
    );

    if (progressEvents.length > 0) {
      const event = coreContract.interface.parseLog(progressEvents[0]);
      done = event.args.done;
      console.log(
        `Progress: ${event.args.from}-${event.args.to}, completed: ${done}`
      );
    }

    // Slight delay to prevent gas limit issues
    if (!done) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  console.log("All position settlement events processing completed");
};
```

### 4. Post-Settlement Processing

#### Claim Payout (After Settlement)

```typescript
const claimPayout = async (positionId: bigint): Promise<void> => {
  // Check if market is settled
  const positionData = await positionContract.getPosition(positionId);
  const marketId = positionData.marketId;
  const market = await coreContract.markets(marketId);

  if (!market.settled) {
    throw new Error("Market not yet settled");
  }

  const tx = await coreContract.claimPayout(positionId);
  await tx.wait();

  console.log("Payout claimed successfully:", tx.hash);
};
```

---

## 📡 Event Listening

### 1. Real-time Event Monitoring

```typescript
// Position creation detection
coreContract.on(
  "PositionOpened",
  (positionId, marketId, lowerTick, upperTick, quantity, cost) => {
    console.log("🆕 New position:", {
      positionId: positionId.toString(),
      marketId: marketId.toString(),
      range: `${lowerTick}-${upperTick}`,
      quantity: ethers.formatUnits(quantity, 0),
      cost: ethers.formatUnits(cost, 6),
    });
  }
);

// Market settlement detection
coreContract.on("MarketSettled", (marketId, settlementTick) => {
  console.log("🏁 Market settled:", {
    marketId: marketId.toString(),
    winningTick: settlementTick.toString(),
  });
});

// Batch settlement progress detection (v1.2.0)
coreContract.on("PositionEventsProgress", (marketId, from, to, done) => {
  console.log("📊 Batch settlement progress:", {
    marketId: marketId.toString(),
    range: `${from}-${to}`,
    completed: done,
  });
});
```

### 2. Filtered Event Listening

```typescript
// Listen to specific market only
const listenToMarket = (marketId: number) => {
  const filter = coreContract.filters.PositionOpened(null, marketId);

  coreContract.on(
    filter,
    (positionId, marketId, lowerTick, upperTick, quantity, cost) => {
      console.log(`New position in market ${marketId}:`, {
        positionId: positionId.toString(),
        range: `${lowerTick}-${upperTick}`,
        cost: ethers.formatUnits(cost, 6),
      });
    }
  );
};
```

### 3. Historical Event Query

```typescript
// Query past events
const getMarketHistory = async (marketId: number) => {
  const filter = coreContract.filters.PositionOpened(null, marketId);
  const events = await coreContract.queryFilter(filter, -10000); // Last 10,000 blocks

  return events.map((event) => ({
    positionId: event.args.positionId.toString(),
    lowerTick: event.args.lowerTick.toString(),
    upperTick: event.args.upperTick.toString(),
    quantity: ethers.formatUnits(event.args.quantity, 0),
    cost: ethers.formatUnits(event.args.cost, 6),
    blockNumber: event.blockNumber,
    transactionHash: event.transactionHash,
  }));
};
```

---

## 🛠️ Utility Functions

### 1. Data Type Conversion

```typescript
// Tick conversion utilities
const tickToPrice = (
  tick: number,
  minTick: number,
  maxTick: number
): number => {
  return (tick - minTick) / (maxTick - minTick);
};

const priceToTick = (
  price: number,
  minTick: number,
  maxTick: number
): number => {
  return Math.floor(price * (maxTick - minTick) + minTick);
};

// SUSD amount formatting
const formatSUSD = (amount: bigint): string => {
  return `${ethers.formatUnits(amount, 6)} SUSD`;
};

const parseSUSD = (amount: string): bigint => {
  return ethers.parseUnits(amount, 6);
};
```

### 2. Validation Functions

```typescript
// Tick range validation
const validateTickRange = (
  lowerTick: number,
  upperTick: number,
  minTick: number,
  maxTick: number,
  tickSpacing: number
): boolean => {
  if (lowerTick >= upperTick) return false;
  if (lowerTick < minTick || upperTick > maxTick) return false;
  if ((upperTick - lowerTick) % tickSpacing !== 0) return false;
  return true;
};

// Amount validation
const validateAmount = (amount: string): boolean => {
  try {
    const parsed = ethers.parseUnits(amount, 6);
    return parsed > 0n;
  } catch {
    return false;
  }
};
```

### 3. Formatting Functions

```typescript
// Market status formatting
const formatMarketStatus = (market: any) => {
  const now = Math.floor(Date.now() / 1000);
  const timeLeft = Number(market.endTimestamp) - now;

  return {
    isActive: market.isActive,
    settled: market.settled,
    timeLeft:
      timeLeft > 0
        ? `${Math.floor(timeLeft / 3600)}h ${Math.floor(
            (timeLeft % 3600) / 60
          )}m`
        : "Expired",
    tickRange: `${market.minTick} ~ ${market.maxTick}`,
    spacing: market.tickSpacing.toString(),
  };
};

// Position summary formatting
const formatPosition = (position: any) => {
  return {
    id: position.positionId.toString(),
    market: position.marketId.toString(),
    range: `${position.lowerTick} ~ ${position.upperTick}`,
    quantity: ethers.formatUnits(position.quantity, 0),
    probability: `${((position.upperTick - position.lowerTick) / 100).toFixed(
      1
    )}%`,
  };
};
```

---

## 🔧 Error Handling

### 1. Common Error Types

```typescript
// Market-related errors
const handleMarketError = (error: any) => {
  if (error.message.includes("MarketNotFound")) {
    return "Market does not exist";
  }
  if (error.message.includes("MarketNotActive")) {
    return "Market is not active";
  }
  if (error.message.includes("MarketExpired")) {
    return "Market has expired";
  }
  return "Unknown market error";
};

// Position-related errors
const handlePositionError = (error: any) => {
  if (error.message.includes("InsufficientBalance")) {
    return "Insufficient SUSD balance";
  }
  if (error.message.includes("InsufficientAllowance")) {
    return "Insufficient SUSD allowance";
  }
  if (error.message.includes("InvalidTickRange")) {
    return "Invalid tick range";
  }
  if (error.message.includes("SlippageExceeded")) {
    return "Slippage tolerance exceeded";
  }
  return "Unknown position error";
};
```

### 2. Retry Logic

```typescript
// Transaction retry with exponential backoff
const executeWithRetry = async (
  transaction: () => Promise<any>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<any> => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await transaction();
    } catch (error) {
      if (i === maxRetries - 1) throw error;

      const delay = baseDelay * Math.pow(2, i);
      console.log(`Transaction failed, retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};
```

---

## 📊 Advanced Integration

### 1. Real-time Price Monitoring

```typescript
class PriceMonitor {
  private coreContract: ethers.Contract;
  private marketId: number;
  private callbacks: Array<(price: string) => void> = [];

  constructor(coreContract: ethers.Contract, marketId: number) {
    this.coreContract = coreContract;
    this.marketId = marketId;
    this.startMonitoring();
  }

  onPriceChange(callback: (price: string) => void) {
    this.callbacks.push(callback);
  }

  private startMonitoring() {
    // Listen for price-affecting events
    const filter = this.coreContract.filters.PositionOpened(
      null,
      this.marketId
    );

    this.coreContract.on(filter, async () => {
      await this.updatePrice();
    });
  }

  private async updatePrice() {
    try {
      // Calculate current price for reference position
      const cost = await this.coreContract.getOpenCost(
        this.marketId,
        100,
        200, // Reference position
        ethers.parseUnits("1", 0) // 1 unit
      );

      const price = ethers.formatUnits(cost, 6);
      this.callbacks.forEach((callback) => callback(price));
    } catch (error) {
      console.error("Price update failed:", error);
    }
  }
}
```

### 2. Portfolio Management

```typescript
class PortfolioManager {
  private coreContract: ethers.Contract;
  private positionContract: ethers.Contract;
  private userAddress: string;

  constructor(contracts: any, userAddress: string) {
    this.coreContract = contracts.coreContract;
    this.positionContract = contracts.positionContract;
    this.userAddress = userAddress;
  }

  async getPortfolioSummary() {
    const positionIds = await this.positionContract.getPositionsByOwner(
      this.userAddress
    );

    let totalValue = 0n;
    let totalCost = 0n;
    const positions = [];

    for (const positionId of positionIds) {
      const position = await this.positionContract.getPosition(positionId);
      const currentValue = await this.coreContract.getCloseProceeds(
        position.marketId,
        positionId
      );

      positions.push({
        id: positionId.toString(),
        marketId: position.marketId.toString(),
        value: ethers.formatUnits(currentValue, 6),
        quantity: ethers.formatUnits(position.quantity, 0),
      });

      totalValue += currentValue;
    }

    return {
      totalPositions: positions.length,
      totalValue: ethers.formatUnits(totalValue, 6),
      positions,
    };
  }
}
```

---

## 🔗 Reference Links

- **Contract Source Code**: [contracts/core/CLMSRMarketCore.sol](../contracts/core/CLMSRMarketCore.sol)
- **Citrea Testnet Explorer**: [explorer.testnet.citrea.xyz](https://explorer.testnet.citrea.xyz)
- **Ethers.js Documentation**: [docs.ethers.org](https://docs.ethers.org)
- **CLMSR Paper**: [Academic Resource Link]

---

**🚀 Ready for production-grade CLMSR integrations!**
