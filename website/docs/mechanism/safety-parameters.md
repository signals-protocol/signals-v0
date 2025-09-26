# Safety Bounds & Parameters

> Reference: Signals CLMSR Whitepaper v1.0 — §7–§11, Appendix B

## Bounded Loss

The market maker’s worst-case loss is

$$
\text{Loss}_{\max} = \alpha \ln(n)
$$

where $\alpha$ is the liquidity parameter and $n$ the number of bins. Choosing tighter tick spacing increases $n$ and therefore the bound. Operators should set $\alpha$ to match their risk budget: $\alpha = \text{Loss}_{\text{target}} / \ln(n)$.

## Segment Tree Guards

Lazy multiplications rely on conservative guards:

| Constant | Purpose | Value |
| --- | --- | --- |
| `MAX_EXP_INPUT_WAD` | Max input for `exp` chunks | `1.0e18` |
| `MIN_FACTOR` | Smallest allowed multiplier | `0.01e18` |
| `MAX_FACTOR` | Largest allowed multiplier | `100e18` |
| `FLUSH_THRESHOLD` | Pending factor auto-flush | `1e21` |
| `MAX_TICK_COUNT` | Upper bound on bins | `1,000,000` |
| `MAX_CHUNKS_PER_TX` | Exponential chunk limit | `1,000` |

The Solidity library enforces the same numbers. Any attempt to exceed the factors or tick limits reverts with explicit errors (`CE.InvalidFactor`, `CE.BinCountExceedsLimit`, etc.).

## Settlement Discipline

- Settlement waits until `block.timestamp ≥ settlementTimestamp` (or `endTimestamp` if no override).
- Outcome ticks are clamped inside `[minTick, maxTick]` for tail events.
- Position settlement emits batched events via `emitPositionSettledBatch` so large markets remain gas-safe.

## Implementation Status

| Item | Whitepaper | Contracts |
| --- | --- | --- |
| Constants above | Normative | ✅ Matches (see `LazyMulSegmentTree.sol`, `CLMSRMarketCore.sol`) |
| Claim expiry | Not specified | No expiry. Older docs mentioning “90 days” have been corrected. |
| Multisig / timelock | Not in spec | Core remains `Ownable` without timelock. |

If additional governance controls (timelock, multisig) are introduced they will be documented as extensions to the base spec, not changes to the CLMSR mechanism.
