# Settlement Pipeline

This guide documents the operational guarantees behind daily settlement. Use it when you need to audit settlement behaviour or reason about trust assumptions.

## Data source and timing

- **Oracle input** – Signals ingests CoinMarketCap's BTC/USD daily close. The price is captured once the 00:00–23:59 UTC candle finalises.
- **Submission window** – Operations broadcast `settleMarket(marketId, settlementValue)` as soon as the canonical close is available. Timestamps on-chain prove when settlement occurred.
- **Tick mapping** – The submitted value is converted to a settlement tick by clamping it inside the configured tick range and dividing by the tick spacing.

## Batch emission

Large markets can hold thousands of open positions. To keep gas bounded we emit settlement events in deterministic batches.

1. `settleMarket` records the settlement tick and value but does not loop through positions.
2. A follow-up job repeatedly calls `emitPositionSettledBatch(limit)` until the contract signals completion.
3. Each batch stores progress markers so rerunning the job is idempotent.

The Goldsky subgraph tracks `PositionSettled` and `PositionEventsProgress` events so you can independently confirm that batches completed.

## Claim semantics

- Claims unlock as soon as a position's settled flag is set. There is **no expiry**.
- Claims transfer the original stake (rounded down per the CLMSR spec) and burn the position token.
- Claim status and outstanding payouts are mirrored in the subgraph so dashboards can highlight unclaimed positions.

## Operational transparency

- Deployment manifests under `deployments/environments/` record every upgrade and address involved in settlement.
- Verification scripts (for example `verification/check-market-pnl.ts`) reconcile on-chain balances with expected CLMSR outcomes.
- Incident response: if CoinMarketCap is unavailable, settlement is delayed until the official close is verifiable. The market remains paused until then but trader funds stay in the pool.

For a trader-facing explanation see [Settlement & Claims](../user/settlement.md). For the math that guarantees bounded maker loss, read [Safety Bounds & Parameters](../mechanism/safety-parameters.md).
