import { ethers } from "hardhat";
import { envManager } from "../utils/environment";
import type { Environment } from "../types/environment";

function normalizeAddress(input?: string | null): string | null {
  if (!input) return null;
  const value = input.trim();
  if (value.length === 0) return null;
  if (value === "0" || /^0x0+$/i.test(value)) return ethers.ZeroAddress;
  return ethers.getAddress(value);
}

export async function setFeePolicyAction(
  environment: Environment
): Promise<void> {
  const label = process.env.FEE_POLICY_LABEL?.trim();
  const explicitAddress = normalizeAddress(process.env.FEE_POLICY_ADDRESS);
  const feeRecipientInput = normalizeAddress(process.env.FEE_RECIPIENT);
  const shouldClearRecipient =
    process.env.FEE_RECIPIENT !== undefined &&
    process.env.FEE_RECIPIENT?.trim() === "";

  const coreProxy = envManager.getCoreProxyAddress(environment);
  if (!coreProxy) {
    throw new Error(
      `Core proxy not recorded for ${environment}. Deploy or register it first.`
    );
  }

  let resolvedPolicy = explicitAddress;
  if (!resolvedPolicy && label) {
    resolvedPolicy = envManager.getFeePolicyAddress(environment, label);
    if (!resolvedPolicy) {
      throw new Error(
        `No stored address for fee policy label "${label}" in ${environment}`
      );
    }
  }

  if (!resolvedPolicy && !feeRecipientInput && !shouldClearRecipient) {
    throw new Error(
      "Provide either FEE_POLICY_ADDRESS, FEE_POLICY_LABEL, or FEE_RECIPIENT to update."
    );
  }

  const [signer] = await ethers.getSigners();
  console.log("👤 Caller:", signer.address);
  console.log("📋 Environment:", environment);
  console.log("📍 Core proxy:", coreProxy);

  const core = await ethers.getContractAt("CLMSRMarketCore", coreProxy);

  if (resolvedPolicy !== null) {
    const policyLabel = label ?? "unknown";
    console.log(
      `🔗 Setting fee policy to ${resolvedPolicy} (label: ${policyLabel})`
    );
    const tx = await core.setFeePolicy(resolvedPolicy);
    console.log("   • tx:", tx.hash);
    await tx.wait();
    envManager.setActiveFeePolicy(environment, resolvedPolicy, label ?? null);
    console.log("   ✅ Fee policy updated");
  }

  if (feeRecipientInput) {
    console.log(`🔗 Setting fee recipient to ${feeRecipientInput}`);
    const tx = await core.setFeeRecipient(feeRecipientInput);
    console.log("   • tx:", tx.hash);
    await tx.wait();
    envManager.setFeeRecipient(environment, feeRecipientInput);
    console.log("   ✅ Fee recipient updated");
  } else if (shouldClearRecipient) {
    console.log("🔗 Clearing fee recipient (setting to zero address)");
    const tx = await core.setFeeRecipient(ethers.ZeroAddress);
    console.log("   • tx:", tx.hash);
    await tx.wait();
    envManager.setFeeRecipient(environment, null);
    console.log("   ✅ Fee recipient cleared");
  }

  console.log("\n🎉 Fee configuration complete!");
  if (resolvedPolicy !== null) {
    console.log("   • Active policy:", resolvedPolicy);
  }
  if (label) {
    console.log("   • Label:", label);
  }
  if (feeRecipientInput) {
    console.log("   • Fee recipient:", feeRecipientInput);
  } else if (shouldClearRecipient) {
    console.log("   • Fee recipient cleared");
  }
}
