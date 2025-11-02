import { ethers } from "hardhat";
import { envManager } from "../utils/environment";
import type { Environment } from "../types/environment";

export async function emitPositionSettledAction(
  environment: Environment
): Promise<void> {
  // 🎯 기본 설정값 (필요시 환경변수로 오버라이드 가능)
  const startMarketId = parseInt(process.env.START_MARKET_ID || "26");
  const endMarketId = parseInt(process.env.END_MARKET_ID || "82");
  const batchLimit = parseInt(process.env.BATCH_LIMIT || "100");

  console.log(
    `📢 Emitting PositionSettled events for markets ${startMarketId}-${endMarketId} on ${environment}`
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
  console.log(`  Market Range: ${startMarketId} - ${endMarketId}`);
  console.log(`  Batch Limit: ${batchLimit}`);

  // 전체 처리 상태 추적
  let totalMarketsProcessed = 0;
  let totalMarketsSkipped = 0;
  let totalBatchesProcessed = 0;
  let totalGasUsed = BigInt(0);

  console.log("\n🚀 Starting multi-market emission...");

  // 각 마켓을 순차적으로 처리
  for (let marketId = startMarketId; marketId <= endMarketId; marketId++) {
    console.log(
      `\n📊 Processing Market ${marketId} (${marketId - startMarketId + 1}/${
        endMarketId - startMarketId + 1
      })`
    );

    // 마켓 상태 확인
    try {
      const market = await coreContract.getMarket(marketId);
      if (!market.settled) {
        console.log(`⚠️  Market ${marketId} is not settled yet. Skipping...`);
        totalMarketsSkipped++;
        continue;
      }
      if (market.positionEventsEmitted) {
        console.log(
          `✅ Market ${marketId} events already emitted. Skipping...`
        );
        totalMarketsSkipped++;
        continue;
      }
      console.log(
        `✅ Market ${marketId} is settled and ready for batch emission`
      );
      console.log(`📊 Current cursor: ${market.positionEventsCursor}`);
    } catch (error) {
      console.error(
        `❌ Market ${marketId} validation failed: ${
          (error as Error).message
        }. Skipping...`
      );
      totalMarketsSkipped++;
      continue;
    }

    // 현재 마켓에 대한 배치 이벤트 emit
    let marketBatchCount = 0;
    let marketGasUsed = BigInt(0);

    console.log(`🚀 Starting batch emission for market ${marketId}...`);

    while (true) {
      marketBatchCount++;
      console.log(
        `📦 Market ${marketId} - Processing batch ${marketBatchCount}...`
      );

      try {
        const tx = await coreContract.emitPositionSettledBatch(
          marketId,
          batchLimit
        );
        const receipt = await tx.wait();

        if (!receipt) {
          throw new Error("Transaction receipt is null");
        }

        console.log(
          `✅ Market ${marketId} - Batch ${marketBatchCount} completed`
        );
        console.log(`📊 Transaction hash: ${receipt.hash}`);
        console.log(`⛽ Gas used: ${receipt.gasUsed.toString()}`);

        marketGasUsed += receipt.gasUsed;
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
            console.log(
              `📈 Market ${marketId} - Progress: ${from} → ${to} (done: ${done})`
            );

            if (done) {
              console.log(
                `🎉 Market ${marketId} - All position events emitted successfully!`
              );
              break;
            }
          }
        }

        // 마켓 상태 재확인
        const market = await coreContract.getMarket(marketId);
        if (market.positionEventsEmitted) {
          console.log(
            `🎉 Market ${marketId} - All position events emitted successfully!`
          );
          break;
        }
      } catch (error) {
        console.error(
          `❌ Market ${marketId} - Batch ${marketBatchCount} failed:`,
          (error as Error).message
        );
        console.error(`❌ Skipping market ${marketId} due to error`);
        totalMarketsSkipped++;
        break;
      }
    }

    // 마켓 처리 완료 후 통계 업데이트
    if (marketBatchCount > 0) {
      totalMarketsProcessed++;
      totalBatchesProcessed += marketBatchCount;
      console.log(`📊 Market ${marketId} Summary:`);
      console.log(`  Batches processed: ${marketBatchCount}`);
      console.log(`  Gas used: ${marketGasUsed.toString()}`);
    }
  }

  console.log("\n📊 Final Emission Summary:");
  console.log(
    `  Markets processed: ${totalMarketsProcessed}/${
      endMarketId - startMarketId + 1
    }`
  );
  console.log(`  Markets skipped: ${totalMarketsSkipped}`);
  console.log(`  Total batches processed: ${totalBatchesProcessed}`);
  console.log(`  Total gas used: ${totalGasUsed.toString()}`);
  console.log(
    `  Average gas per batch: ${
      totalBatchesProcessed > 0
        ? (totalGasUsed / BigInt(totalBatchesProcessed)).toString()
        : "0"
    }`
  );
}

// CLI에서 직접 호출할 때 사용
export async function emitPositionSettledCLI(
  environment: Environment
): Promise<void> {
  await emitPositionSettledAction(environment);
}
