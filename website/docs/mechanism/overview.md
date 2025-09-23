# Mechanism Overview

Signals’ user experience is simple—pick a $100 Bitcoin range and wait for the daily close—but underneath runs a Continuous Logarithmic Market Scoring Rule (CLMSR). This section summarises the formal design for anyone who needs to audit or integrate at the protocol level.

## Role of the mechanism

- **Surface probabilities** – the CLMSR potential guarantees that prices across all bands sum to 1 and adjust instantly when trades arrive.
- **Bound maker loss** – the operator chooses a liquidity parameter `α`, capping potential loss at `α × ln n` where `n` is the number of bands.
- **Enable atomic range trades** – buying or selling a band updates every tick in that band in one transaction, no stitching required.

Although Signals currently runs only daily Bitcoin markets, the same mechanism can power any continuous outcome with discrete ticks.

## Structure of this spec

1. [Outcome space & units](outcome-space.md)
2. [Cost function & rounding](cost-rounding.md)
3. [Safety bounds & parameters](safety-parameters.md)

For proofs and deeper context, see the [Signals CLMSR whitepaper](/whitepaper.pdf).

## Implementation status call-outs

Throughout the spec you’ll find “Implementation status” boxes indicating where the live contracts match or diverge from the whitepaper (e.g., pending updates to sell-rounding). Treat those notes as the authoritative view of what’s on-chain today.
