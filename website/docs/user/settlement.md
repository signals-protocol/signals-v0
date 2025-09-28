# Settlement & Claims

When the countdown hits zero, the trading UI goes quiet but the protocol keeps working. This guide explains what happens from the final tick to the moment you withdraw your payout so you can follow along with confidence.

## From close to settlement

Trading stops at 23:59:59 UTC on the market's target date. Operations confirm CoinMarketCap's BTC/USD daily close--if data is delayed, the market remains frozen until the official value is verifiable--then call `settleMarket(marketId, settlementValue)`. The transaction records the settlement tick and timestamp on-chain without touching individual positions yet.

## How your position gets marked

After settlement is locked in, automation iterates `emitPositionSettledBatch(limit)` so every open position receives a `PositionSettled` event. Each batch leaves a progress marker (`PositionEventsProgress`) indexed by the subgraph, letting traders verify which positions have been processed. Large markets may take several batches, but the order is deterministic and idempotent--reruns never double count.

## Winning criteria

Your band pays out when `lowerTick ≤ settlementTick < upperTick`. For $100 spacing this simply means the CoinMarketCap close, divided by 100 and floored to the nearest tick, falls inside your half-open range. If the tick lands outside, the stake remains in the pool and no claim becomes available.

## Claiming your payout

Once the UI shows “Settlement events complete,” open “My Positions” and click **Claim** beside any winning band. The contract checks the settled flag, transfers SUSD equal to your remaining quantity (rounded per the CLMSR spec), and burns the position NFT. Claims never expire, so you can return later if needed, but claiming promptly keeps analytics accurate and frees up mental bandwidth.

## Auditing the process

Every settlement transaction, batch emission, and claim sits on-chain with full data. Verification scripts such as `verification/check-market-pnl.ts` reconcile the totals against CLMSR expectations, and the Goldsky subgraph mirrors status so dashboards and community recaps stay in sync. If you suspect an anomaly, you can replay the day using these sources without relying on the front end.

Still have questions? Revisit the [Market Flow Overview](../start/market-flow-overview.md) for the daily timeline or read the [Settlement Pipeline](../market/settlement-pipeline.md) for the operator runbook.
