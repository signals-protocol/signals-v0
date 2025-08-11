/**
 * 🎯 Command Dispatcher
 * 모든 스크립트 명령어를 중앙에서 관리하는 디스패처
 */

const COMMAND = process.env.COMMAND;

if (!COMMAND) {
  console.error("❌ COMMAND environment variable is required");
  console.log(`
🎯 Available Commands:
  
📦 Deploy Commands:
  deploy:localhost          - Deploy to localhost
  deploy:base:dev           - Deploy to base dev
  deploy:base:prod          - Deploy to base prod
  
⬆️ Upgrade Commands:
  upgrade:localhost         - Upgrade localhost contracts
  upgrade:base:dev          - Upgrade base dev contracts  
  upgrade:base:prod         - Upgrade base prod contracts
  
🏪 Market Commands:
  create-market:localhost   - Create market on localhost
  create-market:base:dev    - Create market on base dev
  create-market:base:prod   - Create market on base prod
  
🏁 Settlement Commands:
  settle-market:localhost   - Settle market on localhost
  settle-market:base:dev    - Settle market on base dev
  settle-market:base:prod   - Settle market on base prod
  
⏰ Market Timing Commands:
  update-market-timing:localhost   - Update market timing on localhost (hardcoded values)
  update-market-timing:base:dev    - Update market timing on base dev (hardcoded values)
  update-market-timing:base:prod   - Update market timing on base prod (hardcoded values)
  
📊 Status Commands:
  status:localhost          - Show localhost status
  status:base:dev           - Show base dev status
  status:base:prod          - Show base prod status

  
💰 SUSD Commands:
  deploy-susd:base:dev      - Deploy SUSD to base dev
  
🛡️ Safety Commands:
  safety-check:localhost    - Run safety checks for localhost
  safety-check:base:dev     - Run safety checks for base dev
  safety-check:base:prod    - Run safety checks for base prod

🔄 Backfill Commands:
  backfill:preview          - Preview legacy contract backfill (no actual execution)
  backfill:dev:dry          - Dry run backfill on dev environment
  backfill:dev:execute      - Execute backfill on dev environment
  backfill:prod:dry         - Dry run backfill on prod environment
  backfill:prod:execute     - Execute backfill on prod environment
  
📋 Manifest Commands:
  manifest-backup:ENV       - Backup OpenZeppelin manifest for environment
  manifest-commit:ENV       - Commit manifest changes for environment
  manifest-sync:all         - Sync all environment manifests
  manifest-validate:ENV     - Validate manifest for environment

Usage:
  COMMAND=deploy:localhost npx hardhat run scripts/dispatcher.ts --network localhost
  COMMAND=upgrade:base:prod npx hardhat run scripts/dispatcher.ts --network base-prod
`);
  process.exit(1);
}

async function dispatch() {
  try {
    const [action, ...envParts] = COMMAND!.split(":");
    const env = envParts.join(":"); // safety-check:base:prod → base:prod

    // 환경명 정규화: base:dev → dev, base:prod → prod
    let environment = env || "localhost";
    if (environment.includes(":")) {
      environment = environment.split(":")[1]; // base:prod → prod
    }

    console.log(`🎯 Executing: ${COMMAND}`);

    switch (action) {
      case "deploy":
        const { deployAction } = await import("./actions/deploy");
        await deployAction(environment as "localhost" | "dev" | "prod");
        break;

      case "upgrade":
        const { upgradeAction } = await import("./actions/upgrade");
        await upgradeAction(environment as "localhost" | "dev" | "prod");
        break;

      case "create-market":
        const { createMarketAction } = await import("./actions/create-market");
        await createMarketAction(environment as "localhost" | "dev" | "prod");
        break;

      case "settle-market":
        const { settleMarketAction } = await import("./actions/settle-market");
        await settleMarketAction(environment as "localhost" | "dev" | "prod");
        break;

      case "update-market-timing":
        const { updateMarketTimingAction } = await import(
          "./actions/update-market-timing"
        );
        await updateMarketTimingAction(
          environment as "localhost" | "dev" | "prod"
        );
        break;

      case "deploy-susd":
        const { deploySUSDAction } = await import("./actions/deploy-susd");
        await deploySUSDAction();
        break;

      case "status":
        const { statusAction } = await import("./actions/status");
        await statusAction(environment as "localhost" | "dev" | "prod");
        break;

      case "safety-check":
        const { UpgradeSafetyChecker } = await import("./safety-checks");
        const { envManager } = await import("./utils/environment");
        const checker = new UpgradeSafetyChecker(
          environment as "localhost" | "dev" | "prod"
        );

        // 라이브러리 주소 가져오기
        const addresses = envManager.getDeployedAddresses(
          environment as "localhost" | "dev" | "prod"
        );
        const libraries = {
          FixedPointMathU: addresses.FixedPointMathU!,
          LazyMulSegmentTree: addresses.LazyMulSegmentTree!,
        };

        await checker.runAllSafetyChecks(
          "CLMSRMarketCoreUpgradeable",
          libraries
        );
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

      // Backfill Commands
      case "backfill":
        const parts = COMMAND!.split(":");
        const subaction = parts[1];
        switch (subaction) {
          case "preview":
            const { LegacyBackfillAnalyzer } = await import(
              "./backfill-legacy-preview"
            );
            console.log("🔍 레거시 백필 미리보기 실행...");
            const analyzer = new LegacyBackfillAnalyzer();
            await analyzer.analyzeLegacyContract();
            analyzer.generateReport();
            break;

          case "dev":
          case "prod":
            const executeMode = parts[2]; // "dry" or "execute"
            const isDryRun = executeMode !== "execute";

            const { LegacyBackfillExecutor } = await import(
              "./backfill-legacy-execute"
            );
            const executor = new LegacyBackfillExecutor();

            console.log(
              `🚀 레거시 백필 ${
                isDryRun ? "DRY RUN" : "실행"
              } - ${subaction} 환경`
            );

            await executor.initialize(subaction);
            await executor.processLegacyContract(isDryRun);
            executor.generateSummary();
            break;

          default:
            console.error(`❌ Unknown backfill subaction: ${subaction}`);
            console.log(
              "Available: preview, dev:dry, dev:execute, prod:dry, prod:execute"
            );
            process.exit(1);
        }
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
