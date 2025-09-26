# Outcome Space & Units

> Reference: Signals CLMSR Whitepaper v1.0 — §3 (Units and Ticks)

## OutcomeSpec

Every market declares an `OutcomeSpec = (L, U, s, d)`:

- `L`, `U`: inclusive lower and upper outcome bounds in raw oracle units.
- `s`: tick spacing (strictly positive). The number of bins is $n = \left\lceil \dfrac{U - L}{s} \right\rceil$.
- `d`: metadata describing the oracle decimal scale (e.g. BTC price with 8 decimals).

Oracle observations arrive as `OutcomeRaw` in raw units. We map them to a tick index by clamping into the $[0, n-1]$ range:

$$
b = \mathrm{clamp}\left( \left\lfloor \frac{\text{OutcomeRaw} - L}{s} \right\rfloor,\ 0,\ n-1 \right)
$$

Half-open intervals `[L + b·s, L + (b+1)·s)` avoid overlap; only the top edge is exclusive.

## Unit Separation

The protocol uses two unit systems:

- **CurrencyUnit (`U6`)**: external settlement unit with 6 decimals (SUSD). All debits, credits, and liquidity budgets are denominated here.
- **OutcomeUnit**: raw oracle scale used only to interpret ticks.

Internal arithmetic (shares `q_b`, weights `w_b`, cached sums `Z`) uses WAD precision (18 decimals). Conversion between user amounts and internal values multiplies or divides by `10^12`.

```solidity
uint256 constant SCALE_DIFF = 1e12;
wad = amount6 * SCALE_DIFF;
amount6 = wad / SCALE_DIFF;
```

Maintaining strict separation keeps the LMSR algebra numerically stable and lets front ends display familiar 6-decimal values.

## Minimum Range Semantics

A valid position must satisfy:

1. $\text{lowerTick} < \text{upperTick}$
2. $\text{upperTick} - \text{lowerTick}$ is divisible by $\text{tickSpacing}$

The whitepaper also recommends enforcing a **minimum trade size** $\delta_{\min} = 10^{-2}\ U6$ to avoid dust and ensure rounding guarantees. Implementation note: the current contracts still accept smaller quantities; this will be tightened to match the spec.

## Implementation Status

| Topic | Whitepaper | Contracts (current) |
| --- | --- | --- |
| Tick mapping | `[L + b·s, L + (b+1)·s)` | ✅ Matches spec |
| Minimum trade size | $\delta_{\min} = 0.01\ \text{SUSD}$ | ⚠️ Not enforced yet |
| Unit conversions | Multiply/divide by `1e12` | ✅ Matches spec |

Until the minimum size guard lands on-chain, interfaces should surface the recommended minimum and warn users if they try to go below it.
