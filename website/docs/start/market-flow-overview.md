# Market Flow Overview

Signals runs one Bitcoin range market per UTC day. Trading follows a tight loop: the active market closes at 23:00 UTC, the reference price for that day is fixed at midnight, and the market resolves at 00:15 UTC once the price feed is confirmed. This overview walks through that cycle so you always know which stage you are in.

## Daily timeline

- **UTC 23:00:** the live market stops accepting new orders and the next day’s market opens immediately, keeping trading continuous.
- **UTC 00:00:** the designated reference candle for the closing market is set; everyone now waits for the official close price.
- **UTC 00:15:** operations resolve the closed market with `settleMarket`, using the fetched close value; claims unlock, and the new market continues trading toward the next cutoff.

## Trading during the window

From just after settlement at 00:15 UTC until the next cutoff at 23:00 UTC, every order runs through the shared CLMSR liquidity pool. Traders can open new ranges, adjust size on existing positions, or rotate ranges as their thesis changes. Live quotes, fills, and leaderboard updates in the app mirror on-chain data so the interface always matches contract state.

## Cutoff and the next market launch

Exactly at 23:00 UTC, the interface flips to a closed state for the expiring market. No new orders are accepted, and positions remain frozen. Operations immediately call `createMarket` for the next day, and the fresh market card appears in the same block so trading can start on the new bounds right away while the expiring market awaits resolution.

## Reference price and resolution window

At UTC 00:00 the market’s designated price window ends. Fifteen minutes later—at UTC 00:15—automation fetches the Bitcoin daily close for the target date from CoinMarketCap. If that request fails, CoinGecko is queried instead. Should both feeds fail within 24 hours, the market is canceled. Only these sources are valid for resolution, and orders must use whole-dollar bounds. Once a price is obtained, operators submit `settleMarket(marketId, settlementValue)`, locking the canonical outcome on-chain and emitting events that analytics pipelines mirror.

## After settlement

When settlement is recorded, each winning position becomes claimable indefinitely. Calling `claimPayout` collects your payout and burns the position NFT. Risk desks, community teams, and integrators rely on the same on-chain data to reconcile balances, publish recaps, or archive the day’s parameters. The next market has already been live since the cutoff, so trading continues toward the following day’s cycle.

## Roles at a glance

- **Operators** run the cutoff, launch the next market with `createMarket`, verify the fetched close, and submit settlement at 00:15 UTC.
- **Automation** monitors health checks, fetches the reference price from supported sources, alerts on oracle failures, and retries settlement transactions if needed.
- **Traders and integrators** trade during the window, mirror data into their own systems, and claim payouts once settlement locks.

Keep exploring with [How Signals Works](./how-it-works.md), the [Quick Start](../quickstart/index.md), the [Trader Guide](../user/positions-lifecycle.md), or the operator-focused [Settlement Pipeline](../market/settlement-pipeline.md).
