import { ethers } from "hardhat";
import { envManager } from "../utils/environment";

/**
 * Deploy new SUSD token for dev/prod environments (shared)
 */
export async function deploySUSDAction() {
  console.log("🪙 Deploying new SUSD for dev/prod environments");

  const [deployer] = await ethers.getSigners();
  console.log("👤 Deployer:", deployer.address);

  // Deploy MockERC20 as SUSD
  console.log("🏗️ Deploying SUSD token...");
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const susd = await MockERC20.deploy("Signals USD", "SUSD", 6);
  await susd.waitForDeployment();

  const susdAddress = await susd.getAddress();
  console.log("✅ SUSD deployed:", susdAddress);

  // Update both dev and prod environments
  envManager.updateContract("dev", "tokens", "SUSD", susdAddress);
  envManager.updateContract("prod", "tokens", "SUSD", susdAddress);

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
  console.log(`  Updated environments: dev, prod`);

  return susdAddress;
}
