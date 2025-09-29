# Why Signals Exists

Imagine wanting to bet that Bitcoin will close between $112,000 and $113,000 tomorrow. In traditional prediction markets, you'd face a frustrating choice: buy dozens of separate YES/NO contracts and pray the right strikes have liquidity, or settle for a crude "above/below" bet that doesn't capture your actual thesis. Neither approach works well, and both leave money on the table.

Signals solves this by letting you select any price range as a single trade. Want to back $112k-$113k? Just highlight that band, pay one cost, and watch probabilities update in real-time as other traders react. The answer lies in a breakthrough market mechanism called Continuous Logarithmic Market Scoring Rule (CLMSR)—a system that makes range-based prediction markets finally work.

## The prediction market problem

Traditional prediction venues fail because they fragment markets into isolated pieces. Consider what happens when you try to express a nuanced Bitcoin view:

**Order book fragmentation**: Each strike price becomes its own separate market. Liquidity pools at round numbers like $110k or $115k while abandoning the precise ranges traders actually care about. A sophisticated thesis requiring exposure across multiple strikes forces you to manage dozens of separate positions, each with different fill rates and slippage.

**Broken probability surfaces**: When strikes trade independently, the implied probabilities stop adding up to 100%. You might see Bitcoin having a 40% chance of closing above $112k and a 45% chance of closing above $113k—mathematically impossible, but common in fragmented markets.

**Information loss**: Empty order books at specific strikes create dead zones where price discovery stops working. A single abandoned strike can freeze the implied probability for that range, even as the broader market moves and new information arrives.

**Complexity vs. precision trade-off**: The more precise your view, the more separate contracts you need to buy, creating operational overhead that discourages the nuanced predictions that make markets most valuable.

## How CLMSR changes the game

Signals uses CLMSR to solve these problems by design. Instead of separate markets for each strike, every possible price range draws from one shared liquidity pool governed by a single mathematical function.

**One trade, any range**: Select $112k-$113k and pay a single cost that reflects the exact probability and risk of that specific range. No stitching contracts together, no partial fills across strikes, no inventory management complexity.

**Always-normalized probabilities**: Because all ranges share the same underlying mathematical potential, probabilities automatically sum to 100% after every trade. The market stays internally consistent even as thousands of different ranges trade simultaneously.

**Instant price discovery**: When someone buys $115k-$120k exposure, the math instantly updates probabilities for $112k-$113k, $110k-$115k, and every other possible range. Information flows through the entire price surface in a single transaction.

**Bounded risk for market makers**: The liquidity parameter α caps potential losses at α ln(n), where n is the number of possible outcomes. This mathematical guarantee lets market operators offer deep liquidity across thousands of price points without unlimited downside risk.

## Why this works here but not elsewhere

The magic happens because of CLMSR's **potential function**: `C(q) = α ln(Σ e^(q_b/α))`. This single equation governs every possible price band simultaneously.

**Traditional prediction markets can't do this because**:

- **Separate contracts = separate math**: Each YES/NO contract has its own isolated pricing mechanism. There's no mathematical connection forcing Bitcoin above $112k and Bitcoin above $113k to have coherent probabilities.
- **No shared state**: When you buy "BTC > $112k" on Polymarket, that transaction doesn't automatically update the price of "BTC > $113k" because they're completely separate markets with separate order books.
- **Arbitrage delays**: Even when arbitrageurs try to keep related strikes aligned, it takes multiple transactions across multiple venues, creating windows where probabilities don't add up to 100%.

**AMMs like Uniswap can't do this because**:

- **Binary design**: Most AMMs are built for binary outcomes (A vs B), not continuous ranges with thousands of possible bands.
- **No probability constraints**: Nothing forces Uniswap pool prices to sum to 100% across different assets—each pool operates independently.
- **Liquidity fragmentation**: Creating separate pools for each price range fragments liquidity exactly like traditional order books.

**CLMSR works differently**:

- **Single shared state**: All bands read from the same `q_b` (quantity) values in the potential function. When you buy $115k-$120k, it increases `q_b` for those bands, which instantly recalculates prices for every other band through the same formula.
- **Mathematical guarantee**: The potential function's exponential structure `e^(q_b/α)` ensures that band prices `p_b = e^(q_b/α) / Σ e^(q_j/α)` always sum to exactly 1, no matter how many trades happen.
- **Atomic updates**: The lazy segment tree updates thousands of tick weights in a single transaction, so there's never a moment when probabilities are inconsistent.

## The granularity problem: why precise ranges are impossible elsewhere

Consider a real scenario: Bitcoin trades at $102,350 and you believe it will close between $102,800 and $103,200 (+0.4% to +0.8%). This kind of precise, narrow-range thesis is exactly what sophisticated traders want to express.

**Traditional prediction markets fail because of coarse granularity**:

Most platforms only offer strikes at $1,000 or $2,000 intervals. So your options are:

- "BTC > $102k" vs "BTC > $103k" (too wide, covers $102k-$103k = entire 1k range)
- "BTC > $103k" vs "BTC > $104k" (completely wrong range, $103k-$104k)

**The over-buying problem**: To approximate your $102.8k-$103.2k thesis, you're forced to:

1. Buy "BTC > $102k" (gives you exposure to $102k-$∞, way more than you want)
2. Sell "BTC > $103k" (removes exposure above $103k)
3. **Result**: You end up with $102k-$103k exposure instead of $102.8k-$103.2k

You've "over-bought" by 2.5x: your position covers a $1,000 range when you only wanted $400. This dilutes your thesis and forces you to risk more capital than necessary.

**Why order books can't solve this**: Creating strikes every $100 would fragment liquidity across 10x more markets. Most would be empty, making trading impossible. The fundamental problem is that each strike needs its own separate order book.

**CLMSR solves this with configurable tick spacing**:

Signals markets can use any tick spacing - say $100 intervals for Bitcoin. Now you can express exactly what you want:

1. Select range [$102,800, $103,200) on the UI
2. The potential function calculates: "This range currently represents 15% probability"
3. Pay one cost (say $0.15) for a position that pays $1.00 if BTC closes in that exact 0.4% range
4. **No over-buying**: You get precisely the exposure you wanted, nothing more

**Why this works**: The tick spacing `s = $100` creates bands `[102,800, 102,900)`, `[102,900, 103,000)`, etc. Your range covers exactly 4 ticks: `[102,800, 103,200)`. The CLMSR potential function `C(q) = α ln(Σ e^(q_b/α))` prices this 4-tick range as a single atomic position.

**Granularity comparison**:

- **Traditional**: Limited to ~10-20 strikes across the entire price spectrum (insufficient granularity)
- **CLMSR**: Can support 100,000+ ticks with $100 spacing from $50k to $200k (precise granularity)

The mathematical difference is that CLMSR uses one shared potential function across all ticks, while traditional markets need separate order books for each strike. This lets CLMSR offer 1000x finer granularity without fragmenting liquidity.

## Why this matters for Bitcoin markets

Bitcoin's volatility makes it the perfect testing ground for continuous range markets. Traditional daily prediction markets force crude bets: "above $100k" or "below $100k." But Bitcoin routinely moves $2k-5k per day, making the interesting action happen in the ranges between obvious levels.

With Signals, you can express views like:

- "Bitcoin will close between current price +2% and +5%" (momentum continuation)
- "Bitcoin will end the day within 1% of current levels" (mean reversion)
- "Bitcoin will close above the key psychological level of $120k" (breakout thesis)

Each represents a different market view that traditional YES/NO contracts can't capture efficiently.

## Built for transparency and trust

Beyond the mathematical improvements, Signals prioritizes verifiability. Every market parameter, trade, and settlement outcome lives on-chain where anyone can audit it. The Goldsky subgraph mirrors all contract events, making it easy to replay any day's trading for research or compliance purposes.

Settlement uses a designated reference price source that all participants know in advance. When the UTC day ends, operators submit the closing price to `settleMarket()`, the contracts automatically determine winners and losers, and claims remain open indefinitely. No human judgment calls, no discretionary interpretation—just math and public data.

## What's next

CLMSR works for any continuous outcome that can be discretized into ticks. Today's deployment focuses on Bitcoin's daily close, but the same mechanism could power markets for interest rates, commodity prices, election polling, or any other measurable continuous variable.

The sections below explore these concepts in detail. For the mathematical foundation, continue to [How CLMSR Works](../mechanism/overview.md). To understand the daily operational flow, read the [Market Flow Overview](./market-flow-overview.md) and [How Signals Works](./how-it-works.md). Ready to try it yourself? Start with the [Quick Start](../quickstart/index.md).
