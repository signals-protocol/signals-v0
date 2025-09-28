# CLMSR Market System Developer Guide

This guide is the entry point for engineers who need to run, extend, or integrate the Signals CLMSR stack. It links the on-chain contracts, the operations scripts, the subgraph, and the client SDK so you can understand how code flows from one layer to the next.

## 1. System overview

Signals operates a daily Bitcoin prediction market on Citrea Testnet. Each day the operations pipeline creates a market, traders interact with the CLMSR AMM, and the system settles against the CoinMarketCap close. The stack is organised into four cooperating layers:

| Layer | Responsibilities | Repos / packages |
| --- | --- | --- |
| **Contracts** | CLMSR engine, position NFTs, points, upgrade proxies | `contracts/` (Solidity), deployed with Hardhat scripts |
| **Operations** | Market creation, monitoring, settlement batching, verification | `scripts/` jobs, dispatcher helpers, manifests under `deployments/` |
| **Data & SDK** | Goldsky subgraph, `@whworjs7946/clmsr-v0` SDK for math helpers and conversions | `clmsr-subgraph/`, `clmsr-sdk/` |
| **Clients** | React app, integration examples, verification dashboards | `website/`, `docs/`, verification scripts |

All monetary amounts remain in raw contract scale (6-decimal SUSD) and all CLMSR factors use 18-decimal WAD precision. Avoid casting to JavaScript `Number` when interacting with SDK helpers.

## 2. Networks and addresses

Signals currently targets Citrea Testnet (chain id `5115`). The table below summarises the canonical production deployment; development manifests carry the same structure.

| Contract | Address | Explorer |
| --- | --- | --- |
| `CLMSRMarketCore` | `0xE480ca1C63B6dd929af1EeA4D3de1073942F3cEf` | [link](https://explorer.testnet.citrea.xyz/address/0xE480ca1C63B6dd929af1EeA4D3de1073942F3cEf) |
| `CLMSRPosition` | `0xB4c33Df898F8139D784ADE1aDCa9B5979898fE03` | [link](https://explorer.testnet.citrea.xyz/address/0xB4c33Df898F8139D784ADE1aDCa9B5979898fE03) |
| `SUSD` | `0xE32527F8b3f142a69278f22CdA334d70644b9743` | [link](https://explorer.testnet.citrea.xyz/address/0xE32527F8b3f142a69278f22CdA334d70644b9743) |

Deployment manifests (`deployments/environments/*.json`) track every upgrade. Always update them in the same pull request as contract changes.

## 3. Daily market lifecycle

1. **Create** — dispatcher job calls `createMarket` with outcome bounds, tick spacing, timestamps, and liquidity parameter `alpha`.
2. **Trade** — users interact with `openPosition`, `increasePosition`, `decreasePosition`, and `closePosition`. The CLMSR segment tree applies lazy exponential updates, and events feed the subgraph.
3. **Settle** — operations verify the CoinMarketCap close, call `settleMarket`, then iterate `emitPositionSettledBatch(limit)` until `PositionEventsProgress.done = true`.
4. **Claim** — once batches finish, traders call `claimPayout`. Events mirror to the subgraph so dashboards can track outstanding claims.

See `docs/governance/upgrades.md` for the upgrade checklist and `website/docs/market/settlement-pipeline.md` for a detailed settlement walkthrough.

## 4. Development workflow

| Step | Command | Notes |
| --- | --- | --- |
| Install dependencies | `yarn install` | run at repo root |
| Compile & test contracts | `yarn hardhat test` | executes unit + integration suites |
| Run subgraph locally | `yarn workspace clmsr-subgraph dev` | requires `docker-compose` |
| Launch docs / app | `cd website && yarn start` | Docusaurus site with English & Korean locales |
| Execute dispatcher jobs | `yarn workspace scripts run <task>` | see `scripts/README` for details |

### Recommended tooling

- **SDK**: `npm install @whworjs7946/clmsr-v0@1.6.2` for math helpers (`toWad`, `fromWadRoundUp`, cost estimators).
- **Subgraph**: query the production endpoint at `https://api.goldsky.com/api/public/project_cme6kru6aowuy01tb4c9xbdrj/subgraphs/signals-v0-citrea-prod/latest/gn`.
- **Verification**: `verification/check-market-pnl.ts` reconciles subgraph data with contract balances.

## 5. Feature highlight: Batched settlement events

Large markets previously emitted thousands of `PositionSettled` events in a single transaction, risking gas exhaustion. The live contracts split settlement into two phases:

```solidity
function settleMarket(uint256 marketId, int256 settlementTick) external onlyOwner;
function emitPositionSettledBatch(uint256 marketId, uint256 limit) external onlyOwner;
event PositionEventsProgress(uint256 indexed marketId, uint256 processed, uint256 total, bool done);
```

The `Market` struct tracks a cursor and a completion flag, allowing the operator to resume batches safely. Dashboards watch `PositionEventsProgress.done` to declare a market fully settled.

## 6. Additional resources

- [`docs/QUICK_START.md`](./QUICK_START.md) — scaffold a client in minutes.
- [`docs/CONTRACT_INTEGRATION.md`](./CONTRACT_INTEGRATION.md) — contract calls, settlement flows, and error handling patterns.
- [`docs/SUBGRAPH_API.md`](./SUBGRAPH_API.md) — entity reference and query examples.
- [`website/docs`](../website/docs) — user-facing documentation, useful for understanding messaging and UX flows.

For support open an issue in this repository or reach out via the community channels listed in the docs site.
