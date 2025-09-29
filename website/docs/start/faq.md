# Frequently Asked Questions

This FAQ expands on the questions we hear most often so you understand not just the answer, but the rationale behind it.

## Daily market basics

**What market is live each day?** Signals lists one Bitcoin closing-price market per UTC day. A single `marketId` opens with bands defined by the configured tick spacing; if the settlement tick lands inside your half-open range `[lower, upper)`, you earn 1 SUSD for every 1 SUSD you committed.

**Where does the settlement price come from?** The operator verifies the market’s designated reference value and records it with `settleMarket`. Both the transaction and value live on-chain, so explorers and the Goldsky subgraph provide an auditable record at any time.

## Preparing to trade

**How do I secure SUSD and gas?** On Citrea Testnet, request cBTC (gas) from the [official faucet](https://faucet.testnet.citrea.xyz/). Acquire SUSD through the Signals faucet announced in the community Discord or mint it locally with the Hardhat script shown in the [Quick Start](/docs/quickstart).

**Can I adjust or exit a range after opening it?** Yes. Until the market closes you can increase, decrease, or close the position, and every adjustment executes at the live CLMSR probability. Because the cost function depends only on cumulative quantity, the order of trades never changes the final economics.

**Are protocol fees charged?** No protocol fee applies today. You only pay the network gas required to submit transactions.

## After settlement

**Is there a deadline to claim winnings?** Winning positions never expire. Call `claimPayout` whenever you are ready; the contract returns principal plus payout while burning the position NFT. We still recommend claiming soon after settlement so balances stay tidy.

**What happens if the front end disappears?** Funds and settlement logic reside in the smart contracts. Even without the Signals app, you can interact directly with the contracts--addresses and ABIs are published in the repo--to manage positions or withdraw funds.

## Learn more

Dive deeper into the protocol by reading the [CLMSR overview](../mechanism/overview.md), the detailed notes on [cost and rounding](../mechanism/cost-rounding.md), and the full [Signals CLMSR whitepaper](/whitepaper.pdf). Operational plumbing is covered in the [Settlement Pipeline](/docs/market/settlement-pipeline).
