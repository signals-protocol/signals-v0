# Safety Bounds & Parameters

> Reference: Signals CLMSR Whitepaper v1.0 -- §7-§11, Appendix B

This section documents the guardrails that keep Signals predictable. Operators can use it as a checklist when configuring new markets; auditors can map each constant to its on-chain definition to confirm that the implementation enforces the theory.

## Maker loss remains bounded

The CLMSR maker's worst-case loss is

$$
\text{Loss}_{\max} = \alpha \ln(n)
$$

where $\alpha$ is the liquidity parameter and $n$ the number of bins. Narrower tick spacing increases $n$ and therefore the bound, so operators should size $\alpha$ according to their tolerance: choose `alpha = Loss_target / ln(n)` to align the model with the treasury budget. Because the loss formula depends only on $\alpha$ and $n$, you can predict the bound before deploying a market.

## Guards inside the lazy segment tree

Lazy multiplication works because a set of conservative constants keeps exponentials tame:

| Constant | Purpose | Value |
| --- | --- | --- |
| `MAX_EXP_INPUT_WAD` | Maximum exponent input per chunk | `1.0e18` |
| `MIN_FACTOR` | Smallest multiplier allowed per update | `0.01e18` |
| `MAX_FACTOR` | Largest multiplier allowed per update | `100e18` |
| `FLUSH_THRESHOLD` | Pending factor threshold that triggers a flush | `1e21` |
| `MAX_TICK_COUNT` | Maximum number of bins supported | `1,000,000` |
| `MAX_CHUNKS_PER_TX` | Upper bound on exponential chunks per call | `1,000` |

`LazyMulSegmentTree.sol` enforces the same limits as the whitepaper. Attempts to exceed these numbers revert with explicit errors such as `CE.InvalidFactor` or `CE.BinCountExceedsLimit`, making failures easy to diagnose.

## Discipline around settlement

- `settleMarket` only executes after `block.timestamp` reaches the configured `settlementTimestamp` (or `endTimestamp` when no override exists).
- Submitted settlement values are clamped into `[minTick, maxTick]`, protecting the pool from outlier prints.
- Settlement emits per-position results deterministically, keeping gas bounded even when thousands of ranges remain open.

## Implementation status

| Item | Whitepaper | Contracts |
| --- | --- | --- |
| Constants above | Normative | ✅ Matches (`LazyMulSegmentTree.sol`, `CLMSRMarketCore.sol`) |
| Claim expiry | Not specified | No expiry (old guidance referencing “90 days” has been removed) |
| Timelock / multisig | Out of scope | Core stays `Ownable`; governance wrappers will be documented separately |

If new governance controls or oracle sources are added, they will appear as extensions layered on top of this base spec. The CLMSR mechanism itself--loss bounds, chunking limits, rounding rules--remains unchanged.
