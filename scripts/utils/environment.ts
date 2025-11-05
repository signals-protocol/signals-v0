import * as fs from "fs";
import * as path from "path";
import type { Environment } from "../types/environment";

export interface FeeContracts {
  policies: Record<string, string | null>;
  activePolicy?: string | null;
  activePolicyLabel?: string | null;
  feeRecipient?: string | null;
}

export interface EnvironmentConfig {
  environment: string;
  network: string;
  chainId: number;
  description: string;
  contracts: {
    libraries: {
      FixedPointMathU: string | null;
      LazyMulSegmentTree: string | null;
    };
    tokens: {
      SUSD: string | null;
    };
    core: {
      CLMSRPositionProxy: string | null;
      CLMSRPositionImplementation: string | null;
      CLMSRMarketCoreProxy: string | null;
      CLMSRMarketCoreImplementation: string | null;
    };
    points: {
      PointsGranterProxy: string | null;
      PointsGranterImplementation: string | null;
    };
    fees?: FeeContracts;
  };
  deploymentHistory: DeploymentRecord[];
  lastUpdated: string | null;
  deployer: string | null;
}

export interface DeploymentRecord {
  timestamp: string;
  version: string;
  action: "deploy" | "upgrade";
  contracts: Record<string, string>;
  deployer: string;
  gasUsed?: string;
  txHash?: string;
}

export class EnvironmentManager {
  private envDir: string;

  constructor() {
    this.envDir = path.join(__dirname, "../../deployments/environments");
    this.ensureDirectoryExists();
  }

  private ensureDirectoryExists() {
    if (!fs.existsSync(this.envDir)) {
      fs.mkdirSync(this.envDir, { recursive: true });
    }
  }

  /**
   * 환경 설정 파일 경로 반환
   */
  private getEnvPath(env: Environment): string {
    return path.join(this.envDir, `${env}.json`);
  }

  /**
   * 환경 설정 로드
   */
  loadEnvironment(env: Environment): EnvironmentConfig {
    const envPath = this.getEnvPath(env);

    if (!fs.existsSync(envPath)) {
      throw new Error(`Environment file not found: ${envPath}`);
    }

    const content = fs.readFileSync(envPath, "utf8");
    const parsed = JSON.parse(content) as EnvironmentConfig;

    // Backward compatibility: ensure fees container exists
    const existingFees = parsed.contracts.fees;
    if (!existingFees) {
      parsed.contracts.fees = { policies: {} };
    } else if (!existingFees.policies) {
      // Legacy format where fees was a Record<string,string>
      parsed.contracts.fees = {
        policies: { ...(existingFees as unknown as Record<string, string | null>) },
      };
    }

    return parsed;
  }

  /**
   * 환경 설정 저장
   */
  saveEnvironment(env: Environment, config: EnvironmentConfig): void {
    const envPath = this.getEnvPath(env);
    config.lastUpdated = new Date().toISOString();

    fs.writeFileSync(envPath, JSON.stringify(config, null, 2));
    console.log(`✅ Environment saved: ${env} (${envPath})`);
  }

  /**
   * 컨트랙트 주소 업데이트
   */
  updateContract(
    env: Environment,
    contractType: "libraries" | "tokens" | "core" | "points",
    contractName: string,
    address: string
  ): void {
    const config = this.loadEnvironment(env);

    // @ts-ignore
    config.contracts[contractType][contractName] = address;

    this.saveEnvironment(env, config);
    console.log(
      `📝 Updated ${contractType}.${contractName} = ${address} in ${env}`
    );
  }

  /**
   * 수수료 정책 주소 업데이트
   */
  updateFeePolicy(
    env: Environment,
    policyLabel: string,
    address: string | null
  ): void {
    const config = this.loadEnvironment(env);
    if (!config.contracts.fees) {
      config.contracts.fees = { policies: {} };
    }
    config.contracts.fees.policies[policyLabel] = address;

    if (
      config.contracts.fees.activePolicyLabel === policyLabel &&
      address
    ) {
      config.contracts.fees.activePolicy = address;
    }

    this.saveEnvironment(env, config);
    console.log(
      `📝 Updated fee policy "${policyLabel}" = ${
        address ?? "null"
      } in ${env}`
    );
  }

  /**
   * 활성 수수료 정책 기록
   */
  setActiveFeePolicy(
    env: Environment,
    policyAddress: string | null,
    policyLabel?: string | null
  ): void {
    const config = this.loadEnvironment(env);
    if (!config.contracts.fees) {
      config.contracts.fees = { policies: {} };
    }
    config.contracts.fees.activePolicy = policyAddress ?? null;
    if (policyLabel !== undefined) {
      config.contracts.fees.activePolicyLabel = policyLabel;
    }
    this.saveEnvironment(env, config);
    console.log(
      `📝 Active fee policy set to ${
        policyAddress ?? "null"
      } (label=${policyLabel ?? "n/a"}) in ${env}`
    );
  }

  /**
   * 수수료 수취인 기록
   */
  setFeeRecipient(env: Environment, recipient: string | null): void {
    const config = this.loadEnvironment(env);
    if (!config.contracts.fees) {
      config.contracts.fees = { policies: {} };
    }
    config.contracts.fees.feeRecipient = recipient ?? null;
    this.saveEnvironment(env, config);
    console.log(
      `📝 Fee recipient set to ${recipient ?? "null"} in ${env}`
    );
  }

  /**
   * 저장된 수수료 정책 주소 조회
   */
  getFeePolicyAddress(
    env: Environment,
    policyLabel: string
  ): string | null {
    const config = this.loadEnvironment(env);
    return config.contracts.fees?.policies?.[policyLabel] ?? null;
  }

  /**
   * 활성 수수료 정책 주소 조회
   */
  getActiveFeePolicy(env: Environment): string | null {
    const config = this.loadEnvironment(env);
    return config.contracts.fees?.activePolicy ?? null;
  }

  /**
   * 배포 기록 추가
   */
  addDeploymentRecord(
    env: Environment,
    record: Omit<DeploymentRecord, "timestamp">
  ): void {
    const config = this.loadEnvironment(env);

    const fullRecord: DeploymentRecord = {
      ...record,
      timestamp: new Date().toISOString(),
    };

    config.deploymentHistory.push(fullRecord);
    config.deployer = record.deployer;

    this.saveEnvironment(env, config);
    console.log(`📚 Added deployment record to ${env}:`, record.action);
  }

  /**
   * 현재 배포된 주소들 반환
   */
  getDeployedAddresses(env: Environment): Record<string, string> {
    const config = this.loadEnvironment(env);
    const addresses: Record<string, string> = {};

    // Libraries
    Object.entries(config.contracts.libraries).forEach(([name, address]) => {
      if (address) addresses[name] = address;
    });

    // Tokens
    Object.entries(config.contracts.tokens).forEach(([name, address]) => {
      if (address) addresses[name] = address;
    });

    // Core contracts
    Object.entries(config.contracts.core).forEach(([name, address]) => {
      if (address) addresses[name] = address;
    });

    // Points contracts
    if (config.contracts.points) {
      Object.entries(config.contracts.points).forEach(([name, address]) => {
        if (address) addresses[name] = address;
      });
    }

    if (config.contracts.fees) {
      Object.entries(config.contracts.fees.policies).forEach(
        ([label, address]) => {
          if (address) {
            addresses[`FeePolicy:${label}`] = address;
          }
        }
      );
      if (config.contracts.fees.activePolicy) {
        addresses["FeePolicy:active"] = config.contracts.fees.activePolicy;
      }
      if (config.contracts.fees.feeRecipient) {
        addresses["FeeRecipient"] = config.contracts.fees.feeRecipient;
      }
    }

    return addresses;
  }

  /**
   * Get next version by incrementing the minor version
   * @param environment Environment name
   * @returns Next version string
   */
  getNextVersion(environment: Environment): string {
    const env = this.loadEnvironment(environment);

    if (!env.deploymentHistory || env.deploymentHistory.length === 0) {
      return "1.0.0"; // First deployment
    }

    // Get latest version
    const latestRecord =
      env.deploymentHistory[env.deploymentHistory.length - 1];
    const currentVersion = latestRecord.version || "1.0.0";

    // Parse version (format: x.y.z)
    const versionParts = currentVersion.split(".").map(Number);
    const [major, minor, patch] =
      versionParts.length === 3 ? versionParts : [1, 0, 0];

    // Increment minor version, reset patch
    const nextVersion = `${major}.${minor + 1}.0`;
    console.log(`📈 Version bump: ${currentVersion} → ${nextVersion}`);

    return nextVersion;
  }

  /**
   * 환경 상태 출력
   */
  printEnvironmentStatus(env: Environment): void {
    const config = this.loadEnvironment(env);

    console.log(`\n🌍 Environment: ${config.environment.toUpperCase()}`);
    console.log(`📡 Network: ${config.network} (Chain ID: ${config.chainId})`);
    console.log(`📝 Description: ${config.description}`);
    console.log(`👤 Deployer: ${config.deployer || "Not set"}`);
    console.log(`🕐 Last Updated: ${config.lastUpdated || "Never"}`);

    console.log(`\n📚 Libraries:`);
    Object.entries(config.contracts.libraries).forEach(([name, address]) => {
      console.log(`  ${name}: ${address || "❌ Not deployed"}`);
    });

    console.log(`\n🪙 Tokens:`);
    Object.entries(config.contracts.tokens).forEach(([name, address]) => {
      console.log(`  ${name}: ${address || "❌ Not deployed"}`);
    });

    console.log(`\n🏗️ Core Contracts:`);
    Object.entries(config.contracts.core).forEach(([name, address]) => {
      console.log(`  ${name}: ${address || "❌ Not deployed"}`);
    });

    if (config.contracts.points) {
      console.log(`\n🎯 Points Contracts:`);
      Object.entries(config.contracts.points).forEach(([name, address]) => {
        console.log(`  ${name}: ${address || "❌ Not deployed"}`);
      });
    }

    if (config.contracts.fees) {
      console.log(`\n💸 Fee Policies:`);
      const { policies, activePolicy, activePolicyLabel, feeRecipient } =
        config.contracts.fees;
      if (Object.keys(policies).length === 0) {
        console.log("  (none recorded)");
      } else {
        Object.entries(policies).forEach(([label, address]) => {
          console.log(`  ${label}: ${address || "❌ Not deployed"}`);
        });
      }
      console.log(
        `  Active Policy: ${activePolicy || "not set"}${
          activePolicyLabel ? ` (label: ${activePolicyLabel})` : ""
        }`
      );
      console.log(`  Fee Recipient: ${feeRecipient || "not set"}`);
    }

    console.log(
      `\n📋 Deployment History: ${config.deploymentHistory.length} records`
    );
    if (config.deploymentHistory.length > 0) {
      const latest =
        config.deploymentHistory[config.deploymentHistory.length - 1];
      console.log(
        `  Latest: ${latest.action} v${latest.version} (${latest.timestamp})`
      );
    }
  }

  /**
   * SUSD 주소 반환 (이미 배포된 것 사용)
   */
  getSUSDAddress(env: Environment): string | null {
    const config = this.loadEnvironment(env);
    return config.contracts.tokens.SUSD;
  }

  /**
   * Core 프록시 주소 반환
   */
  getCoreProxyAddress(env: Environment): string | null {
    const config = this.loadEnvironment(env);
    return config.contracts.core.CLMSRMarketCoreProxy;
  }

  /**
   * Position 프록시 주소 반환
   */
  getPositionProxyAddress(env: Environment): string | null {
    const config = this.loadEnvironment(env);
    return config.contracts.core.CLMSRPositionProxy;
  }

  /**
   * 새로운 환경 파일 초기화
   */
  initializeEnvironment(env: Environment): void {
    const envPath = this.getEnvPath(env);

    // 기존 파일이 있으면 백업
    if (fs.existsSync(envPath)) {
      const backupPath = `${envPath}.backup.${Date.now()}`;
      fs.copyFileSync(envPath, backupPath);
      console.log(`📋 Existing environment backed up to: ${backupPath}`);
    }

    const defaultConfig: EnvironmentConfig = {
      environment: env,
      network:
        env === "localhost"
          ? "localhost"
          : env.startsWith("citrea")
          ? "citrea"
          : "base",
      chainId:
        env === "localhost" ? 31337 : env.startsWith("citrea") ? 5115 : 8453,
      description:
        env === "localhost"
          ? "Local development environment with MockUSDC"
          : env.startsWith("citrea")
          ? `Citrea ${
              env.includes("dev") ? "development" : "production"
            } environment`
          : env.startsWith("base")
          ? `Base ${
              env.includes("dev") ? "development" : "production"
            } environment`
          : `${env.charAt(0).toUpperCase() + env.slice(1)} environment`,
      contracts: {
        libraries: {
          FixedPointMathU: null,
          LazyMulSegmentTree: null,
        },
        tokens: {
          SUSD: null,
        },
        core: {
          CLMSRPositionProxy: null,
          CLMSRPositionImplementation: null,
          CLMSRMarketCoreProxy: null,
          CLMSRMarketCoreImplementation: null,
        },
        points: {
          PointsGranterProxy: null,
          PointsGranterImplementation: null,
        },
        fees: {
          policies: {},
          activePolicy: null,
          activePolicyLabel: null,
          feeRecipient: null,
        },
      },
      deploymentHistory: [],
      lastUpdated: null,
      deployer: null,
    };

    this.saveEnvironment(env, defaultConfig);
    console.log(`✅ Initialized new environment: ${env}`);
  }

  /**
   * 환경 파일이 존재하는지 확인
   */
  environmentExists(env: Environment): boolean {
    const envPath = this.getEnvPath(env);
    return fs.existsSync(envPath);
  }

  /**
   * 안전한 환경 로드 (파일이 없으면 초기화)
   */
  loadOrInitializeEnvironment(env: Environment): EnvironmentConfig {
    if (!this.environmentExists(env)) {
      console.log(`🔧 Environment file not found for ${env}, initializing...`);
      this.initializeEnvironment(env);
    }
    return this.loadEnvironment(env);
  }

  /**
   * 현재 버전 조회
   */
  getCurrentVersion(env: Environment): string {
    const config = this.loadEnvironment(env);

    if (config.deploymentHistory.length === 0) {
      return "1.0.0"; // 기본 버전
    }

    // 최신 배포 기록에서 버전 반환
    const latestDeployment =
      config.deploymentHistory[config.deploymentHistory.length - 1];
    return latestDeployment.version;
  }
}

// 편의 함수들
export const envManager = new EnvironmentManager();

export function getEnvironment(env: Environment): EnvironmentConfig {
  return envManager.loadEnvironment(env);
}

export function updateEnvironment(
  env: Environment,
  config: EnvironmentConfig
): void {
  envManager.saveEnvironment(env, config);
}

export function getCoreProxy(env: Environment): string {
  const address = envManager.getCoreProxyAddress(env);
  if (!address) {
    throw new Error(`Core proxy not deployed in ${env} environment`);
  }
  return address;
}

export function getPositionProxy(env: Environment): string {
  const address = envManager.getPositionProxyAddress(env);
  if (!address) {
    throw new Error(`Position proxy not deployed in ${env} environment`);
  }
  return address;
}
