# Frequently Asked Questions

### What market is live today?
Signals runs one market at a time: Bitcoin’s daily closing price for a specific UTC date. All ranges are $100 wide. If the closing candle lands inside your band, you receive a 1:1 SUSD payout.

### Where does the settlement price come from?
We use CoinMarketCap’s BTC/USD daily close (UTC 00:00–23:59). The settlement transaction is published on-chain so anyone can audit it.

### How do I get SUSD and gas?
On Citrea Testnet you can request cBTC (gas) from the official faucet and SUSD from the Signals faucet or CLI script. The [Quick Start](/docs/quickstart) walks you through the steps.

### Can I change my mind after entering a range?
Yes. Before settlement you can increase, decrease, or close a position at any time. Every adjustment executes at the current probability.

### Are there trading fees?
No protocol fee is charged. You only pay network gas for each transaction.

### Is there a deadline to claim winnings?
No. Claims never expire. We still recommend claiming soon after settlement so you don’t forget about unclaimed funds.

### What if Signals disappears?
Funds and settlement logic live in smart contracts. Signals provides the market interface and submits settlement data, but users can always interact directly with the contracts to withdraw balances.

### Where can I learn more about the mechanism?
Check out the [Mechanism Spec](../mechanism/overview.md) and the [Signals CLMSR whitepaper](/whitepaper.pdf) for the maths and design details.
