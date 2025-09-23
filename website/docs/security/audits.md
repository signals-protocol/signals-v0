# Security & Testing Overview

Signals applies layered safeguards across mechanism design, contract implementation, and operational practice. This document summarises what is in place today and what is planned next.

## Contract security

- **Mechanism fidelity** — Contracts implement the CLMSR potential from the [whitepaper](/whitepaper.pdf), guaranteeing normalized probabilities and bounded maker loss.
- **Access control** — `Ownable` plus Hardhat scripts centralise upgrade, market creation, and settlement powers in a single operator account (timelock/multisig planned).
- **Reentrancy & pausing** — External entrypoints use `nonReentrant`, and emergency pause/unpause hooks exist for critical incidents.
- **Input validation** — Tick ranges, factors, and liquidity parameters revert with explicit errors when out of bounds.
- **Chunk guards** — Exponential operations respect `MAX_EXP_INPUT_WAD` and `MAX_CHUNKS_PER_TX` to keep gas usage and precision stable.

## Testing coverage

- Unit tests for math libraries, segment tree operations, and error handling.
- Integration / E2E suites covering market creation, trading flows, settlement, and claims.
- Invariant tests that confirm price normalization and bounded loss.
- Gas benchmarks that track chunking behaviour and settlement batching costs.

## Operational security

- **Deployment manifests** track every implementation address and version across environments.
- **Dispatcher scripts** remove manual command risk when deploying, upgrading, or operating markets.
- **Monitoring** via the Goldsky subgraph and verification scripts catches divergence between expected and actual state.

## Roadmap

- Add a timelock + multisig wrapper around the owner role.
- Finalise rounding updates (floor rounding on sell/claim) and enforce the `0.01 SUSD` minimum order on-chain.
- Commission external audits once the rounding/minimum-order changes ship.

## Reporting vulnerabilities

Responsible disclosure keeps the community safe:

- Email `security@signals-protocol.com` with a clear reproduction path and impact assessment.
- Do **not** post critical issues on public channels or GitHub issues.
- Coordinate disclosure so fixes can be deployed before details are public.

Brush up on protocol limits in [Safety Bounds & Parameters](../mechanism/safety-parameters.md) and operational procedures in the [Settlement Pipeline](../market/settlement-pipeline.md).
