import { ethers } from "hardhat";
import { envManager } from "../utils/environment";
import type { Environment } from "../types/environment";
import { safeTxOpts, safeExecuteTx } from "../utils/txOpts";

export async function updateMarketTimingAction(
  environment: Environment
): Promise<void> {
  // 하드코딩된 값들
  const marketId = 24; // 두 번째 마켓
  const newStartTime = "2025-09-06T00:00:00Z"; // 2025년 8월 7일 UTC 00:00
  const newEndTime = "2025-09-07T00:00:00Z"; // 2025년 8월 8일 UTC 00:00

  console.log(`⏰ 마켓 ${marketId} 시간 변경 시작 on ${environment}`);

  const [deployer] = await ethers.getSigners();
  console.log("호출자 주소:", deployer.address);

  const addresses = envManager.getDeployedAddresses(environment);

  if (!addresses.CLMSRMarketCoreProxy) {
    throw new Error(`Core proxy not deployed in ${environment} environment`);
  }

  // 컨트랙트 연결
  const core = await ethers.getContractAt(
    "CLMSRMarketCore",
    addresses.CLMSRMarketCoreProxy
  );

  // 시간 파싱 (ISO 8601 형식 지원)
  const newStartTimestamp = Math.floor(new Date(newStartTime).getTime() / 1000);
  const newEndTimestamp = Math.floor(new Date(newEndTime).getTime() / 1000);

  // 시간 유효성 검증
  if (newStartTimestamp >= newEndTimestamp) {
    throw new Error("시작 시간이 종료 시간보다 늦거나 같습니다");
  }

  const currentTime = Math.floor(Date.now() / 1000);
  if (newEndTimestamp <= currentTime) {
    console.warn("⚠️ 경고: 종료 시간이 현재 시간보다 이릅니다");
  }

  console.log("\n📊 마켓 시간 변경 정보:");
  console.log("  - 마켓 ID:", marketId);
  console.log(
    "  - 새로운 시작 시간:",
    new Date(newStartTimestamp * 1000).toISOString()
  );
  console.log(
    "  - 새로운 종료 시간:",
    new Date(newEndTimestamp * 1000).toISOString()
  );
  console.log("  - 시작 타임스탬프:", newStartTimestamp);
  console.log("  - 종료 타임스탬프:", newEndTimestamp);

  try {
    // 기존 마켓 정보 확인
    const market = await core.getMarket(marketId);
    console.log("\n📋 기존 마켓 정보:");
    console.log("  - 활성 상태:", market.isActive);
    console.log("  - 정산 여부:", market.settled);
    console.log(
      "  - 기존 시작 시간:",
      new Date(Number(market.startTimestamp) * 1000).toISOString()
    );
    console.log(
      "  - 기존 종료 시간:",
      new Date(Number(market.endTimestamp) * 1000).toISOString()
    );

    if (market.settled) {
      throw new Error("이미 정산된 마켓의 시간은 변경할 수 없습니다");
    }

    // 마켓 시간 변경 실행
    console.log("\n⏰ 마켓 시간 변경 실행 중...");

    const tx = await core.updateMarketTiming(
      marketId,
      newStartTimestamp,
      newEndTimestamp
    );

    console.log("✅ 마켓 시간 변경 완료!");
    console.log("트랜잭션 해시:", tx.hash);

    // 변경된 마켓 정보 확인
    const updatedMarket = await core.getMarket(marketId);
    console.log("\n📋 변경된 마켓 정보:");
    console.log(
      "  - 새로운 시작 시간:",
      new Date(Number(updatedMarket.startTimestamp) * 1000).toISOString()
    );
    console.log(
      "  - 새로운 종료 시간:",
      new Date(Number(updatedMarket.endTimestamp) * 1000).toISOString()
    );
  } catch (error: any) {
    console.error("❌ 마켓 시간 변경 실패:", error.message);
    throw error;
  }
}
