import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

async function deployHarnessFixture(treeSize: number) {
  const libs = await (await import("../../../helpers/fixtures/core")).unitFixture();
  const HarnessFactory = await ethers.getContractFactory(
    "LazyMulSegmentTreeHarness",
    {
      libraries: {
        LazyMulSegmentTree: await libs.lazyMulSegmentTree.getAddress(),
      },
    }
  );

  const harness = await HarnessFactory.deploy();
  await harness.waitForDeployment();
  await harness.init(treeSize);

  return { harness };
}

const TREE_SIZE = 128;
async function fixtureTree() {
  return deployHarnessFixture(TREE_SIZE);
}

const BIG = (value: bigint | number) => BigInt(value);

describe("LazyMulSegmentTree - Sum Consistency", function () {
  it("should keep parent sum equal to children sums after lazy push", async function () {
    const { harness } = await loadFixture(fixtureTree);

    await harness.applyFactor(0, TREE_SIZE - 1, ethers.parseEther("50"));
    await harness.applyFactor(0, TREE_SIZE - 1, ethers.parseEther("50"));
    await harness.applyFactor(0, TREE_SIZE - 1, ethers.parseEther("20"));

    const quarter = Math.floor(TREE_SIZE / 4);
    await harness.applyFactor(
      quarter,
      TREE_SIZE - 1 - quarter,
      ethers.parseEther("1.05")
    );

    const rootIndex = await harness.root();
    const [rootSum, , rootPtr] = await harness.getNode(rootIndex);
    const leftIndex = Number(rootPtr >> 32n);
    const rightIndex = Number(rootPtr & 0xffffffffn);

    const [leftSum] = await harness.getNode(leftIndex);
    const [rightSum] = await harness.getNode(rightIndex);

    expect(leftIndex).to.not.equal(0, "left child should exist");
    expect(rightIndex).to.not.equal(0, "right child should exist");
    expect(BIG(leftSum) + BIG(rightSum)).to.equal(
      BIG(rootSum),
      "parent sum must equal sum of children after push"
    );
  });
});
