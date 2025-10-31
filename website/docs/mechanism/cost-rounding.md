# Cost Function & Rounding

> Reference: Signals CLMSR Whitepaper v1.0 -- §4-§8

This chapter explains how Signals prices every trade and why rounding rules matter. If you are auditing the contracts, walk through each section alongside LazyMulSegmentTree.sol and the helpers in FixedPointMath.sol--the on-chain implementation matches the structure outlined here.

## One potential for all bins

CLMSR keeps a single convex potential over tick shares $q_b$:

$$
C(q) = \alpha \ln \left( \sum_b e^{q_b / \alpha} \right)
$$

The liquidity parameter $\alpha$ is stored as a WAD value. Exponential weights $w_b = e^{q_b/\alpha}$ drive the gradient, and prices follow directly from

$$
p_b = \frac{w_b}{\sum_j w_j}
$$

so the sum of probabilities remains 1 even as trades accumulate. Buying $\delta$ shares of a range multiplies each weight inside the affected bins by $\varphi = e^{\delta/\alpha}$ and charges the change in potential:

$$
\Delta C = \alpha \ln\left(\frac{\Sigma_\text{after}}{\Sigma_\text{before}}\right)
$$

Selling inverts the exponent--it is the same expression with $\delta$ negated.

## Keeping exponentials safe

Exponentials are evaluated in chunks to respect PRB-Math limits. The implementation caps each exponent input at `MAX_EXP_INPUT_WAD = 1e18`, effectively ensuring that `(chunk/alpha) <= 1`. Large trades are split automatically by the lazy segment tree so a single call never exceeds precision or gas bounds.

## Lazy segment tree implementation

The CLMSR keeps every exponential weight in a sparse lazy multiplication segment tree so prices stay correct without touching every bin on each trade.

- Leaves track a single bin's weight and default to 1 (the weight for an empty position). Internal nodes cache child sums so the contracts can read $\\sum_j w_j$ from one slot after each update.
- `applyRangeFactor` multiplies every leaf in the target range but walks only the nodes on the search path. Lazy propagation keeps both writes and reads at $O(\log n)$ even when markets span hundreds of bins.
- Pending multipliers accumulate until they cross the flush threshold; the tree then pushes factors to both children and resets the parent so numerical error never compounds.
- Every mutation refreshes the cached root sum, which is the denominator in price quotes. `CLMSRMarketCore` consumes that cached value when quoting trades and publishing events.
- 모든 곱셈은 `wMulNearest`를 사용해 최근접(동일 시 올림) 라운딩으로 계산되며, 동일한 규칙이 pendingFactor 조합에도 적용된다. 덕분에 하향 편향이 사라지고, 뷰/갱신 경로가 동일한 라운딩 결과를 유지한다.

Large trades still honour the `MAX_EXP_INPUT_WAD` guard. `CLMSRMarketCore` slices them into safe chunks before each tree update so every exponent passed to PRB-Math remains bounded.

During cost quotes the core contract reads the cached root (Σ_before) and narrows the affected range with `getRangeSum`. `_calculateTradeCostInternal` and `_calculateSellProceeds` keep those sums in step with each chunk so the logarithm always reflects the current tree state. Once the trade is authorised, `_applyFactorChunked` reuses the same chunk-splitting logic to mutate the tree and emits `RangeFactorApplied` events after every multiplier. This mirrors the whitepaper's requirement that prices change atomically across the entire range while keeping on-chain work sub-linear in the number of bins.

Because the payment token uses six decimals, every chunk is quantised to a multiple of `1e12` WAD (`_maxSafeChunkQuantity`). The core rounds each chunked quote up to the nearest micro USDC and accumulates those rounded values, keeping the chunked result within `(chunks − 1)` micro units of executing the same size sequentially. Unit tests pin this behaviour across multiple α/quantity combinations to keep rounding parity explicit.

## Nearest rounding policy

The rounding layer now applies a symmetric rule that removes the systematic buy/sell bias while preserving the minimum-cost guarantee:

| Action | Conversion | Helper |
| --- | --- | --- |
| Buy / Increase | Nearest (ties up) **with min 1 μUSDC** | fromWadNearestMin1 |
| Sell / Decrease / Close | Nearest (ties up) | fromWadNearest |
| Settlement payout | Position quantity (already 6 decimals) | — |

**Implementation status:** the core contracts, SDK, and scripts are migrating to the nearest policy as part of Sprint R. Dashboards should treat buy quotes as at least one micro unit and assume sell/close proceeds may move up or down by ≤1 μUSDC compared to the raw WAD output.

## Minimum cost guarantee

Ceiling rounding on buys plus the minimum trade size $\delta_{\min}$ guarantee that every successful trade removes at least one micro unit of SUSD. Attackers cannot leave zero-cost dust positions on the books, and auditors can assume that every position reflects real capital at risk.

> **Implementation detail:** `fromWadRoundUp` subtracts 1 before dividing by $10^{12}$, so even an input of `type(uint256).max` rounds to a positive micro amount instead of wrapping to zero. This hardens the zero-cost attack fix for extreme WAD values.

## Nearest-rounding helpers (transition)

Signals is rolling out a symmetric, nearest-rounding policy to remove the cumulative bias observed in Market #64. The Solidity helpers landed first so downstream integrations (core, SDK, subgraph) can adopt them in lockstep:

- `fromWadNearest` converts WAD to 6-decimals using ties-up nearest rounding.
- `fromWadNearestMin1` guarantees at least one micro unit when the input is non-zero.
- `wMulNearest` mirrors PRB `mulDiv` but rounds the result to the nearest WAD.

These utilities coexist with `fromWadRoundUp` during the migration window; once every caller switches to the nearest policy, the asymmetric helper will be retired.

## Where to look in code

- LazyMulSegmentTree.sol implements the chunking logic and exponential weight updates.
- FixedPointMath.sol exposes the rounding helpers (`fromWadRoundUp`, `fromWadNearest`, `fromWadNearestMin1`, `wMulNearest`) used across core, SDK, and scripts.
- Unit tests cover both rounding directions and chunk-splitting edge cases.

For the bounds that ensure these routines remain safe, continue to [Safety Bounds & Parameters](safety-parameters.md).
