import { ethers } from "hardhat";
import { envManager } from "../utils/environment";
import type { Environment } from "../types/environment";

/**
 * Close a market by setting its endTimestamp to current time
 * This prevents further trading without settling the market
 */
export async function closeMarketAction(
  environment: Environment
): Promise<void> {
  // 🎯 Configuration (can be overridden via environment variables)
  const marketId = parseInt(process.env.MARKET_ID || "55");

  console.log(`🚫 Closing market ${marketId} on ${environment}`);
  console.log(`   (Setting endTimestamp to current time to stop trading)`);

  const [deployer] = await ethers.getSigners();
  console.log("👤 Deployer:", deployer.address);

  const addresses = envManager.getDeployedAddresses(environment);

  if (!addresses.CLMSRMarketCoreProxy) {
    throw new Error(`Core proxy not deployed in ${environment} environment`);
  }

  console.log("📋 Core Proxy:", addresses.CLMSRMarketCoreProxy);

  // Connect to Core contract
  const coreContract = await ethers.getContractAt(
    "CLMSRMarketCore",
    addresses.CLMSRMarketCoreProxy
  );

  // Get current market info
  let market;
  try {
    market = await coreContract.getMarket(marketId);
    if (!market.isActive) {
      console.log(`⚠️  Market ${marketId} is already inactive`);
      return;
    }
    if (market.settled) {
      console.log(`⚠️  Market ${marketId} is already settled`);
      return;
    }
  } catch (error) {
    throw new Error(`Market ${marketId} not found or invalid`);
  }

  console.log("\n📊 Current Market Info:");
  console.log(`  Market ID: ${marketId}`);
  console.log(`  Active: ${market.isActive}`);
  console.log(`  Settled: ${market.settled}`);
  console.log(
    `  Start Time: ${new Date(
      Number(market.startTimestamp) * 1000
    ).toISOString()}`
  );
  console.log(
    `  End Time: ${new Date(Number(market.endTimestamp) * 1000).toISOString()}`
  );
  console.log(
    `  Settlement Time: ${new Date(
      Number(market.settlementTimestamp) * 1000
    ).toISOString()}`
  );

  // Calculate new timestamps
  const currentTime = Math.floor(Date.now() / 1000);
  const newStartTimestamp = Number(market.startTimestamp); // Keep original start
  const newEndTimestamp = currentTime; // Close immediately
  const newSettlementTimestamp = currentTime + 3600; // 1 hour buffer for settlement

  console.log("\n🔧 New Timing:");
  console.log(
    `  Start Time: ${new Date(
      newStartTimestamp * 1000
    ).toISOString()} (unchanged)`
  );
  console.log(
    `  End Time: ${new Date(
      newEndTimestamp * 1000
    ).toISOString()} (NOW - closes trading)`
  );
  console.log(
    `  Settlement Time: ${new Date(
      newSettlementTimestamp * 1000
    ).toISOString()} (+1 hour buffer)`
  );

  // Validate timing
  if (newStartTimestamp >= newEndTimestamp) {
    throw new Error(
      "Invalid timing: start time would be >= end time after closing"
    );
  }
  if (newEndTimestamp >= newSettlementTimestamp) {
    throw new Error(
      "Invalid timing: end time would be >= settlement time after closing"
    );
  }

  // Update market timing to close it
  console.log("\n🚫 Closing market by updating timing...");
  const tx = await coreContract.updateMarketTiming(
    marketId,
    newStartTimestamp,
    newEndTimestamp,
    newSettlementTimestamp
  );

  const receipt = await tx.wait();
  console.log("✅ Market closed successfully!");
  console.log(`📊 Transaction hash: ${receipt?.hash}`);
  console.log(`⛽ Gas used: ${receipt?.gasUsed?.toString()}`);

  // Verify updated state
  const updatedMarket = await coreContract.getMarket(marketId);
  console.log("\n📋 Updated Market Info:");
  console.log(`  Active: ${updatedMarket.isActive}`);
  console.log(
    `  End Time: ${new Date(
      Number(updatedMarket.endTimestamp) * 1000
    ).toISOString()}`
  );
  console.log(
    `  Settlement Time: ${new Date(
      Number(updatedMarket.settlementTimestamp) * 1000
    ).toISOString()}`
  );
  console.log("\n💡 Trading is now closed for this market.");
  console.log("   You can still settle it later using settle-market action.");
}

// CLI entry point
export async function closeMarketCLI(environment: Environment): Promise<void> {
  await closeMarketAction(environment);
}
