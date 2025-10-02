# Why Signals Exists

Imagine wanting to bet that Bitcoin will close between \$111,000 and \$117,000 tomorrow. In traditional prediction markets, you face a structural problem. Most platforms create separate range markets at \$2,000 intervals: [\$110k-\$112k], [\$112k-\$114k], [\$114k-\$116k], [\$116k-\$118k], each with its own order book. To express your \$111k-\$117k view, you must buy positions in four separate markets, over-purchasing \$110k-\$111k and \$117k-\$118k that you don't actually want. Each market has different liquidity and slippage.

Why don't platforms just offer \$100 spacing? Each range market needs its own order book with paired issuance. Creating 20x finer spacing would fragment the same total liquidity across 20x more order books—most would sit empty. Traditional markets face a structural constraint: maintain tradeable liquidity with coarse ranges, or offer precision and fragment liquidity into unusable books.

Signals solves this using CLMSR (Continuous Logarithmic Market Scoring Rule), an LMSR-family mechanism extended for continuous outcomes. Instead of separate order books per range, a single shared potential function prices all ranges simultaneously. Select \$111k-\$117k, pay one cost, get one position—no over-buying; all ranges update off the same potential; liquidity is concentrated rather than fragmented.

## How traditional prediction markets handle continuous outcomes

Traditional prediction markets excel at binary questions: "Will X happen? YES or NO." For continuous outcomes like Bitcoin's closing price, platforms create **separate range markets**: [\$110k-\$112k], [\$112k-\$114k], [\$114k-\$116k], [\$116k-\$118k], etc. On venues like Polymarket, each range is its own YES/NO contract with an isolated order book.

**Why not one multi-outcome market?** You might ask: "Why not create a single market with outcomes [\$110k-\$112k, \$112k-\$114k, \$114k-\$116k, \$116k-\$118k] where traders bet on ranges directly?"

**The constraint: order-book clearing requires multi-leg counterparty matching and/or house inventory/margin management across complements, which is operationally brittle as outcomes increase.** Traditional order books rely on **paired issuance**—when you buy a range, the platform mints your token and complementary tokens for counterparties, always summing to \$1.00.

For binary outcomes (2 results), this works:

- You buy "YES" for \$0.60 → Platform mints [YES: \$0.60] + [NO: \$0.40] = \$1.00
- Exactly 2 tokens, simple pairing

For multi-outcome markets (4+ ranges), simultaneous pairing becomes impractical:

- You want [\$112k-\$114k] for \$0.30
- Complement = [\$110k-\$112k] + [\$114k-\$116k] + [\$116k-\$118k] (3 other ranges totaling \$0.70)
- Platform must mint 4 tokens: yours (\$0.30) + three complementary tokens (\$0.25 + \$0.25 + \$0.20)
- **Who takes those three tokens?** Every trade requires finding counterparties for all complement ranges at those exact prices simultaneously.

Order book-based paired issuance with 3+ outcomes requires matching multiple complementary positions per trade—matching and risk management become combinatorially brittle (superlinear coordination cost), and liquidity fragmentation makes sustainable operation impractical.

**So platforms create separate range markets**: Each range ([\$110k-\$112k], [\$112k-\$114k], etc.) becomes an independent binary market (YES/NO) with its own book. To bet \$111k-\$117k, you buy across 4 separate markets:

1. [\$110k-\$112k] market → over-buys \$110k-\$111k
2. [\$112k-\$114k] market → matches thesis
3. [\$114k-\$116k] market → matches thesis
4. [\$116k-\$118k] market → over-buys \$117k-\$118k

**This creates three core problems**:

1. **Liquidity fragmentation**: Each range market needs its own order book. \$2k spacing → ~10 markets. Finer \$100 spacing → 20x more markets, fragmenting liquidity across hundreds of thin books where most sit empty and untradeable.

2. **Implied probabilities don't normalize**: Independent range markets aren't constrained to partition-based normalization. Implied probabilities inferred from different ranges often sum to >100% (e.g., 30% for \$100k-\$110k + 35% for \$110k-\$120k + 40% for \$120k+ = 105%). Even when a venue lists non-overlapping bins as separate books, cross-book consistency and exact Σ=1 are not enforced without a shared pricing function or active arbitrage.

3. **No atomic custom ranges**: Every precise range bet requires managing multiple positions across different markets, each with different liquidity, slippage, and over-buying at the edges.

## How Signals solves this with CLMSR

Signals uses **CLMSR**, an LMSR-family potential function extended for continuous outcomes through discrete ticks. Instead of separate order books per range, a single shared potential governs pricing for all ranges simultaneously.

**Core mechanism**: `C(q) = α ln(Σ e^(q_b/α))` where b indexes atomic ticks (price intervals).

- **Clarifying assumption — Partition.** Normalization claims refer to **disjoint & exhaustive atomic ticks within a single CLMSR market**. Threshold or overlapping ranges are **not** a partition, so sums need not equal 1.

> **Intuition.** Thresholds quote tails of the CDF (e.g., P(>110k)), bins are CDF differences (e.g., P(110k-112k)=P(>110k)-P(>112k)). Independent books don't enforce these identities; CLMSR does by construction.

- **Shared liquidity pool**: All ranges draw from one potential. When you buy \$111k-\$117k, the transaction updates `q_b` values, which instantly recalculates prices for \$110k-\$115k, \$112k-\$113k, and every other range through the same formula. No separate order books → no liquidity fragmentation.

- **Automatic normalization**: The exponential structure ensures tick probabilities `p_b = e^(q_b/α) / Σ e^(q_j/α)` always sum to exactly 1. The market maintains internal consistency across all ranges after every trade.

- **Atomic custom range positions**: One trade prices your exact \$111k-\$117k range as a single position. No need for paired complements or simultaneous counterparty matching across multiple ranges.

- **Bounded operator risk**: The liquidity parameter α caps maximum loss at `α ln(n)` where n = number of active atomic ticks in the market's partition. Example: α=\$10k, n=1,500 → max loss ≈ \$73k. This bound enables liquidity provision across thousands of ticks with predictable risk.

**Why traditional markets can't replicate this**: Each independent range market has separate pricing with no mathematical connection. Buying [\$112k-\$114k] on a traditional platform doesn't update [\$114k-\$116k] or any other range—they're completely separate order books.

## The granularity-liquidity tradeoff

**Scenario**: Bitcoin trades at \$102,350. You believe it will close between \$111,000 and \$117,000 based on technical levels.

**Traditional markets (\$2k spacing)**: Platforms offer range markets [\$110k-\$112k], [\$112k-\$114k], [\$114k-\$116k], [\$116k-\$118k], each with separate order books. To capture \$111k-\$117k:

1. Buy [\$110k-\$112k] → over-buys \$110k-\$111k (don't want)
2. Buy [\$112k-\$114k] → matches thesis
3. Buy [\$114k-\$116k] → matches thesis
4. Buy [\$116k-\$118k] → over-buys \$117k-\$118k (don't want)

**Result**: 4 separate positions, different liquidity/slippage each, over-bought at edges.

**Why not \$100 spacing?** Platforms could create 20x more range markets ([\$110.0k-\$110.1k], [\$110.1k-\$110.2k], ...). But each range needs its own order book with its own liquidity providers. The same liquidity that creates one tradeable [\$110k-\$120k] market now fragments across 100 shallow books—most would sit empty with no bids or offers. **The core constraint: separate order books cannot share liquidity.**

**With CLMSR (\$100 tick spacing)**: All 1,000+ ticks from \$50k to \$200k share one potential function:

- **\$111k-\$117k**: Select range, pay one cost, get one position (60 ticks)
- **\$110.4k-\$117.5k**: Select range, pay one cost, get one position (71 ticks)
- No over-buying, no multiple positions, all ranges tradeable

**Comparison**:

- Traditional (\$2k): ~10 range markets → \$111k-\$117k requires 4 positions with over-buying.
- Traditional (\$100, theoretical): 1,000 range markets → liquidity fragments, most untradeable.
- CLMSR (\$100): 1,000 ticks, shared pool → any custom range becomes one position; liquidity is concentrated, not fragmented.

Signals collapses that tradeoff. You can back a +2% momentum view, a ±1% consolidation, or a bespoke \$110.5k-\$117.2k band with a single position; every trade updates the shared curve, and settlement events remain on-chain so anyone can audit the close.

Ready to explore it yourself? Jump into the [Quick Start](../quickstart/index.md) or skim the [Market Flow Overview](./market-flow-overview.md) for the daily cadence.
