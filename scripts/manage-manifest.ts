import { promises as fs } from "fs";
import { execSync } from "child_process";
import * as path from "path";

interface ManifestManager {
  backup(environment: string): Promise<void>;
  restore(environment: string, backupTime?: string): Promise<void>;
  commit(environment: string, message: string): Promise<void>;
  sync(): Promise<void>;
  validate(environment: string): Promise<boolean>;
}

class OpenZeppelinManifestManager implements ManifestManager {
  private manifestDir = ".openzeppelin";
  private backupDir = ".openzeppelin/backups";

  async ensureBackupDir(): Promise<void> {
    try {
      await fs.mkdir(this.backupDir, { recursive: true });
    } catch (error) {
      // Directory already exists, ignore
    }
  }

  /**
   * 환경별 OpenZeppelin 매니페스트 파일명 매핑
   */
  getManifestFileName(environment: string): string {
    switch (environment) {
      case "localhost":
        return "localhost.json";
      case "dev":
        return "base-dev.json"; // dev 환경 전용
      case "prod":
        return "base-prod.json"; // prod 환경 전용
      default:
        return `${environment}.json`;
    }
  }

  /**
   * 매니페스트 백업
   */
  async backup(environment: string): Promise<void> {
    await this.ensureBackupDir();

    // 환경별 매니페스트 파일 매핑
    const manifestFileName = this.getManifestFileName(environment);
    const manifestFile = path.join(this.manifestDir, manifestFileName);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupFile = path.join(
      this.backupDir,
      `${environment}-${timestamp}.json`
    );

    try {
      await fs.access(manifestFile);
      await fs.copyFile(manifestFile, backupFile);
      console.log(`✅ Manifest backed up: ${backupFile}`);
    } catch (error) {
      console.log(`⚠️  No manifest found for ${environment}`);
    }
  }

  /**
   * 매니페스트 복원
   */
  async restore(environment: string, backupTime?: string): Promise<void> {
    const backupPattern = backupTime
      ? `${environment}-${backupTime}.json`
      : `${environment}-*.json`;

    try {
      const backupFiles = await fs.readdir(this.backupDir);
      const matchingBackups = backupFiles
        .filter((file) => file.includes(environment))
        .sort()
        .reverse(); // 최신 순

      if (matchingBackups.length === 0) {
        throw new Error(`No backups found for ${environment}`);
      }

      const backupToRestore = backupTime
        ? matchingBackups.find((f) => f.includes(backupTime))
        : matchingBackups[0];

      if (!backupToRestore) {
        throw new Error(`Backup not found: ${backupPattern}`);
      }

      const backupFile = path.join(this.backupDir, backupToRestore);
      const manifestFileName = this.getManifestFileName(environment);
      const manifestFile = path.join(this.manifestDir, manifestFileName);

      await fs.copyFile(backupFile, manifestFile);
      console.log(`✅ Manifest restored from: ${backupToRestore}`);
    } catch (error) {
      console.error(`❌ Restore failed:`, error);
      throw error;
    }
  }

  /**
   * 매니페스트 Git 커밋
   */
  async commit(environment: string, message: string): Promise<void> {
    const manifestFileName = this.getManifestFileName(environment);
    const manifestFile = path.join(this.manifestDir, manifestFileName);

    try {
      await fs.access(manifestFile);

      // Git add
      execSync(`git add ${manifestFile}`, { stdio: "inherit" });

      // Git commit
      const commitMessage = `📝 ${environment}: ${message}`;
      execSync(`git commit -m "${commitMessage}"`, { stdio: "inherit" });

      console.log(`✅ Manifest committed: ${commitMessage}`);
    } catch (error: any) {
      if (error.message?.includes("nothing to commit")) {
        console.log(`ℹ️  No changes to commit for ${environment}`);
      } else {
        console.error(`❌ Commit failed:`, error);
        throw error;
      }
    }
  }

  /**
   * 모든 환경 매니페스트 동기화
   */
  async sync(): Promise<void> {
    console.log("🔄 Syncing all manifests...");

    try {
      const files = await fs.readdir(this.manifestDir);
      const manifestFiles = files.filter(
        (f) => f.endsWith(".json") && f !== "package.json"
      );

      for (const file of manifestFiles) {
        const env = file.replace(".json", "");
        await this.backup(env);
        console.log(`📋 ${env}: manifest synced`);
      }

      console.log("✅ All manifests synced");
    } catch (error) {
      console.error("❌ Sync failed:", error);
      throw error;
    }
  }

  /**
   * 매니페스트 유효성 검증
   */
  async validate(environment: string): Promise<boolean> {
    const manifestFileName = this.getManifestFileName(environment);
    const manifestFile = path.join(this.manifestDir, manifestFileName);

    try {
      const content = await fs.readFile(manifestFile, "utf-8");
      const manifest = JSON.parse(content);

      // 기본 구조 검증
      const requiredFields = ["manifestVersion", "proxies", "impls"];
      const isValid = requiredFields.every(
        (field) => manifest[field] !== undefined
      );

      if (isValid) {
        console.log(`✅ ${environment}: manifest is valid`);
        console.log(`   - Proxies: ${manifest.proxies?.length || 0}`);
        console.log(
          `   - Implementations: ${Object.keys(manifest.impls || {}).length}`
        );
      } else {
        console.log(`❌ ${environment}: manifest is invalid`);
      }

      return isValid;
    } catch (error) {
      console.log(`❌ ${environment}: manifest not found or corrupted`);
      return false;
    }
  }
}

async function main() {
  const manager = new OpenZeppelinManifestManager();
  const action = process.argv[2];
  const environment = process.argv[3];
  const message = process.argv[4];

  try {
    switch (action) {
      case "backup":
        if (!environment) throw new Error("Environment required");
        await manager.backup(environment);
        break;

      case "restore":
        if (!environment) throw new Error("Environment required");
        await manager.restore(environment, message); // message as backup time
        break;

      case "commit":
        if (!environment || !message)
          throw new Error("Environment and message required");
        await manager.commit(environment, message);
        break;

      case "sync":
        await manager.sync();
        break;

      case "validate":
        if (!environment) throw new Error("Environment required");
        await manager.validate(environment);
        break;

      default:
        console.log(`
📋 OpenZeppelin Manifest Manager

Usage:
  npx ts-node scripts/manage-manifest.ts <action> [environment] [message]

Actions:
  backup <env>              - Backup manifest for environment
  restore <env> [time]      - Restore manifest (latest or specific time)
  commit <env> <message>    - Git commit manifest with message
  sync                      - Sync all environment manifests
  validate <env>            - Validate manifest structure

Examples:
  npx ts-node scripts/manage-manifest.ts backup prod
  npx ts-node scripts/manage-manifest.ts commit prod "Updated after v1.4.0 upgrade"
  npx ts-node scripts/manage-manifest.ts sync
`);
    }
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { OpenZeppelinManifestManager };
