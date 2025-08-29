# Mathematical Deep Dive: Cost Functions and Precision

The Signals protocol implements sophisticated mathematical mechanisms to enable fair and efficient range-based prediction markets. This document examines the core cost function implementation, inverse calculations, and precision handling that underpin the system.

## Cost Function Implementation

When you purchase delta shares of a range spanning from lower tick to upper tick, the protocol calculates the cost using the logarithmic market scoring rule. The fundamental operation multiplies all exponential weights within your chosen range by the factor `φ = exp(δ/α)`, where delta represents your share quantity and alpha is the market's liquidity parameter.

The cost calculation follows the formula `α × ln(Σw_after / Σw_before)`, where the weight sums represent the total exponential values across all market bins before and after your trade. This approach ensures path independence, meaning the final cost remains identical regardless of whether you purchase shares in multiple smaller transactions or one large transaction.

For selling operations, the protocol applies the inverse factor `1/φ = exp(-δ/α)` to reduce the weights within your range. The proceeds calculation follows the same logarithmic formula, but with the ratio inverted to reflect the weight reduction rather than increase.

## Chunked Transaction Processing

Large trades require careful handling to prevent gas limit issues and mathematical overflow. The protocol includes a maximum chunk limit of 1000 transactions per operation, with each chunk sized to stay within safe exponential calculation bounds. The maximum safe quantity per chunk equals `α × MAX_EXP_INPUT_WAD - 1`, where MAX_EXP_INPUT_WAD is set to 1.0 × 10^18.

When a trade exceeds single-chunk capacity, the protocol splits it into multiple chunks while maintaining cumulative state tracking. Each chunk updates the affected range weights and recalculates the total sum before processing the next chunk. This approach preserves mathematical accuracy while staying within gas and overflow constraints.

Adaptive overflow guards monitor intermediate calculations to prevent arithmetic overflow. If a chunk would cause overflow, the protocol reduces the chunk size dynamically and continues processing with the smaller quantity. The system includes ultimate safety limits to ensure no chunk processing can exceed maximum safe values.

## Inverse Cost Calculations

The protocol includes functionality to calculate required share quantities given a target cost. This inverse calculation solves the equation `cost = α × ln(factor)` for the factor, then derives the quantity as `q = α × ln(factor)`. The implementation handles the mathematical relationship between costs and exponential weight changes.

For purchase operations, the target factor represents `exp(quantity/α)`, while sales use the inverse relationship. The protocol validates that all calculated factors fall within the established bounds of MIN_FACTOR (0.01 × 10^18) and MAX_FACTOR (100 × 10^18) to prevent extreme price movements and mathematical instability.

## Precision and Rounding Policy

Internal calculations throughout the protocol use 18-decimal WAD precision to maintain mathematical accuracy. External interfaces with users employ 6-decimal precision matching USDC formatting standards, requiring careful conversion between these precision levels.

The protocol implements asymmetric rounding to prevent zero-cost attacks and ensure fair pricing. Purchase costs use ceiling rounding through the `fromWadRoundUp` function, guaranteeing users never pay less than the mathematically correct amount. Payout calculations use floor rounding to prevent the protocol from paying out more than the precise mathematical result.

This rounding policy creates a small but systematic bias in favor of the protocol, accumulating minor amounts that serve as a buffer against precision-related arbitrage opportunities. The bias remains minimal due to the high precision of internal calculations and only affects the final user-facing conversion.

## Segment Tree Mathematical Properties

The lazy multiplicative segment tree enables efficient range operations while preserving mathematical correctness. Each tree node maintains a sum representing the total exponential weights in its subtree and a pending factor representing deferred multiplications.

When applying a factor to a range, the tree updates only the minimal set of nodes needed to cover that range. Lazy propagation defers factor applications until needed, reducing computational overhead while maintaining mathematical equivalence. The tree includes automatic flushing mechanisms when pending factors exceed the FLUSH_THRESHOLD of 1 × 10^21 to prevent overflow accumulation.

The segment tree design guarantees O(log n) complexity for range updates and queries, making it economical to support markets with hundreds or thousands of distinct outcome ranges. The mathematical properties ensure that partial tree updates produce identical results to full tree recalculation, maintaining consistency regardless of the sequence of operations performed.
