import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { UNIT_TAG } from "../../../helpers/tags";
import { unitFixture } from "../../../helpers/fixtures/core";

const TREE_SIZE = 128;
const SAMPLE_COUNT = 150;
const OPS_PER_SAMPLE = 1;
const VIEW_TOLERANCE = 1_000_000_000_000n; // 1 micro WAD tolerance

const MIN_FACTOR = ethers.parseEther("0.75");
const MAX_FACTOR = ethers.parseEther("1.5");
const SCALE = 1_000_000n;

type HarnessFixture = Awaited<ReturnType<typeof deployHarnessFixture>>;

function createPrng(seed: bigint = 0x6eed0e9dafbb99b5n) {
  let state = seed & ((1n << 64n) - 1n);
  const modulus = 1n << 64n;
  const multiplier = 6364136223846793005n;
  const increment = 1442695040888963407n;

  return {
    next(): bigint {
      state = (state * multiplier + increment) % modulus;
      return state;
    },
    nextInt(maxExclusive: number): number {
      if (maxExclusive <= 0) {
        throw new Error("maxExclusive must be positive");
      }
      return Number(this.next() % BigInt(maxExclusive));
    },
    nextBigInt(maxExclusive: bigint): bigint {
      if (maxExclusive <= 0n) {
        throw new Error("maxExclusive must be positive");
      }
      return this.next() % maxExclusive;
    },
  };
}

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

  return { harness };
}

function randomFactor(rng: ReturnType<typeof createPrng>): bigint {
  const span = MAX_FACTOR - MIN_FACTOR;
  if (span === 0n) {
    return MIN_FACTOR;
  }
  const offset = (span * rng.nextBigInt(SCALE)) / SCALE;
  const candidate = MIN_FACTOR + offset;
  if (candidate < MIN_FACTOR) {
    return MIN_FACTOR;
  }
  if (candidate > MAX_FACTOR) {
    return MAX_FACTOR;
  }
  return candidate;
}

describe(`${UNIT_TAG} LazyMulSegmentTree - View vs Propagate consistency`, function () {
  it("should keep getRangeSum and propagateLazy in sync across random samples", async function () {
    const { harness }: HarnessFixture = await loadFixture(
      deployHarnessFixture
    );
    const rng = createPrng();

    for (let iteration = 0; iteration < SAMPLE_COUNT; iteration++) {
      const opCount = 1 + rng.nextInt(OPS_PER_SAMPLE);
      for (let j = 0; j < opCount; j++) {
        const lo = rng.nextInt(TREE_SIZE);
        const hi = lo + rng.nextInt(TREE_SIZE - lo);
        const factor = randomFactor(rng);
        await harness.applyFactor(lo, hi, factor);
      }

      const queryLo = rng.nextInt(TREE_SIZE);
      const queryHi = queryLo + rng.nextInt(TREE_SIZE - queryLo);

      const viewSum = await harness.rangeSum(queryLo, queryHi);
      const staticPropagate = await harness.propagate.staticCall(
        queryLo,
        queryHi
      );

      const diff =
        staticPropagate >= viewSum
          ? staticPropagate - viewSum
          : viewSum - staticPropagate;

      expect(diff, "view vs propagate difference should stay within tolerance").to.be.lte(
        VIEW_TOLERANCE
      );

      await harness.propagate(queryLo, queryHi);

      const viewAfterFlush = await harness.rangeSum(queryLo, queryHi);
      expect(
        viewAfterFlush,
        "view sum should remain stable after propagation"
      ).to.equal(staticPropagate);

      const totalSum = await harness.rangeSum(0, TREE_SIZE - 1);
      expect(await harness.cachedRootSum(), "cached root sum must reflect full range").to.equal(
        totalSum
      );

      await harness.propagate(0, TREE_SIZE - 1);
    }
  });

});
