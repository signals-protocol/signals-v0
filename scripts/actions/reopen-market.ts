import { ethers } from "hardhat";
import { envManager } from "../utils/environment";
import type { Environment } from "../types/environment";

export async function reopenMarketAction(
  environment: Environment
): Promise<void> {
  // 🎯 기본 설정값 (필요시 환경변수로 오버라이드 가능)
  const marketId = parseInt(process.env.MARKET_ID || "24");

  console.log(`🔄 Reopening market ${marketId} on ${environment}`);

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

  console.log("📊 Reopen parameters:");
  console.log(`  Market ID: ${marketId}`);

  // 마켓 상태 확인
  try {
    const market = await coreContract.getMarket(marketId);
    if (!market.settled) {
      throw new Error(
        `Market ${marketId} is not settled - cannot reopen unsettled market`
      );
    }
    if (market.isActive) {
      throw new Error(`Market ${marketId} is already active`);
    }
    console.log(`✅ Market ${marketId} is settled and ready for reopen`);
    console.log(`📈 Current settlement tick: ${market.settlementTick}`);
    console.log(`📈 Current settlement value: ${market.settlementValue}`);
    console.log(
      `⏰ Start time: ${new Date(
        Number(market.startTimestamp) * 1000
      ).toISOString()}`
    );
    console.log(
      `⏰ End time: ${new Date(
        Number(market.endTimestamp) * 1000
      ).toISOString()}`
    );
  } catch (error) {
    throw new Error(`Market validation failed: ${(error as Error).message}`);
  }

  // 마켓 재오픈
  const tx = await coreContract.reopenMarket(marketId);

  const receipt = await tx.wait();
  console.log("✅ Market reopened successfully!");
  console.log(`📊 Transaction hash: ${receipt?.hash}`);
  console.log(`⛽ Gas used: ${receipt?.gasUsed?.toString()}`);

  // 재오픈 후 상태 확인
  try {
    const market = await coreContract.getMarket(marketId);
    console.log(
      `📈 Market ${marketId} active after reopen: ${market.isActive}`
    );
    console.log(
      `📈 Market ${marketId} settled after reopen: ${market.settled}`
    );
    console.log(
      `📈 Settlement values reset: tick=${market.settlementTick}, value=${market.settlementValue}`
    );
  } catch (error) {
    console.log("⚠️  Could not verify market status after reopen");
  }
}

// CLI에서 직접 호출할 때 사용
export async function reopenMarketCLI(environment: Environment): Promise<void> {
  await reopenMarketAction(environment);
}
