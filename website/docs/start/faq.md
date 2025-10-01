# Frequently Asked Questions

This FAQ expands on the questions we hear most often so you understand not just the answer, but the rationale behind it.

## Daily market basics

**What market is live each day?** Signals lists one Bitcoin closing-price market per UTC day. A single `marketId` opens with bins defined by the configured tick spacing; if the settlement tick lands inside your half-open range `[lower, upper)`, you earn 1 SUSD for every 1 SUSD you committed.

**Where does the settlement price come from?** The operator verifies the market’s designated reference value and records it with `settleMarket`. Both the transaction and value live on-chain, so explorers provide an auditable record at any time.

## Preparing to trade

**How do I secure SUSD and gas?** On Citrea Testnet, request cBTC (gas) from the [official faucet](https://faucet.testnet.citrea.xyz/). When you first sign into the Signals app your wallet is automatically credited with **100 SUSD**. Join the [Signals Discord](https://discord.gg/tUyGDDz8Kt) and follow the directions in the welcome channel to unlock an additional **1,000 SUSD** trading balance. No manual minting is required.

**Can I adjust or exit a range after opening it?** Yes. Until the market closes you can increase, decrease, or close the position, and every adjustment executes at the live CLMSR probability. Because the cost function depends only on cumulative quantity, the order of trades never changes the final economics.

**Are protocol fees charged?** No protocol fee applies today. You only pay the network gas required to submit transactions.

## After settlement

**Is there a deadline to claim winnings?** Winning positions never expire. Call `claimPayout` whenever you are ready; the contract transfers your payout and burns the position NFT. We still recommend claiming soon after settlement so balances stay tidy.

**What happens if the front end disappears?** Funds and settlement logic reside in the smart contracts. Even without the Signals app, you can use an explorer or wallet to interact with the contracts and manage positions.

## Learn more

Dive deeper into the protocol by reading the [CLMSR overview](../mechanism/overview.md), the detailed notes on [cost and rounding](../mechanism/cost-rounding.md), and the full [Signals CLMSR whitepaper](/whitepaper.pdf). Operational plumbing is covered in the [Settlement Pipeline](/docs/market/settlement-pipeline).
