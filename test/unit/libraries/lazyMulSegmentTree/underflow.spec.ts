import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { UNIT_TAG } from "../../../helpers/tags";
import { unitFixture } from "../../../helpers/fixtures/core";

const WAD = ethers.parseEther("1");
const UNDERFLOW_FLUSH_THRESHOLD = 1_000_000_000_000_000n; // 1e15
const HALF_WAD = WAD / 2n;
const TREE_SIZE = 1024;
const HALF_SIZE = TREE_SIZE / 2;
const FULL_RANGE_LO = 0;
const FULL_RANGE_HI = TREE_SIZE - 1;
const LEFT_RANGE_HI = HALF_SIZE - 1;

function mulWadNearest(a: bigint, b: bigint): bigint {
  const product = a * b;
  return (product + HALF_WAD) / WAD;
}

function expectedRangeSum(length: number, factor: bigint, iterations: number): bigint {
  let result = BigInt(length) * WAD;
  for (let i = 0; i < iterations; i++) {
    result = mulWadNearest(result, factor);
  }
  return result;
}

function simulatePending(factor: bigint, iterations: number): bigint {
  let pending = WAD;
  for (let i = 0; i < iterations; i++) {
    const candidate = mulWadNearest(pending, factor);
    pending = candidate < UNDERFLOW_FLUSH_THRESHOLD ? factor : candidate;
  }
  return pending;
}

describe(`${UNIT_TAG} LazyMulSegmentTree - Underflow Flush`, function () {
  async function deployHarnessFixture() {
    const libs = await unitFixture();

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
    await harness.init(TREE_SIZE);

    return { harness, fixedPointMathU: libs.fixedPointMathU };
  }

  it("flushes tiny pending factors instead of zeroing them", async function () {
    const { harness, fixedPointMathU } = await loadFixture(deployHarnessFixture);

    const expOne = await fixedPointMathU.wExp(WAD);
    const factor = await fixedPointMathU.wDiv(WAD, expOne);

    const iterations = 60;
    for (let i = 0; i < iterations; i++) {
      await harness.applyFactor(FULL_RANGE_LO, FULL_RANGE_HI, factor);
    }

    const rootIndex = await harness.root();
    const [rootSum, rootPendingBeforePartial] = await harness.getNode(rootIndex);

    const expectedPending = simulatePending(factor, iterations);
    expect(rootPendingBeforePartial).to.equal(expectedPending);
    expect(rootPendingBeforePartial).to.not.equal(0n);

    const expectedTotal = expectedRangeSum(TREE_SIZE, factor, iterations);
    expect(rootSum).to.equal(expectedTotal);
    expect(await harness.cachedRootSum()).to.equal(expectedTotal);
    expect(await harness.rangeSum(FULL_RANGE_LO, FULL_RANGE_HI)).to.equal(
      expectedTotal
    );

    // Trigger partial overlap to force a push of the accumulated pending factor
    await harness.applyFactor(FULL_RANGE_LO, LEFT_RANGE_HI, factor);

    const [rootSumAfterPartial, rootPendingAfterPartial, childPtr] =
      await harness.getNode(rootIndex);

    const expectedLeft = expectedRangeSum(HALF_SIZE, factor, iterations + 1);
    const expectedRight = expectedRangeSum(HALF_SIZE, factor, iterations);
    const expectedCombined = expectedLeft + expectedRight;

    expect(rootSumAfterPartial).to.equal(expectedCombined);
    expect(await harness.cachedRootSum()).to.equal(expectedCombined);
    expect(await harness.rangeSum(FULL_RANGE_LO, LEFT_RANGE_HI)).to.equal(
      expectedLeft
    );
    expect(await harness.rangeSum(HALF_SIZE, FULL_RANGE_HI)).to.equal(
      expectedRight
    );

    // Root pending should reset after the partial update and children must exist
    expect(rootPendingAfterPartial).to.equal(WAD);
    expect(childPtr).to.not.equal(0);

    await harness.propagate(FULL_RANGE_LO, LEFT_RANGE_HI);
    expect(await harness.rangeSum(FULL_RANGE_LO, LEFT_RANGE_HI)).to.equal(
      expectedLeft
    );
    expect(await harness.cachedRootSum()).to.equal(expectedCombined);
  });
});
