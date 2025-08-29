# Signals: Range-Based Bitcoin Prediction

Signals enables prediction markets on continuous outcomes rather than simple binary questions. Instead of betting whether Bitcoin will be above or below a specific price, you can express precise predictions by purchasing range securities that cover specific price intervals.

## The Range Security Innovation

Traditional prediction markets limit you to yes-or-no questions such as "Will BTC exceed $50,000 by January 31st?" This binary approach fragments liquidity across many separate markets and fails to capture the nuanced nature of price movements. Signals solves this problem through range securities that allow you to bet on specific price intervals.

When you purchase range securities for the interval $52,000 to $54,000, you are expressing your belief that Bitcoin will settle within that exact range. Each range security pays out 1 SUSD if the final settlement value falls within your chosen interval. The price you pay for these securities directly represents the market's estimated probability of that outcome occurring.

## How Price Discovery Works

The protocol implements a Continuous Logarithmic Market Scoring Rule that maintains a single unified liquidity pool across all possible outcome ranges. This design eliminates the liquidity fragmentation that plagues traditional binary prediction markets. When you purchase range securities, the cost is calculated using the formula `α × ln(sum_after / sum_before)`, where alpha represents the liquidity parameter and the sums represent the total exponential weights before and after your trade.

The mathematical foundation ensures that prices always sum to 1 SUSD across all possible outcomes, creating an internally consistent probability distribution. If a range currently costs 0.25 SUSD, the market collectively estimates a 25% probability that the final outcome will fall within that range.

## Market Settlement and Payout

Markets operate with predefined settlement criteria and timing. When a market reaches its settlement date, an authorized operator posts the final outcome value using 6-decimal precision. The protocol then determines winning ranges by checking which intervals contain the settlement tick, calculated as `floor(settlement_value / 1e6)`.

Position holders whose ranges include the settlement tick can claim 1 SUSD per share they own. The claiming process is permissionless once settlement occurs, allowing position holders to retrieve their winnings at any time within the 90-day claim period.

## Bitcoin Markets on Citrea

Signals currently operates Bitcoin prediction markets on the Citrea testnet, providing a secure zkRollup environment that inherits Bitcoin's security guarantees while offering EVM compatibility. Transaction fees are paid in cBTC, Citrea's native token, while all trading and settlement occurs in SUSD, a 6-decimal token that follows USDC formatting conventions.

The protocol's gas-efficient design uses a lazy multiplicative segment tree to handle range operations in O(log n) complexity, making it economical to support markets with hundreds of distinct price ranges. Safety mechanisms limit individual transactions to 1000 computational chunks and enforce bounds on multiplicative factors to prevent overflow conditions.

## Getting Started

To begin using Signals, you need a Web3 wallet configured for the Citrea testnet, some cBTC for transaction fees, and SUSD tokens for trading. The Quick Start guide provides detailed instructions for wallet setup and executing your first trade.

The protocol documentation covers mathematical foundations, security considerations, and data access through GraphQL endpoints. Whether you are a trader seeking to express nuanced market views, a researcher analyzing prediction accuracy, or a developer building on top of the protocol, the documentation provides the context and technical details needed to engage effectively with Signals.

---

**Network**: Citrea Testnet (Chain ID 5115)  
**Settlement Token**: SUSD (6 decimals, USDC-style)  
**Transaction Fees**: cBTC  
**Contract Addresses**: [View deployment details →](/docs/addresses)
