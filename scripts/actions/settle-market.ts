import { ethers } from "hardhat";
import { envManager } from "../utils/environment";
import type { Environment } from "../types/environment";

export async function settleMarketAction(
  environment: Environment
): Promise<void> {
  // 🎯 기본 설정값 (필요시 환경변수로 오버라이드 가능)
  const marketId = parseInt(process.env.MARKET_ID || "3");
  const settlementTick = parseInt(process.env.SETTLEMENT_TICK || "117491");

  console.log(`⚖️ Settling market ${marketId} on ${environment}`);

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

  console.log("📊 Settlement parameters:");
  console.log(`  Market ID: ${marketId}`);
  console.log(`  Settlement Tick: ${settlementTick}`);

  // 마켓 상태 확인
  try {
    const market = await coreContract.getMarket(marketId);
    if (!market.isActive) {
      throw new Error(`Market ${marketId} is not active or does not exist`);
    }
    console.log(`✅ Market ${marketId} is active`);
  } catch (error) {
    throw new Error(`Market validation failed: ${(error as Error).message}`);
  }

  // 마켓 세틀 (정수 틱 값 사용)
  const tx = await coreContract.settleMarket(marketId, settlementTick);

  const receipt = await tx.wait();
  console.log("✅ Market settled successfully!");
  console.log(`📊 Transaction hash: ${receipt?.hash}`);
  console.log(`⛽ Gas used: ${receipt?.gasUsed?.toString()}`);

  // 세틀 후 상태 확인
  try {
    const market = await coreContract.getMarket(marketId);
    console.log(
      `📈 Market ${marketId} active after settlement: ${market.isActive}`
    );
  } catch (error) {
    console.log("⚠️  Could not verify market status after settlement");
  }
}

// CLI에서 직접 호출할 때 사용
export async function settleMarketCLI(environment: Environment): Promise<void> {
  await settleMarketAction(environment);
}
