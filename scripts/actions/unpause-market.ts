import { ethers } from "hardhat";
import { envManager } from "../utils/environment";
import type { Environment } from "../types/environment";

export async function unpauseMarketAction(
  environment: Environment
): Promise<void> {
  console.log(`▶️ Unpausing market contract on ${environment}`);

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

  // 현재 pause 상태 확인
  const isPaused = await coreContract.isPaused();
  if (!isPaused) {
    console.log("✅ Contract is already active (not paused)");
    return;
  }

  console.log("⏸️ Contract is currently paused");

  // 마켓 unpause
  console.log("▶️ Unpausing contract...");
  const tx = await coreContract.unpause();

  const receipt = await tx.wait();
  console.log("✅ Contract unpaused successfully!");
  console.log(`📊 Transaction hash: ${receipt?.hash}`);
  console.log(`⛽ Gas used: ${receipt?.gasUsed?.toString()}`);

  // Unpause 후 상태 확인
  const isPausedAfter = await coreContract.isPaused();
  console.log(`🔓 Contract paused status: ${isPausedAfter}`);
}

// CLI에서 직접 호출할 때 사용
export async function unpauseMarketCLI(environment: Environment): Promise<void> {
  await unpauseMarketAction(environment);
}
