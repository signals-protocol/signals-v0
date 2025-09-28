# Why Signals Exists

Signals grew out of first-hand frustration with order-book style prediction venues. We wanted a place to express a daily Bitcoin thesis without stitching half a dozen YES/NO contracts together or guessing which abandoned strike would distort the odds. The answer was a continuous, range-based market where every trade shares the same potential--exactly what the Continuous LMSR (CLMSR) delivers.

## Order book failure modes

Traditional order books fracture liquidity. Depth piles up at round numbers, dries up everywhere else, and leaves traders rationing size instead of stating a view. Trying to cover a $112k-$113k window meant juggling separate orders, partial fills, and the inventory that comes with them. Worse, the surface stopped communicating information at all: a single empty strike could freeze an implied probability even while the market moved.

## Requirements for continuous outcomes

Fixing those shortcomings demanded a different mechanism. Prices across every band had to share one potential so they always normalised to 1. Maker loss needed a predictable ceiling even as we increased the number of bands. Trades had to update entire ranges in a single transaction so positions stayed atomic. Precision and rounding had to follow one rule so adversaries could not slip dust trades through the cracks.

## CLMSR design principles

CLMSR satisfies those requirements by construction. A single pool of exponential weights links every tick, so one trade reshapes the whole surface instead of leaving liquidity marooned. The interface stays native to ranges--$100 bands, win probabilities, and payouts--so the math and the UI speak the same language. Settlement remains deterministic: the CoinMarketCap close feeds into `settleMarket`, batched events mark every position, and the public subgraph mirrors the progress so analytics keep up. Transparency underwrites the whole loop; manifests, verification scripts, and on-chain data make each market audit-friendly from creation through claims.

If you want the formal specification, continue to [How CLMSR Works](../mechanism/overview.md). To see the daily cadence from creation to claims, read the [Market Flow Overview](./market-flow-overview.md) and the more detailed [How Signals Works](./how-it-works.md).
