# CLMSR: Continuous Prediction Markets

signals-v0 implements **CLMSR (Continuous Logarithmic Market Scoring Rule)** - a revolutionary approach to prediction markets that enables betting on continuous outcomes like asset prices, market indices, or any numerical value.

## What is CLMSR?

Traditional prediction markets are limited to binary yes/no questions. CLMSR enables **range-based prediction markets** where you can bet on specific outcome ranges rather than just discrete events.

### Key Innovation: Range Securities

Instead of betting "Will BTC be above $50000?", you can bet:

- "BTC will be between $48000-$52000"
- "BTC will be between $50000-$55000"
- "BTC will be above $55000"

Each range security pays out **1 SUSD** if the final outcome falls within your chosen range.

## How CLMSR Works

### 1. Tick-Based Outcome Space

The outcome space is divided into uniform **ticks** (price levels):

- **Example**: BTC price from $40000 to $70000 with $100 spacing
- Creates 300 discrete bins: [40000-40100), [40100-40200), ..., [69900-70000)
- You can buy ranges covering multiple consecutive bins

### 2. Single Liquidity Pool

Unlike traditional prediction markets that fragment liquidity across many binary questions, CLMSR uses **one unified liquidity pool** that covers the entire outcome range:

- All ranges share the same liquidity
- Prices automatically adjust based on total demand
- No liquidity fragmentation between different ranges

### 3. Automatic Market Making

The market operates using a mathematical function called the **logarithmic market scoring rule**:

```
Cost = α × ln(partition_sum_after / partition_sum_before)
```

Where:

- **α (alpha)**: Liquidity parameter - higher α means deeper liquidity and less price impact
- **Partition sum**: Sum of all exponential weights across all bins

### 4. Price = Probability

The price of any range directly represents the market's estimated probability:

- If a range costs 0.30 SUSD, the market thinks there's a 30% chance of that outcome
- Prices across all possible outcomes always sum to 1.00 SUSD

## Key Benefits

### Bounded Risk

Market makers have **guaranteed maximum loss** of `α × ln(n)` where:

- `α` = liquidity parameter
- `n` = number of bins
- This allows precise risk management

### Path Independence

The final cost is the same regardless of order:

- Buying 10 shares at once = same cost as buying 5 shares twice
- No front-running or MEV opportunities from order sequencing

### Efficient On-Chain Implementation

Uses a **lazy multiplicative segment tree** for:

- O(log n) complexity for range updates
- Supports hundreds of bins efficiently on-chain
- Gas costs scale logarithmically, not linearly

## Mathematical Foundation

### Weights and Probabilities

Each bin `b` has:

- **Shares**: `q_b` (number of shares outstanding)
- **Weight**: `w_b = exp(q_b / α)`
- **Price/Probability**: `p_b = w_b / Σ(all weights)`

### Range Trading

When you buy `δ` shares of range `[L,U)`:

1. **Weight Update**: All bins in range multiply by `φ = exp(δ/α)`
2. **Cost Calculation**: `α × ln((Σw_after)/(Σw_before))`
3. **New Prices**: Automatically adjust across all bins

### Example

Market: BTC price, 5 bins, α = 50 SUSD

- Initial state: All bins have weight = 1, total = 5
- Buy 10 shares of range [48000-50000): costs ~4 SUSD
- If BTC settles at $48500: your 10 shares pay 10 SUSD profit = 6 SUSD

## Technical Implementation

### Numerical Precision

- **Internal**: 18-decimal precision for all calculations
- **External**: 6-decimal SUSD for user transactions
- **Rounding**: Ceiling for costs, floor for payouts (prevents arbitrage)

### Gas Efficiency

- **Lazy Updates**: Only update tree nodes when necessary
- **Batch Operations**: Multiple range updates in single transaction
- **Optimized Storage**: Minimal on-chain data structure

### Security Features

- **Bounded Factors**: Prevent overflow in exponential calculations
- **Automatic Flushing**: Prevent precision loss from lazy updates
- **Access Control**: Only operators can create/settle markets

## Market Lifecycle

1. **Creation**: Operator creates market with outcome range and parameters
2. **Trading**: Users buy/sell range securities based on their predictions
3. **Settlement**: Operator posts final outcome value
4. **Payout**: Winning ranges automatically receive 1 SUSD per share

This mechanism enables sophisticated continuous-outcome prediction markets while maintaining the simplicity and efficiency needed for on-chain operation.
