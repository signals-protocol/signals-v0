# Deployment Addresses

All contract addresses live in the environment manifests under `deployments/environments/`. This page summarises the current production deployment on Citrea and explains how to retrieve other versions.

## Citrea Production (`citrea-prod.json`)

| Component | Proxy | Implementation (v1.15.0) |
| --- | --- | --- |
| `CLMSRMarketCore` | `0xE480ca1C63B6dd929af1EeA4D3de1073942F3cEf` | `0xb86c5f8b5b59e3f4dde9b13758ee3de3ef0f2fca` |
| `CLMSRPosition` | `0xB4c33Df898F8139D784ADE1aDCa9B5979898fE03` | `0x799c0f18c004498e10f1e47631ba48055762c972` |
| `PointsGranter` | `0x9E1265677B628A22b9C1d6f0FeCEb6241eA5268d` | `0x210fbc9b14b222bf0097f9862da0d4f8662084f4` |
| `SUSD` token | `—` | `0xE32527F8b3f142a69278f22CdA334d70644b9743` |
| `FixedPointMathU` library | `—` | `0x629E255320Ab520062A07F22A8a407CFbad62025` |
| `LazyMulSegmentTree` library | `—` | `0xEB80528a819f4729a39ff5695BecE8a63F6072ae` |

Recent versions:

| Version | Timestamp (UTC) | Notes |
| --- | --- | --- |
| 1.15.0 | 2025-09-17T08:22:47Z | Latest rounding fixes prep |
| 1.14.0 | 2025-09-15T09:01:36Z | Library refresh |
| 1.13.0 | 2025-09-14T11:17:07Z | Incremental tree updates |

## Citrea Development (`citrea-dev.json`)

| Component | Proxy | Implementation (v1.27.0) |
| --- | --- | --- |
| `CLMSRMarketCore` | `0x971F9bcE130743BB3eFb37aeAC2050cD44d7579a` | `0xe29c0d0f41eb44b90ebf4b65a908519853c07a2f` |
| `CLMSRPosition` | `0xe163497F304ad4b7482C84Bc82079d46050c6e93` | `0x53e80a00029e9f52ea2e8d03b1e9e7498a5eb7fb` |
| `PointsGranter` | `0x59eb810fa5e7c0646902C29D9e8bfdaDf25Ce274` | `0x978b7150a89dacddb9fc81294676eed3686c1ea3` |
| `SUSD` token | `—` | `0xE32527F8b3f142a69278f22CdA334d70644b9743` |
| `FixedPointMathU` library | `—` | `0xB4779459E2681257d6fe64105dFd05ECA93E7b82` |
| `LazyMulSegmentTree` library | `—` | `0x23e01A7a1e32ff146D1851e6E64B3f261dB105bE` |

Development history is much noisier (frequent upgrades). Always check the manifest for the exact version you target.

## How to Regenerate These Tables

1. Read the manifest file:
   ```bash
   cat deployments/environments/citrea-prod.json | jq '.'
   ```
2. Copy the proxy/implementation addresses and version history.
3. Update both this page and [Network Information](../networks/supported-networks.md).

Because the manifests are version-controlled, you can diff them between commits to audit upgrades. When a new upgrade ships, ensure the docs are refreshed in the same pull request so integrators never rely on stale data.
