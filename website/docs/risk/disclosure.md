# Risk Disclosure and Important Considerations

Participating in prediction markets involves multiple categories of risk that can result in partial or total loss of funds. Understanding these risks is essential for making informed decisions about your involvement with the Signals protocol.

## Market and Trading Risks

Prediction market outcomes depend on future events that are inherently uncertain. Even well-researched positions can result in losses when actual outcomes differ from expectations. The range-based structure of Signals markets means that positions outside the final settlement range receive no payout regardless of how close they come to the actual outcome.

Price volatility affects position values continuously until settlement occurs. Market sentiment can shift rapidly based on new information, causing significant changes in the cost to exit positions before settlement. Positions that appear profitable at one point may become unprofitable due to subsequent market movements.

Liquidity constraints may prevent you from exiting positions at desired prices or quantities, particularly during periods of high volatility or low market participation. While the automated market maker provides consistent pricing, large position changes can result in significant price impact that affects your transaction costs.

Timing risks affect both entry and exit decisions. Market efficiency means that obvious opportunities are quickly arbitraged away, requiring careful analysis and prompt execution. Delayed transaction confirmations during network congestion can result in execution at prices different from those expected when transactions were submitted.

## Settlement and Oracle Risks

Settlement accuracy depends on authorized operators providing correct outcome values. While operators are selected for reliability and expertise, human error or data source issues could potentially result in incorrect settlements. The protocol's immutable settlement design means that errors cannot be corrected once committed to the blockchain.

Data source dependencies create additional points of failure in the settlement process. If authoritative price feeds experience technical issues, manipulation attempts, or definitional ambiguities, settlement outcomes might not reflect true market conditions. These risks are particularly relevant for markets based on external financial data.

The 90-day claim period requires active monitoring of settled positions. Failure to claim winning positions within this timeframe results in forfeiture of payouts. Technical issues, loss of wallet access, or simply forgetting about positions can lead to unclaimed winnings.

## Smart Contract and Technical Risks

Smart contract vulnerabilities could potentially be exploited to drain funds or manipulate market outcomes despite extensive testing and security measures. While the protocol implements established security patterns and undergoes careful review, no smart contract system can be considered completely risk-free.

Upgrade risks arise from the protocol's upgradeable design, which enables improvements but also creates potential for changes that affect existing positions or user expectations. While upgrades require appropriate governance processes, they represent a form of trust in the protocol development team.

Network dependency means that protocol functionality relies on the continued operation and security of the underlying Citrea blockchain. Network issues, consensus failures, or security compromises at the blockchain level could affect the protocol's operation or accessibility.

Gas price volatility on the underlying network affects transaction costs and may make certain operations economically unfeasible during periods of high network congestion. Large positions requiring multiple chunks are particularly sensitive to gas price changes.

## Regulatory and Compliance Risks

Prediction market regulations vary significantly across jurisdictions and continue evolving as regulators assess these novel financial instruments. Legal requirements in your jurisdiction may restrict or prohibit participation in prediction markets, creating potential compliance issues.

Tax implications of prediction market activities differ by location and individual circumstances. Gains and losses may be subject to various tax treatments including capital gains, gambling taxes, or other categories depending on local law. Professional tax advice is recommended for significant trading activity.

Cross-border considerations become relevant when participants access protocol interfaces or hold positions while traveling or relocating. Changes in jurisdictional exposure may affect the legality or tax treatment of existing positions.

## Operational and Financial Risks

The experimental nature of range-based prediction markets means that user interfaces, market designs, and operational procedures continue evolving. Early participants may encounter unexpected behaviors or design changes that affect their trading experience or strategies.

Concentration risk affects participants who allocate significant portions of their capital to prediction markets or specific outcome ranges. Diversification across markets, time periods, and traditional investment vehicles may help mitigate these risks.

Liquidity management becomes critical when positions represent substantial portions of your investment portfolio. The difficulty of quickly exiting large positions may create cash flow issues if you need to access funds rapidly for other purposes.

Education and experience gaps can lead to poor decision-making, particularly for participants unfamiliar with prediction market mechanics or the specific mathematical properties of continuous outcome markets. Starting with small positions while learning the system is generally advisable.

## Testnet Environment Considerations

Current Signals markets operate on the Citrea testnet, which carries additional risks compared to production blockchain environments. Testnet tokens have no monetary value, but testnet networks may experience different reliability characteristics than their production counterparts.

Contract addresses and parameters may change during the testnet phase as the protocol undergoes refinement. These changes could affect existing positions or require migration to new contract versions. Testnet participation should be considered experimental and educational rather than investment activity.

Future migration to production networks will involve new contract deployments with potentially different parameters, addresses, and operational characteristics. Testnet experience may not fully translate to production environment conditions.
