# Signals Protocol Architecture

Signals behaves like a simple prediction app on the surface, yet every slider movement triggers a coordinated system of contracts, scripts, and data services. This document walks through the stack from the on-chain core to the analytics layer so you can see how the pieces stay in sync each day.

## 1. Core contracts: the CLMSR engine

At the heart of Signals sits the CLMSR core (`CLMSRMarketCore.sol`) and its position manager (`CLMSRPosition.sol`). They maintain the lazy multiplicative segment tree that stores band weights, mint ERC 721 position tokens, and expose entrypoints for opening, adjusting, and closing ranges. The contracts enforce unit conversions, rounding, and safety bounds, ensuring that every trade respects the math described in the whitepaper. Auxiliary modules such as `PointsGranter` emit engagement rewards without touching settlement funds, while upgradeable proxies keep storage layout stable across releases.

## 2. Daily operations pipeline

A small operations job creates one market per UTC day. It submits the tick window, timestamps, and liquidity parameter, then monitors invariants throughout the session. After the designated reference value is verified, the same pipeline calls `settleMarket` and confirms that every position has flipped into its terminal state. Dispatcher scripts and deployment manifests remove manual steps and record which implementation handled each action, making audits reproducible.

## 3. Oracle ingestion and data surface

Price ingestion is intentionally conservative. Operators fetch the daily reference value from the configured source, clamp it into the tick range, and broadcast it on-chain with timestamped proof. Goldsky-hosted subgraphs (`clmsr-subgraph`) mirror every `MarketCreated`, `Position*`, and settlement-related state change. They expose entities such as `MarketStats`, `UserPosition`, `Trade`, `PositionSettled`, and `PositionClaimed`, letting analytics jobs compute PnL, unclaimed balances, and leaderboard standings. Verification scripts in `verification/` cross-check chain balances against CLMSR expectations to catch drift.

## 4. Front-end and client applications

The Signals front end consumes both the contracts and the subgraph through ethers.js. `MainProvider` composes hooks (`useBTCState`, `useChart`, `usePrediction`, `useAction`) so the chart, range selector, and modals share a single state store. After trades settle, UI components refresh directly from the subgraph entities, while success modals reuse the same probability math implemented on-chain. External clients can replicate this pattern: call the contracts for writes, subscribe to the subgraph for reads.

## 5. How information flows each day

1. Users submit trades through the app; transactions hit the CLMSR core and emit structured events.
2. Operations scripts create and settle markets, keeping the contract state aligned with the real-world schedule.
3. The subgraph ingests both trading and operational events, exposing normalized views for analytics, leaderboards, and monitoring.
4. Dashboards and the front end render those views, giving the community immediate insight into flow, settlement status, and points.

## 6. Extensibility and roadmap

The current stack already runs unattended for daily markets, but improvements are in flight: automated oracle ingestion, timelock or multisig controls for the owner role, and contract updates that enforce the minimum trade size and rounding rules specified in the whitepaper. Because the architecture keeps each layer loosely coupled, these upgrades can roll out without rewriting the entire system.

## Further reading

- [Mechanism Overview](../mechanism/overview.md) for the CLMSR math and rounding guarantees.
- [Security & Testing](../security/audits.md) for defenses, test coverage, and roadmap.
- [Governance & Upgrades](../governance/upgrades.md) for the operational checklist behind deployments.
