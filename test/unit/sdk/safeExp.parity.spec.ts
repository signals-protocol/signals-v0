import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import Big from "big.js";

import { safeExp } from "../../../clmsr-sdk/src/utils/math";
import { unitFixture } from "../../helpers/fixtures/core";

type HarnessContracts = Awaited<ReturnType<typeof deployHarnessFixture>>;

async function deployHarnessFixture() {
  const libs = await unitFixture();

  const harnessFactory = await ethers.getContractFactory("CLMSRMathHarness", {
    libraries: {
      FixedPointMathU: await libs.fixedPointMathU.getAddress(),
      LazyMulSegmentTree: await libs.lazyMulSegmentTree.getAddress(),
    },
  });

  const harness = await harnessFactory.deploy();
  await harness.waitForDeployment();

  return { harness };
}

function toBigInt(big: Big): bigint {
  return BigInt(big.toFixed(0, Big.roundDown));
}

describe("SDK ↔ Core safeExp parity", function () {
  it("matches contract _safeExp outputs across representative samples", async function () {
    const { harness }: HarnessContracts = await loadFixture(deployHarnessFixture);

    const alphaSamples = [
      ethers.parseEther("0.001"),
      ethers.parseEther("0.01"),
      ethers.parseEther("0.05"),
      ethers.parseEther("0.5"),
      ethers.parseEther("1"),
    ];

const ratioSamples = ["0", "0.0625", "0.25", "0.5", "1"];

for (const alpha of alphaSamples) {
      const alphaBig = new Big(alpha.toString());

      for (const ratio of ratioSamples) {
        const qBig = alphaBig.mul(ratio);
        const q = toBigInt(qBig);

        const onChain = await harness.exposedSafeExp(q, alpha);
        const sdk = safeExp(new Big(q.toString()), alphaBig);
        const sdkAsBigInt = toBigInt(sdk);
        const delta =
          onChain >= sdkAsBigInt ? onChain - sdkAsBigInt : sdkAsBigInt - onChain;

        expect(
          delta,
          `safeExp mismatch alpha=${alpha.toString()} ratio=${ratio}`
        ).to.lte(1_000_000_000_000n); // ≤ 1 micro WAD tolerance
      }
    }
  });

  it("handles large multi-chunk quantities consistently", async function () {
    const { harness }: HarnessContracts = await loadFixture(deployHarnessFixture);

    const alpha = ethers.parseEther("0.75"); // realistic liquidity parameter
    const alphaBig = new Big(alpha.toString());

    // Quantity pushes chunking but stays within overflow-safe bounds
    const qBig = alphaBig.mul("10");
    const q = toBigInt(qBig);

    const onChain = await harness.exposedSafeExp(q, alpha);
    const sdk = safeExp(new Big(q.toString()), alphaBig);
    const sdkAsBigInt = toBigInt(sdk);
    const delta =
      onChain >= sdkAsBigInt ? onChain - sdkAsBigInt : sdkAsBigInt - onChain;

    expect(delta).to.lte(1_000_000_000_000n); // ≤ 1 micro WAD tolerance
  });
});
