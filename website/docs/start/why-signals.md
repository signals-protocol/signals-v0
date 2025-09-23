# Why Signals Exists

Signals is our response to structural flaws in crypto prediction venues. We believe the right way to bet on Bitcoin's daily close is through a continuous, range-based market powered by CLMSR. This page summarises the problems we observed and the design principles that guide the protocol.

## Order book failure modes

- **Liquidity fragmentation** – Order-book prediction markets split flow across dozens of independent YES/NO strikes. Depth concentrates around round numbers and evaporates elsewhere, making it expensive to size a nuanced view.
- **Replication friction** – To express "between $112k and $113k" a trader must stitch multiple orders and babysit partial fills. Slippage compounds and you end up managing inventory rather than a single thesis.
- **Signal dilution** – When liquidity is scattered, implied probabilities no longer line up. Observers cannot trust the odds because a single abandoned strike can skew the surface.

## Requirements for continuous outcomes

We needed a market mechanism that:

1. Maintains a single potential so prices across all bands always sum to 1.
2. Guarantees bounded loss for the maker even as the number of bands grows.
3. Allows trades to update entire ranges atomically in one transaction.
4. Handles precision and rounding consistently so dust trades cannot attack the system.

## CLMSR design principles

- **Single pool** – A Continuous LMSR keeps every tick linked. One trade reshapes the whole surface.
- **Range-native UX** – The front end speaks in $100 bands and probability percentages, mirroring how traders think about the close.
- **Deterministic settlement** – Official CoinMarketCap closes feed into `settleMarket`, and batched events mark every position so analytics remain trustworthy.
- **Transparency first** – Deployment manifests, verification scripts, and the public subgraph make it easy to audit every market.

Want the math? Continue to [How CLMSR Works](../mechanism/overview.md). Ready to see the daily cadence? Read the [Market Flow Overview](./market-flow-overview.md) or the deeper [How Signals Works](./how-it-works.md).
