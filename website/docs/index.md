# Signals Overview

Signals is a daily Bitcoin range market built on a Continuous LMSR (CLMSR). We created it after watching order-book prediction venues collapse under thin liquidity: prices drifted away from reality, traders stitched together dozens of YES/NO legs, and no one could tell whether the odds meant anything. This documentation explains how Signals addresses that failure, how the on-chain system operates each day, and how you can interact with it safely.

## What Signals solves

Every market we list covers a single UTC date. Operators publish the tick bounds, traders choose $100-wide ranges, and the CLMSR potential recalculates probabilities after every trade. Because all ranges sit in one pool, inventory never fragments into abandoned strikes and the maker's loss stays bounded by the chosen liquidity parameter. The result is a market that reacts instantly to flow while keeping the economic guarantees you expect from the LMSR family.

Settlement is deterministic. When the CoinMarketCap daily close is confirmed, the operator calls `settleMarket`, emits batches so every position receives a settlement event, and leaves claims open indefinitely. All of those actions are visible on-chain and mirrored through the Goldsky subgraph, so auditors can replay the day without trusting the front end.

## How to use this documentation

If you want the story of *why* Signals exists and what design principles shaped it, start with [Why Signals Exists](./start/why-signals.md) and the [Market Flow Overview](./start/market-flow-overview.md). Readers who need the formal mechanism can move straight into [How CLMSR Works](./mechanism/overview.md), followed by the specific notes on [Cost & Rounding](./mechanism/cost-rounding.md) and [Safety Parameters](./mechanism/safety-parameters.md). To understand the deployed system--contracts, operations pipeline, and data surface--read the [Protocol Architecture](./protocol/architecture.md) and [Security & Testing](./security/audits.md) sections. When you are ready to trade, follow the [Quick Start](./quickstart/index.md), then keep the [Trader Guide](./user/positions-lifecycle.md) and [Settlement & Claims](./user/settlement.md) nearby for day-to-day decisions.

## Snapshot of the daily loop

A Signals day opens with market creation: the operator sets tick bounds, timestamps, and the liquidity parameter. Traders then adjust ranges throughout the session, and every order mutates the CLMSR weights so probabilities stay normalized. After the close, settlement writes the CoinMarketCap price on-chain, emits batched events until every position is marked, and leaves a verifiable trail that the subgraph and analytics jobs consume. This same loop repeats every day, giving integrators a predictable surface to monitor and extend.

Need a deeper mathematical reference? Consult the [Key Formulas Cheat Sheet](./mechanism/key-formulas.md) or download the full [Signals CLMSR whitepaper](/whitepaper.pdf).

Questions or feedback are always welcome via the Signals community channels or `hello@signals.wtf`.
