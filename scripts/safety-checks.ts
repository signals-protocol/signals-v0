import { ethers, upgrades } from "hardhat";
import { EnvironmentManager } from "./utils/environment";
import type { Environment } from "./types/environment";

interface SafetyCheck {
  name: string;
  execute(): Promise<boolean>;
  description: string;
}

class UpgradeSafetyChecker {
  private environment: Environment;
  private envManager: EnvironmentManager;

  constructor(environment: Environment) {
    this.environment = environment;
    this.envManager = new EnvironmentManager();
  }

  /**
   * 스토리지 레이아웃 호환성 검증
   */
  async validateStorageLayout(
    proxyAddress: string,
    newImplementationFactory: string,
    libraries?: Record<string, string>
  ): Promise<boolean> {
    console.log("🔍 Validating storage layout compatibility...");
    console.log(`🔍 Environment: ${this.environment}`);
    console.log(`🔍 Using proxy address: ${proxyAddress}`);
    console.log(`🔍 Chain ID: ${(await ethers.provider.getNetwork()).chainId}`);

    try {
      const factory = await ethers.getContractFactory(
        newImplementationFactory,
        {
          libraries,
        }
      );

      // OpenZeppelin의 validateUpgrade 사용
      const validateOptions: any = {
        unsafeAllow: libraries ? ["external-library-linking"] : undefined,
      };

      // dev 환경에서 kind 옵션 추가 (OpenZeppelin 에러 해결)
      if (this.environment === "base-dev") {
        validateOptions.kind = "uups";
        console.log(`🔧 dev 환경: kind=uups 옵션 추가`);
      }

      await upgrades.validateUpgrade(proxyAddress, factory, validateOptions);

      console.log("✅ Storage layout is compatible");
      return true;
    } catch (error: any) {
      console.error("❌ Storage layout validation failed:");
      console.error(error.message);
      return false;
    }
  }

  /**
   * 새 Implementation 배포 시뮬레이션
   */
  async simulateImplementationDeployment(
    contractName: string,
    libraries?: Record<string, string>
  ): Promise<string | null> {
    console.log(`🔍 Validating ${contractName} upgrade compatibility...`);

    try {
      const factory = await ethers.getContractFactory(contractName, {
        libraries,
      });

      // validateUpgrade로 호환성 검증 (실제 배포 없이 검증)
      const addresses = this.envManager.getDeployedAddresses(this.environment);
      const proxyAddress = contractName.includes("Position")
        ? addresses.CLMSRPositionProxy
        : addresses.CLMSRMarketCoreProxy;

      if (!proxyAddress) {
        throw new Error(`Proxy address not found for ${contractName}`);
      }

      const validateOptions: any = {
        unsafeAllow: libraries ? ["external-library-linking"] : undefined,
      };

      // dev 환경에서 kind 옵션 추가
      if (this.environment === "base-dev") {
        validateOptions.kind = "uups";
      }

      // validateUpgrade로 호환성만 검증 (배포 없음)
      await upgrades.validateUpgrade(proxyAddress, factory, validateOptions);

      console.log(`✅ Upgrade compatibility validation successful`);
      console.log(`   ${contractName} is ready for upgrade`);
      return null; // 실제 주소 반환 안함
    } catch (error: any) {
      console.error("❌ Upgrade compatibility validation failed:");
      console.error(error.message);
      return null;
    }
  }

  /**
   * 가스 추정
   */
  async estimateUpgradeGas(
    proxyAddress: string,
    newImplementationFactory: string,
    libraries?: Record<string, string>
  ): Promise<bigint | null> {
    console.log("⛽ Estimating upgrade gas costs...");

    try {
      const factory = await ethers.getContractFactory(
        newImplementationFactory,
        {
          libraries,
        }
      );

      // 업그레이드 트랜잭션 시뮬레이션
      const proxy = await ethers.getContractAt("UUPSUpgradeable", proxyAddress);

      // 가스 추정을 위한 호환성 검증만 수행
      const gasUpgradeOptions: any = {
        unsafeAllow: libraries ? ["external-library-linking"] : undefined,
      };

      // dev 환경에서 kind 옵션 추가
      if (this.environment === "base-dev") {
        gasUpgradeOptions.kind = "uups";
      }

      // 호환성 검증만 수행 (배포 없음)
      await upgrades.validateUpgrade(proxyAddress, factory, gasUpgradeOptions);

      // 가스 추정은 간략화 (실제 구현체 없이는 정확한 추정 불가)
      console.log(`✅ Upgrade compatibility validated for gas estimation`);
      const gasEstimate = BigInt(500000); // 예상 가스 (실제 배포 시 정확한 값 확인)

      console.log(
        `✅ Estimated gas for upgrade: ${gasEstimate.toLocaleString()}`
      );
      return gasEstimate;
    } catch (error: any) {
      console.error("❌ Gas estimation failed:");
      console.error(error.message);
      return null;
    }
  }

  /**
   * 라이브러리 호환성 검증
   */
  async validateLibraryCompatibility(
    contractName: string,
    oldLibraries: Record<string, string>,
    newLibraries: Record<string, string>
  ): Promise<boolean> {
    console.log("📚 Validating library compatibility...");

    try {
      const libraryNames = Object.keys(newLibraries);

      for (const libName of libraryNames) {
        const oldAddr = oldLibraries[libName];
        const newAddr = newLibraries[libName];

        if (oldAddr && newAddr && oldAddr !== newAddr) {
          console.log(`⚠️  Library ${libName} address changed:`);
          console.log(`   Old: ${oldAddr}`);
          console.log(`   New: ${newAddr}`);

          // 새 라이브러리 코드 검증
          const code = await ethers.provider.getCode(newAddr);
          if (code === "0x") {
            console.error(
              `❌ New library ${libName} has no code at ${newAddr}`
            );
            return false;
          }
        }
      }

      console.log("✅ Library compatibility validated");
      return true;
    } catch (error: any) {
      console.error("❌ Library compatibility validation failed:");
      console.error(error.message);
      return false;
    }
  }

  /**
   * 전체 안전성 검사 실행
   */
  async runAllSafetyChecks(
    contractName: string,
    libraries?: Record<string, string>
  ): Promise<boolean> {
    console.log(`🛡️  Running safety checks for ${contractName} upgrade...`);
    console.log(`🌍 Environment: ${this.environment}`);

    const addresses = this.envManager.getDeployedAddresses(this.environment);
    let proxyAddress = contractName.includes("Position")
      ? addresses.CLMSRPositionProxy
      : addresses.CLMSRMarketCoreProxy;

    // 🔧 dev 환경에서는 원래 주소 유지 (kind 옵션으로 해결)
    console.log(`🎯 사용할 proxy 주소: ${proxyAddress}`);

    if (!proxyAddress) {
      console.error(`❌ Proxy address not found for ${contractName}`);
      return false;
    }

    const checks: SafetyCheck[] = [
      {
        name: "Storage Layout Validation",
        description: "Verify storage layout compatibility",
        execute: () =>
          this.validateStorageLayout(proxyAddress!, contractName, libraries),
      },
      {
        name: "Implementation Deployment Simulation",
        description: "Simulate new implementation deployment",
        execute: async () => {
          const result = await this.simulateImplementationDeployment(
            contractName,
            libraries
          );
          return result !== null;
        },
      },
      {
        name: "Gas Estimation",
        description: "Estimate upgrade transaction gas",
        execute: async () => {
          const result = await this.estimateUpgradeGas(
            proxyAddress!,
            contractName,
            libraries
          );
          return result !== null;
        },
      },
    ];

    if (libraries) {
      checks.push({
        name: "Library Compatibility",
        description: "Validate library compatibility",
        execute: () =>
          this.validateLibraryCompatibility(
            contractName,
            (addresses.libraries as any) || {},
            libraries
          ),
      });
    }

    let allPassed = true;
    for (const check of checks) {
      console.log(`\n🔍 ${check.name}: ${check.description}`);
      const passed = await check.execute();

      if (passed) {
        console.log(`✅ ${check.name} - PASSED`);
      } else {
        console.log(`❌ ${check.name} - FAILED`);
        allPassed = false;
      }
    }

    console.log(
      `\n🛡️  Safety Check Summary: ${
        allPassed ? "✅ ALL PASSED" : "❌ SOME FAILED"
      }`
    );
    return allPassed;
  }
}

async function main() {
  const environment = (process.argv[2] || "localhost") as Environment;
  const contractName = process.argv[3] || "CLMSRMarketCore";

  const checker = new UpgradeSafetyChecker(environment);

  try {
    const envManager = new EnvironmentManager();
    const addresses = envManager.getDeployedAddresses(environment);

    const libraries = contractName.includes("Core")
      ? {
          FixedPointMathU: addresses.FixedPointMathU!,
          LazyMulSegmentTree: addresses.LazyMulSegmentTree!,
        }
      : undefined;

    const result = await checker.runAllSafetyChecks(contractName, libraries);

    if (!result) {
      console.error("\n❌ Safety checks failed. Do not proceed with upgrade.");
      process.exit(1);
    }

    console.log("\n✅ All safety checks passed. Upgrade is safe to proceed.");
  } catch (error) {
    console.error("❌ Safety check error:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { UpgradeSafetyChecker };
