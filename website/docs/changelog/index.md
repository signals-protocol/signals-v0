# Changelog

Signals tracks every contract and documentation release so integrators can audit what changed and when. This log highlights user-visible behaviour, contract upgrades, and key operational notes. Check the deployment manifests (`deployments/environments/*.json`) for the authoritative address history.

## 1.1.0 — 2025-08-21

**What changed**
- Upgraded `LazyMulSegmentTree` with gas optimisations and additional guards
- Shipped a new `CLMSRMarketCore` implementation tuned for faster settlement automation
- Refined `CLMSRPosition` events to improve subgraph performance
- Updated `PointsGranter` emission logic

**Impact**
- Lower gas usage during heavy trading and settlement
- More predictable settlement automation (fewer retries for large markets)
- Cleaner subgraph mirrors (fewer null fields)

**Addresses (Citrea prod)**
- `CLMSRMarketCore` proxy `0xE480ca1C63B6dd929af1EeA4D3de1073942F3cEf` → implementation `0xb86c5f8b5b59e3f4dde9b13758ee3de3ef0f2fca`
- `CLMSRPosition` proxy `0xB4c33Df898F8139D784ADE1aDCa9B5979898fE03` → implementation `0x799c0f18c004498e10f1e47631ba48055762c972`
- `PointsGranter` proxy `0x9E1265677B628A22b9C1d6f0FeCEb6241eA5268d` → implementation `0x210fbc9b14b222bf0097f9862da0d4f8662084f4`

## 1.0.0 — 2025-08-14

**Initial launch**
- Deployed the CLMSR range market on Citrea Testnet (chain id 5115)
- Released ERC 721 position tokens with lazy segment tree powered pricing
- Introduced the Points system and dispatcher scripts for daily operations

**Highlights**
- Continuous outcome markets with bounded maker loss (`alpha * ln n`)
- Upgradeable via UUPS proxies with manifests for every environment
- Emergency pause/unpause controls baked into core contracts

**Deployment info**
- Deployer: `0xe0785a8cDc92bAe49Ae7aA6C99B602e3CC43F7eD`
- Genesis block: 14,176,879

---

Need more detail? Review the relevant manifest diff alongside this log entry and see `docs/governance/upgrades.md` for the upgrade checklist.
