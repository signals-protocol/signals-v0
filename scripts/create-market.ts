import { ethers } from "hardhat";
import { parseEther } from "ethers";
import * as fs from "fs";
import * as path from "path";

// 최신 배포 정보를 읽어오는 함수
function getLatestDeployment() {
  const deploymentsDir = path.join(__dirname, "../deployments");

  if (!fs.existsSync(deploymentsDir)) {
    throw new Error("배포 정보 디렉토리가 없습니다. 먼저 배포를 실행하세요.");
  }

  const files = fs
    .readdirSync(deploymentsDir)
    .filter((file) => file.startsWith("deployment-") && file.endsWith(".json"))
    .sort()
    .reverse(); // 최신 파일 먼저

  if (files.length === 0) {
    throw new Error("배포 정보 파일이 없습니다. 먼저 배포를 실행하세요.");
  }

  const latestFile = files[0];
  const deploymentPath = path.join(deploymentsDir, latestFile);
  const deploymentData = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));

  console.log(`📄 배포 정보 로드: ${latestFile}`);
  return deploymentData;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("🏪 마켓 생성 시작");
  console.log("호출자 주소:", deployer.address);

  // 배포 정보 로드
  let deploymentData;
  try {
    deploymentData = getLatestDeployment();
  } catch (error) {
    console.error("❌ 배포 정보 로드 실패:", error);
    return;
  }

  // 컨트랙트 연결
  const core = await ethers.getContractAt(
    "CLMSRMarketCore",
    deploymentData.contracts.CLMSRMarketCore
  );

  // 마켓 설정
  const marketId = 0;
  const numTicks = 10000; // 틱 개수 10,000개
  const startTimestamp = Math.floor(Date.now() / 1000);
  const endTimestamp = startTimestamp + 7 * 24 * 60 * 60; // 7일 후
  const liquidityParameter = parseEther("200"); // 알파값 100

  console.log("\n📊 마켓 설정:");
  console.log("  - 마켓 ID:", marketId);
  console.log("  - 틱 개수:", numTicks.toLocaleString());
  console.log(
    "  - 시작 시간:",
    new Date(startTimestamp * 1000).toLocaleString()
  );
  console.log("  - 종료 시간:", new Date(endTimestamp * 1000).toLocaleString());
  console.log("  - 알파값:", ethers.formatEther(liquidityParameter));

  try {
    // 마켓 생성
    const createMarketTx = await core.createMarket(
      marketId,
      numTicks,
      startTimestamp,
      endTimestamp,
      liquidityParameter
    );

    console.log("\n⏳ 마켓 생성 트랜잭션 대기 중...");
    console.log("트랜잭션 해시:", createMarketTx.hash);

    const receipt = await createMarketTx.wait();
    console.log("✅ 마켓 생성 성공!");
    console.log("  - 가스 사용량:", receipt?.gasUsed.toString());

    console.log("\n🎉 마켓 생성 완료!");
  } catch (error) {
    console.log("❌ 마켓 생성 실패:", error);

    // 오류 분석
    const errorStr = (error as Error).toString();
    if (errorStr.includes("UnauthorizedCaller")) {
      console.log("  → 권한 문제: 호출자가 매니저가 아님");
    } else if (errorStr.includes("MarketAlreadyExists")) {
      console.log("  → 마켓이 이미 존재함");
    } else if (errorStr.includes("InvalidTimeRange")) {
      console.log("  → 시간 범위 오류");
    } else if (errorStr.includes("InvalidLiquidityParameter")) {
      console.log("  → 유동성 파라미터 오류");
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ 마켓 생성 중 오류:", error);
    process.exit(1);
  });
