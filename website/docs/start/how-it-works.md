# How Signals Works

This guide follows a single market from configuration to final claims so you can see how the contracts, operators, and traders interact over a day. If you only want the high-level cadence, start with the [Market Flow Overview](./market-flow-overview.md); otherwise keep reading for the detailed path every position takes.

## 1. Scheduling the market

The loop begins when the operator submits daily parameters to `createMarket`. The transaction locks in the target UTC date, lower and upper ticks, $100 spacing, and the liquidity parameter $\alpha$. As soon as it lands, the resulting `marketId` is visible in the app and via the subgraph, and a tree of exponential weights is initialised so trades can arrive immediately.

## 2. Choosing a band

Traders express a thesis by highlighting a half-open range `[lower, upper)` where they believe the CoinMarketCap close will land. Inputs move in $100 increments to match the on-chain ticks, and the UI shows the live win probability and potential payout by reading the CLMSR potential. Because every band draws from the same pool, the quoted odds already reflect all other open ranges.

## 3. Staking SUSD

Funding the position debits SUSD (6 decimals) from the trader's wallet and passes it into the pool. The contracts round costs up by at least one micro SUSD to keep “free” positions out of the system, and the stake remains locked until the position is closed or settled. Traders can size a thesis in a single band or spread exposure across adjacent bands without juggling separate assets.

## 4. Watching and adjusting

Through the trading window--open until 23:59:59 UTC--every adjustment calls the same CLMSR machinery. Increasing a range multiplies the underlying weights, decreasing or closing unwinds them, and the order of operations never affects the final economics because the cost function depends solely on cumulative quantity. The app surfaces the probability chart, recent fills, and leaderboards so traders can react to shifting sentiment without leaving the interface.

## 5. Settlement and claims

After the window closes, the operator verifies the CoinMarketCap BTC/USD daily close and posts it via `settleMarket`. Follow-up jobs iterate `emitPositionSettledBatch(limit)` until every position is marked with a settlement event. Winning traders can then call `claimPayout` whenever they like--there is no expiry--and the contract returns stake plus payout while burning the position token. The same events feed the subgraph, keeping analytics and community recaps in sync with the chain.

Ready to run the full flow yourself? Follow the [Quick Start](/docs/quickstart) to set up your wallet and test liquidity, then explore today's market.
