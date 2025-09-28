# Glossary

Signals uses a tight vocabulary so traders, operators, and integrators stay aligned. Each entry below explains what the word means in practice and where you will encounter it.

**Band** - A $100-wide half-open range `[lower, upper)` you buy or sell in the CLMSR. Bands settle 1:1 in SUSD when the final tick lands inside them, and adjacent bands can be combined to express wider views.

**Closing tick** - The integer tick derived from CoinMarketCap's BTC/USD daily close: `tick = floor(price / 100)`. This value is clamped into the configured bounds during settlement and determines which bands win.

**CLMSR** - The Continuous Logarithmic Market Scoring Rule, implemented in Solidity to keep every band connected through a single potential. It ensures probabilities across bands always sum to 1 and that maker loss is capped by the liquidity parameter $\alpha$.

**Points** - Engagement rewards emitted by `PointsGranter`. They feed the leaderboard UI and analytics but never change SUSD payouts. Reasons are logged on-chain (1 = Activity, 2 = Performance, 3 = Risk Bonus).

**SUSD** - The 6-decimal token used for staking and payouts on Signals. Testnet users mint it via the provided script or faucet; all trades and claims settle in SUSD.

**Stake** - The SUSD amount you commit to a band. It debits from your wallet when the trade executes, remains locked until you close or settle, and returns with payout if you win.

**Timer** - The countdown to 23:59:59 UTC shown in the app. When it hits zero, trading freezes, the operator verifies CoinMarketCap, and settlement begins.

Need more terminology? The [mechanism spec](../mechanism/overview.md) and [protocol architecture](../protocol/architecture.md) drill into the full contract model.
