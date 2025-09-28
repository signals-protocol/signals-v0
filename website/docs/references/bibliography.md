# Further Reading

Looking to dive deeper into market scoring rules, bounded-loss automated market makers, or the history behind CLMSR? Start with these cornerstone papers.

- **Robin Hanson (2003) — *Combinatorial Information Market Design***  
  Introduces the Logarithmic Market Scoring Rule (LMSR) that Signals extends into a continuous range setting. Read this to understand why maintaining a single convex potential keeps probabilities normalised.

- **Jacob Abernethy, Yiling Chen, Jennifer Vaughan (2013) — *Efficient Market Making via Convex Optimization***  
  Formalises cost-function market makers, bounding maker loss and analysing liquidity parameters. Handy when you want the proof behind the $\alpha \ln n$ limit.

- **Abraham Othman, Tuomas Sandholm (2012) — *Market Making via Smoothing***  
  Discusses practical considerations—limited liquidity, smoothing techniques, and how to keep markets stable—which inspired parts of the Signals operational tooling.

Pair these with our [Key Formulas Cheat Sheet](../mechanism/key-formulas.md) and the [Signals CLMSR Whitepaper](./whitepaper.md) for Signals-specific notation and implementation details.
