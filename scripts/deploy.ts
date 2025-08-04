import { ethers } from "hardhat";
import { parseUnits } from "ethers";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("🚀 배포 계정:", deployer.address);
  console.log(
    "💰 계정 잔액:",
    ethers.formatEther(await ethers.provider.getBalance(deployer.address)),
    "ETH"
  );

  console.log("\n📦 라이브러리 배포 중...");

  // 1. 라이브러리 배포
  const FixedPointMathUFactory = await ethers.getContractFactory(
    "FixedPointMathU"
  );
  const fixedPointMathU = await FixedPointMathUFactory.deploy();
  await fixedPointMathU.waitForDeployment();
  console.log("✅ FixedPointMathU 배포됨:", await fixedPointMathU.getAddress());

  const LazyMulSegmentTreeFactory = await ethers.getContractFactory(
    "LazyMulSegmentTree",
    {
      libraries: {
        FixedPointMathU: await fixedPointMathU.getAddress(),
      },
    }
  );
  const lazyMulSegmentTree = await LazyMulSegmentTreeFactory.deploy();
  await lazyMulSegmentTree.waitForDeployment();
  console.log(
    "✅ LazyMulSegmentTree 배포됨:",
    await lazyMulSegmentTree.getAddress()
  );

  // 네트워크 안정성을 위한 지연
  console.log("⏳ 네트워크 안정화 대기 중...");
  await new Promise((resolve) => setTimeout(resolve, 5000)); // 5초 대기

  console.log("\n💰 MockERC20 (SUSD) 배포 중...");

  // 2. MockERC20 배포 (시그널 토큰, 데시말 6)
  const MockERC20Factory = await ethers.getContractFactory("MockERC20");
  const paymentToken = await MockERC20Factory.deploy("Signals USD", "SUSD", 6);
  await paymentToken.waitForDeployment();
  console.log("✅ SUSD 배포됨:", await paymentToken.getAddress());

  // 네트워크 안정성을 위한 지연
  console.log("⏳ 네트워크 안정화 대기 중...");
  await new Promise((resolve) => setTimeout(resolve, 5000)); // 5초 대기

  console.log("\n🎯 Position 계약 배포 중...");

  // 3. Position 계약 배포를 위한 미래 주소 계산
  const nonce = await ethers.provider.getTransactionCount(deployer.address);
  const futureCore = ethers.getCreateAddress({
    from: deployer.address,
    nonce: nonce + 1, // Position 다음에 Core가 배포됨
  });

  const CLMSRPositionFactory = await ethers.getContractFactory("CLMSRPosition");
  const position = await CLMSRPositionFactory.deploy(futureCore);
  await position.waitForDeployment();
  console.log("✅ CLMSRPosition 배포됨:", await position.getAddress());

  // 네트워크 안정성을 위한 지연
  console.log("⏳ 네트워크 안정화 대기 중...");
  await new Promise((resolve) => setTimeout(resolve, 5000)); // 5초 대기

  console.log("\n🎲 Core 계약 배포 중...");

  // 4. Core 계약 배포 (라이브러리 링크)
  const CLMSRMarketCoreFactory = await ethers.getContractFactory(
    "CLMSRMarketCore",
    {
      libraries: {
        FixedPointMathU: await fixedPointMathU.getAddress(),
        LazyMulSegmentTree: await lazyMulSegmentTree.getAddress(),
      },
    }
  );

  const core = await CLMSRMarketCoreFactory.deploy(
    await paymentToken.getAddress(),
    await position.getAddress(),
    deployer.address // 매니저 주소
  );
  await core.waitForDeployment();
  console.log("✅ CLMSRMarketCore 배포됨:", await core.getAddress());

  // 주소 검증
  const actualCoreAddress = await core.getAddress();
  if (actualCoreAddress !== futureCore) {
    console.log("⚠️ 주의: 계산된 주소와 실제 주소가 다름");
    console.log("계산된:", futureCore);
    console.log("실제:", actualCoreAddress);
  }

  console.log("\n💵 초기 SUSD 발행...");

  // 5. 초기 토큰 발행 (배포자에게 1,000,000 SUSD)
  const initialSupply = parseUnits("1000000", 6); // 1M SUSD (6 decimals)
  await paymentToken.mint(deployer.address, initialSupply);
  console.log(
    "✅ 초기 SUSD 발행 완료:",
    ethers.formatUnits(initialSupply, 6),
    "SUSD"
  );

  console.log("\n📊 배포 완료 요약:");
  console.log("====================");
  console.log("🏛️  FixedPointMathU:", await fixedPointMathU.getAddress());
  console.log("🌳 LazyMulSegmentTree:", await lazyMulSegmentTree.getAddress());
  console.log("💰 SUSD Token:", await paymentToken.getAddress());
  console.log("🎯 CLMSRPosition:", await position.getAddress());
  console.log("🎲 CLMSRMarketCore:", await core.getAddress());

  console.log("\n🎉 시스템 배포 완료!");
  console.log("다음 단계: 마켓 생성 및 테스트를 실행하세요.");

  // 배포 검증
  console.log("\n🔍 배포 검증 중...");

  try {
    // 컨트랙트 코드 확인
    const coreCode = await ethers.provider.getCode(await core.getAddress());
    console.log("✅ Core 컨트랙트 코드 크기:", coreCode.length, "bytes");

    // Core 컨트랙트의 기본 정보 확인
    const corePaymentToken = await core.paymentToken();
    const corePositionContract = await core.positionContract();
    const coreManagerContract = await core.managerContract();

    console.log("✅ Core 컨트랙트 설정:");
    console.log("  - Payment Token:", corePaymentToken);
    console.log("  - Position Contract:", corePositionContract);
    console.log("  - Manager Contract:", coreManagerContract);

    // SUSD 초기 잔액 확인
    const deployerBalance = await paymentToken.balanceOf(deployer.address);
    console.log(
      "✅ SUSD 초기 발행 확인:",
      ethers.formatUnits(deployerBalance, 6),
      "SUSD"
    );

    console.log("✅ 모든 배포 검증 통과!");
  } catch (error) {
    console.log("❌ 배포 검증 실패:", error);
  }

  // 배포 정보를 JSON 파일로 저장
  const network = await ethers.provider.getNetwork();
  const currentBlock = await ethers.provider.getBlockNumber();
  const deploymentInfo = {
    network: network.name,
    chainId: Number(network.chainId),
    deployer: deployer.address,
    blockNumber: currentBlock,
    contracts: {
      FixedPointMathU: await fixedPointMathU.getAddress(),
      LazyMulSegmentTree: await lazyMulSegmentTree.getAddress(),
      SUSD: await paymentToken.getAddress(),
      CLMSRPosition: await position.getAddress(),
      CLMSRMarketCore: await core.getAddress(),
    },
    subgraphConfig: {
      recommendedStartBlock: currentBlock - 100, // 안전 마진 100블록
      actualBlock: currentBlock,
    },
    timestamp: new Date().toISOString(),
  };

  const deploymentsDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const fileName = `deployment-${deploymentInfo.chainId}-${Date.now()}.json`;
  fs.writeFileSync(
    path.join(deploymentsDir, fileName),
    JSON.stringify(deploymentInfo, null, 2)
  );
  console.log(`📄 배포 정보 저장: deployments/${fileName}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ 배포 실패:", error);
    process.exit(1);
  });
