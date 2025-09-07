import { ethers } from "hardhat";
import { envManager } from "../utils/environment";
import type { Environment } from "../types/environment";

export async function pauseMarketAction(
  environment: Environment
): Promise<void> {
  // 🎯 기본 설정값 (필요시 환경변수로 오버라이드 가능)
  const reason = process.env.PAUSE_REASON || "Emergency pause requested by admin";

  console.log(`⏸️ Pausing market contract on ${environment}`);
  console.log(`📝 Reason: ${reason}`);

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
  if (isPaused) {
    console.log("⚠️  Contract is already paused");
    return;
  }

  console.log("✅ Contract is currently active");

  // 마켓 pause
  console.log("⏸️ Pausing contract...");
  const tx = await coreContract.pause(reason);

  const receipt = await tx.wait();
  console.log("✅ Contract paused successfully!");
  console.log(`📊 Transaction hash: ${receipt?.hash}`);
  console.log(`⛽ Gas used: ${receipt?.gasUsed?.toString()}`);

  // Pause 후 상태 확인
  const isPausedAfter = await coreContract.isPaused();
  console.log(`🔒 Contract paused status: ${isPausedAfter}`);
}

// CLI에서 직접 호출할 때 사용
export async function pauseMarketCLI(environment: Environment): Promise<void> {
  await pauseMarketAction(environment);
}
