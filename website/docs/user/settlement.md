# Settlement & Claims

When the countdown hits zero, the trading UI goes quiet but the protocol keeps working. This guide explains what happens from the final tick to the moment you withdraw your payout so you can follow along with confidence.

## From close to settlement

Trading stops at the market’s configured cutoff ahead of the target date. Operations confirm the designated reference value—if data is delayed, the market remains frozen until a verifiable number is available—then call `settleMarket(marketId, settlementValue)`. The transaction records the settlement tick and timestamp on-chain without touching individual positions yet.

## How your position gets marked

After settlement is locked in, on-chain state immediately reflects the final outcome for every open token. The process is deterministic and idempotent, meaning retries after any hiccup leave the ledger unchanged—you only need to confirm that the UI or subgraph now shows your position as settled.

## Winning criteria

Your band pays out when `lowerTick ≤ settlementTick < upperTick`. With configurable spacing this simply means the reference price, mapped onto the market’s tick grid, falls inside your half-open range. If the tick lands outside, the capital you committed remains in the pool and no claim becomes available.

## Claiming your payout

Once the UI shows that settlement is complete, open “My Positions” and click **Claim** beside any winning band. The contract checks the settled flag, transfers SUSD equal to your remaining quantity (rounded per the CLMSR spec), and burns the position NFT. Claims never expire, so you can return later if needed, but claiming promptly keeps analytics accurate and frees up mental bandwidth.

## Auditing the process

Every settlement transaction and claim sits on-chain with full data. Verification scripts such as `verification/check-market-pnl.ts` reconcile the totals against CLMSR expectations, and the Goldsky subgraph mirrors status so dashboards and community recaps stay in sync. If you suspect an anomaly, you can replay the day using these sources without relying on the front end.

Still have questions? Revisit the [Market Flow Overview](../start/market-flow-overview.md) for the daily timeline or read the [Settlement Pipeline](../market/settlement-pipeline.md) for the operator runbook.
