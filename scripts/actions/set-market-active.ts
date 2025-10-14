import { ethers } from "hardhat";
import { envManager } from "../utils/environment";
import type { Environment } from "../types/environment";

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(normalized)) return true;
  if (["false", "0", "no", "n"].includes(normalized)) return false;
  return fallback;
}

export async function setMarketActiveAction(
  environment: Environment
): Promise<void> {
  const marketIdInput = process.env.MARKET_ID;
  if (!marketIdInput) {
    throw new Error("MARKET_ID environment variable is required");
  }

  let marketId: bigint;
  try {
    marketId = BigInt(marketIdInput);
    if (marketId < 0n) throw new Error();
  } catch {
    throw new Error(`Invalid MARKET_ID: ${marketIdInput}`);
  }

  const desiredActive = parseBoolean(process.env.ACTIVE, true);
  console.log(
    `🔁 setMarketActive(marketId=${marketId.toString()}, active=${desiredActive}) on ${environment}`
  );

  const [deployer] = await ethers.getSigners();
  console.log("👤 Caller:", deployer.address);

  const addresses = envManager.getDeployedAddresses(environment);
  if (!addresses.CLMSRMarketCoreProxy) {
    throw new Error(`Core proxy not deployed in ${environment} environment`);
  }
  console.log("📋 Core Proxy:", addresses.CLMSRMarketCoreProxy);

  const core = await ethers.getContractAt(
    "CLMSRMarketCore",
    addresses.CLMSRMarketCoreProxy
  );

  const market = await core.getMarket(marketId);
  console.log("\n📊 Current Market State:");
  console.log(`  • isActive: ${market.isActive}`);
  console.log(`  • settled: ${market.settled}`);
  console.log(
    `  • trading window: ${new Date(
      Number(market.startTimestamp) * 1000
    ).toISOString()} → ${new Date(
      Number(market.endTimestamp) * 1000
    ).toISOString()}`
  );

  if (market.isActive === desiredActive) {
    console.log("\nℹ️  Market already in desired activation state. No action taken.");
    return;
  }

  if (market.settled && desiredActive) {
    throw new Error(
      `Market ${marketId.toString()} is settled. Use reopenMarket before activating.`
    );
  }

  console.log("\n🚀 Sending setMarketActive transaction...");
  const tx = await core.setMarketActive(marketId, desiredActive);
  console.log("   • tx:", tx.hash);
  const receipt = await tx.wait();
  console.log(
    "   ✅ completed (gas=",
    receipt?.gasUsed?.toString() ?? "N/A",
    ")"
  );

  const updated = await core.getMarket(marketId);
  console.log("\n✅ Updated Market State:");
  console.log(`  • isActive: ${updated.isActive}`);
  console.log(`  • settled: ${updated.settled}`);
}
