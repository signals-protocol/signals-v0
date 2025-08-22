import { ethers } from "hardhat";
import { envManager } from "./utils/environment";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`🎯 Testing events on dev as ${deployer.address}`);

  const addresses = envManager.getDeployedAddresses("dev");
  const granter = addresses.PointsGranterProxy;
  const core = addresses.CLMSRMarketCoreProxy;

  if (!granter) throw new Error("PointsGranter not deployed in dev");
  if (!core) throw new Error("Core not deployed in dev");

  const points = await ethers.getContractAt("PointsGranter", granter);

  console.log("📊 Emitting various point events...");

  // 1. ACTIVITY 포인트 (reason=1)
  const activityAmount = ethers.parseUnits("50.123456", 6);
  let tx = await points.grantPoints(deployer.address, activityAmount, 1, 0);
  console.log("🔥 ACTIVITY points tx:", tx.hash);
  await tx.wait();

  // 2. PERFORMANCE 포인트 (reason=2)
  const performanceAmount = ethers.parseUnits("100.789", 6);
  tx = await points.grantPoints(deployer.address, performanceAmount, 2, 0);
  console.log("🚀 PERFORMANCE points tx:", tx.hash);
  await tx.wait();

  // 3. RISK_BONUS 포인트 (reason=3)
  const riskAmount = ethers.parseUnits("25.5", 6);
  tx = await points.grantPoints(deployer.address, riskAmount, 3, 0);
  console.log("💎 RISK_BONUS points tx:", tx.hash);
  await tx.wait();

  // 4. MANUAL 포인트 (reason=100)
  const manualAmount = ethers.parseUnits("200", 6);
  tx = await points.grantPoints(deployer.address, manualAmount, 100, 0);
  console.log("⚡ MANUAL points tx:", tx.hash);
  await tx.wait();

  // 5. Batch grant
  const users = [deployer.address, deployer.address];
  const amounts = [ethers.parseUnits("10", 6), ethers.parseUnits("20", 6)];
  const reasons = [1, 2]; // ACTIVITY, PERFORMANCE
  const timestamps = [0, 0];

  tx = await points.batchGrantPoints(users, amounts, reasons, timestamps);
  console.log("📦 BATCH points tx:", tx.hash);
  await tx.wait();

  console.log("✅ All events emitted!");
  console.log("📊 Expected totals for", deployer.address);
  console.log(
    "  - ACTIVITY:",
    ethers.formatUnits(activityAmount.add(ethers.parseUnits("10", 6)), 6)
  );
  console.log(
    "  - PERFORMANCE:",
    ethers.formatUnits(performanceAmount.add(ethers.parseUnits("20", 6)), 6)
  );
  console.log("  - RISK_BONUS:", ethers.formatUnits(riskAmount, 6));
  console.log(
    "  - Total:",
    ethers.formatUnits(
      activityAmount
        .add(performanceAmount)
        .add(riskAmount)
        .add(manualAmount)
        .add(ethers.parseUnits("30", 6)),
      6
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
