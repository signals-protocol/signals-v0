# Mechanism Overview

Signals feels intuitive on the surface--pick a $100 range and watch the close--but the market only works because every trade runs through a Continuous Logarithmic Market Scoring Rule (CLMSR). This overview explains why the protocol chose CLMSR, how the main components fit together, and where to dig deeper if you are auditing code or integrating with the contracts.

## Why CLMSR underpins Signals

A single potential governs the entire price surface. Each bin's cost and probability comes from the same convex function, so trades that hit one range instantly reshape the neighbours and keep the sum of probabilities at 1. The liquidity parameter $\alpha$ sets the maker's risk budget: tighter spacing or more bins increase potential loss, but the bound remains $\alpha \ln n$, making exposure predictable. Because the AMM updates all ticks within a range atomically, traders never stitch multiple orders together—the UI's range selection maps directly to the underlying math.

Although today's deployment focuses on Bitcoin's daily close, nothing in the mechanism cares about the asset. Any continuous outcome that can be discretised into ticks can ride on the same contracts by swapping in a new outcome spec.

## How the specification is organised

The mechanism docs follow the same path the contracts take when they execute a trade.
- **Outcome space & units** describe how ticks, bins, and quantities are encoded on-chain, including scaling factors such as WAD values and minimum trade sizes.
- **Cost function & rounding** walks through the CLMSR potential, the lazy segment tree that applies exponential weights, and the rounding rules that keep trades fair while blocking dust attacks.
- **Safety bounds & parameters** documents the constants that guard precision, gas usage, and maker loss so operators know which levers they can safely move.

For full derivations and proofs, open the [Signals CLMSR whitepaper](/whitepaper.pdf). “Implementation status” callouts in each chapter highlight any gaps between the paper and the current Solidity release--treat those notes as the authoritative view of what is live on-chain.
