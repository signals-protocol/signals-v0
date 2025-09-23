# Signals Protocol Architecture

Signals is more than a trading UI—it is an on-chain CLMSR market, a daily operations pipeline, and a data layer that powers the front end and analytics. This page ties those pieces together so you can understand how the service actually runs.

## Components at a glance

| Layer | What it does | Notes |
| --- | --- | --- |
| Smart contracts | Execute CLMSR trades, mint/burn range NFTs, settle markets, emit batched events | Core contracts live under `contracts/core/` and `contracts/points/`. |
| Operations pipeline | Create daily markets, submit settlement prices, emit settlement batches, run health checks | Currently driven by CLI jobs that call the core contract methods; oracle automation is on the roadmap. |
| Price ingestion | Fetch CoinMarketCap’s BTC/USD daily close and feed it to `settleMarket` | Operator verifies the close before broadcasting; timestamps remain on-chain. |
| Data & analytics | Mirror on-chain events, compute user stats, leaderboards, PnL and points | Goldsky-hosted subgraph plus verification scripts maintain parity with chain state. |
| Front end | Shows the live BTC market: chart, range selector, rules, leaderboards, wallet actions | The Signals app consumes the subgraph and contracts via ethers.js. |

## Markets & ticks

- Daily market covering BTC closing price.
- Tick configuration: `minTick = 100_000`, `maxTick = 140_000`, `tickSpacing = 100` (i.e. $100 increments covering $100,000–$140,000). The scripts create 401 ticks / 400 bands.
- Liquidity parameter `α` defaults to 1 (can be overridden via `ALPHA`). Maker loss is bounded by `α × ln(numberOfBins)`.
- Positions are ERC‑721 tokens storing `marketId`, `lowerTick`, `upperTick`, `quantity`, and timestamps.

## Trade lifecycle

1. **Open / increase** – `openPosition` and `increasePosition` charge SUSD (6 decimals) using `fromWadRoundUp`, eliminating zero-cost attacks.
2. **Decrease / close** – return SUSD based on current weights (proceeds rounding is switching to floor in the next release).
3. **Range data structure** – a lazy multiplicative segment tree keeps exponential weights for every band (`LazyMulSegmentTree.sol`).
4. **Events** – all trades emit structured events consumed by the subgraph (`PositionOpened`, `PositionIncreased`, etc.).

## Daily operations

- **Create Market** – The operator submits the day’s tick bounds, timestamps, and liquidity parameter; the core contract auto-increments `marketId` and initialises the segment tree.
- **Monitor** – Health-check scripts interrogate tree sums, pause status, and invariants to ensure markets remain in a safe state.
- **Settle** – Once the CoinMarketCap close is confirmed, the operator calls `settleMarket` with the price in micro SUSD (`settlementValue`).
- **Batch events** – Follow-up jobs iterate `emitPositionSettledBatch(limit)` until the contract signals completion via `PositionEventsProgress(..., done = true)`.

Roadmap: automate CMC ingestion and wire an oracle so settlement can be trust-minimised.

## Data surface

- **Subgraph** – Goldsky hosts dev/prod deployments (`clmsr-subgraph`). Key entities include:
  - `Market`, `BinState`, `MarketStats` – per-market configuration, current factors, PnL, and unclaimed payout.
  - `UserPosition`, `Trade`, `UserStats` – trader-level stats, realized PnL, and gas spend.
  - `PositionSettled`, `PositionClaimed` – used to drive settlement banners and claim status.
- **Points system** – `PointsGranter` emits events (reasons 1=Activity, 2=Performance, 3=Risk Bonus). The subgraph enforces per-day activity limits (3 per day) and computes risk bonuses when positions are held for ≥1 hour.

## Front end state flow

From `signals-app/src/components/features/main` (see `complete_codebase_app.md`):

- `MainProvider` composes `useBTCState`, `useChart`, `usePrediction`, and `useAction` hooks so the range selector, chart, and modals share a single store.
- The UI layout mirrors the app: title/countdown, probability chart, rules, range descriptor, input widget, leaderboards, and “My Positions”.
- After a successful prediction, `PredictionSuccessModal` surfaces payout info and multipliers, referencing the same probability math as the contracts.

## How the pieces talk to each other

1. Users interact with the web app → `signals-app` calls the CLMSR core via ethers.js and tracks balances via the subgraph.
2. Operations CLI scripts (run by Signals) create and settle markets, keeping the on-chain state current.
3. The subgraph ingests events from both trading and operations, populating the leaderboard, points, and analytics.
4. Leaderboards/points data are rendered in the app (`components/features/main/view/leaderboards`), giving the community instant feedback.

## Further reading

- [Mechanism Spec](../mechanism/overview.md) – maths behind CLMSR execution and rounding.
- [Security & Testing](../security/audits.md) – guardrails, test suites, and upcoming improvements.
- [Governance](../governance/parameters.md) – current owner powers and upgrade process.

Have questions about this architecture? Ping the Signals team—we’re happy to walk through the scripts, contracts, or subgraph in more detail.
