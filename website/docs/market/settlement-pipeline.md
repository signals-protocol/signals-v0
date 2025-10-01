# Settlement Pipeline

This document is the operator's playbook for closing a Signals market. It explains every step from ingesting the official price to recording the final settlement so auditors and integrators know exactly what guarantees to expect.

## Capturing the official price

Signals relies on a designated reference price for each market. Operations capture the value once the configured observation window finalises. If the feed stalls or data is suspect, the market stays paused until a verifiable number is published—no settlement transaction is sent until the input is confirmed.

## Posting the settlement

With the price verified, the operator broadcasts `settleMarket(marketId, settlementValue)`. The contract clamps the submitted value into the configured tick range, stores the settlement tick and raw value, and emits a timestamped event. Importantly, this call does not iterate positions; it simply locks in the result and signals downstream jobs to begin.

## Finalising positions

Once the closing price is locked in, the core contracts expose the settled state to everyone. Operators verify that the transaction succeeded and that every open token now carries the `settled` flag. If the automation stack ever needs to retry, repeating the submission is safe because the settlement state is idempotent.

## Enabling claims

As soon as settlement finishes, each winning position is immediately claimable. Owners can call `claimPayout` to receive their payout (rounded according to the CLMSR spec) and burn the position NFT. There is no expiry window, but keeping claims current helps analytics and treasury reconciliation.

## Transparency and monitoring

- Settlement transactions and `claimPayout` events remain on-chain, giving the community a permanent audit trail.
- If the oracle feed is unavailable or inconsistent, operations pause the market so funds stay inside the pool until a verifiable close arrives.

For the trader-facing walkthrough, see [Settlement & Claims](../user/settlement.md). For the mechanism guarantees that bound maker loss, review [Safety Bounds & Parameters](../mechanism/safety-parameters.md).
