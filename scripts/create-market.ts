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

  // 새로운 틱 시스템 설정 - 100k~140k 범위, 간격 100
  const minTick = 100000; // 최소 틱: 100,000
  const maxTick = 140000; // 최대 틱: 140,000 (maxTick는 포함되지 않음)
  const tickSpacing = 100; // 틱 간격: 100

  // Bin 개수 계산: (maxTick - minTick) / tickSpacing
  // 각 bin은 연속된 틱 간격을 나타냄 [tick, tick+spacing)
  const numBins = (maxTick - minTick) / tickSpacing; // 400개의 bin (range)
  const numValidTicks = numBins + 1; // 401개의 유효한 틱 포인트 (100,000부터 140,000까지)

  const startTimestamp = Math.floor(Date.now() / 1000);
  // 다음 주 토요일 UTC 0시 (2025년 8월 9일)
  const endTimestamp = Math.floor(
    new Date("2025-08-09T00:00:00Z").getTime() / 1000
  );
  const liquidityParameter = parseEther("1000"); // 알파값 1000

  console.log("\n📊 새로운 틱 시스템 마켓 설정:");
  console.log("  - 마켓 ID:", marketId);
  console.log("  - 최소 틱:", minTick.toLocaleString());
  console.log("  - 최대 틱:", maxTick.toLocaleString(), "(상한 불포함)");
  console.log("  - 틱 간격:", tickSpacing);
  console.log("  - 유효한 틱 포인트:", numValidTicks.toLocaleString(), "개");
  console.log("  - Bin 개수 (Range):", numBins.toLocaleString(), "개");
  console.log(
    "  - 틱 범위 예시: [100000, 100100), [100100, 100200), [100200, 100300)..."
  );
  console.log(
    "  - 시작 시간:",
    new Date(startTimestamp * 1000).toLocaleString()
  );
  console.log("  - 종료 시간:", new Date(endTimestamp * 1000).toLocaleString());
  console.log(
    "  - 유동성 파라미터 (α):",
    ethers.formatEther(liquidityParameter)
  );

  try {
    // 마켓 생성 (새로운 파라미터 구조)
    const createMarketTx = await core.createMarket(
      marketId,
      minTick,
      maxTick,
      tickSpacing,
      startTimestamp,
      endTimestamp,
      liquidityParameter
    );

    console.log("\n⏳ 마켓 생성 트랜잭션 대기 중...");
    console.log("트랜잭션 해시:", createMarketTx.hash);

    const receipt = await createMarketTx.wait();
    console.log("✅ 마켓 생성 성공!");
    console.log("  - 가스 사용량:", receipt?.gasUsed.toString());

    // 초기 유동성 자금 제공
    console.log("\n💰 초기 유동성 자금 제공 중...");

    const numTicks = Math.floor((maxTick - minTick) / tickSpacing);
    const alpha = Number(ethers.formatEther(liquidityParameter)); // ETH 단위를 숫자로
    const requiredFunding = Math.ceil(alpha * Math.log(numTicks) * 1000000); // 6 decimals로 변환

    console.log("📊 자금 요구사항:");
    console.log("  - α (liquidity parameter):", alpha * 1000000, "USDC");
    console.log("  - N (number of ticks):", numTicks);
    console.log(
      "  - 최대 손실 (α × ln(N)):",
      requiredFunding / 1000000,
      "USDC"
    );

    // SUSD 토큰 가져오기
    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    const susdToken = MockERC20Factory.attach(
      deploymentData.contracts.SUSD
    ) as any;

    // 잔액 확인 및 필요시 발행
    const [signer] = await ethers.getSigners();
    const balance = await susdToken.balanceOf(signer.address);
    const fundingAmount = BigInt(requiredFunding);

    if (balance < fundingAmount) {
      console.log("💵 SUSD 추가 발행 중...");
      const mintAmount = fundingAmount - balance + BigInt(1000 * 1000000); // 여유분 1000 SUSD
      const mintTx = await susdToken.mint(signer.address, mintAmount);
      await mintTx.wait();
      console.log(
        "✅ SUSD 발행 완료:",
        ethers.formatUnits(mintAmount, 6),
        "SUSD"
      );
    }

    // Core 컨트랙트로 자금 송금
    console.log("📤 Core 컨트랙트로 초기 자금 송금 중...");
    const transferTx = await susdToken.transfer(
      await core.getAddress(),
      fundingAmount
    );
    await transferTx.wait();
    console.log(
      "✅ 초기 자금 송금 완료:",
      ethers.formatUnits(fundingAmount, 6),
      "SUSD"
    );

    console.log("\n🎉 마켓 생성 및 자금 조달 완료!");
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
