# Glossary

**Band** — A $100-wide range `[lower, upper)` that pays 1 SUSD per share if the closing tick lands inside.

**Closing tick** — The integer tick computed from CoinMarketCap’s BTC/USD daily close: `tick = floor(price / 100)`.

**CLMSR** — Continuous Logarithmic Market Scoring Rule. The AMM that keeps prices normalized and allows arbitrary range trades.

**Points** — Engagement rewards displayed on the leaderboard. They do not affect payouts.

**SUSD** — The 6-decimal token used for staking and payouts on Signals.

**Stake** — The SUSD amount you risk on a band. Winning bands return stake $\times 1$.

**Timer** — The countdown to the end of trading (23:59:59 UTC on the target date).

Need deeper technical terminology? See the [Mechanism Spec](../mechanism/overview.md).
