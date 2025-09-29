# How Signals Works

This guide follows a single market from configuration to final claims so you can see how the contracts, operators, and traders interact over a day. If you only want the high-level cadence, start with the [Market Flow Overview](./market-flow-overview.md); otherwise keep reading for the detailed path every position takes.

## 1. Scheduling the market

The loop begins when the operator submits daily parameters to `createMarket`. The transaction locks in the target UTC date, lower and upper ticks, the configured tick spacing, and the liquidity parameter $\alpha$. As soon as it lands, the resulting `marketId` is visible in the app and via the subgraph, and a tree of exponential weights is initialized so trades can arrive immediately.

## 2. Choosing a band

Traders express a thesis by highlighting a half-open range `[lower, upper)` where they believe the designated reference value will land. Inputs move in increments that match the market’s tick spacing, and the UI shows the live win probability and potential payout by reading the CLMSR potential. Because every band draws from the same pool, the quoted odds already reflect all other open ranges.

## 3. Paying for exposure

Opening or increasing a position debits SUSD (6 decimals) from the trader's wallet and records the exposure inside the pool. The contracts round costs up by at least one micro SUSD to keep “free” positions out of the system, and the paid amount remains at risk until the position is closed or settlement completes. Traders can size a thesis in a single band or spread exposure across adjacent bands without juggling separate assets.

## 4. Watching and adjusting

Throughout the configured trading window—open until the market’s cutoff ahead of settlement—every adjustment calls the same CLMSR machinery. Increasing a range multiplies the underlying weights, decreasing or closing unwinds them, and the order of operations never affects the final economics because the cost function depends solely on cumulative quantity. The app surfaces the probability chart, recent fills, and leaderboards so traders can react to shifting sentiment without leaving the interface.

## 5. Settlement and claims

After the window closes, the operator records the designated reference value via `settleMarket`. That call locks in the outcome on-chain and immediately makes every position claimable according to the CLMSR rules. Winning traders can call `claimPayout` whenever they like—there is no expiry—and the contract returns principal plus payout while burning the position token. Subgraph consumers and analytics jobs read the same state to keep recaps and dashboards aligned with the chain.

Ready to run the full flow yourself? Follow the [Quick Start](/docs/quickstart) to set up your wallet and test liquidity, then explore today's market.
