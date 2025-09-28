# Cost Function & Rounding

> Reference: Signals CLMSR Whitepaper v1.0 -- §4-§8

This chapter explains how Signals prices every trade and why rounding rules matter. If you are auditing the contracts, walk through each section alongside LazyMulSegmentTree.sol and the helpers in FixedPointMath.sol--the on-chain implementation matches the structure outlined here.

## One potential for all bands

CLMSR keeps a single convex potential over tick shares $q_b$:

$$
C(q) = \alpha \ln \left( \sum_b e^{q_b / \alpha} \right)
$$

The liquidity parameter $\alpha$ is stored as a WAD value. Exponential weights $w_b = e^{q_b/\alpha}$ drive the gradient, and prices follow directly from

$$
p_b = \frac{w_b}{\sum_j w_j}
$$

so the sum of probabilities remains 1 even as trades accumulate. Buying $\delta$ shares of a band multiplies each weight inside that band by $\varphi = e^{\delta/\alpha}$ and charges the change in potential:

$$
\Delta C = \alpha \ln\left(\frac{\Sigma_\text{after}}{\Sigma_\text{before}}\right)
$$

Selling inverts the exponent--it is the same expression with $\delta$ negated.

## Keeping exponentials safe

Exponentials are evaluated in chunks to respect PRB-Math limits. The implementation caps each exponent input at `MAX_EXP_INPUT_WAD = 1e18`, effectively ensuring that `(chunk/alpha) <= 1`. Large trades are split automatically by the lazy segment tree so a single call never exceeds precision or gas bounds.

## Asymmetric rounding

The whitepaper insists on one conversion per action, with direction fixed to close the “free trade” loophole:

| Action | Conversion | Helper |
| --- | --- | --- |
| Buy / Increase | Round **up** | fromWadRoundUp |
| Sell / Decrease / Close | Round **down** | fromWadFloor |
| Settlement payout | Round **down** | fromWadFloor |

**Implementation status:** buys already round up. Sells and payouts currently round up in production contracts but are slated to switch to floor rounding to match the spec. Until that ships, dashboards should note that live proceeds may be marginally higher than the post-update expectation.

## Minimum cost guarantee

Ceiling rounding on buys plus the minimum trade size $\delta_{\min}$ guarantee that every successful trade removes at least one micro unit of SUSD. Attackers cannot leave zero-cost dust positions on the books, and auditors can assume that every position reflects real capital at risk.

## Where to look in code

- LazyMulSegmentTree.sol implements the chunking logic and exponential weight updates.
- FixedPointMath.sol houses the rounding helpers (fromWadRoundUp, fromWadFloor).
- Tests under test/unit/libraries/** cover both rounding directions and chunk-splitting edge cases.

For the bounds that ensure these routines remain safe, continue to [Safety Bounds & Parameters](safety-parameters.md).
