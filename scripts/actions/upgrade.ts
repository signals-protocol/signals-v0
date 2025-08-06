import { ethers, upgrades } from "hardhat";
import { envManager } from "../utils/environment";
import { safeTxOpts, delay, safeExecuteTx } from "../utils/txOpts";
import { UpgradeSafetyChecker } from "../safety-checks";
import { OpenZeppelinManifestManager } from "../manage-manifest";

export async function upgradeAction(
  environment: "localhost" | "dev" | "prod"
): Promise<void> {
  console.log(`⬆️ Upgrading ${environment} to latest contract`);

  const [deployer] = await ethers.getSigners();
  console.log("👤 Deployer:", deployer.address);

  const addresses = envManager.getDeployedAddresses(environment);

  if (!addresses.CLMSRMarketCoreProxy) {
    throw new Error(`Core proxy not deployed in ${environment} environment`);
  }

  console.log("📋 Core Proxy:", addresses.CLMSRMarketCoreProxy);

  // 🛡️ 안전장치 및 매니페스트 관리 초기화
  const safetyChecker = new UpgradeSafetyChecker(environment);
  const manifestManager = new OpenZeppelinManifestManager();

  // 매니페스트 백업
  console.log("💾 Backing up OpenZeppelin manifest...");
  await manifestManager.backup(environment);

  // 🔧 선제적 매니페스트 동기화 (안전한 방식)
  console.log("🔄 Pre-synchronizing OpenZeppelin manifest...");

  // Position contract forceImport (선제적)
  const CLMSRPositionUpgradeable = await ethers.getContractFactory(
    "CLMSRPositionUpgradeable"
  );

  await upgrades.forceImport(
    addresses.CLMSRPositionProxy!,
    CLMSRPositionUpgradeable,
    { kind: "uups" }
  );
  console.log("✅ Position proxy pre-imported");

  await delay(1000);

  // Core contract forceImport (선제적) - 현재 라이브러리로 먼저 등록
  const CLMSRMarketCoreUpgradeableOld = await ethers.getContractFactory(
    "CLMSRMarketCoreUpgradeable",
    {
      libraries: {
        FixedPointMathU: addresses.FixedPointMathU!,
        LazyMulSegmentTree: addresses.LazyMulSegmentTree!, // 현재 라이브러리
      },
    }
  );

  await upgrades.forceImport(
    addresses.CLMSRMarketCoreProxy!,
    CLMSRMarketCoreUpgradeableOld,
    { kind: "uups" }
  );
  console.log("✅ Core proxy pre-imported");
  console.log("📝 Manifest synchronized with on-chain state");

  // 새 라이브러리 배포 (FLUSH_THRESHOLD 등 신기능 포함)
  console.log("📚 Deploying new LazyMulSegmentTree library...");
  const txOpts = await safeTxOpts();

  const newSegmentTreeAddress = await safeExecuteTx(async () => {
    const LazyMulSegmentTree = await ethers.getContractFactory(
      "LazyMulSegmentTree",
      { libraries: { FixedPointMathU: addresses.FixedPointMathU } }
    );
    const newSegmentTree = await LazyMulSegmentTree.deploy(txOpts);
    await newSegmentTree.waitForDeployment();
    return await newSegmentTree.getAddress();
  });

  // 환경 파일에 새 라이브러리 주소 저장
  envManager.updateContract(
    environment,
    "libraries",
    "LazyMulSegmentTree",
    newSegmentTreeAddress
  );
  console.log("✅ New LazyMulSegmentTree deployed:", newSegmentTreeAddress);

  // Position contract 업그레이드 (자동 forceImport 포함)
  console.log("🎭 Upgrading Position contract...");
  await delay(3000); // Wait between transactions

  if (!addresses.CLMSRPositionProxy) {
    throw new Error(
      `Position proxy not deployed in ${environment} environment`
    );
  }

  // 🛡️ Position 안전성 검사
  console.log("🔍 Running Position contract safety checks...");
  const positionSafe = await safetyChecker.runAllSafetyChecks(
    "CLMSRPositionUpgradeable"
  );
  if (!positionSafe) {
    throw new Error("Position contract safety checks failed!");
  }

  // Position contract 업그레이드 (매니페스트 이미 동기화됨)
  const newPositionImplAddress = await safeExecuteTx(async () => {
    const upgradedPosition = await upgrades.upgradeProxy(
      addresses.CLMSRPositionProxy,
      CLMSRPositionUpgradeable, // 이미 위에서 생성됨
      {
        txOverrides: await safeTxOpts(),
      }
    );

    await upgradedPosition.waitForDeployment();

    return await upgrades.erc1967.getImplementationAddress(
      addresses.CLMSRPositionProxy
    );
  });

  envManager.updateContract(
    environment,
    "core",
    "CLMSRPositionImplementation",
    newPositionImplAddress
  );
  console.log("✅ Position contract upgraded:", newPositionImplAddress);

  // Core contract 업그레이드
  console.log("🔧 Upgrading Core contract with new library...");
  await delay(3000); // Wait between transactions

  // 🛡️ Core 안전성 검사
  console.log("🔍 Running Core contract safety checks...");
  const coreLibraries = {
    FixedPointMathU: addresses.FixedPointMathU,
    LazyMulSegmentTree: newSegmentTreeAddress, // 새 라이브러리 주소 사용
  };
  const coreSafe = await safetyChecker.runAllSafetyChecks(
    "CLMSRMarketCoreUpgradeable",
    coreLibraries
  );
  if (!coreSafe) {
    throw new Error("Core contract safety checks failed!");
  }

  // Core contract 업그레이드 (매니페스트 이미 동기화됨)
  const CLMSRMarketCoreUpgradeable = await ethers.getContractFactory(
    "CLMSRMarketCoreUpgradeable",
    {
      libraries: {
        FixedPointMathU: addresses.FixedPointMathU,
        LazyMulSegmentTree: newSegmentTreeAddress, // 새 라이브러리 주소 사용
      },
    }
  );

  const upgraded = await upgrades.upgradeProxy(
    addresses.CLMSRMarketCoreProxy,
    CLMSRMarketCoreUpgradeable,
    {
      unsafeAllow: ["external-library-linking"],
      txOverrides: await safeTxOpts(),
    }
  );

  await upgraded.waitForDeployment();

  const newImplAddress = await upgrades.erc1967.getImplementationAddress(
    addresses.CLMSRMarketCoreProxy
  );

  envManager.updateContract(
    environment,
    "core",
    "CLMSRMarketCoreImplementation",
    newImplAddress
  );
  console.log("✅ Core contract upgraded:", newImplAddress);

  // 업그레이드 기록 저장
  const nextVersion = envManager.getNextVersion(environment);
  envManager.addDeploymentRecord(environment, {
    version: nextVersion, // 자동 버전 증가
    action: "upgrade",
    contracts: {
      LazyMulSegmentTree: newSegmentTreeAddress,
      CLMSRPositionImplementation: newPositionImplAddress,
      CLMSRMarketCoreImplementation: newImplAddress,
    },
    deployer: deployer.address,
  });

  // 매니페스트 커밋
  console.log("📝 Committing manifest changes...");
  const version = envManager.getCurrentVersion(environment);
  await manifestManager.commit(environment, `Upgrade to v${version} completed`);

  console.log("🎉 Upgrade completed successfully!");
  envManager.printEnvironmentStatus(environment);
}
