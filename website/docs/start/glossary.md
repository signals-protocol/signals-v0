# Glossary

Signals uses a tight vocabulary so traders, operators, and integrators stay aligned. Each entry below explains what the word means in practice and where you will encounter it.

**Bin** - A single half-open tick interval `[lower, upper)` determined by the market’s spacing. Every price level on the outcome grid maps to exactly one bin.

**Range** - One or more consecutive bins that share the same position. Traders specify a lower and upper tick to define their range; a single bin is therefore a valid range.

**Closing tick** - The integer tick derived from the designated reference value. The price is mapped onto the configured grid, clamped into bounds during settlement, and determines which ranges win.

**CLMSR** - The Continuous Logarithmic Market Scoring Rule, implemented in Solidity to keep every bin connected through a single potential. It ensures probabilities across bins always sum to 1 and that maker loss is capped by the liquidity parameter $\alpha$.

**SUSD** - The 6-decimal token used for trades and payouts on Signals. New wallets receive 100 SUSD automatically in-app, and another 1,000 SUSD is available through the [Signals Discord](https://discord.gg/tUyGDDz8Kt); all trades and claims settle in SUSD.

**Committed amount** - The SUSD you pay to enter a range. It debits from your wallet when the trade executes, remains locked until you close or settle, and if the range wins the pool pays the quoted payout.

**Timer** - The countdown to the market’s trading cutoff. When it hits zero, trading freezes, the operator verifies the reference price, and settlement begins.
