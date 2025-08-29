# Frequently Asked Questions

## Understanding Range Securities

**Why do prices equal probabilities in Signals?**
The protocol implements a logarithmic market scoring rule that automatically adjusts prices based on the exponential weights of different outcome ranges. When you purchase range securities, you increase the weight assigned to your chosen range, which increases its price. The mathematical relationship ensures that all range prices sum to exactly 1 SUSD, creating a valid probability distribution where each price represents the market's collective estimate of that outcome's likelihood.

**How do range boundaries work with the settlement process?**
Range boundaries follow a half-open interval convention where the lower bound is inclusive and the upper bound is exclusive, written as [lower, upper). If you hold positions for range [52000, 54000) and settlement occurs at exactly $52000, your position wins. However, if settlement occurs at exactly $54000, your position does not win because the upper boundary excludes that exact value. This convention prevents ambiguity when adjacent ranges meet at common boundaries.

**Can multiple positions win in the same market?**
Yes, multiple overlapping positions can win simultaneously if they all contain the settlement tick. Each winning position pays out independently at 1 SUSD per share regardless of how many other positions also win. This differs from traditional betting where only one outcome can win, enabling more nuanced expression of beliefs about likely outcome distributions.

## Trading and Position Management

**What determines the cost of range securities?**
Position costs depend on the current probability distribution across all market outcomes and the specific range you select. Ranges with higher market-estimated probabilities cost more per share, while ranges considered unlikely by the market trade at lower prices. The cost calculation uses the formula α × ln(sum_after / sum_before), where the sums represent total exponential weights before and after your trade.

**Why do I need to specify maximum cost when opening positions?**
The maximum cost protection prevents you from paying more than intended due to price movements that occur between transaction submission and execution. During periods of high trading activity, market conditions can change rapidly. If the calculated cost at execution time exceeds your specified maximum, the transaction will be rejected rather than executing at an unexpected price.

**How does position reduction work before settlement?**
You can sell portions of your holdings back to the market before settlement occurs, receiving SUSD based on current market conditions. The proceeds calculation applies the inverse of the purchase cost formula, potentially resulting in gains or losses depending on how market sentiment has shifted since you opened your position. Reduction operations require specifying minimum proceeds to protect against unfavorable price changes during execution.

**What happens if I forget to claim winning positions?**
Winning positions must be claimed within 90 days of market settlement to receive payouts. After this deadline, unclaimed winnings are forfeited and remain with the protocol. The extended claim period accommodates various delays, but ultimately establishes a definitive endpoint for market resolution. Setting reminders or monitoring tools can help ensure timely claiming of winning positions.

## Technical and Mathematical Questions

**How does the chunked transaction system work?**
Large trades that exceed safe calculation limits are automatically split into multiple chunks, with each chunk sized to stay within mathematical bounds. The protocol processes up to 1000 chunks per transaction, with each chunk sized to avoid exponential overflow. This approach maintains mathematical accuracy while accommodating substantial position sizes that might otherwise require multiple separate transactions.

**Why does the protocol use ceiling rounding for costs?**
Ceiling rounding on purchase costs prevents zero-cost attacks where users might exploit precision limitations to acquire shares for free or at artificially low prices. This rounding policy creates a small systematic bias in favor of the protocol that accumulates minor amounts serving as a buffer against precision-related arbitrage opportunities.

**What is the significance of the 18-decimal internal precision?**
Internal calculations use 18-decimal WAD precision to maintain mathematical accuracy throughout complex operations involving exponential functions and range updates. This high precision minimizes cumulative rounding errors while enabling precise probability calculations. External user interfaces convert to 6-decimal precision matching standard USDC formatting for familiar user experience.

## Settlement and Oracles

**Who determines settlement outcomes and how?**
Market settlement is restricted to authorized operators who submit official outcome values using 6-decimal precision. The current implementation relies on trusted operators while future versions may incorporate additional oracle mechanisms. Settlement values become immutable once committed to the blockchain, emphasizing the importance of accuracy in the initial submission.

**What happens if settlement data sources have problems?**
Settlement accuracy depends on the quality and availability of underlying data sources. Technical issues, manipulation attempts, or definitional ambiguities in external price feeds could potentially affect settlement outcomes. The protocol's immutable settlement design means that such issues cannot be corrected after settlement is finalized, highlighting the importance of reliable data sources and operator procedures.

## Network and Token Questions

**Why does Signals use SUSD instead of USDC directly?**
SUSD follows 6-decimal USDC formatting conventions while being specifically designed for the Signals protocol environment. This approach provides familiar precision and user experience while enabling protocol-specific optimizations and features. The 6-decimal format matches the mathematical requirements of the cost calculation and settlement systems.

**What are the implications of operating on Citrea testnet?**
Testnet operation means that all tokens have no monetary value and the network may experience different reliability characteristics compared to production environments. Contract addresses and parameters may change during the testnet phase as the protocol undergoes refinement. Testnet participation should be considered educational and experimental rather than investment activity.

**How do gas costs affect large positions?**
Gas costs for position operations scale with transaction complexity, particularly for large positions requiring chunk-based processing. Multiple chunks within a single transaction share fixed costs but add variable costs for each chunk processed. Very large positions might benefit from execution across multiple transactions to optimize total gas expenditure.

## Risk and Regulatory Considerations

**What are the main risks of participating in prediction markets?**
Risks include market risk from uncertain outcomes, liquidity risk affecting exit opportunities, settlement risk from data sources or operator decisions, smart contract risk from potential vulnerabilities, and regulatory risk from evolving legal requirements. Understanding these risk categories helps inform appropriate position sizing and risk management strategies.

**How should I think about legal and tax implications?**
Legal and tax treatment of prediction market activities varies significantly across jurisdictions and individual circumstances. Regulations continue evolving as authorities assess these novel financial instruments. Professional legal and tax advice is recommended for significant trading activity, particularly for participants subject to multiple jurisdictions.
