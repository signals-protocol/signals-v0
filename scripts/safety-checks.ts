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
    console.log(`🎭 Simulating ${contractName} implementation deployment...`);

    try {
      const factory = await ethers.getContractFactory(contractName, {
        libraries,
      });

      // prepareUpgrade로 시뮬레이션 (실제 배포 없이 검증)
      const addresses = this.envManager.getDeployedAddresses(this.environment);
      const proxyAddress = contractName.includes("Position")
        ? addresses.CLMSRPositionProxy
        : addresses.CLMSRMarketCoreProxy;

      if (!proxyAddress) {
        throw new Error(`Proxy address not found for ${contractName}`);
      }

      const prepareOptions: any = {
        unsafeAllow: libraries ? ["external-library-linking"] : undefined,
      };

      // dev 환경에서 kind 옵션 추가
      if (this.environment === "base-dev") {
        prepareOptions.kind = "uups";
      }

      const newImplAddress = await upgrades.prepareUpgrade(
        proxyAddress,
        factory,
        prepareOptions
      );

      console.log(`✅ Implementation deployment simulation successful`);
      console.log(
        `   New implementation would be deployed at: ${newImplAddress}`
      );
      return newImplAddress as string;
    } catch (error: any) {
      console.error("❌ Implementation deployment simulation failed:");
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

      const gasUpgradeOptions: any = {
        unsafeAllow: libraries ? ["external-library-linking"] : undefined,
      };

      // dev 환경에서 kind 옵션 추가
      if (this.environment === "base-dev") {
        gasUpgradeOptions.kind = "uups";
      }

      const newImpl = await upgrades.prepareUpgrade(
        proxyAddress,
        factory,
        gasUpgradeOptions
      );

      // upgradeToAndCall 가스 추정
      const implAddress =
        typeof newImpl === "string" ? newImpl : newImpl.toString();
      const gasEstimate = await proxy.upgradeToAndCall.estimateGas(
        implAddress,
        "0x"
      );

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
  const contractName = process.argv[3] || "CLMSRMarketCoreUpgradeable";

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
