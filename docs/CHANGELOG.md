# CLMSR v1.2.0 Major Changes 📝

> **August 14, 2025** - Major Update: Batch Position Event Emission, Points System, Citrea Testnet Deployment

## 🚀 Major Update Summary

This v1.2.0 update represents the **biggest change** in the CLMSR system. It solves gas limit issues in large-scale markets and evolves into a **batch processing system**.

### ⭐ 3 Core Changes

1. **⚡ Batch Position Event Emission** - Large-scale settlement system without gas limits
2. **🎯 Points System Introduction** - Activity, Performance, Risk Bonus points
3. **🌍 Citrea Testnet Deployment** - Prediction markets on Bitcoin Layer 2

---

## 🎯 1. Points System

### Overview

A system providing **3 types of points** based on user trading activity and performance.

### Point Types

#### 🔥 Activity Points

- **Earning Condition**: When opening or increasing positions
- **Calculation Formula**: `A = cost ÷ 10` (6 decimals)
- **Example**: 1000 SUSD investment → 100 Activity Points
- **Purpose**: Basic activity rewards
- **Code**: `return cost.div(BigInt.fromI32(10));`

#### 🏆 Performance Points

- **Earning Condition**: When decreasing, closing, or settling positions with profit
- **Calculation Formula**: `P = max(realizedPnL, 0)` (6 decimals)
- **Example**: 500 SUSD profit → 500 Performance Points, loss → 0 Points
- **Purpose**: Performance-based rewards (0 points on loss)
- **Code**: `return realizedPnL.gt(0) ? realizedPnL : 0;`

#### 💎 Risk Bonus Points

- **Earning Condition**: Must hold position for 1+ hours (3600+ seconds)
- **Calculation Formula**:
  ```
  R = A × 0.3 × (1 + (marketRange - userRange) / marketRange)
  Final = min(R, 2A)
  ```
- **Detailed Logic**:
  1. **Holding Time Check**: `holdingSeconds < 3600` → 0 points
  2. **Range Risk**: Narrower position range (higher risk) increases bonus
  3. **Base Multiplier**: Activity Points × 30%
  4. **Risk Multiplier**: 1.0 ~ 2.0 (based on position range)
  5. **Max Limit**: Cannot exceed Activity Points × 2
- **Examples**:
  - A=100, 1 hour hold, 50% of market range → R = 100 × 0.3 × 1.5 = 45 Points
  - A=100, 30 min hold → 0 Points (time condition not met)
- **Purpose**: Incentivizes long-term holding and high-risk (narrow range) positions

### Subgraph Additional Fields

```graphql
# Added to Trade entity
type Trade {
  activityPt: BigInt! # Activity points (6 decimals)
  performancePt: BigInt! # Performance points (6 decimals)
  riskBonusPt: BigInt! # Risk Bonus points (6 decimals)
  # ... existing fields
}

# Added to UserStats entity
type UserStats {
  totalPoints: BigInt! # Cumulative point balance (6 decimals)
  # ... existing fields
}

# Added to UserPosition entity
type UserPosition {
  activityRemaining: BigInt! # Remaining Activity Points (OPEN/INCREASE accumulation - DECREASE/CLOSE deduction)
  weightedEntryTime: BigInt! # Weighted average entry time (for Risk Bonus holding time calculation)
  # ... existing fields
}

# activityRemaining calculation logic:
# - OPEN/INCREASE: += cost ÷ 10
# - DECREASE/CLOSE: -= (decrease quantity ÷ total quantity) × activityRemaining
# - SETTLE: = 0 (reset)

# weightedEntryTime calculation logic:
# - INCREASE: (existing time × existing quantity + current time × additional quantity) ÷ total quantity
# - DECREASE: maintain on partial sell, reset to 0 on full sell
# - SETTLE: = 0 (reset)
```

---

## 🏆 2. Position Results System

### Overview

Replaced the simple `isActive` field with a **4-state outcome system**.

### PositionOutcome States

#### 🟢 OPEN

- **Meaning**: Position is currently open and tradeable
- **Condition**: Market is active and position is not fully closed
- **Possible Actions**: INCREASE, DECREASE, CLOSE

#### 🔵 CLOSED

- **Meaning**: User manually closed position completely before market end
- **Condition**: Made quantity 0 through CLOSE trade
- **Feature**: Exited early regardless of settlement result

#### 🟡 WIN

- **Meaning**: Position won during market settlement
- **Condition**: Settlement tick is within position range `[lowerTick, upperTick)`
- **Reward**: SUSD payment equal to position quantity (1:1)

#### 🔴 LOSS

- **Meaning**: Position lost during market settlement
- **Condition**: Settlement tick is outside position range
- **Reward**: None (0 SUSD)

### Subgraph Changes

```graphql
# Before (v1.0.x)
type UserPosition {
  isActive: Boolean! # Simple active status
}

# After Change (v1.2.0)
type UserPosition {
  outcome: PositionOutcome! # OPEN/CLOSED/WIN/LOSS
  isClaimed: Boolean! # Whether winning position claimed
}

enum PositionOutcome {
  OPEN # Position open
  CLOSED # Manual close
  WIN # Win
  LOSS # Loss
}
```

---

## 📡 3. PositionSettled Event System

### Overview

A system that automatically determines and records **settlement results for all positions** when markets settle.

### Automatic Settlement Process

1. **Market Settlement**: Call `settleMarket(marketId, settlementTick)`
2. **Position Determination**: Automatic calculation of all position results
   - `lowerTick ≤ settlementTick < upperTick` → WIN (payout = quantity)
   - Otherwise → LOSS (payout = 0)
3. **Event Emission**: `PositionSettled` event for each position
4. **Subgraph Processing**: Execute `handlePositionSettled()` function
   - ✅ **Create PositionSettled entity**
   - ✅ **Update position status**: `outcome = WIN/LOSS`, `isClaimed = false`
   - ✅ **Calculate PnL**: `realizedPnL = payout - totalCostBasis`
   - ✅ **Calculate points**: Performance Points + Risk Bonus Points
   - ✅ **Calculate holding time**: `holdingSeconds = current time - weightedEntryTime`
   - ✅ **Update statistics**: Record UserStats win/loss, accumulate points
   - ✅ **Record SETTLE trade**: Create Trade entity (type: SETTLE)
   - ✅ **Reset fields**: `activityRemaining = 0`, `weightedEntryTime = 0`

### New Contract Events

```solidity
event PositionSettled(
    uint256 indexed positionId,
    address indexed trader,
    uint256 payout,
    bool isWin
);
```

### New Subgraph Entities

```graphql
type PositionSettled {
  id: Bytes! # transactionHash-logIndex
  positionId: BigInt! # Settled position ID
  trader: Bytes! # Trader address
  payout: BigInt! # Payout amount (6 decimals SUSD)
  isWin: Boolean! # Whether won
  blockNumber: BigInt!
  blockTimestamp: BigInt!
  transactionHash: Bytes!
}
```

### TradeType Changes

```graphql
# Before
enum TradeType {
  OPEN
  INCREASE
  DECREASE
  CLOSE
  CLAIM
}

# After
enum TradeType {
  OPEN
  INCREASE
  DECREASE
  CLOSE
  SETTLE # CLAIM → SETTLE
}
```

---

## 🌍 4. Batch Position Event Emission System

### Overview

A **batch processing-based position settlement system** to solve gas limit issues in large-scale markets.

### Problem

The existing `settleMarket` function emitted all `PositionSettled` events at once for all positions, causing gas limit issues in markets with many positions.

### Solution

#### 1. Market Struct Extension

```solidity
struct Market {
    // ... existing fields ...
    uint32 positionEventsCursor;   // Next emission start index
    bool positionEventsEmitted;    // All emission completion flag
}
```

#### 2. settleMarket Function Changes

- Remove position event emission loop
- Emit only `MarketSettled` event
- Initialize progress state for batch processing

#### 3. New Batch Function Addition

```solidity
function emitPositionSettledBatch(
    uint256 marketId,
    uint256 limit
) external onlyOwner marketExists(marketId) {
    // Cursor-based batch processing logic
    // Progress event emission
}
```

#### 4. Progress Tracking Event

```solidity
event PositionEventsProgress(
    uint256 indexed marketId,
    uint256 from,
    uint256 to,
    bool done
);
```

### Operation Method

1. Execute `settleMarket(marketId, settlementTick)` → Only `MarketSettled` emitted
2. Repeatedly call `emitPositionSettledBatch(marketId, limit)` for batch processing
3. Monitor progress with `PositionEventsProgress` events

---

## 💰 5. Token Change: USDC → SUSD

### Reason for Change

- **Branding Consistency**: Strengthen platform identity with "Signals USD"
- **Independence**: Reduce dependency on external stablecoins
- **Scalability**: Enable future token feature expansion

### Technical Changes

```typescript
// Changes in all documentation and code
"USDC" → "SUSD"
"USD Coin" → "Signals USD"
"0x5b3E..." → "0x9a0d..." // New contract address
```

### User Impact

- **Same Functionality**: Maintains 6 decimals, 1:1 USD pegging
- **UI Display**: Change display from "USDC" → "SUSD"
- **Wallet Setup**: Need to add new token address

---

## 📊 6. Subgraph API Changes

### Endpoint Updates

```
Before: The Graph Studio (deprecated)
After: Goldsky Production: https://api.goldsky.com/api/public/project_cme6kru6aowuy01tb4c9xbdrj/subgraphs/signals-v0-citrea-prod/1.0.0/gn
After: Goldsky Development: https://api.goldsky.com/api/public/project_cme6kru6aowuy01tb4c9xbdrj/subgraphs/signals-v0-citrea-dev/1.0.0/gn
```

### Major Query Changes

#### Position Query Filter Changes

```graphql
# Before
query GetUserPositions($user: Bytes!) {
  userPositions(where: { user: $user, isActive: true }) {
    # ...
  }
}

# After
query GetUserPositions($user: Bytes!) {
  userPositions(where: { user: $user, outcome: OPEN }) {
    positionId
    outcome
    isClaimed
    activityRemaining
    weightedEntryTime
    # ...
  }
}
```

#### Points Data Query

```graphql
# New query: User points query
query GetUserPoints($user: Bytes!) {
  userStats(id: $user) {
    totalPoints # Cumulative point balance (6 decimals)
  }

  trades(where: { user: $user }, orderBy: timestamp, orderDirection: desc) {
    id
    type
    activityPt # Activity points (6 decimals)
    performancePt # Performance points (6 decimals)
    riskBonusPt # Risk bonus (6 decimals)
    timestamp
    positionId
  }
}
```

#### Settlement Event Query

```graphql
# New query: Position settlement results query
query GetSettlements($trader: Bytes!) {
  positionSettleds(
    where: { trader: $trader }
    orderBy: blockTimestamp
    orderDirection: desc
  ) {
    id
    positionId
    trader
    payout # Payout amount (6 decimals SUSD)
    isWin # Whether won
    blockNumber
    blockTimestamp
    transactionHash
  }
}
```

---

## 🔧 7. Developer Guide

### Migration Checklist

#### Frontend Developers

- [ ] Change network settings to Citrea Testnet
- [ ] Update contract addresses (Citrea Production/Development)
- [ ] Change USDC → SUSD token display
- [ ] Use new Goldsky subgraph endpoints
- [ ] Implement points system UI
- [ ] Add outcome status display
- [ ] Implement batch settlement progress UI

#### Backend Developers

- [ ] Update subgraph queries
- [ ] Add PositionSettled event processing logic
- [ ] Implement points calculation logic
- [ ] Store settlement result data
- [ ] Implement batch settlement progress monitoring

#### Smart Contract Developers

- [ ] Implement PositionSettled event listeners
- [ ] Prepare Citrea network deployment scripts
- [ ] Implement points system verification logic
- [ ] Implement batch settlement function call logic

### Implementation Examples

#### 1. Points System Integration

```typescript
// Points data query
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

#### 2. Position Results Tracking

```typescript
// Position status-based query
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

#### 3. Settlement Results Query

```typescript
// Settlement event query
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

// Points calculation helper functions
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

## ⚠️ 8. Compatibility and Considerations

### Breaking Changes

1. **Subgraph Schema**: All existing queries need modification
2. **Network**: Completely different chain migration
3. **Token**: USDC → SUSD change requires token address update
4. **API Response**: Response structure changes due to new fields

### Migration Guide

1. **Subgraph**: Switch to Goldsky endpoints
2. **Wallet**: Add Citrea Testnet network
3. **Token**: Import SUSD token
4. **Queries**: Change to outcome-based filtering
5. **Batch Processing**: Add settlement progress monitoring

### Comparison with Previous Versions

```typescript
// v1.0.x (previous)
interface OldUserPosition {
  isActive: boolean;
  // No points system
  // No settlement result tracking
}

// v1.2.0 (current)
interface NewUserPosition {
  outcome: "OPEN" | "CLOSED" | "WIN" | "LOSS";
  isClaimed: boolean;
  activityRemaining: string;
  weightedEntryTime: string;
}
```

---

## 🎉 9. Future Plans

### Short-term (1-2 weeks)

- [ ] Build points leaderboard system
- [ ] Add prediction accuracy statistics
- [ ] Implement user performance dashboard

### Mid-term (1-2 months)

- [ ] Introduce points-based reward system
- [ ] Connect NFT badge system
- [ ] Social features (friend battles, rankings, etc.)

### Long-term (3-6 months)

- [ ] Multi-chain support (Ethereum, Polygon, Bitcoin Layer 2, etc.)
- [ ] Provide advanced analytics tools
- [ ] Add institutional investor features
- [ ] Implement automatic batch settlement bot

---

## 📞 10. Support and Contact

### Technical Support

- **Discord**: [signals-v0 channel](https://discord.gg/signals-v0)
- **GitHub Issues**: [GitHub Repository](https://github.com/signals-v0/clmsr)
- **Documentation**: [docs.signals-v0.io](https://docs.signals-v0.io)

### Developer Resources

- **API Documentation**: [SUBGRAPH_API.md](./SUBGRAPH_API.md)
- **Integration Guide**: [CONTRACT_INTEGRATION.md](./CONTRACT_INTEGRATION.md)
- **Quick Start**: [QUICK_START.md](./QUICK_START.md)

---

**Last Updated**: August 14, 2025  
**Version**: v1.2.0  
**Author**: CLMSR Development Team

