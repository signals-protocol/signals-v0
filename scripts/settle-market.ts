import { ethers } from "hardhat";
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
  console.log("🏁 마켓 종료 시작");
  console.log("호출자 주소:", deployer.address);

  // 🎯 정산할 마켓 ID (여기서 변경하세요!)
  const TARGET_MARKET_ID = 1;

  // 사용자 지정 정산 틱
  const settlementTick = 114217;
  console.log(`🎯 정산할 마켓 ID: ${TARGET_MARKET_ID}`);
  console.log(`🎯 지정된 정산 틱: ${settlementTick}`);

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

  console.log("🔍 지정된 마켓 상태 확인 중...");

  // 특정 마켓 ID만 처리
  try {
    const marketId = TARGET_MARKET_ID;
    const market = await core.markets(marketId);

    console.log(`\n📈 마켓 ID ${marketId} 상태:`);
    console.log(`  - 활성화 상태: ${market.isActive}`);
    console.log(`  - 정산 완료: ${market.settled}`);
    console.log(`  - 최소 틱: ${market.minTick.toString()}`);
    console.log(`  - 최대 틱: ${market.maxTick.toString()}`);
    console.log(`  - 틱 간격: ${market.tickSpacing.toString()}`);
    console.log(
      `  - 시작 시간: ${new Date(
        Number(market.startTimestamp) * 1000
      ).toLocaleString()}`
    );
    console.log(
      `  - 종료 시간: ${new Date(
        Number(market.endTimestamp) * 1000
      ).toLocaleString()}`
    );
    console.log(`  - 현재 시간: ${new Date().toLocaleString()}`);

    const currentTime = Math.floor(Date.now() / 1000);
    const isExpired = currentTime > Number(market.endTimestamp);

    // 정산 틱이 마켓 범위 내에 있는지 확인
    const isValidTick =
      settlementTick >= Number(market.minTick) &&
      settlementTick <= Number(market.maxTick);

    if (!isValidTick) {
      console.log(
        `  ❌ 지정된 정산 틱 ${settlementTick}이 마켓 범위(${market.minTick} ~ ${market.maxTick})를 벗어납니다.`
      );
      return;
    }

    if (market.settled) {
      console.log(`  ✅ 마켓 ${marketId}는 이미 정산되었습니다.`);
      console.log(`  - 정산 틱: ${market.settlementTick}`);
    } else if (market.isActive) {
      console.log(`  🔄 마켓 ${marketId}는 현재 활성화 상태입니다.`);

      if (isExpired) {
        console.log(`  ⏰ 마켓이 만료되었습니다. 정산을 진행합니다.`);
      } else {
        const remainingTime = Number(market.endTimestamp) - currentTime;
        const remainingHours = Math.floor(remainingTime / 3600);
        const remainingMinutes = Math.floor((remainingTime % 3600) / 60);
        console.log(
          `  ⏳ 마켓이 아직 활성 상태입니다. (남은 시간: ${remainingHours}시간 ${remainingMinutes}분)`
        );
        console.log(`  💡 매니저 권한으로 강제 정산을 시도합니다.`);
      }

      console.log(`  🎯 정산 틱: ${settlementTick}`);

      try {
        const settleTx = await core.settleMarket(marketId, settlementTick);
        console.log("⏳ 정산 트랜잭션 대기 중...");
        console.log("트랜잭션 해시:", settleTx.hash);

        const receipt = await settleTx.wait();
        console.log("✅ 마켓 정산 성공!");
        console.log("  - 가스 사용량:", receipt?.gasUsed.toString());

        // 정산 후 상태 확인
        const settledMarket = await core.markets(marketId);
        console.log(`  📊 정산 완료 상태:`);
        console.log(`    - 정산 여부: ${settledMarket.settled}`);
        console.log(`    - 활성화 상태: ${settledMarket.isActive}`);
        console.log(`    - 정산 틱: ${settledMarket.settlementTick}`);
      } catch (error) {
        console.log("❌ 마켓 정산 실패:", error);

        // 오류 분석
        const errorStr = (error as Error).toString();
        if (errorStr.includes("UnauthorizedCaller")) {
          console.log("  → 권한 문제: 호출자가 매니저가 아님");
          console.log(
            "  💡 매니저 계정으로 다시 실행하거나 마켓 만료를 기다리세요."
          );
        } else if (errorStr.includes("MarketAlreadySettled")) {
          console.log("  → 마켓이 이미 정산됨");
        } else if (errorStr.includes("InvalidTick")) {
          console.log("  → 유효하지 않은 정산 틱");
        } else if (errorStr.includes("MarketNotActive")) {
          console.log("  → 마켓이 활성화되지 않음");
        }
      }
    } else {
      console.log(`  ⚠️ 마켓 ${marketId}는 비활성화 상태입니다.`);
    }
  } catch (error) {
    console.error(`❌ 마켓 ${TARGET_MARKET_ID} 확인 실패:`, error);
  }

  console.log("\n🎉 마켓 종료 스크립트 실행 완료!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ 마켓 종료 중 오류:", error);
    process.exit(1);
  });
