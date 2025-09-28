# Protocol Parameters

Signals keeps most policy choices simple: operators configure markets up front, while the contracts enforce hard safety bounds. This page summarises the knobs you can turn when deploying or operating a market and the constants that should not change without a protocol upgrade.

## Market-level choices

Each daily market begins with an `OutcomeSpec = (L, U, s, d)` describing the oracle bounds, tick spacing, and decimal scale. Operators pair that spec with a liquidity parameter $\alpha$, the trading window (`startTimestamp`, `endTimestamp`, optional `settlementTimestamp`), and the settlement token (currently 6-decimal SUSD). These inputs determine how fine the outcome grid is, how volatile the probability surface can become, and how much loss the maker is willing to tolerate. The whitepaper recommends a minimum order size of $0.01$ SUSD; until the contracts enforce it, interfaces should warn or reject smaller orders.

## Hard-coded safeguards

Several constants live directly in the Solidity libraries and should remain untouched unless the mechanism itself evolves:

- `MAX_TICK_COUNT = 1_000_000` keeps the segment tree manageable.
- `MAX_CHUNKS_PER_TX = 1_000`, `MAX_EXP_INPUT_WAD = 1.0e18`, and `MIN_FACTOR`/`MAX_FACTOR = 0.01e18 / 100e18` bound the lazy exponential updates.
- `FLUSH_THRESHOLD = 1e21` forces deferred factors to propagate before they accumulate risk.

The rationale behind these numbers is detailed in [Safety Bounds & Parameters](../mechanism/safety-parameters.md).

## Access and governance

Today the protocol relies on a single `Ownable` owner to create markets, pause or unpause trading, settle outcomes, and upgrade proxies. Users interact permissionlessly: they open, adjust, and close ranges and claim payouts whenever they like. Timelock and multisig wrappers are planned, and when they ship this section will expand to document additional roles.

## Upgrade process

Signals uses the UUPS proxy pattern. Upgrades require the owner to deploy a new implementation, verify it, and call `upgradeTo` on each proxy. Storage gaps (`__gap`) in core contracts preserve layout compatibility, while deployment manifests (`deployments/environments/*.json`) log every implementation hash and timestamp so auditors can trace history. For the operational checklist, see [Governance & Upgrades](upgrades.md).

## Economic policy

The base CLMSR mechanism charges no protocol fee. Incentive programs run through auxiliary contracts such as `PointsGranter` or entirely off-chain systems. Should a fee or reward scheme move on-chain, it will be documented here with explicit formulas and governance controls instead of being baked into the CLMSR cost function.
