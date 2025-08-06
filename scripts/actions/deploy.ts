import { ethers, upgrades } from "hardhat";
import { envManager } from "../utils/environment";

export async function deployAction(
  environment: "localhost" | "dev" | "prod"
): Promise<void> {
  console.log(`🚀 Deploying to ${environment}`);

  const [deployer] = await ethers.getSigners();
  console.log("👤 Deployer:", deployer.address);

  // 새로운 배포를 위해 환경 파일 초기화
  console.log("🔧 Initializing fresh environment for new deployment...");
  envManager.initializeEnvironment(environment);

  // SUSD 주소 확인 (localhost는 새로 배포, dev/prod는 기존 것 사용)
  let susdAddress: string | null | undefined;
  if (environment === "localhost") {
    susdAddress = null; // localhost는 항상 새로 배포
  } else {
    try {
      susdAddress = envManager.getSUSDAddress(environment);
    } catch (error) {
      susdAddress = null;
    }
  }

  if (!susdAddress) {
    if (environment === "localhost") {
      // Localhost는 MockUSDC 새로 배포
      console.log("🪙 Deploying MockUSDC for localhost...");
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const susd = await MockERC20.deploy("Signals USD", "SUSD", 6);
      await susd.waitForDeployment();
      susdAddress = await susd.getAddress();

      envManager.updateContract(environment, "tokens", "SUSD", susdAddress);
      console.log("✅ MockUSDC deployed:", susdAddress);
    } else {
      // dev/prod: 새로운 SUSD 필요 (deploy-susd 스크립트로 미리 배포해야 함)
      throw new Error(
        `❌ SUSD not found for ${environment}. Please run: npm run deploy-susd:base:${environment}`
      );
    }
  } else {
    console.log("✅ Using existing SUSD:", susdAddress);
  }

  // 라이브러리 배포
  console.log("📚 Deploying libraries...");

  const FixedPointMathU = await ethers.getContractFactory("FixedPointMathU");
  const fixedPointMath = await FixedPointMathU.deploy();
  await fixedPointMath.waitForDeployment();
  const fixedPointMathAddress = await fixedPointMath.getAddress();
  envManager.updateContract(
    environment,
    "libraries",
    "FixedPointMathU",
    fixedPointMathAddress
  );

  const LazyMulSegmentTree = await ethers.getContractFactory(
    "LazyMulSegmentTree",
    { libraries: { FixedPointMathU: fixedPointMathAddress } }
  );
  const segmentTree = await LazyMulSegmentTree.deploy();
  await segmentTree.waitForDeployment();
  const segmentTreeAddress = await segmentTree.getAddress();
  envManager.updateContract(
    environment,
    "libraries",
    "LazyMulSegmentTree",
    segmentTreeAddress
  );

  console.log("✅ Libraries deployed");

  // Position 컨트랙트 배포
  console.log("🎭 Deploying Position contract...");

  const CLMSRPositionUpgradeable = await ethers.getContractFactory(
    "CLMSRPositionUpgradeable"
  );
  const positionProxy = await upgrades.deployProxy(
    CLMSRPositionUpgradeable,
    [ethers.ZeroAddress], // Temporary
    {
      kind: "uups",
      initializer: "initialize",
    }
  );
  await positionProxy.waitForDeployment();
  const positionProxyAddress = await positionProxy.getAddress();

  const positionImplAddress = await upgrades.erc1967.getImplementationAddress(
    positionProxyAddress
  );

  envManager.updateContract(
    environment,
    "core",
    "CLMSRPositionProxy",
    positionProxyAddress
  );
  envManager.updateContract(
    environment,
    "core",
    "CLMSRPositionImplementation",
    positionImplAddress
  );

  console.log("✅ Position proxy deployed:", positionProxyAddress);

  // Core 컨트랙트 배포
  console.log("🏗️ Deploying Core contract...");

  const CLMSRMarketCoreUpgradeable = await ethers.getContractFactory(
    "CLMSRMarketCoreUpgradeable",
    {
      libraries: {
        FixedPointMathU: fixedPointMathAddress,
        LazyMulSegmentTree: segmentTreeAddress,
      },
    }
  );

  const coreProxy = await upgrades.deployProxy(
    CLMSRMarketCoreUpgradeable,
    [susdAddress, positionProxyAddress],
    {
      kind: "uups",
      initializer: "initialize",
      unsafeAllow: ["external-library-linking"],
    }
  );
  await coreProxy.waitForDeployment();
  const coreProxyAddress = await coreProxy.getAddress();

  const coreImplAddress = await upgrades.erc1967.getImplementationAddress(
    coreProxyAddress
  );

  envManager.updateContract(
    environment,
    "core",
    "CLMSRMarketCoreProxy",
    coreProxyAddress
  );
  envManager.updateContract(
    environment,
    "core",
    "CLMSRMarketCoreImplementation",
    coreImplAddress
  );

  console.log("✅ Core proxy deployed:", coreProxyAddress);

  // Position 컨트랙트 core 주소 업데이트
  console.log("🔗 Updating Position contract...");
  await positionProxy.updateCore(coreProxyAddress);
  console.log("✅ Position core address updated");

  // localhost에서만 초기 SUSD 민팅
  if (environment === "localhost") {
    console.log("💰 Minting initial SUSD...");
    const susdContract = await ethers.getContractAt("MockERC20", susdAddress);
    const mintAmount = ethers.parseUnits("1000000", 6);
    await susdContract.mint(deployer.address, mintAmount);
    console.log("✅ Minted 1M SUSD to deployer");
  }

  // 배포 기록 저장
  envManager.addDeploymentRecord(environment, {
    version: "1.0.0",
    action: "deploy",
    contracts: {
      FixedPointMathU: fixedPointMathAddress,
      LazyMulSegmentTree: segmentTreeAddress,
      SUSD: susdAddress,
      CLMSRPositionProxy: positionProxyAddress,
      CLMSRPositionImplementation: positionImplAddress,
      CLMSRMarketCoreProxy: coreProxyAddress,
      CLMSRMarketCoreImplementation: coreImplAddress,
    },
    deployer: deployer.address,
  });

  console.log("\n🎉 Deployment completed successfully!");
  envManager.printEnvironmentStatus(environment);
}
