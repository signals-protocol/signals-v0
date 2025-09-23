# Events Reference

Signals emits structured events for every market lifecycle step. Use this guide when building indexers, analytics, or monitoring jobs.

## Core market events

| Event | Emitted by | Purpose |
| --- | --- | --- |
| `MarketCreated(uint256 marketId, int256 minTick, int256 maxTick, int256 tickSpacing, uint256 alpha, uint64 startTimestamp, uint64 endTimestamp)` | `CLMSRMarketCore` | Announces a new daily market and its configuration. |
| `MarketSettled(uint256 marketId, int256 settlementTick, uint256 settlementValue)` | `CLMSRMarketCore` | Records the settlement value submitted from CoinMarketCap. |
| `PositionEventsProgress(uint256 marketId, uint256 processed, uint256 total, bool done)` | `CLMSRMarketCore` | Reports progress during batched settlement emission. |

## Position lifecycle events

| Event | Trigger | Notes |
| --- | --- | --- |
| `PositionOpened(uint256 positionId, address owner, uint256 marketId, int256 lowerTick, int256 upperTick, uint256 quantity, uint256 cost)` | `openPosition` | Issued once per new position token. Cost is rounded up per CLMSR rules. |
| `PositionIncreased(uint256 positionId, uint256 quantity, uint256 cost)` | `increasePosition` | Adds size at current probabilities. |
| `PositionDecreased(uint256 positionId, uint256 quantity, uint256 proceeds)` | `decreasePosition` | Returns SUSD at current probabilities (future update will round down). |
| `PositionClosed(uint256 positionId, uint256 proceeds)` | `closePosition` | Final exit before settlement; burns the token once quantity hits zero. |
| `PositionSettled(uint256 positionId, uint256 payout, bool won)` | `emitPositionSettledBatch` | Marks whether the range won and records the claim amount (current contracts round payout up; upcoming releases will switch to floor per the CLMSR spec). |
| `PositionClaimed(uint256 positionId, address owner, uint256 payout)` | `claimPosition` | Transfers SUSD back to the owner and burns the token. |

## Points layer events

| Event | Meaning |
| --- | --- |
| `PointsGranted(address account, uint8 reason, uint128 amount)` | Emitted by `PointsGranter`. `reason` codes: 1 Activity, 2 Performance, 3 Risk Bonus. |

## Working with the subgraph

The Goldsky-hosted subgraph mirrors all events above:

- Endpoints listed in the [Subgraph API guide](./subgraph.md).
- Entities worth highlighting: `Market`, `BinState`, `UserPosition`, `Trade`, `PositionSettled`, `MarketStats`, `UserStats`.
- `MarketStats.unclaimedPayout` helps monitor post-settlement obligations, while `PositionSettled` plus `PositionClaimed` reveal who still needs to claim.

## Best practices

- Handle potential reorgs by monitoring `PositionEventsProgress.done`. Stop emitting batches only after the flag is `true`.
- Derive probabilities and PnL using the SDK helpers (`clmsr-sdk/src/utils/math.ts`) to stay aligned with CLMSR rounding rules.
- When running archival jobs, paginate by `marketId` and `positionId` to avoid missing events in large batches.

Need the underlying math? Revisit [Key Formulas](../mechanism/key-formulas.md). For a trader-focused view, see [Settlement & Claims](../user/settlement.md).
