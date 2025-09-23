# Quick Start

Trade the daily Bitcoin market in minutes. This guide walks you from wallet setup to placing and claiming your first range.

## 1. Connect wallet & network

1. Install MetaMask (or any EVM wallet).
2. Add **Citrea Tangerine Testnet**:
   ```text
   Network Name: Citrea Testnet
   RPC URL:      https://rpc.testnet.citrea.xyz
   Chain ID:     5115
   Currency:     cBTC
   Explorer:     https://explorer.testnet.citrea.xyz/
   ```
3. Switch your wallet to Citrea.

## 2. Get test tokens

- Request cBTC from the [Citrea faucet](https://faucet.testnet.citrea.xyz/) for gas.
- Mint or request SUSD test tokens via the Signals faucet (see community Discord) or by running `npx hardhat run scripts/mint-susd.ts --network <env>`.
  - Use `citrea-dev` for the development deployment or `citrea-prod` for the production test market.

## 3. Enter today’s market

1. Open the Signals app. You’ll see the active “Bitcoin Closing Price on …” card with timer, chart, and leaderboards.
2. Connect your wallet; your SUSD balance appears in the trade panel.

## 4. Pick a range and stake

1. Select the minimum and maximum prices using the $100-increment inputs.
2. Enter the amount of SUSD you want to stake.
3. Review the displayed **win probability** and **payout**.
4. Confirm the transaction. The AMM debits your stake immediately.

## 5. Manage until settlement

- Increase or decrease your range whenever you like before the countdown ends.
- Use the probability chart and recent trades list to stay informed.

## 6. Settlement & claim

1. After the daily close, the Signals operator settles the market using the official CoinMarketCap price.
2. Once the “Settlement events complete” banner appears, click **Claim** next to each winning position.
3. SUSD payouts transfer instantly; there is **no expiration** on claims.

## What next?

- Learn tactics in the [Trader Guide](../user/positions-lifecycle.md).
- Understand the settlement flow in [Settlement & Claims](../user/settlement.md).
- Explore the underlying mechanism in the [Mechanism Spec](../mechanism/overview.md).
