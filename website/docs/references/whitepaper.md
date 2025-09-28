# Signals CLMSR Whitepaper

The Signals whitepaper is the canonical description of how our Continuous LMSR implementation works. It walks through the probability model, proves the bounded-loss guarantees that make the market safe to operate, and documents the practical constraints we enforce in Solidity. Keep it close whenever you audit the protocol or build integrations that rely on the exact economics of a range trade.

## Download and version

The latest release lives at [Signals CLMSR Whitepaper (PDF)](/whitepaper.pdf). Version `v1.0` matches the production contracts as of the 1.1.0 release train; when protocol upgrades affect the math or rounding rules we bump the whitepaper version and log the change in the [Changelog](../changelog/index.md).

## What the paper covers

1. **Mechanism derivation** – Starting from the classic LMSR, the paper derives the continuous version used in Signals. It shows how the potential function generates prices, how $\alpha$ bounds maker loss by $\alpha \ln n$, and why every range shares the same convex surface.
2. **Outcome grid construction** – It formalises the outcome spec `(L, U, s, d)` and proves that the half-open tick intervals keep probabilities normalised even when oracle data sits at the exact edge of a band.
3. **Lazy multiplicative segment tree** – The data structure that stores weights for millions of ticks is analysed in detail. You can trace how deferred factors propagate, why chunk sizes are capped, and which invariants must hold for every node.
4. **Rounding discipline** – A full chapter justifies rounding costs up and proceeds down, quantifies the dust the system can tolerate, and enumerates the guards that block “free” positions. Upcoming Solidity changes around sell and claim rounding are also scoped here.

## How to use the whitepaper effectively

- **When reading the contracts**: Keep `contracts/core/CLMSRMarketCore.sol` and `contracts/libraries/LazyMulSegmentTree.sol` open alongside the whitepaper so you can see how each formula maps into code. Implementation notes in the paper call out any deliberate deviations (for example, minimum trade size still being off-chain policy today).
- **During audits or security reviews**: Combine the proofs with the operational guarantees listed in the [Security & Testing Overview](../security/audits.md). Together they explain both the theoretical bounds and the runtime checks that enforce them.
- **For product or research work**: Use the derivations to justify probability calculations in dashboards or risk reports. The notation section provides the exact symbols and units we use across the SDK and documentation.

## Related references

- [Mechanism Overview](../mechanism/overview.md) converts the whitepaper into narrative form for engineers who prefer prose over proofs.
- [Cost & Rounding](../mechanism/cost-rounding.md) and [Safety Parameters](../mechanism/safety-parameters.md) keep a running list of implementation status so you can compare the live contracts with the model.
- The [Subgraph API](../api/subgraph.md) guide explains how to retrieve the on-chain data that the whitepaper’s formulas expect.

Whenever you quote or extend Signals’ CLMSR implementation, reference the whitepaper directly. It is the single source of truth for the math that underpins every range trade.
