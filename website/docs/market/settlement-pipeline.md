# Settlement Pipeline

This document is the operator's playbook for closing a Signals market. It explains every step from ingesting the official price to emitting the final batch so auditors and integrators know exactly what guarantees to expect.

## Capturing the official price

Signals relies on CoinMarketCap's BTC/USD daily close. Operations capture the value once the 00:00-23:59 UTC candle finalises. If the feed stalls or data is suspect, the market stays paused until a verifiable number is published--no settlement transaction is sent until the input is confirmed.

## Posting the settlement

With the price verified, the operator broadcasts `settleMarket(marketId, settlementValue)`. The contract clamps the submitted value into the configured tick range, stores the settlement tick and raw value, and emits a timestamped event. Importantly, this call does not iterate positions; it simply locks in the result and signals downstream jobs to begin.

## Emitting batches

Settlement progresses through deterministic batches to keep gas bounded:
1. Automation calls `emitPositionSettledBatch(limit)` with a safe limit.
2. The contract walks a slice of positions, emits `PositionSettled` events, and advances an index.
3. A `PositionEventsProgress` event records the range covered. Automation repeats the call until `done = true` appears.

Because batches are idempotent, rerunning them after a hiccup never double-emits. The Goldsky subgraph indexes both events, giving operators and auditors a live view of progress.

## Enabling claims

As soon as a position is marked settled, its owner can call `claimPayout`. Claims transfer the remaining stake and payout (rounded according to the CLMSR spec) and burn the position NFT. There is no expiry window, but keeping claims current helps analytics and treasury reconciliation.

## Transparency and monitoring

- Deployment manifests under `deployments/environments/` show every contract address involved in settlement.
- Verification tools such as `verification/check-market-pnl.ts` and the public subgraph reconcile payouts against the CLMSR model.
- Incident response playbooks require pausing the market if the oracle feed is unavailable or inconsistent; traders remain safe because funds never leave the pool without a verifiable close.

For the trader-facing walkthrough, see [Settlement & Claims](../user/settlement.md). For the mechanism guarantees that bound maker loss, review [Safety Bounds & Parameters](../mechanism/safety-parameters.md).
