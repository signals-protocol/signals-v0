# Glossary of Terms

**Alpha (α)**: The liquidity parameter that determines market depth and price impact in the automated market maker. Higher alpha values provide more liquidity and reduce price sensitivity to individual trades, while lower values increase price responsiveness to trading activity.

**Chunk**: A subdivision of large trading operations designed to stay within safe computational bounds. The protocol automatically splits trades requiring more than the maximum safe exponential input into multiple chunks, processing each sequentially while maintaining mathematical accuracy.

**Claim Period**: The 90-day window following market settlement during which winning position holders can retrieve their payouts. Unclaimed winnings after this deadline are forfeited and remain with the protocol.

**CLMSR**: Continuous Logarithmic Market Scoring Rule, the mathematical framework underlying the Signals protocol. CLMSR enables range-based prediction markets by maintaining a unified liquidity pool and calculating costs through logarithmic functions of exponential weight changes.

**Cost Function**: The mathematical formula `α × ln(sum_after / sum_before)` that determines the price for purchasing range securities. The function ensures path independence, meaning the total cost remains identical regardless of whether shares are purchased in multiple small transactions or one large transaction.

**Lazy Multiplicative Segment Tree**: The data structure used to efficiently store and update exponential weights across market outcome ranges. The tree supports O(log n) complexity for range operations and includes lazy propagation to defer computations until needed.

**Pending Factor**: A multiplication value stored in segment tree nodes that represents deferred operations not yet applied to child nodes. Pending factors enable efficient range updates by avoiding immediate propagation of changes throughout the entire tree structure.

**Position**: A holding of range securities that entitles the holder to payouts if the market settles within the specified tick range. Positions are represented as ERC-721 tokens and can be increased, decreased, or closed before market settlement.

**Range Securities**: Tokenized claims on specific outcome intervals that pay 1 SUSD per share if the final settlement value falls within the specified range. Range securities enable precise expression of beliefs about probability distributions rather than simple binary outcomes.

**Settlement Tick**: The discrete tick value calculated from the settlement outcome using floor division: `floor(settlement_value / 1e6)`. The settlement tick determines which position ranges qualify for payouts based on the half-open interval inclusion rules.

**Settlement Value**: The official outcome value submitted by authorized operators using 6-decimal precision. This value becomes immutable once committed to the blockchain and serves as the definitive basis for determining winning positions.

**SUSD**: The 6-decimal token used for trading and settlement in Signals markets. SUSD follows USDC formatting conventions while being specifically designed for protocol compatibility and mathematical requirements.

**Tick**: A discrete unit in the outcome space representing a specific price level or range boundary. Ticks are spaced according to market-specific intervals and serve as the fundamental building blocks for defining position ranges.

**Tick Spacing**: The price interval between consecutive ticks in a market, determining the granularity of range definitions. Markets with smaller tick spacing enable more precise range selection but require more computational resources for equivalent price ranges.

**WAD**: An 18-decimal fixed-point number format used for internal protocol calculations. WAD precision enables accurate mathematical operations while external interfaces convert to 6-decimal representations for user familiarity.

**Weight**: The exponential value `exp(q/α)` associated with each tick or range, where q represents the quantity of shares outstanding. Weights determine relative probabilities and are updated through multiplication factors when positions are opened or closed.

**Range Factor Application**: The process of updating exponential weights within a specified tick range by multiplying them by a calculated factor. This operation underlies all position changes and maintains the mathematical consistency of the probability distribution.

**Flush Threshold**: The limit value (1 × 10^21) that triggers automatic propagation of pending factors down the segment tree. Flushing prevents overflow accumulation while maintaining mathematical correctness of deferred operations.

**Half-Open Interval**: The range notation [lower, upper) where the lower bound is inclusive and the upper bound is exclusive. This convention prevents ambiguity when adjacent ranges meet at common boundaries and ensures consistent settlement behavior.

**Operator**: An authorized account with permission to settle markets by submitting official outcome values. Operators bear responsibility for accuracy and timeliness of settlement data while operating within the protocol's immutable settlement framework.

**Proxy Contract**: The unchanging contract address that users interact with, which delegates function calls to upgradeable implementation contracts. The proxy pattern enables protocol improvements while maintaining consistent addresses and preserving user data.

**Implementation Contract**: The contract containing the actual protocol logic, which can be upgraded while preserving storage state and user positions. Implementation contracts include authorization checks to prevent unauthorized modifications.

**Gas Optimization**: Design principles and mechanisms that minimize transaction costs while maintaining functionality. The protocol includes chunk limits, lazy evaluation, and efficient data structures to optimize gas consumption for users.

**Price Impact**: The effect of trading activity on market prices, determined by position size relative to market liquidity. Larger trades relative to the alpha parameter create greater price impact, while smaller trades have minimal effect on market pricing.

**Probability Distribution**: The assignment of likelihood estimates across all possible market outcomes, represented through range security prices that sum to 1 SUSD. The distribution evolves continuously as trading activity reveals new information about expected outcomes.
