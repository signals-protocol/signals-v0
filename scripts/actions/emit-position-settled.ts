import { ethers } from "hardhat";
import { envManager } from "../utils/environment";
import type { Environment } from "../types/environment";

export async function emitPositionSettledAction(
  environment: Environment
): Promise<void> {
  // 🎯 기본 설정값 (필요시 환경변수로 오버라이드 가능)
  const marketId = parseInt(process.env.MARKET_ID || "11");
  const batchLimit = parseInt(process.env.BATCH_LIMIT || "200");

  console.log(
    `📢 Emitting PositionSettled events for market ${marketId} on ${environment}`
  );
  console.log(`📦 Batch limit: ${batchLimit} positions per transaction`);

  const [deployer] = await ethers.getSigners();
  console.log("👤 Deployer:", deployer.address);

  const addresses = envManager.getDeployedAddresses(environment);

  if (!addresses.CLMSRMarketCoreProxy) {
    throw new Error(`Core proxy not deployed in ${environment} environment`);
  }

  console.log("📋 Core Proxy:", addresses.CLMSRMarketCoreProxy);

  // Core 컨트랙트 연결
  const coreContract = await ethers.getContractAt(
    "CLMSRMarketCore",
    addresses.CLMSRMarketCoreProxy
  );

  console.log("📊 Batch emission parameters:");
  console.log(`  Market ID: ${marketId}`);
  console.log(`  Batch Limit: ${batchLimit}`);

  // 마켓 상태 확인
  try {
    const market = await coreContract.getMarket(marketId);
    if (!market.settled) {
      throw new Error(
        `Market ${marketId} is not settled yet. Please settle the market first.`
      );
    }
    if (market.positionEventsEmitted) {
      console.log(
        `✅ All position events for market ${marketId} have already been emitted`
      );
      return;
    }
    console.log(
      `✅ Market ${marketId} is settled and ready for batch emission`
    );
    console.log(`📊 Current cursor: ${market.positionEventsCursor}`);
  } catch (error) {
    throw new Error(`Market validation failed: ${(error as Error).message}`);
  }

  // 배치 이벤트 emit
  let batchCount = 0;
  let totalGasUsed = BigInt(0);

  console.log("\n🚀 Starting batch emission...");

  while (true) {
    batchCount++;
    console.log(`\n📦 Processing batch ${batchCount}...`);

    try {
      const tx = await coreContract.emitPositionSettledBatch(
        marketId,
        batchLimit
      );
      const receipt = await tx.wait();

      if (!receipt) {
        throw new Error("Transaction receipt is null");
      }

      console.log(`✅ Batch ${batchCount} completed`);
      console.log(`📊 Transaction hash: ${receipt.hash}`);
      console.log(`⛽ Gas used: ${receipt.gasUsed.toString()}`);

      totalGasUsed += receipt.gasUsed;

      // 이벤트 로그에서 진행 상황 확인
      const positionEventsProgressLogs = receipt.logs.filter((log) => {
        try {
          const parsed = coreContract.interface.parseLog({
            topics: log.topics,
            data: log.data,
          });
          return parsed?.name === "PositionEventsProgress";
        } catch {
          return false;
        }
      });

      if (positionEventsProgressLogs.length > 0) {
        const progressLog = positionEventsProgressLogs[0];
        const parsed = coreContract.interface.parseLog({
          topics: progressLog.topics,
          data: progressLog.data,
        });

        if (parsed) {
          const { from, to, done } = parsed.args;
          console.log(`📈 Progress: ${from} → ${to} (done: ${done})`);

          if (done) {
            console.log(
              "\n🎉 All position events have been emitted successfully!"
            );
            break;
          }
        }
      }

      // 마켓 상태 재확인
      const market = await coreContract.getMarket(marketId);
      if (market.positionEventsEmitted) {
        console.log("\n🎉 All position events have been emitted successfully!");
        break;
      }
    } catch (error) {
      console.error(`❌ Batch ${batchCount} failed:`, (error as Error).message);
      throw error;
    }
  }

  console.log("\n📊 Emission Summary:");
  console.log(`  Total batches processed: ${batchCount}`);
  console.log(`  Total gas used: ${totalGasUsed.toString()}`);
  console.log(
    `  Average gas per batch: ${
      batchCount > 0 ? (totalGasUsed / BigInt(batchCount)).toString() : "0"
    }`
  );
}

// CLI에서 직접 호출할 때 사용
export async function emitPositionSettledCLI(
  environment: Environment
): Promise<void> {
  await emitPositionSettledAction(environment);
}

