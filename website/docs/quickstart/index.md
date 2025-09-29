# Quick Start

Follow this path to go from zero to your first claimed range on Signals. You'll prepare a wallet, secure test liquidity, place a band in the live market, and watch the settlement play out.

## Step 1 - Prepare your wallet

Install MetaMask or any EVM-compatible wallet and add the **Citrea Tangerine Testnet** configuration. The values below match the current deployment:

```text
Network Name: Citrea Testnet
RPC URL:      https://rpc.testnet.citrea.xyz
Chain ID:     5115
Currency:     cBTC
Explorer:     https://explorer.testnet.citrea.xyz/
```

After adding the network, switch your wallet to Citrea so transactions route to the correct chain.

## Step 2 - Fund with test assets

You need two assets: cBTC for gas and SUSD for trading. Request cBTC from the [Citrea faucet](https://faucet.testnet.citrea.xyz/). For SUSD, either use the Signals faucet advertised in the community Discord or mint it locally with Hardhat:

```bash
npx hardhat run scripts/mint-susd.ts --network <env>
```

Use `citrea-dev` to target the development deployment or `citrea-prod` for the production test market. Confirm balances in your wallet before proceeding.

## Step 3 - Load today's market

Open the Signals app. The home screen highlights the active “Bitcoin Closing Price on …” card with countdown, chart, and leaderboards. Connect your wallet; the trade panel immediately reflects your SUSD balance and the market's configured tick band.

## Step 4 - Place your first range

Choose the lower and upper ticks using the market’s configured spacing. Enter the amount of SUSD you want to risk, confirm the displayed win probability and payout, and approve the transaction. The CLMSR pool debits your payment as soon as the transaction finalises and mints an ERC-721 position token to your wallet.

## Step 5 - Monitor through settlement

Until the countdown reaches the configured cutoff you can increase, decrease, or close the position in single clicks. The probability chart and recent trades stream show how other participants are moving the surface, helping you decide whether to hold or rotate ranges. If operations ever pause the market, the UI displays the status and the contract prevents new trades.

## Step 6 - Claim the payout

After the trading window closes, the operator settles the market with the designated reference value. Once `settleMarket` lands on-chain, open the “My Positions” tab and click **Claim** beside any winning range. Claims have no expiration, but completing them right away keeps your balances tidy.

## Where to go next

- Learn deeper tactics in the [Trader Guide](../user/positions-lifecycle.md).
- Understand the back-office flow in [Settlement & Claims](../user/settlement.md).
- Dive into the mechanism details in the [CLMSR spec](../mechanism/overview.md).
