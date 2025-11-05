/**
 * 🎯 Command Dispatcher
 * 모든 스크립트 명령어를 중앙에서 관리하는 디스패처
 */

import { Environment } from "./types/environment";

const COMMAND = process.env.COMMAND;

if (!COMMAND) {
  console.error("❌ COMMAND environment variable is required");
  console.log(`
🎯 Available Commands:
  
📦 Deploy Commands:
  deploy:localhost          - Deploy to localhost
  deploy:citrea:dev         - Deploy to citrea dev
  deploy:citrea:prod        - Deploy to citrea prod
  deploy-fee-policy:ENV     - Deploy a fee policy contract (Null/Custom)

⬆️ Upgrade Commands:
  upgrade:localhost         - Upgrade localhost contracts
  upgrade:citrea:dev        - Upgrade citrea dev contracts
  upgrade:citrea:prod       - Upgrade citrea prod contracts

💸 Fee Policy Commands:
  set-fee-policy:ENV        - Configure core fee policy / recipient

🏪 Market Commands:
  create-market:localhost   - Create market on localhost
  create-market:citrea:dev  - Create market on citrea dev
  create-market:citrea:prod - Create market on citrea prod
  set-market-active:ENV     - Toggle activation (MARKET_ID, ACTIVE env vars)
  activate-market:ENV       - Alias for set-market-active with ACTIVE=true
  deactivate-market:ENV     - Alias for set-market-active with ACTIVE=false
  
🏁 Settlement Commands:
  settle-market:localhost   - Settle market on localhost
  settle-market:citrea:dev  - Settle market on citrea dev
  settle-market:citrea:prod - Settle market on citrea prod
  
🚫 Market Close Commands:
  close-market:localhost    - Close market on localhost (stops trading)
  close-market:citrea:dev   - Close market on citrea dev (stops trading)
  close-market:citrea:prod  - Close market on citrea prod (stops trading)
  
🔄 Market Reopen Commands:
  reopen-market:localhost   - Reopen settled market on localhost
  reopen-market:citrea:dev  - Reopen settled market on citrea dev
  reopen-market:citrea:prod - Reopen settled market on citrea prod
  
⏸️ Market Pause Commands:
  pause-market:localhost    - Pause market contract on localhost
  pause-market:citrea:dev   - Pause market contract on citrea dev
  pause-market:citrea:prod  - Pause market contract on citrea prod
  
▶️ Market Unpause Commands:
  unpause-market:localhost  - Unpause market contract on localhost
  unpause-market:citrea:dev - Unpause market contract on citrea dev
  unpause-market:citrea:prod- Unpause market contract on citrea prod
  
📢 Position Events Commands:
  emit-position-settled:localhost   - Emit position settled events on localhost
  emit-position-settled:citrea:dev  - Emit position settled events on citrea dev
  emit-position-settled:citrea:prod - Emit position settled events on citrea prod
  
🔍 Position Status Commands:
  check-position-status:localhost   - Check position emission status on localhost
  check-position-status:citrea:dev  - Check position emission status on citrea dev
  check-position-status:citrea:prod - Check position emission status on citrea prod
  
⏰ Market Timing Commands:
  update-market-timing:localhost   - Update market timing on localhost (hardcoded values)
  update-market-timing:citrea:dev  - Update market timing on citrea dev (hardcoded values)
  update-market-timing:citrea:prod - Update market timing on citrea prod (hardcoded values)
  
📊 Status Commands:
  status:localhost          - Show localhost status
  status:citrea:dev         - Show citrea dev status
  status:citrea:prod        - Show citrea prod status

  
💰 SUSD Commands:
  deploy-susd:citrea:dev    - Deploy SUSD to citrea dev
  
🛡️ Safety Commands:
  safety-check:localhost    - Run safety checks for localhost
  safety-check:citrea:dev   - Run safety checks for citrea dev
  safety-check:citrea:prod  - Run safety checks for citrea prod


📋 Manifest Commands:
  manifest-backup:ENV       - Backup OpenZeppelin manifest for environment
  manifest-commit:ENV       - Commit manifest changes for environment
  manifest-sync:all         - Sync all environment manifests
  manifest-validate:ENV     - Validate manifest for environment
  repair-manifest:ENV       - Clean ghost implementations from manifest

💸 Compensation Commands:
  compensate-susd:ENV       - Send 2x total cost SUSD to investors from CSV

🔍 Query Commands:
  range-sum:localhost       - Get range sum for market on localhost
  range-sum:citrea:dev      - Get range sum for market on citrea dev
  range-sum:citrea:prod     - Get range sum for market on citrea prod

Usage:
  COMMAND=deploy:localhost npx hardhat run scripts/dispatcher.ts --network localhost
  COMMAND=deploy:citrea:dev npx hardhat run scripts/dispatcher.ts --network citrea-dev
  COMMAND=upgrade:citrea:prod npx hardhat run scripts/dispatcher.ts --network citrea-prod
`);
  process.exit(1);
}

async function dispatch() {
  try {
    const [action, ...envParts] = COMMAND!.split(":");
    const env = envParts.join(":"); // safety-check:base:prod → base:prod

    // 환경명 정규화: citrea:dev → citrea-dev, citrea:prod → citrea-prod
    let environment = env || "localhost";
    if (environment.includes(":")) {
      const parts = environment.split(":");
      if (parts[0] === "citrea") {
        environment = `${parts[0]}-${parts[1]}`; // citrea:dev → citrea-dev
      } else {
        environment = parts[1]; // fallback
      }
    }

    console.log(`🎯 Executing: ${COMMAND}`);

    switch (action) {
      case "deploy":
        const { deployAction } = await import("./actions/deploy");
        await deployAction(environment as Environment);
        break;

      case "deploy-fee-policy":
        const { deployFeePolicyAction } = await import(
          "./actions/deploy-fee-policy"
        );
        await deployFeePolicyAction(environment as Environment);
        break;

      case "upgrade":
        const { upgradeAction } = await import("./actions/upgrade");
        await upgradeAction(environment as Environment);
        break;

      case "create-market":
        const { createMarketAction } = await import("./actions/create-market");
        await createMarketAction(environment as Environment);
        break;

      case "settle-market":
        const { settleMarketAction } = await import("./actions/settle-market");
        await settleMarketAction(environment as Environment);
        break;

      case "close-market":
        const { closeMarketAction } = await import("./actions/close-market");
        await closeMarketAction(environment as Environment);
        break;

      case "reopen-market":
        const { reopenMarketAction } = await import("./actions/reopen-market");
        await reopenMarketAction(environment as Environment);
        break;

      case "pause-market":
        const { pauseMarketAction } = await import("./actions/pause-market");
        await pauseMarketAction(environment as Environment);
        break;

      case "set-fee-policy":
        const { setFeePolicyAction } = await import(
          "./actions/set-fee-policy"
        );
        await setFeePolicyAction(environment as Environment);
        break;

      case "unpause-market":
        const { unpauseMarketAction } = await import(
          "./actions/unpause-market"
        );
        await unpauseMarketAction(environment as Environment);
        break;

      case "emit-position-settled":
        const { emitPositionSettledAction } = await import(
          "./actions/emit-position-settled"
        );
        await emitPositionSettledAction(environment as Environment);
        break;

      case "check-position-status":
        const { checkMarketPositionStatusCLI } = await import(
          "./actions/check-market-position-status"
        );
        await checkMarketPositionStatusCLI(environment as Environment);
        break;

      case "update-market-timing":
        const { updateMarketTimingAction } = await import(
          "./actions/update-market-timing"
        );
        await updateMarketTimingAction(environment as Environment);
        break;

      case "set-market-active":
      case "activate-market":
      case "deactivate-market": {
        if (action === "activate-market") {
          process.env.ACTIVE = "true";
        } else if (action === "deactivate-market") {
          process.env.ACTIVE = "false";
        }
        const { setMarketActiveAction } = await import(
          "./actions/set-market-active"
        );
        await setMarketActiveAction(environment as Environment);
        break;
      }

      case "deploy-susd":
        const { deploySUSDAction } = await import("./actions/deploy-susd");
        await deploySUSDAction();
        break;

      case "status":
        const { statusAction } = await import("./actions/status");
        await statusAction(environment as Environment);
        break;

      case "safety-check":
        const { UpgradeSafetyChecker } = await import("./safety-checks");
        const { envManager } = await import("./utils/environment");
        const checker = new UpgradeSafetyChecker(environment as Environment);

        // 라이브러리 주소 가져오기
        const addresses = envManager.getDeployedAddresses(
          environment as Environment
        );
        const libraries = {
          FixedPointMathU: addresses.FixedPointMathU!,
          LazyMulSegmentTree: addresses.LazyMulSegmentTree!,
        };

        await checker.runAllSafetyChecks("CLMSRMarketCore", libraries);
        break;

      case "manifest-backup":
        const { OpenZeppelinManifestManager: ManifestManagerBackup } =
          await import("./manage-manifest");
        const managerBackup = new ManifestManagerBackup();
        await managerBackup.backup(environment);
        break;

      case "manifest-commit":
        const { OpenZeppelinManifestManager: ManifestManagerCommit } =
          await import("./manage-manifest");
        const managerCommit = new ManifestManagerCommit();
        const message = `${environment} environment changes`;
        await managerCommit.commit(environment, message);
        break;

      case "manifest-sync":
        const { OpenZeppelinManifestManager: ManifestManagerSync } =
          await import("./manage-manifest");
        const managerSync = new ManifestManagerSync();
        await managerSync.sync();
        break;

      case "manifest-validate":
        const { OpenZeppelinManifestManager: ManifestManagerValidate } =
          await import("./manage-manifest");
        const managerValidate = new ManifestManagerValidate();
        await managerValidate.validate(environment);
        break;

      case "repair-manifest":
        const { repairManifestAction } = await import("./repair-manifest");
        await repairManifestAction(environment as Environment);
        break;

      case "compensate-susd":
        const { compensateSUSDAction } = await import(
          "./actions/compensate-susd"
        );
        await compensateSUSDAction(environment as Environment);
        break;

      case "debug-emission":
        const { debugEmissionAction } = await import(
          "./actions/debug-emission"
        );
        await debugEmissionAction(environment as Environment);
        break;

      case "test-batch-sizes":
        const { testBatchSizesAction } = await import(
          "./actions/test-batch-sizes"
        );
        await testBatchSizesAction(environment as Environment);
        break;

      case "range-sum":
        const { rangeSumAction } = await import("./actions/range-sum");
        await rangeSumAction(environment as Environment);
        break;

      default:
        console.error(`❌ Unknown command: ${action}`);
        console.log("Use COMMAND without value to see available commands");
        process.exit(1);
    }

    console.log("✅ Command completed successfully!");
  } catch (error) {
    console.error("❌ Command failed:", error);
    process.exit(1);
  }
}

dispatch();
