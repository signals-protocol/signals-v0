# Governance & Upgrades

Signals contracts run behind a lightweight governance model today, but upgrades still demand discipline. Use this guide as the canonical checklist when you change bytecode or hand off control to a new operator.

## 1. Current authority model

A single `Ownable` owner controls `CLMSRMarketCore`, `CLMSRPosition`, and `PointsGranter`. That account (EOA or admin contract) can create markets, pause or unpause trading, settle outcomes, and upgrade proxies. No timelock or multisig is live yet, so operational safeguards depend on dispatcher scripts, peer review, and deployment manifests. The roadmap introduces a timelock + multisig wrapper so multiple signers approve upgrades and settlements.

## 2. Preparing an upgrade

1. Develop and test the new implementation. Run unit, integration, invariant, and gas suites against the compiled bytecode to confirm storage compatibility.
2. Deploy the implementation with Hardhat Ignition or the provided `deploy` scripts and record the address.
3. Update dispatcher configuration (`MANIFEST_DEFAULT_DIR`, environment files) so `yarn upgrade:<env>` points at the new build.

## 3. Executing the upgrade

1. Run the dispatcher, for example:
   ```bash
yarn upgrade:citrea:prod
   ```
   This calls `upgradeTo` on each proxy (core, position, points) using the freshly deployed implementation. Watch the transaction receipts to confirm success.
2. Verify the source on the block explorer using `scripts/verify-all.sh` so auditors can inspect the bytecode.
3. Append the new implementation address, version, and timestamp to `deployments/environments/*.json`. These manifests are the ground truth for which bytecode is live.
4. Publish release notes in `website/docs/changelog` highlighting behavioural changes and migration considerations.

## 4. Rolling back

If an upgrade must be reverted, redeploy the previous implementation (if it is no longer available) and call `upgradeTo` with the old address. Storage remains intact, but you must ensure the previous code is layout-compatible before reverting. Update the manifest and changelog to document the rollback.

## 5. Configuration versus upgrades

Most day-to-day adjustments—OutcomeSpec, liquidity parameter $\alpha$, or trading windows—happen when creating the next market. Use `updateMarketTiming` only if the current market’s timestamps require a nudge. Structural changes such as fees, alternative price sources, or new payout logic require a contract upgrade and must follow the full checklist above.

## 6. Toward stronger governance

Timelock and multisig wrappers are planned so different teams can own upgrades, settlements, and emergency pauses. When those components land, additional guides will document signer roles, queue/cancel flows, and emergency procedures. Until then, treat dispatcher scripts, manifests, and changelog entries as mandatory artefacts for every change.
