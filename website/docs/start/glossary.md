# Glossary

Signals uses a tight vocabulary so traders, operators, and integrators stay aligned. Each entry below explains what the word means in practice and where you will encounter it.

**Band** - A half-open range `[lower, upper)` you buy or sell in the CLMSR. Band width is set by the market’s tick spacing, and adjacent bands can be combined to express wider views.

**Closing tick** - The integer tick derived from the designated reference value. The price is mapped onto the configured grid, clamped into bounds during settlement, and determines which bands win.

**CLMSR** - The Continuous Logarithmic Market Scoring Rule, implemented in Solidity to keep every band connected through a single potential. It ensures probabilities across bands always sum to 1 and that maker loss is capped by the liquidity parameter $\alpha$.

**Points** - Engagement rewards emitted by `PointsGranter`. They feed the leaderboard UI and analytics but never change SUSD payouts. Reasons are logged on-chain (1 = Activity, 2 = Performance, 3 = Risk Bonus).

**SUSD** - The 6-decimal token used for trades and payouts on Signals. Testnet users mint it via the provided script or faucet; all trades and claims settle in SUSD.

**Committed amount** - The SUSD you pay to enter a band. It debits from your wallet when the trade executes, remains locked until you close or settle, and returns with payout if you win.

**Timer** - The countdown to the market’s trading cutoff. When it hits zero, trading freezes, the operator verifies the reference price, and settlement begins.

Need more terminology? The [mechanism spec](../mechanism/overview.md) and [protocol architecture](../protocol/architecture.md) drill into the full contract model.
