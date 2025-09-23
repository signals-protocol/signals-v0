# Protocol Parameters

This page catalogues configurable parameters and constants that govern Signals deployments. Values come from the CLMSR whitepaper and the current Solidity contracts; when they differ, the whitepaper entry describes the intended change.

## Market Configuration

| Parameter | Description | Source |
| --- | --- | --- |
| `OutcomeSpec = (L, U, s, d)` | Outcome bounds, tick spacing, and oracle decimals | Operator per market |
| `α` (alpha) | Liquidity parameter controlling slippage and maker loss | Operator per market |
| Trading window | `startTimestamp`, `endTimestamp`, optional `settlementTimestamp` | Operator per market |
| Payment token | ERC-20 used for trades (SUSD, 6 decimals) | Deployment |

### Recommended Defaults

- Minimum trade size `δ_min = 0.01 SUSD` (spec) — enforce in UI until contracts add the guard.
- Choose `s` based on desired resolution; finer spacing increases gas and `α × ln n`.

## Hard-Coded Constants

| Constant | Value | Purpose |
| --- | --- | --- |
| `MAX_TICK_COUNT` | `1_000_000` | Prevents excessive tree depth |
| `MAX_CHUNKS_PER_TX` | `1_000` | Caps exponential chunking loops |
| `MIN_FACTOR` / `MAX_FACTOR` | `0.01e18` / `100e18` | Bounds lazy multipliers |
| `FLUSH_THRESHOLD` | `1e21` | Forces propagation of large pending factors |
| `MAX_EXP_INPUT_WAD` | `1.0e18` | Safe input for PRB-Math `exp` |

See [Safety Bounds & Parameters](../mechanism/safety-parameters.md) for the reasoning behind these numbers.

## Access Control

| Role | Capabilities | Notes |
| --- | --- | --- |
| Owner (`Ownable`) | Market creation, settlement, pause/unpause, upgrades | Single account today |
| Users | Open/increase/decrease/close positions, claim payouts | Permissionless |

No timelock or multisig wrapper is deployed yet; a future governance upgrade will document additional roles.

## Upgrade Process

- Contracts use the UUPS proxy pattern. Upgrades require the owner to call `upgradeTo` on each proxy.
- Storage gaps (`__gap`) are maintained in core contracts to keep layout compatibility.
- Deployment manifests (`deployments/environments/*.json`) record every implementation address.

See [Governance & Upgrades](upgrades.md) for the operational checklist.

## Economic Policy

The core CLMSR mechanism does not charge protocol fees. Any incentives (e.g., PointsGranter rewards) are handled off-chain or via auxiliary contracts. Fee programs, if introduced, will be documented here with explicit formulas rather than baked into the cost function.
