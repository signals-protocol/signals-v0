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
    "CLMSRMarketCore",
    addresses.CLMSRMarketCoreProxy
  );

  // BTC Daily 2025.09.29 마켓 파라미터 설정
  const minTick = 100000;
  const maxTick = 140000;
  const tickSpacing = 100;

  // Bin 개수 계산: (maxTick - minTick) / tickSpacing
  const numBins = (maxTick - minTick) / tickSpacing; // 400개의 bin
  const numValidTicks = numBins + 1; // 401개의 유효한 틱 포인트

  // BTC Daily 마켓 타임스탬프 설정
  // openTime: 2025-09-28 23:00:00 UTC
  // closeTime: 2025-09-29 23:00:00 UTC
  // settlementTime: 2025-09-30 00:00:00 UTC
  const startTimestamp = Math.floor(
    new Date("2025-09-28T23:00:00Z").getTime() / 1000
  );
  const endTimestamp = Math.floor(
    new Date("2025-09-29T23:00:00Z").getTime() / 1000
  );
  const settlementTimestamp = Math.floor(
    new Date("2025-09-30T00:00:00Z").getTime() / 1000
  );

  // liquidityParameter: 100000000000000000000000 (100,000 ETH)
  const liquidityParameter = parseEther("100000");

  console.log("\n📊 BTC Daily 2025.09.29 마켓 설정:");
  console.log("  - 마켓 ID: 자동 생성됨");
  console.log("  - 마켓 이름: BTC Daily 2025.09.29");
  console.log("  - 최소 틱:", minTick.toLocaleString());
  console.log("  - 최대 틱:", maxTick.toLocaleString(), "(상한 불포함)");
  console.log("  - 틱 간격:", tickSpacing);
  console.log("  - 유효한 틱 포인트:", numValidTicks.toLocaleString(), "개");
  console.log("  - Bin 개수 (Range):", numBins.toLocaleString(), "개");
  console.log(
    "  - 시작 시간:",
    new Date(startTimestamp * 1000).toLocaleString() +
      " (2025-09-28 23:00:00 UTC)"
  );
  console.log(
    "  - 종료 시간:",
    new Date(endTimestamp * 1000).toLocaleString() +
      " (2025-09-29 23:00:00 UTC)"
  );
  console.log(
    "  - 정산 시간:",
    new Date(settlementTimestamp * 1000).toLocaleString() +
      " (2025-09-30 00:00:00 UTC)"
  );
  console.log(
    "  - 유동성 파라미터 (α):",
    ethers.formatEther(liquidityParameter),
    "ETH"
  );

  try {
    // 마켓 생성 (marketId 자동 생성)
    const createMarketTx = await core.createMarket(
      minTick,
      maxTick,
      tickSpacing,
      startTimestamp,
      endTimestamp,
      settlementTimestamp,
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

    let marketId: bigint | undefined;
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

    const autoActivate = process.env.ACTIVATE_AFTER_CREATE === "true";

    if (autoActivate) {
      if (marketId === undefined) {
        console.warn(
          "⚠️  ACTIVATE_AFTER_CREATE=true 이지만 marketId를 파싱하지 못해 활성화 스킵"
        );
      } else {
        console.log(
          "\n🔓 ACTIVATE_AFTER_CREATE=true -> 마켓 활성화 트랜잭션 전송..."
        );
        const activateTx = await core.setMarketActive(marketId, true);
        console.log("   • tx:", activateTx.hash);
        const activateReceipt = await activateTx.wait();
        console.log(
          "   ✅ 활성화 완료 (gas=",
          activateReceipt?.gasUsed?.toString() ?? "N/A",
          ")"
        );
      }
    } else {
      console.log(
        "\n⚠️ 새로 생성된 마켓은 기본적으로 비활성 상태입니다. 시딩 및 검증 완료 후 아래 커맨드를 실행해 개장하세요:"
      );
      if (marketId !== undefined) {
        console.log(
          `   COMMAND=set-market-active:${environment} MARKET_ID=${marketId.toString()} ACTIVE=true npx hardhat run scripts/dispatcher.ts --network ${environment}`
        );
      } else {
        console.log(
          "   (marketId를 파싱하지 못했습니다. 이벤트 로그에서 marketId를 확인한 뒤 set-market-active 스크립트를 실행하세요)"
        );
      }
    }

    console.log("\n🎯 Market creation completed for", environment);
  } catch (error: any) {
    console.error("❌ 마켓 생성 실패:", error.message);
    throw error;
  }
}
