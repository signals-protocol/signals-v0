# Risk Guide

Signals is a live trading product—treat it with the same respect you give any venue that holds funds and settles against market data.

## Trading risk

- **Outcome uncertainty**: even a strong thesis can miss the settlement band by $100. Size responsibly.
- **Volatility**: large intraday moves can swing probabilities; consider diversifying across multiple ranges.
- **Liquidity shifts**: the AMM rebalances instantly, but big trades can still move the odds. Watch the chart before committing size.

## Operational risk

- **Data source**: settlement uses CoinMarketCap’s BTC/USD close. If CMC or our ingest pipeline fails, settlement may be delayed until the official price is verified.
- **Operator trust**: Signals runs the markets and submits settlement values. All transactions are on-chain and auditable, but you rely on us to execute honestly (see [Security & Testing](../security/audits.md) for the current safeguards and roadmap).
- **Batch completion**: claims only unlock after settlement batches finish. We highlight progress in the UI and subgraph.

## Technical risk

- **Smart contracts**: the CLMSR implementation is open-source but, like any protocol, could have undiscovered bugs.
- **Network**: running on Citrea Testnet means RPC hiccups or chain upgrades can momentarily disrupt trading.
- **Gas costs**: extreme congestion can raise gas prices, especially during settlement.

## Best practices

- Start with small stakes until you understand the flow.
- Keep a record of your trades and outcomes to calibrate future decisions.
- Claim winnings promptly and verify settlement data if anything looks off.

See [Security & Testing](../security/audits.md) for more detail on how we run the protocol safely.
