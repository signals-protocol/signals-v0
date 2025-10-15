import { ethers } from "hardhat";
import type { Provider } from "ethers";

/**
 * Get safe transaction options with higher fees to avoid "replacement transaction underpriced"
 * @param multiplier Fee multiplier (default 1.15 = 15% increase)
 * @returns Transaction options with bumped fees
 */
export async function safeTxOpts(
  multiplier = 1.15,
  provider?: Provider
) {
  const fee = await (provider ?? ethers.provider).getFeeData();

  const bump = (x: bigint | null) => {
    if (!x) return ethers.parseUnits("2", "gwei"); // Fallback
    return (x * BigInt(Math.round(multiplier * 100))) / BigInt(100);
  };

  return {
    maxFeePerGas: bump(fee.maxFeePerGas),
    maxPriorityFeePerGas: bump(
      fee.maxPriorityFeePerGas ?? ethers.parseUnits("1", "gwei")
    ),
    gasLimit: 6000000, // Increased for new LazyMulSegmentTree features
  };
}

export async function safeTxOptsPinned(
  provider: Provider,
  multiplier = 1.15
) {
  return safeTxOpts(multiplier, provider);
}

/**
 * Wait for a specified time (useful between transactions)
 * @param ms Milliseconds to wait
 */
export async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Safe transaction execution with retry logic
 * @param txPromise Transaction promise
 * @param retries Number of retries
 * @param delayMs Delay between retries
 */
export async function safeExecuteTx<T>(
  txPromise: () => Promise<T>,
  retries = 3,
  delayMs = 2000
): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      const result = await txPromise();
      return result;
    } catch (error: any) {
      console.log(`🔄 Transaction attempt ${i + 1} failed:`, error.message);

      if (i === retries - 1) {
        throw error; // Last retry, throw the error
      }

      if (
        error.message.includes("replacement transaction underpriced") ||
        error.message.includes("nonce too low")
      ) {
        console.log(`⏳ Waiting ${delayMs}ms before retry...`);
        await delay(delayMs);
      } else {
        throw error; // Non-nonce related error, don't retry
      }
    }
  }

  throw new Error("Should not reach here");
}
