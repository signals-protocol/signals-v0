# Key Formulas Cheat Sheet

Use this page as a quick reference when you need the core CLMSR equations without re-reading the full spec.

## Potential and prices

- Potential: $C(q) = \alpha \ln \left( \sum_b e^{q_b / \alpha} \right)$ (where $\alpha$ is the liquidity parameter and $q_b$ the share inventory for band $b$).
- Price of band $b$: $p_b = \dfrac{e^{q_b / \alpha}}{\sum_j e^{q_j / \alpha}}$.
- Bounded loss: $\text{Loss}_{\max} = \alpha \ln(n)$ where $n$ is the number of bands in the market.

## Trade updates

- Buy $\delta$ shares of a band: multiply each weight by $\varphi = e^{\delta / \alpha}$.
- Cost: $\Delta C = \alpha \ln(\Sigma_{\text{after}} / \Sigma_{\text{before}})$.
- Sell actions use the same formula with $\delta$ negated.

## Tick mapping

- Outcome tick: $b = \mathrm{clamp}(\lfloor (\text{OutcomeRaw} - L)/s \rfloor, 0, n-1)$.
- Half-open intervals $[L + b s,\, L + (b+1)s)$ guarantee non-overlapping bands.

## Precision and rounding

- Currency conversion: multiply or divide by `10^12` between 6-decimal SUSD and WAD (18 decimals).
- Rounding policy:
  - Buys/increases: round up (`fromWadRoundUp`).
  - Sells/claims: round down (`fromWadFloor`).
  - Minimum trade size: $\delta_{\min} = 0.01\ \text{SUSD}$ (UI enforced until the contract guard lands).

## Segment tree guards

- `MAX_EXP_INPUT_WAD = 1.0e18`
- `MIN_FACTOR = 0.01e18`, `MAX_FACTOR = 100e18`
- `MAX_TICK_COUNT = 1_000_000`
- `MAX_CHUNKS_PER_TX = 1_000`

Need deeper context? Jump back to [Mechanism Overview](overview.md) or [Safety Bounds & Parameters](safety-parameters.md).
