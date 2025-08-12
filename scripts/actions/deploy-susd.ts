import { ethers } from "hardhat";
import { envManager } from "../utils/environment";

/**
 * Deploy new SUSD token for dev/prod environments (shared)
 */
export async function deploySUSDAction() {
  // 네트워크 감지 (환경변수 COMMAND에서)
  const command = process.env.COMMAND || "";
  const isBase = command.includes("base");
  const isCitrea = command.includes("citrea");

  if (isBase) {
    console.log("🪙 Deploying new SUSD for Base dev/prod environments");
  } else if (isCitrea) {
    console.log("🪙 Deploying new SUSD for Citrea dev/prod environments");
  } else {
    console.log("🪙 Deploying new SUSD for dev/prod environments");
  }

  const [deployer] = await ethers.getSigners();
  console.log("👤 Deployer:", deployer.address);

  // Deploy MockERC20 as SUSD
  console.log("🏗️ Deploying SUSD token...");
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const susd = await MockERC20.deploy("Signals USD", "SUSD", 6);
  await susd.waitForDeployment();

  const susdAddress = await susd.getAddress();
  console.log("✅ SUSD deployed:", susdAddress);

  // Update environments based on network
  if (isCitrea) {
    envManager.updateContract("citrea-dev", "tokens", "SUSD", susdAddress);

    // citrea-prod 파일이 없으면 먼저 초기화
    if (!envManager.environmentExists("citrea-prod")) {
      envManager.initializeEnvironment("citrea-prod");
    }
    envManager.updateContract("citrea-prod", "tokens", "SUSD", susdAddress);
    console.log("✅ Updated citrea-dev and citrea-prod environments");
  } else {
    // Default to base environments
    envManager.updateContract("base-dev", "tokens", "SUSD", susdAddress);
    envManager.updateContract("base-prod", "tokens", "SUSD", susdAddress);
    console.log("✅ Updated base-dev and base-prod environments");
  }

  // Mint generous amounts to deployer
  const mintAmount = ethers.parseUnits("10000000", 6); // 10M SUSD (6 decimals)
  console.log("💰 Minting 10M SUSD to deployer...");

  try {
    const mintTx = await susd.mint(deployer.address, mintAmount);
    await mintTx.wait();
    console.log("✅ 10M SUSD minted to:", deployer.address);
  } catch (error: any) {
    console.error("❌ Minting failed:", error.message);
    console.log("⚠️ Continuing without minting...");
  }

  // Get current balance
  const balance = await susd.balanceOf(deployer.address);
  const balanceFormatted = ethers.formatUnits(balance, 6);
  console.log(`💳 Deployer SUSD balance: ${balanceFormatted} SUSD`);

  console.log("\n🎉 SUSD deployment completed!");
  console.log("📋 Summary:");
  console.log(`  SUSD Address: ${susdAddress}`);
  console.log(`  Initial Supply: ${balanceFormatted} SUSD`);
  if (isCitrea) {
    console.log(`  Updated environments: citrea-dev, citrea-prod`);
  } else {
    console.log(`  Updated environments: base-dev, base-prod`);
  }

  return susdAddress;
}
