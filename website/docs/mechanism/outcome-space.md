# Outcome Space & Units

Understanding Signals starts with the outcome grid the CLMSR operates on. This page explains how a market encodes its price range, how oracle observations map into ticks, and why the protocol insists on keeping outcome math separate from settlement currency.

## Defining the outcome grid

Each market publishes an `OutcomeSpec = (L, U, s, d)` before trading begins. The lower bound `L` and upper bound `U` live in raw oracle units (for the Bitcoin close that means 8 decimal places). Tick spacing `s` sets the resolution: the number of available bands is

$$
n = \left\lceil \frac{U - L}{s} \right\rceil.
$$

Metadata `d` records how the oracle scales its outputs so integrators know which factors to apply when decoding events.

When an oracle observation `OutcomeRaw` arrives, Signals clamps it into the configured grid:

$$
b = \mathrm{clamp}\left( \left\lfloor \frac{\text{OutcomeRaw} - L}{s} \right\rfloor, 0, n-1 \right).
$$

Every band is a half-open interval `[L + b s, L + (b+1) s)`. The open upper edge prevents overlap, while the clamp protects the pool from a stray oracle value that would otherwise fall outside the configured window.

## Why units stay separate

The CLMSR math operates in WAD precision (18 decimals) even though users trade with 6-decimal SUSD. Signals enforces a clean boundary between the two systems:

- **Currency unit (`U6`)** covers SUSD debits, credits, and liquidity budgets.
- **Outcome unit** mirrors the raw oracle scale and is only used when mapping ticks or emitting settlement data.

Conversions multiply or divide by `10^12` so that 6-decimal inputs become 18-decimal values inside the contracts:

```solidity
uint256 constant SCALE_DIFF = 1e12;
wadAmount = amount6 * SCALE_DIFF;
amount6 = wadAmount / SCALE_DIFF;
```

This separation keeps the LMSR algebra numerically stable and lets front ends display familiar decimal formats without leaking precision errors back into the pool.

## Valid range constraints

Positions must satisfy two simple rules:

1. `lowerTick < upperTick` (no zero-width ranges).
2. `(upperTick - lowerTick)` is an integer multiple of `tickSpacing`.

The whitepaper also recommends a minimum order size of $\delta_{\min} = 0.01$ SUSD so rounding guarantees remain meaningful. Current contracts still allow smaller quantities, so interfaces warn traders when they attempt to submit dust-sized orders.

## Implementation status

| Topic | Whitepaper | Contracts today |
| --- | --- | --- |
| Tick intervals | `[L + b s, L + (b+1) s)` | ✅ Matches spec |
| Unit conversions | Multiply/divide by `1e12` | ✅ Matches spec |
| Minimum order | $\delta_{\min} = 0.01$ SUSD | ⚠️ Not enforced on-chain yet |

Until the minimum guard lands in Solidity, treat $0.01$ SUSD as the practical floor and surface it in every UI or script that builds positions.
