# Protocol Parameters

Configuration parameters that govern the signals-v0 protocol behavior.

## Market Parameters

### Core Constants

| Parameter             | Value     | Description                                         |
| --------------------- | --------- | --------------------------------------------------- |
| **Tick Spacing**      | Variable  | Distance between consecutive ticks (set per market) |
| **Min Tick Range**    | 2         | Minimum number of ticks in a market                 |
| **Max Tick Range**    | 1000      | Maximum number of ticks in a market                 |
| **Min Position Size** | 0.01 SUSD | Minimum position size to prevent dust               |

### Liquidity Parameters

| Parameter             | Value         | Description                                 |
| --------------------- | ------------- | ------------------------------------------- |
| **Alpha (α)**         | Variable      | Liquidity parameter (set per market)        |
| **Max Loss Bound**    | α × ln(n)     | Mathematical maximum loss for market makers |
| **Initial Liquidity** | Equal weights | All bins start with weight = 1              |

## Technical Limits

### Gas & Performance

| Parameter             | Value | Description                             |
| --------------------- | ----- | --------------------------------------- |
| **Max Chunks Per TX** | 10    | Limit on exponential computation chunks |
| **Flush Threshold**   | 2^32  | Auto-flush limit for lazy segment tree  |
| **Max Factor**        | 2^64  | Maximum multiplicative factor           |
| **Min Factor**        | 2^-64 | Minimum multiplicative factor           |

### Position Management

| Parameter              | Value    | Description                           |
| ---------------------- | -------- | ------------------------------------- |
| **Max Position Count** | 1000     | Maximum positions per user per market |
| **Settlement Window**  | 24 hours | Time window for market settlement     |
| **Claim Period**       | 90 days  | Time limit for claiming winnings      |

## Precision & Rounding

### Internal Arithmetic

| Parameter              | Value                             | Description                        |
| ---------------------- | --------------------------------- | ---------------------------------- |
| **Internal Precision** | 18 decimals (WAD)                 | All calculations use WAD precision |
| **External Precision** | 6 decimals (USDC)                 | User-facing amounts in USDC        |
| **Rounding Policy**    | Ceil for costs, Floor for payouts | Prevents rounding arbitrage        |

## Security Parameters

### Access Control

| Role         | Permissions                           | Description                 |
| ------------ | ------------------------------------- | --------------------------- |
| **Owner**    | Market creation, settlement, upgrades | Full protocol control       |
| **Operator** | Market settlement                     | Can resolve market outcomes |
| **User**     | Position trading                      | Can open/close positions    |

### Emergency Controls

| Parameter             | Value         | Description                      |
| --------------------- | ------------- | -------------------------------- |
| **Pause Authority**   | Owner only    | Can pause trading in emergencies |
| **Upgrade Timelock**  | 48 hours      | Minimum delay for upgrades       |
| **Emergency Actions** | Pause/Unpause | Limited emergency capabilities   |

## Economic Model

### Settlement Currency

- **Primary Token**: SUSD (Synthetic USD)
- **Payout Ratio**: 1 SUSD per winning share
- **Transaction Fees**: Paid in cBTC (network native token)

### Points System

Points are awarded for:

- Opening positions
- Holding positions
- Accurate predictions
- Community participation

_Note: Points are for engagement tracking and do not represent monetary value._
