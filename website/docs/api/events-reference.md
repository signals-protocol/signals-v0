# Events Reference

Signals emits structured events at every step of the market lifecycle. This guide explains what each event represents, when it fires, and how indexers or analytics pipelines can consume the data safely.

## Core market events

- **`MarketCreated(uint256 marketId, int256 minTick, int256 maxTick, int256 tickSpacing, uint256 alpha, uint64 startTimestamp, uint64 endTimestamp)`** — emitted when the daily market is created. It records the outcome grid and trading window so indexers can prepare derived entities before trades arrive.
- **`MarketSettled(uint256 marketId, int256 settlementTick, uint256 settlementValue)`** — broadcast after the designated reference value is verified and submitted. The value is clamped inside the configured tick range; downstream services can recompute payouts from the tick alone.

## Position lifecycle events

- **`PositionOpened(uint256 positionId, address owner, uint256 marketId, int256 lowerTick, int256 upperTick, uint256 quantity, uint256 cost)`** — minted once per new ERC 721 position token. Costs are rounded up per CLMSR rules so every position carries non-zero capital.
- **`PositionIncreased(uint256 positionId, uint256 quantity, uint256 cost)`** — adds exposure at the current probability surface. Quantity and cost values respect the same rounding as the open event.
- **`PositionDecreased(uint256 positionId, uint256 quantity, uint256 proceeds)`** — partially unwinds exposure and returns SUSD at current probabilities. Upcoming releases will floor-round proceeds to match the whitepaper.
- **`PositionClosed(uint256 positionId, uint256 proceeds)`** — final exit before settlement; once quantity hits zero the token burns.
- **`PositionSettled(uint256 positionId, uint256 payout, bool won)`** — emitted when settlement finalises. It records whether the band won and the exact claimable amount.
- **`PositionClaimed(uint256 positionId, address owner, uint256 payout)`** — emitted when the owner calls `claimPayout`. The contract transfers SUSD back and burns the token.

## Points and incentives

- **`PointsGranted(address account, uint8 reason, uint128 amount)`** — emitted by `PointsGranter`. `reason` codes: 1 = Activity, 2 = Performance, 3 = Risk Bonus. Off-chain programs can aggregate these events to run leaderboards or rewards.

## Subgraph alignment

Goldsky-hosted subgraphs index every event above. Notable entities include:
- `Market`, `BinState`, `MarketStats` for per-market configuration and health metrics.
- `UserPosition`, `Trade`, `UserStats` for trader-level analytics.
- `PositionSettled` and `PositionClaimed` to monitor outstanding claims; combine them with `MarketStats.unclaimedPayout` to track liabilities.

Follow the [Subgraph API guide](./subgraph.md) for endpoints and query examples. When replaying history, paginate by `marketId` and `positionId` to avoid missing events across long replays.

## Processing tips

- Derive probabilities or payouts using the SDK helpers (`clmsr-sdk/src/utils/math.ts`) to remain consistent with on-chain rounding.
- Label events with the block timestamp and number when storing analytics data—this makes it easy to reconcile with manifests and dispatcher logs.

Need the formulas behind these values? Open the [Key Formulas cheat sheet](../mechanism/key-formulas.md). For a trader-facing explanation, see [Settlement & Claims](../user/settlement.md).
