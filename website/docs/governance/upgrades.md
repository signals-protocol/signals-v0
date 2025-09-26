# Governance & Upgrades

Signals contracts follow the UUPS pattern, so the upgrade surface is small but powerful. This page outlines the current governance model and the steps required to ship a new implementation.

## Current Governance Model

- **Owner**: A single account (EOA or admin contract) controls `CLMSRMarketCore`, `CLMSRPosition`, and `PointsGranter` via `Ownable`. There is no timelock or multisig live today.
- **Scope**: The owner can upgrade implementations, create/settle markets, pause trading, and manage auxiliary contracts.
- **Roadmap**: Introduce a timelock + multisig wrapper so upgrades and settlements can be supervised by multiple parties. Until that lands, deployments rely on operational discipline.

## Upgrade Checklist

1. **Develop & test** the new implementation (`*.sol`) and ensure storage layout compatibility.
2. **Deploy implementation** using Hardhat Ignition or a direct `deploy` script. Record the address.
3. **Run unit + invariant tests** against the new bytecode, including gas snapshots.
4. **Broadcast upgrade**:
   ```bash
   yarn upgrade:citrea:prod
   ```
   The dispatcher sets `MANIFEST_DEFAULT_DIR` and invokes `upgradeTo` on each proxy.
5. **Verify** the new implementation source on the explorer (`scripts/verify-all.sh`).
6. **Update manifests**: `deployments/environments/*.json` append a new entry with version, timestamp, and addresses.
7. **Announce** the upgrade with a changelog entry summarising behavioural differences.

## Rollback Procedure

- If an upgrade must be reverted, deploy the previous implementation and call `upgradeTo` with the old address.
- Because state is preserved, ensure the old code is still storage-compatible before rolling back.

## Configuration Changes

Most parameter changes (OutcomeSpec, $\alpha$) occur when creating a new market. If a live market needs adjustment, use `updateMarketTiming` for timing changes. Structural changes (fees, different price sources) require new contract logic and therefore follow the upgrade checklist above.

## Transparency

- Release notes live in [`website/docs/changelog`](../changelog/index.md).
- Deployment manifests are version-controlled and reviewed in pull requests.
- Future governance layers (timelock/multisig) will publish their ops guide alongside the base process so integrators can adjust expectations.
