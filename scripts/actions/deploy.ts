import { ethers, upgrades } from "hardhat";
import { envManager } from "../utils/environment";
import type { Environment } from "../types/environment";

export async function deployAction(environment: Environment): Promise<void> {
  console.log(`🚀 Deploying to ${environment}`);

  const [deployer] = await ethers.getSigners();
  console.log("👤 Deployer:", deployer.address);

  // 환경 파일 확인 및 필요시 초기화
  if (!envManager.environmentExists(environment)) {
    console.log("🔧 Initializing fresh environment for new deployment...");
    envManager.initializeEnvironment(environment);
  } else {
    console.log("🔍 Using existing environment configuration...");
  }

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
      const networkPrefix = environment.startsWith("citrea")
        ? "citrea"
        : "base";
      throw new Error(
        `❌ SUSD not found for ${environment}. Please run: npm run deploy-susd:${networkPrefix}`
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

  console.log("🏢 Deploying Manager contract...");
  const CLMSRMarketManager = await ethers.getContractFactory(
    "CLMSRMarketManager",
    {
      libraries: {
        LazyMulSegmentTree: segmentTreeAddress,
      },
    }
  );
  const manager = await CLMSRMarketManager.deploy();
  await manager.waitForDeployment();
  const managerAddress = await manager.getAddress();
  envManager.updateContract(
    environment,
    "core",
    "CLMSRMarketManager",
    managerAddress
  );
  console.log("✅ Manager deployed:", managerAddress);

  // Position 컨트랙트 배포
  console.log("🎭 Deploying Position contract...");

  const CLMSRPosition = await ethers.getContractFactory("CLMSRPosition");
  const positionProxy = await upgrades.deployProxy(
    CLMSRPosition,
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

  const CLMSRMarketCore = await ethers.getContractFactory("CLMSRMarketCore", {
    libraries: {
      FixedPointMathU: fixedPointMathAddress,
      LazyMulSegmentTree: segmentTreeAddress,
    },
  });

  const coreProxy = await upgrades.deployProxy(
    CLMSRMarketCore,
    [susdAddress, positionProxyAddress],
    {
      kind: "uups",
      initializer: "initialize",
      unsafeAllow: ["external-library-linking", "delegatecall"],
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

  console.log("⚙️ Configuring manager pointer...");
  await coreProxy.setManager(managerAddress);
  console.log("✅ Manager linked to Core");

  // Position 컨트랙트 core 주소 업데이트
  console.log("🔗 Updating Position contract...");
  await positionProxy.updateCore(coreProxyAddress);
  console.log("✅ Position core address updated");

  // PointsGranter 배포 (항상 배포)
  console.log("🎯 Deploying PointsGranter (UUPS)...");
  const PointsGranter = await ethers.getContractFactory("PointsGranter");
  const pointsProxy = await upgrades.deployProxy(
    PointsGranter,
    [deployer.address],
    {
      kind: "uups",
      initializer: "initialize",
    }
  );
  await pointsProxy.waitForDeployment();
  const pointsProxyAddress = await pointsProxy.getAddress();
  const pointsImplAddress = await upgrades.erc1967.getImplementationAddress(
    pointsProxyAddress
  );

  envManager.updateContract(
    environment,
    "points" as any,
    "PointsGranterProxy",
    pointsProxyAddress
  );
  envManager.updateContract(
    environment,
    "points" as any,
    "PointsGranterImplementation",
    pointsImplAddress
  );
  console.log("✅ PointsGranter deployed:", pointsProxyAddress);

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
      CLMSRMarketManager: managerAddress,
      CLMSRPositionProxy: positionProxyAddress,
      CLMSRPositionImplementation: positionImplAddress,
      CLMSRMarketCoreProxy: coreProxyAddress,
      CLMSRMarketCoreImplementation: coreImplAddress,
      PointsGranterProxy: pointsProxyAddress,
      PointsGranterImplementation: pointsImplAddress,
    },
    deployer: deployer.address,
  });

  console.log("\n🎉 Deployment completed successfully!");
  envManager.printEnvironmentStatus(environment);
}
