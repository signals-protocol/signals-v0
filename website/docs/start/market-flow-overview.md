# Market Flow Overview

Signals launches one Bitcoin range market per UTC day. Behind the simple interface sits a repeatable rhythm: operators stage the next market while the current one trades, automation watches invariants, and analytics mirror every event through the subgraph. Walk through the stages below to understand who does what and which data surfaces update along the way.

## Before trading opens

Early each afternoon (UTC) the operations dispatcher submits `createMarket` with the next day’s parameters: the outcome spec `(L, U, s, d)`, the liquidity budget $\alpha$, and the intended trading window. The transaction does three things at once. First, it initialises a fresh lazy segment tree so the CLMSR potential can price trades immediately. Second, it emits a `MarketCreated` event that the Goldsky subgraph ingests, priming dashboards and the app to show the upcoming card. Third, it locks the configuration into the manifest history so auditors know exactly which bounds were advertised. Traders can inspect the chart, tick spacing, and liquidity before risking any capital, and integrators often archive these parameters for research or treasury planning.

## During the trading window

From the block that confirms `createMarket` until the configured trading cutoff, every trade passes through the CLMSR potential. Because all bands draw from one pool of exponential weights, opening, increasing, or rotating a range is a single transaction whose cost reflects the collective state of outstanding positions. Front-end components poll both the contracts and the subgraph: they read live probabilities for quotes, consume `Position*` events for leaderboards, and surface alerts when liquidity or activity shifts materially. If monitoring scripts detect an invariant violation, an oracle delay, or abnormal gas usage, operators can pause the market with a single call; otherwise trading continues uninterrupted.

## Closing the book

Ahead of the daily settlement window the UI flips into “closed” mode and suppresses new orders. The operator verifies the designated reference value, clamps it into the configured tick range, and submits `settleMarket(marketId, value)`. This call records the canonical settlement tick and timestamp on-chain and freezes the probability surface in preparation for payouts. No SUSD moves yet—settlement establishes the outcome that everyone can audit later.

## Publishing settlement results

Large markets can hold thousands of tokens, so the settlement run focuses on updating contract state rather than manual bookkeeping. Automation simply confirms that `settleMarket` completed and that every open token now reflects its terminal state. The process is deterministic and idempotent, which keeps retries safe and makes reconciliation straightforward through the subgraph.

## After settlement

Once settlement finalizes, winning positions are claimable indefinitely. Traders call `claimPayout`, receive their principal plus winnings, and the position NFT burns in the same transaction. Risk desks and community teams rely on the same on-chain data to update dashboards, reconcile treasuries, or publish nightly recaps. Meanwhile, the dispatcher has usually staged the following day’s market, so the loop restarts without downtime.

## Roles at a glance

- **Operators** configure markets, verify the designated reference value, and make sure settlement automation stays healthy. Their transactions are fully auditable via manifests and explorer links.
- **Automation** enforces cadence: it monitors invariants, replays settlement submissions when necessary, and raises alerts if progress stalls.
- **Traders and integrators** consume the app or subgraph, trade during the window, and claim payouts later; many mirror the data into internal research notebooks.

For a minute-by-minute breakdown of user and operator actions, continue to [How Signals Works](./how-it-works.md). To see how the operator playbook runs, read the [Settlement Pipeline](../market/settlement-pipeline.md). If you are preparing to place a range yourself, start with the [Quick Start](../quickstart/index.md) and keep the [Trader Guide](../user/positions-lifecycle.md) nearby.
