# Deployment Addresses

Signals publishes manifests for every environment under `deployments/environments/`. This page summarises the current Citrea deployments so integrators can copy addresses quickly while understanding where the data comes from. Always cross-check the manifests before broadcasting transactions—this document is a convenience, not the source of truth.

## Citrea production (citrea-prod.json)

| Component | Proxy | Latest implementation | Notes |
| --- | --- | --- | --- |
| `CLMSRMarketCore` | `0xE480ca1C63B6dd929af1EeA4D3de1073942F3cEf` | `0xb86c5f8b5b59e3f4dde9b13758ee3de3ef0f2fca` | Settles markets and exposes trading entrypoints |
| `CLMSRPosition` | `0xB4c33Df898F8139D784ADE1aDCa9B5979898fE03` | `0x799c0f18c004498e10f1e47631ba48055762c972` | ERC 721 range positions |
| `PointsGranter` | `0x9E1265677B628A22b9C1d6f0FeCEb6241eA5268d` | `0x210fbc9b14b222bf0097f9862da0d4f8662084f4` | Activity/performance/risk points |
| `SUSD` token | — | `0xE32527F8b3f142a69278f22CdA334d70644b9743` | 6-decimal settlement token |
| `FixedPointMathU` library | — | `0x629E255320Ab520062A07F22A8a407CFbad62025` | Shared math helpers |
| `LazyMulSegmentTree` library | — | `0xEB80528a819f4729a39ff5695BecE8a63F6072ae` | Exponential weight tree |

Recent production revisions:

| Version | Timestamp (UTC) | Summary |
| --- | --- | --- |
| 1.15.0 | 2025-09-17T08:22:47Z | Prepared rounding updates and gas improvements |
| 1.14.0 | 2025-09-15T09:01:36Z | Library refresh |
| 1.13.0 | 2025-09-14T11:17:07Z | Segment tree maintenance release |

## Citrea development (citrea-dev.json)

| Component | Proxy | Latest implementation | Notes |
| --- | --- | --- | --- |
| `CLMSRMarketCore` | `0x971F9bcE130743BB3eFb37aeAC2050cD44d7579a` | `0xe29c0d0f41eb44b90ebf4b65a908519853c07a2f` | Development staging environment |
| `CLMSRPosition` | `0xe163497F304ad4b7482C84Bc82079d46050c6e93` | `0x53e80a00029e9f52ea2e8d03b1e9e7498a5eb7fb` | Mirrors production features before release |
| `PointsGranter` | `0x59eb810fa5e7c0646902C29D9e8bfdaDf25Ce274` | `0x978b7150a89dacddb9fc81294676eed3686c1ea3` | Test points programme |
| `SUSD` token | — | `0xE32527F8b3f142a69278f22CdA334d70644b9743` | Same token across environments |
| `FixedPointMathU` library | — | `0xB4779459E2681257d6fe64105dFd05ECA93E7b82` | |
| `LazyMulSegmentTree` library | — | `0x23e01A7a1e32ff146D1851e6E64B3f261dB105bE` | |

Development upgrades happen frequently; always read the manifest to ensure the implementation hash matches what you expect.

## Keeping addresses fresh

1. Inspect the manifest before every deploy or integration change:
   ```bash
   jq '.' deployments/environments/citrea-prod.json
   ```
2. When the dispatcher scripts upgrade a proxy, update the manifest and this page in the same pull request.
3. If you add a new environment (e.g., staging or local devnet), create a new manifest file and mirror its data here.

For broader network details (RPC endpoints, faucets) see [Network Information](../networks/supported-networks.md). For upgrade procedures refer to [Governance & Upgrades](../governance/upgrades.md).
