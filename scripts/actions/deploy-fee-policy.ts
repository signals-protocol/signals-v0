import { ethers } from "hardhat";
import { envManager } from "../utils/environment";
import type { Environment } from "../types/environment";

function parseArgs(raw: string | undefined): unknown[] {
  if (!raw || raw.trim().length === 0) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error("FEE_POLICY_ARGS must be a JSON array");
    }
    return parsed;
  } catch (error) {
    throw new Error(
      `Failed to parse FEE_POLICY_ARGS. Provide JSON array. Original error: ${
        (error as Error).message
      }`
    );
  }
}

export async function deployFeePolicyAction(
  environment: Environment
): Promise<void> {
  const contractName = process.env.FEE_POLICY_CONTRACT ?? "NullFeePolicy";
  const label = process.env.FEE_POLICY_LABEL ?? contractName;
  const constructorArgs = parseArgs(process.env.FEE_POLICY_ARGS);

  console.log(
    `🪄 Deploying fee policy "${contractName}" (label: ${label}) on ${environment}`
  );
  if (constructorArgs.length > 0) {
    console.log("   • constructor args:", constructorArgs);
  }

  const [deployer] = await ethers.getSigners();
  console.log("👤 Deployer:", deployer.address);

  const factory = await ethers.getContractFactory(contractName);
  const policy = await factory.deploy(...constructorArgs);
  await policy.waitForDeployment();
  const policyAddress = await policy.getAddress();

  console.log("✅ Fee policy deployed at:", policyAddress);

  const targetEnvironments: Environment[] =
    environment === "citrea-dev" || environment === "citrea-prod"
      ? ["citrea-dev", "citrea-prod"]
      : [environment];

  for (const targetEnv of targetEnvironments) {
    envManager.loadOrInitializeEnvironment(targetEnv);
    envManager.updateFeePolicy(targetEnv, label, policyAddress);
  }

  console.log("\n🎉 Fee policy deployment complete!");
  console.log("   • Policy address:", policyAddress);
  console.log("   • Label:", label);
  if (targetEnvironments.length > 1) {
    console.log(
      `   • Recorded for environments: ${targetEnvironments.join(", ")}`
    );
  } else {
    console.log(`   • Recorded for environment: ${targetEnvironments[0]}`);
  }
  console.log(
    "   • Core configuration unchanged (use set-fee-policy to apply on-chain)"
  );
}
