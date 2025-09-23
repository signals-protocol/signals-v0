# How Signals Works

This is the step-by-step reference for the daily market. If you only need the quick narrative, start with the [Market Flow Overview](./market-flow-overview.md); otherwise keep reading for the detailed timeline from market creation through claims.

Signals focuses on one product: daily Bitcoin closing-price markets. Here’s the full loop from opening a position to claiming payouts.

## 1. Market schedule

- Each market targets a specific calendar date.
- Trading stays open until 23:59:59 UTC on that date.
- The settlement price is CoinMarketCap’s BTC/USD daily close for that window.

## 2. Choosing your range

- Bounds step in **$100 increments** (e.g. $112,000–$112,100).
- Ranges are half-open: `[lower, upper)` wins if the settlement tick is ≥ lower and < upper.
- The slider and number inputs update win probability and expected payout in real time.

## 3. Staking SUSD

- The stake is denominated in SUSD (6 decimals). It stays in the pool until settlement or until you close early.
- Costs round **up** by at least 1 micro SUSD, so every position has skin in the game.

## 4. Watching the market

- The probability chart shows how odds shift as trades arrive.
- Leaderboards surface active traders and the most recent ranges.
- You can increase, decrease, or close a position at any time before settlement.

## 5. Settlement and payouts

- Once the candle closes, we call `settleMarket` with the official price.
- Settlement events are emitted in batches, updating the subgraph and UI.
- Winning positions can immediately call `claimPayout`; there’s **no expiry** window.

Ready to try it yourself? Head to the [Quick Start](/docs/quickstart) for the wallet and token setup, then explore today’s market.
