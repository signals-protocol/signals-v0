# Key Formulas Cheat Sheet

Keep this page handy when you need the CLMSR math without re-reading the entire specification. Each block lists the formula, explains when it applies, and points to the contracts that enforce it.

## Potential, prices, and loss bound

- **Potential**: $C(q) = \alpha \ln \left( \sum_b e^{q_b / \alpha} \right)$ governs the entire surface. The share inventory $q_b$ and liquidity parameter $\alpha$ live in WAD precision.
- **Band price**: $p_b = e^{q_b / \alpha} / \sum_j e^{q_j / \alpha}$. Because every band shares the same potential, the prices always sum to 1.
- **Maker loss bound**: $\text{Loss}_{\max} = \alpha \ln(n)$ where $n$ is the number of bands. Adjusting the tick spacing or liquidity parameter alters the bound predictably.

## Trading a band

- **Weight update**: buying $\delta$ shares multiplies the weights inside the band by $\varphi = e^{\delta / \alpha}; selling flips the sign of $\delta$.
- **Cost**: $\Delta C = \alpha \ln(\Sigma_{\text{after}} / \Sigma_{\text{before}})$, where the sigma terms are the summed weights before and after applying $\varphi$.
- **Chunking rule**: exponents are evaluated in chunks no larger than `MAX_EXP_INPUT_WAD = 1e18`, keeping `(chunk/alpha) <= 1`.

## Outcome and tick mapping

- **Tick index**: $b = \mathrm{clamp}(\lfloor (\text{OutcomeRaw} - L)/s \rfloor, 0, n-1)$.
- **Band interval**: `[L + b s, L + (b+1) s)` with the upper edge open to prevent overlap.

## Precision and rounding

- **Currency to WAD**: multiply SUSD amounts by `10^12`; divide by the same factor to convert back.
- **Rounding policy**:
  - Buys and increases: round up (`fromWadRoundUp`).
  - Sells, decreases, closes, and payouts: round down (`fromWadFloor`).
  - Recommended minimum trade size: $\delta_{\min} = 0.01$ SUSD (UI enforced until the Solidity guard ships).

## Guard rails

- `MAX_EXP_INPUT_WAD = 1.0e18`
- `MIN_FACTOR = 0.01e18`, `MAX_FACTOR = 100e18`
- `MAX_TICK_COUNT = 1_000_000`
- `MAX_CHUNKS_PER_TX = 1_000`

Need the longer story? Step back to the [Mechanism Overview](overview.md) or jump into the detailed discussions in [Cost Function & Rounding](cost-rounding.md) and [Safety Bounds & Parameters](safety-parameters.md).
