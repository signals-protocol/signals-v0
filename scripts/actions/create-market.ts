import { ethers } from "hardhat";
import { parseEther } from "ethers";
import { envManager } from "../utils/environment";
import type { Environment } from "../types/environment";

export async function createMarketAction(
  environment: Environment
): Promise<void> {
  console.log(`🏪 마켓 생성 시작 on ${environment}`);

  const [deployer] = await ethers.getSigners();
  console.log("호출자 주소:", deployer.address);

  const addresses = envManager.getDeployedAddresses(environment);

  if (!addresses.CLMSRMarketCoreProxy) {
    throw new Error(`Core proxy not deployed in ${environment} environment`);
  }

  // 컨트랙트 연결
  const core = await ethers.getContractAt(
    "CLMSRMarketCoreUpgradeable",
    addresses.CLMSRMarketCoreProxy
  );

  // 마켓 파라미터 설정 (marketId는 자동 생성)
  const minTick = 100000;
  const maxTick = 140000;
  const tickSpacing = 100;

  // Bin 개수 계산: (maxTick - minTick) / tickSpacing
  const numBins = (maxTick - minTick) / tickSpacing; // 400개의 bin
  const numValidTicks = numBins + 1; // 401개의 유효한 틱 포인트

  const startTimestamp = Math.floor(
    new Date("2025-08-17T00:00:00Z").getTime() / 1000
  );
  // 다음 주 토요일 UTC 0시 (2025년 8월 9일)
  const endTimestamp = Math.floor(
    new Date("2025-08-18T00:00:00Z").getTime() / 1000
  );
  const liquidityParameter = parseEther("1000"); // 알파값 1000

  console.log("\n📊 새로운 틱 시스템 마켓 설정:");
  console.log("  - 마켓 ID: 자동 생성됨");
  console.log("  - 최소 틱:", minTick.toLocaleString());
  console.log("  - 최대 틱:", maxTick.toLocaleString(), "(상한 불포함)");
  console.log("  - 틱 간격:", tickSpacing);
  console.log("  - 유효한 틱 포인트:", numValidTicks.toLocaleString(), "개");
  console.log("  - Bin 개수 (Range):", numBins.toLocaleString(), "개");
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
    // 마켓 생성 (marketId 자동 생성)
    const createMarketTx = await core.createMarket(
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

    // 이벤트에서 생성된 marketId 추출
    const marketCreatedEvent = receipt?.logs.find((log) => {
      try {
        const parsed = core.interface.parseLog({
          topics: log.topics,
          data: log.data,
        });
        return parsed?.name === "MarketCreated";
      } catch {
        return false;
      }
    });

    let marketId: number | undefined;
    if (marketCreatedEvent) {
      const parsed = core.interface.parseLog({
        topics: marketCreatedEvent.topics,
        data: marketCreatedEvent.data,
      });
      marketId = parsed?.args[0]; // 첫 번째 파라미터가 marketId
    }

    console.log("✅ 마켓 생성 성공!");
    console.log("  - 생성된 마켓 ID:", marketId?.toString() || "확인 불가");
    console.log("  - 가스 사용량:", receipt?.gasUsed.toString());

    console.log("\n🎯 Market creation completed for", environment);
  } catch (error: any) {
    console.error("❌ 마켓 생성 실패:", error.message);
    throw error;
  }
}
