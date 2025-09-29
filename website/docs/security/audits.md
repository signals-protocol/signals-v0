# Security & Testing Overview

Signals protects traders by layering defenses across the mechanism, the Solidity codebase, and daily operations. Use this guide to understand what is live today, how we validate it, and which improvements are coming next.

## Mechanism and contract safeguards

The CLMSR contracts implement the whitepaper’s potential exactly, enforcing normalized probabilities and the $\alpha \ln n$ maker loss bound. Entry points are guarded by `nonReentrant`, emergency pause hooks, and explicit input checks on tick ranges, liquidity factors, and oracle values. Lazy segment tree operations respect hard limits (`MAX_EXP_INPUT_WAD`, `MAX_CHUNKS_PER_TX`, `MIN_FACTOR`, `MAX_FACTOR`) so no trade can blow past precision or gas constraints. All external authority remains with a single `Ownable` owner today, but dispatcher scripts encapsulate upgrades and daily operations to reduce human error while timelock and multisig wrappers are prepared.

## Testing strategy

Automated tests exercise the system at multiple levels:
- Unit suites cover math libraries, fixed-point helpers, and segment tree mutations.
- Integration and end-to-end scenarios run through market creation, trading, settlement, and claims to ensure the contracts and scripts stay aligned.
- Invariant tests confirm price normalization and bounded loss across randomized trade sequences.
- Gas benchmarks track the cost of chunked exponentials, settlement state transitions, and typical trading paths so regressions are caught before deployment.

Every pull request runs in CI, and nightly jobs replay longer trade traces to detect non-deterministic edge cases.

## Operational controls

Deployment manifests under `deployments/environments/` log each implementation address, making it easy to audit which bytecode is live. Dispatcher scripts issue upgrades, create markets, submit settlements, and monitor settlement health with reproducible CLI commands. Goldsky subgraphs and verification scripts compare on-chain balances with CLMSR expectations, raising alerts if unclaimed payouts or tree sums drift from the model. If the reference feed is delayed, the pipeline pauses settlement until a verifiable close is available; funds always remain locked in the pool.

## Roadmap and upcoming work

- Ship the remaining rounding updates (floor rounding for sells and claims) and enforce the $0.01$ SUSD minimum trade size on-chain.
- Introduce a timelock plus multisig wrapper for the owner role so upgrades and settlements require multiple approvals.
- Commission an external audit once the rounding and minimum-order changes land, producing a public report alongside remediation notes.

## Responsible disclosure

Security researchers can reach the team at `security@signals-protocol.com`. Include a clear reproduction path, expected impact, and suggested mitigations. Please avoid posting critical findings on public channels or GitHub issues; coordinate timing so fixes can roll out before details are shared broadly.

For deeper background, review the [Safety Bounds & Parameters](../mechanism/safety-parameters.md) reference and the operational detail in the [Settlement Pipeline](../market/settlement-pipeline.md).
