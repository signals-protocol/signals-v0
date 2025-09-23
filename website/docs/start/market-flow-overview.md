# Market Flow Overview

Signals runs a single Bitcoin closing-price market every day. This page gives you the fast, narrative walk-through so you know what happens when.

## Daily cadence at a glance

1. **Market opens** – A new market appears with its target date, tick bounds, and liquidity parameter. Trading starts as soon as the operator deploys the daily configuration on-chain.
2. **Trading window** – Until 23:59:59 UTC you can open, increase, decrease, or close ranges. Prices update continuously because every trade flows through the CLMSR potential.
3. **Freeze & settle** – Once the candle closes, the operator submits the CoinMarketCap BTC/USD daily close with `settleMarket`.
4. **Batch events** – Settlement walks every open position in deterministic batches so even the largest markets stay inside gas limits.
5. **Claim forever** – Winning positions can be claimed immediately. There is no expiry window.

Want the minute-by-minute contract view? Jump to [How Signals Works](../start/how-it-works.md). Need the settlement plumbing details? See [Settlement Pipeline](../market/settlement-pipeline.md).
