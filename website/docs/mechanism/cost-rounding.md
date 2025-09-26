# Cost Function & Rounding

> Reference: Signals CLMSR Whitepaper v1.0 — §4–§8

## Convex Potential

CLMSR maintains a single potential over tick shares $q_b$:

$$
C(q) = \alpha \ln \left( \sum_b e^{q_b / \alpha} \right)
$$

- $\alpha$ is the market’s liquidity parameter (stored internally in WAD).
- $w_b = e^{q_b / \alpha}$ are the exponential weights.
- Prices are the gradient $p_b = w_b / \sum_j w_j$, so prices always sum to 1.

Buying $\delta$ shares of range $B$ multiplies each weight in the range by $\varphi = e^{\delta / \alpha}$ and charges

$$
\Delta C = \alpha \ln\left( \frac{\Sigma_{\text{after}}}{\Sigma_{\text{before}}} \right).
$$

The same formula (with $\delta$ negated) yields sell proceeds.

## Chunking for Safety

Exponentials are evaluated in chunks to stay within PRB-Math bounds. The spec defines `MAX_EXP_INPUT_WAD = 1.0e18` so each chunk satisfies $(\text{chunk} / \alpha) \le 1$. The tree routines split large trades accordingly.

## Asymmetric Rounding

The whitepaper mandates a single conversion per trade, with direction fixed per action:

| Action | Conversion | Helper |
| --- | --- | --- |
| Buy / Increase | Round **up** to prevent zero-cost attacks | `fromWadRoundUp` |
| Sell / Decrease / Close | Round **down** | `fromWadFloor` |
| Settlement payout | Round **down** | `fromWadFloor` |

**Implementation status:** buys already use `fromWadRoundUp`, but sells and payouts still round up in the current Solidity. The contracts will be updated to follow the spec; until then, dashboards should display the expected post-update behaviour and note that live payouts may be slightly higher than specified.

## Minimum Cost Guarantee

Because of ceiling rounding on buys and $\delta_{\min}$, every successful trade debits at least `1` micro unit of SUSD. This removes the zero-cost vector described in the security analysis (§8).

## References

- Whitepaper §4 — weight definitions and potential.
- Whitepaper §5 — range updates via lazy segment tree.
- Whitepaper §8 — rounding helpers and single-conversion rule.
