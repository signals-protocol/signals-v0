# Settlement & Claims

Signals resolves each market using CoinMarketCap’s Bitcoin daily close for the targeted date. Here’s what you should expect once trading stops.

## Timeline

1. **Trading ends** at 23:59:59 UTC on the stated date.
2. **Settlement** – Signals submits the official close to the CLMSR contract shortly after the candle finalises.
3. **Batch events** – we emit `PositionSettled` events in chunks until every position has been marked.
4. **Claim window** – winning traders can claim immediately; there is no deadline.

## Winning criteria

- Your range wins if `lowerTick ≤ settlementTick < upperTick`.
- `settlementTick` is simply the closed price divided by 100 (for $100 bands), floored to the nearest tick.

## Claiming payout

- Once the UI shows “Claims ready”, click **Claim** beside your position.
- The contract sends SUSD equal to your staked quantity and burns the position NFT.
- Missed a claim? No problem. Claims remain valid forever, though we recommend claiming promptly to keep analytics clean.

## Behind the scenes

- Every settlement transaction is visible on-chain with a timestamp and the submitted price.
- Verification scripts (`verification/check-market-pnl.ts`) and the public subgraph mirror the final tally so you can audit the outcome.

Questions about fairness or data sources? Check the [Rules section](../start/how-it-works.md) or reach out via the Signals support channels.
