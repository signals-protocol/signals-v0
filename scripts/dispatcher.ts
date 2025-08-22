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
  deploy:base:dev           - Deploy to base dev
  deploy:base:prod          - Deploy to base prod
  deploy:citrea:dev         - Deploy to citrea dev
  deploy:citrea:prod        - Deploy to citrea prod
  
⬆️ Upgrade Commands:
  upgrade:localhost         - Upgrade localhost contracts
  upgrade:base:dev          - Upgrade base dev contracts  
  upgrade:base:prod         - Upgrade base prod contracts
  upgrade:citrea:dev        - Upgrade citrea dev contracts
  upgrade:citrea:prod       - Upgrade citrea prod contracts
  
🏪 Market Commands:
  create-market:localhost   - Create market on localhost
  create-market:base:dev    - Create market on base dev
  create-market:base:prod   - Create market on base prod
  create-market:citrea:dev  - Create market on citrea dev
  create-market:citrea:prod - Create market on citrea prod
  
🏁 Settlement Commands:
  settle-market:localhost   - Settle market on localhost
  settle-market:base:dev    - Settle market on base dev
  settle-market:base:prod   - Settle market on base prod
  settle-market:citrea:dev  - Settle market on citrea dev
  settle-market:citrea:prod - Settle market on citrea prod
  
📢 Position Events Commands:
  emit-position-settled:localhost   - Emit position settled events on localhost
  emit-position-settled:base:dev    - Emit position settled events on base dev
  emit-position-settled:base:prod   - Emit position settled events on base prod
  emit-position-settled:citrea:dev  - Emit position settled events on citrea dev
  emit-position-settled:citrea:prod - Emit position settled events on citrea prod
  
⏰ Market Timing Commands:
  update-market-timing:localhost   - Update market timing on localhost (hardcoded values)
  update-market-timing:base:dev    - Update market timing on base dev (hardcoded values)
  update-market-timing:base:prod   - Update market timing on base prod (hardcoded values)
  update-market-timing:citrea:dev  - Update market timing on citrea dev (hardcoded values)
  update-market-timing:citrea:prod - Update market timing on citrea prod (hardcoded values)
  
📊 Status Commands:
  status:localhost          - Show localhost status
  status:base:dev           - Show base dev status
  status:base:prod          - Show base prod status
  status:citrea:dev         - Show citrea dev status
  status:citrea:prod        - Show citrea prod status

  
💰 SUSD Commands:
  deploy-susd:base:dev      - Deploy SUSD to base dev
  deploy-susd:citrea:dev    - Deploy SUSD to citrea dev
  
🛡️ Safety Commands:
  safety-check:localhost    - Run safety checks for localhost
  safety-check:base:dev     - Run safety checks for base dev
  safety-check:base:prod    - Run safety checks for base prod
  safety-check:citrea:dev   - Run safety checks for citrea dev
  safety-check:citrea:prod  - Run safety checks for citrea prod


📋 Manifest Commands:
  manifest-backup:ENV       - Backup OpenZeppelin manifest for environment
  manifest-commit:ENV       - Commit manifest changes for environment
  manifest-sync:all         - Sync all environment manifests
  manifest-validate:ENV     - Validate manifest for environment
  repair-manifest:ENV       - Clean ghost implementations from manifest

Usage:
  COMMAND=deploy:localhost npx hardhat run scripts/dispatcher.ts --network localhost
  COMMAND=upgrade:base:prod npx hardhat run scripts/dispatcher.ts --network base-prod
  COMMAND=deploy:citrea:dev npx hardhat run scripts/dispatcher.ts --network citrea-dev
  COMMAND=upgrade:citrea:prod npx hardhat run scripts/dispatcher.ts --network citrea-prod
`);
  process.exit(1);
}

async function dispatch() {
  try {
    const [action, ...envParts] = COMMAND!.split(":");
    const env = envParts.join(":"); // safety-check:base:prod → base:prod

    // 환경명 정규화: base:dev → base-dev, base:prod → base-prod, citrea:dev → citrea-dev, citrea:prod → citrea-prod
    let environment = env || "localhost";
    if (environment.includes(":")) {
      const parts = environment.split(":");
      if (parts[0] === "citrea" || parts[0] === "base") {
        environment = `${parts[0]}-${parts[1]}`; // citrea:dev → citrea-dev, base:dev → base-dev
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

      case "emit-position-settled":
        const { emitPositionSettledAction } = await import(
          "./actions/emit-position-settled"
        );
        await emitPositionSettledAction(environment as Environment);
        break;

      case "update-market-timing":
        const { updateMarketTimingAction } = await import(
          "./actions/update-market-timing"
        );
        await updateMarketTimingAction(environment as Environment);
        break;

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
