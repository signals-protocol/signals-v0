# Trader Guide

This guide follows a Signals position from the moment you sketch a thesis to the instant you claim your payout. Use it alongside the live app so each action on-screen matches the contract calls happening under the hood.

## Framing your trade

Start by deciding where the market’s designated reference value is most likely to land. The interface lets you drag or type tick bounds that respect the configured spacing, which map directly to on-chain bands. Because the range is half-open, the settlement tick must be greater than or equal to the lower bound and strictly less than the upper bound. Before you confirm, the UI reads the CLMSR potential and shows the exact probability, price impact, and payout so you understand what the pool is charging.

## Funding the position

Submitting the transaction transfers SUSD (6 decimals) from your wallet into the pool and mints an ERC-721 position token that records market, bounds, and quantity. Costs are rounded up by at least one micro SUSD, which keeps dust trades from existing for free. The capital you committed stays at risk until you unwind the band or settlement completes, and you retain full custody of the position token in the meantime.

## Managing exposure during the day

From market creation until the configured cutoff ahead of settlement, you can increase, decrease, or close the position as often as needed. Increasing multiplies the underlying exponential weights inside the band; decreasing unwinds part of that exposure and returns SUSD at the current probability; closing drives quantity to zero and burns the position NFT. Because the CLMSR cost function depends only on cumulative quantity, the order of these adjustments never changes the final economics—you can ladder in, scale out, or rotate bands without worrying about path dependence.

## Reading the interface

Three panes keep you oriented while you trade:
- The probability chart overlays the live price line with the distribution of outstanding bands so you can see how sentiment shifts after large orders.
- Recent trades stream fills as they happen, giving a real-time sense of which ranges are attracting flow.
- The leaderboard surfaces wallets earning points, useful when you want to track consistent performers or community programs.

## Preparing for settlement

As the countdown nears zero, double-check that your thesis still holds. Capture a note about why you entered the band so you can evaluate it after settlement. If monitoring scripts or operators pause the market, the interface displays the state and blocks additional trades until the issue is resolved. Otherwise, let the timer hit zero and watch for the settlement banner.

## After the close

When `settleMarket` posts the official tick, the contracts mark each position. As soon as your band is flagged as settled, open “My Positions” and click **Claim** to withdraw your principal plus payout; claims never expire, but claiming promptly keeps your balances clear. For a deep dive into what happens behind the scenes, read [Settlement & Claims](./settlement.md) and the [Settlement Pipeline](../market/settlement-pipeline.md).
