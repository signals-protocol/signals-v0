# Signals Overview

Signals runs a daily Bitcoin range market backed by a Continuous LMSR (CLMSR). We built it because binary prediction markets and fragmented order books fail to keep liquidity and probabilities aligned. Here you will find everything from the high-level thesis to the trading playbook.

## Why read this documentation?

- Understand the market structure that keeps prices normalized and maker loss bounded.
- See how each daily market is scheduled, settled, and audited.
- Learn how to participate responsibly with SUSD test liquidity on Citrea.

## Where to start

1. **Grasp the thesis** – Read [Why Signals Exists](./start/why-signals.md) to see how CLMSR fixes fragmented order books, then skim the [Market Flow Overview](./start/market-flow-overview.md).
2. **Dive into the math** – Head to [How CLMSR Works](./mechanism/overview.md) and the follow-up pages for the potential, rounding rules, and risk envelope.
3. **Check the protocol guarantees** – [Protocol Architecture](./protocol/architecture.md) and [Security & Testing](./security/audits.md) explain the states, invariants, and trust assumptions.
4. **Trade the market** – Follow the [Quick Start](./quickstart/index.md), then use the [Trader Handbook](./user/positions-lifecycle.md) and [Settlement & Claims](./user/settlement.md) when you place your first range.

## Signals in one glance

- **Single market per day** – We list one BTC close range market, with $100 ticks across a configured price band.
- **Continuous pricing** – Every trade flows through the CLMSR potential so probabilities add to 1 and react instantly.
- **Transparent settlement** – CoinMarketCap's close is posted on-chain, batched events mark every position, and claims never expire.

Need deeper theory? Jump straight to the [Key Formulas Cheat Sheet](./mechanism/key-formulas.md) or download the [Signals CLMSR whitepaper](/whitepaper.pdf).

Questions or feedback? Reach out via the Signals community channels or email `hello@signals.wtf`.
