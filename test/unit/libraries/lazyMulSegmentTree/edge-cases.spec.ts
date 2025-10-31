import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { UNIT_TAG } from "../../../helpers/tags";
import { unitFixture } from "../../../helpers/fixtures/core";

describe(`${UNIT_TAG} LazyMulSegmentTree - Edge Cases & Stress Tests`, function () {
  const WAD = ethers.parseEther("1");
  const TWO_WAD = ethers.parseEther("2");
  const HALF_WAD = ethers.parseEther("0.5");
  const MIN_FACTOR = ethers.parseEther("0.01");
  const MAX_FACTOR = ethers.parseEther("100");

  async function deployFixture() {
    const libs = await unitFixture();

    const LazyMulSegmentTreeTest = await ethers.getContractFactory(
      "LazyMulSegmentTreeTest",
      {
        libraries: {
          FixedPointMathU: await libs.fixedPointMathU.getAddress(),
        },
      }
    );
    const test = await LazyMulSegmentTreeTest.deploy();
    await test.waitForDeployment();

    return { test };
  }

  async function deploySmallTreeFixture() {
    const { test } = await deployFixture();
    await test.init(10);
    return { test };
  }

  async function deployMediumTreeFixture() {
    const { test } = await deployFixture();
    await test.init(1000);
    return { test };
  }

  describe("Lazy Propagation Tests", function () {
    it("Should handle deferred propagation correctly", async function () {
      const { test } = await loadFixture(deployMediumTreeFixture);

      // Multiple range operations that should trigger lazy propagation
      await test.applyRangeFactor(100, 200, TWO_WAD);
      await test.applyRangeFactor(150, 250, ethers.parseEther("3"));
      await test.applyRangeFactor(50, 150, HALF_WAD);

      // Query specific values - getRangeSum now includes lazy calculation
      expect(await test.getRangeSum(75, 75)).to.equal(HALF_WAD);
      expect(await test.getRangeSum(125, 125)).to.equal(WAD); // 2 * 0.5 = 1 (125는 150-250 범위에 포함되지 않음)
      expect(await test.getRangeSum(175, 175)).to.equal(ethers.parseEther("6")); // 2 * 3 = 6
      expect(await test.getRangeSum(225, 225)).to.equal(ethers.parseEther("3"));
      expect(await test.getRangeSum(300, 300)).to.equal(WAD);
    });

    it("Should maintain consistency across lazy updates", async function () {
      const { test } = await loadFixture(deployMediumTreeFixture);

      // Complex pattern of lazy operations
      await test.applyRangeFactor(0, 999, TWO_WAD); // Global multiplication
      await test.applyRangeFactor(100, 200, HALF_WAD); // Partial reversion
      await test.applyRangeFactor(150, 160, ethers.parseEther("4")); // Small range boost

      // Verify different segments - getRangeSum includes lazy calculation
      expect(await test.getRangeSum(50, 50)).to.equal(TWO_WAD); // Only global
      expect(await test.getRangeSum(125, 125)).to.equal(WAD); // 2 * 0.5 = 1
      expect(await test.getRangeSum(155, 155)).to.equal(ethers.parseEther("4")); // 2 * 0.5 * 4 = 4
      expect(await test.getRangeSum(250, 250)).to.equal(TWO_WAD); // Only global
    });

    it("Should handle overlapping lazy ranges efficiently", async function () {
      const { test } = await loadFixture(deployMediumTreeFixture);

      // Create multiple overlapping lazy ranges
      const ranges = [
        [0, 500, ethers.parseEther("2")],
        [200, 700, ethers.parseEther("1.5")],
        [400, 900, ethers.parseEther("0.8")],
        [100, 600, ethers.parseEther("2.5")],
      ];

      for (const [start, end, factor] of ranges) {
        await test.applyRangeFactor(start, end, factor);
      }

      // Check specific points to verify correct lazy calculation - getRangeSum includes lazy calculation
      const checkPoints = [50, 150, 300, 450, 650, 800];
      for (const point of checkPoints) {
        const value = await test.getRangeSum(point, point);
        expect(value).to.be.gt(0); // Should be positive
      }
    });

    it("Should trigger propagation on range boundaries", async function () {
      const { test } = await loadFixture(deployMediumTreeFixture);

      // Set up lazy ranges with specific boundaries
      await test.applyRangeFactor(100, 199, TWO_WAD);
      await test.applyRangeFactor(200, 299, ethers.parseEther("3"));

      // Query at boundaries - getRangeSum includes lazy calculation
      expect(await test.getRangeSum(99, 99)).to.equal(WAD);
      expect(await test.getRangeSum(100, 100)).to.equal(TWO_WAD);
      expect(await test.getRangeSum(199, 199)).to.equal(TWO_WAD);
      expect(await test.getRangeSum(200, 200)).to.equal(ethers.parseEther("3"));
      expect(await test.getRangeSum(299, 299)).to.equal(ethers.parseEther("3"));
      expect(await test.getRangeSum(300, 300)).to.equal(WAD);

      // Cross-boundary range queries - getRangeSum includes lazy calculation
      expect(await test.getRangeSum(98, 101)).to.equal(ethers.parseEther("6")); // 1 + 1 + 2 + 2 = 6
      expect(await test.getRangeSum(198, 201)).to.equal(
        ethers.parseEther("10")
      ); // 2 + 2 + 3 + 3 = 10
    });
  });

  describe("Stress Tests", function () {
    it("Should handle many sequential operations", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // Perform many operations in sequence
      for (let i = 0; i < 50; i++) {
        const index = i % 10;
        const factor = ethers.parseEther(((i % 5) + 1).toString());

        if (i % 3 === 0) {
          await test.update(index, factor);
        } else {
          const endIndex = Math.min(index + 2, 9);
          await test.applyRangeFactor(index, endIndex, factor);
        }
      }

      // Verify tree is still in valid state
      const totalSum = await test.getTotalSum();
      expect(totalSum).to.be.gt(0);

      // Check that all individual queries work - getRangeSum includes lazy calculation
      for (let i = 0; i < 10; i++) {
        const value = await test.getRangeSum(i, i);
        expect(value).to.be.gt(0);
      }
    });

    it("Should handle alternating update and applyRangeFactor operations", async function () {
      const { test } = await loadFixture(deployMediumTreeFixture);

      // Alternating pattern of operations
      for (let i = 0; i < 20; i++) {
        const start = i * 40;
        const end = Math.min(start + 30, 999);

        if (i % 2 === 0) {
          await test.applyRangeFactor(start, end, TWO_WAD);
        } else {
          const midPoint = Math.floor((start + end) / 2);
          await test.update(midPoint, ethers.parseEther("3"));
        }
      }

      // Verify some scattered points - getRangeSum includes lazy calculation
      const checkPoints = [15, 85, 155, 225, 395, 565, 735, 905];
      for (const point of checkPoints) {
        const value = await test.getRangeSum(point, point);
        expect(value).to.be.gt(0);
      }
    });

    it("Should maintain precision under stress", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // Operations that could accumulate precision errors
      const operations = [
        { type: "applyRangeFactor", args: [0, 9, ethers.parseEther("1.1")] },
        { type: "applyRangeFactor", args: [2, 7, ethers.parseEther("0.9")] },
        { type: "update", args: [5, ethers.parseEther("1.5")] },
        { type: "applyRangeFactor", args: [3, 8, ethers.parseEther("1.01")] },
        { type: "applyRangeFactor", args: [1, 6, ethers.parseEther("0.99")] },
      ];

      for (const op of operations) {
        if (op.type === "applyRangeFactor") {
          await test.applyRangeFactor(op.args[0], op.args[1], op.args[2]);
        } else {
          await test.update(op.args[0], op.args[1]);
        }
      }

      // Check that values are reasonable and non-zero - getRangeSum includes lazy calculation
      for (let i = 0; i < 10; i++) {
        const value = await test.getRangeSum(i, i);
        expect(value).to.be.gt(ethers.parseEther("0.1"));
        expect(value).to.be.lt(ethers.parseEther("10"));
      }
    });

    it("Should handle maximum tree size efficiently", async function () {
      const { test } = await loadFixture(deployFixture);
      await test.init(10000); // Large tree

      // Perform operations on large tree
      await test.applyRangeFactor(1000, 5000, TWO_WAD);
      await test.update(2500, ethers.parseEther("5"));
      await test.applyRangeFactor(7000, 9000, HALF_WAD);

      // Test scattered queries - getRangeSum includes lazy calculation
      expect(await test.getRangeSum(500, 500)).to.equal(WAD);
      expect(await test.getRangeSum(2500, 2500)).to.equal(
        ethers.parseEther("5")
      );
      expect(await test.getRangeSum(8000, 8000)).to.equal(HALF_WAD);
      expect(await test.getRangeSum(9500, 9500)).to.equal(WAD);
    });
  });

  describe("Extreme Value Tests", function () {
    it("Should handle very small factors", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      const verySmall = ethers.parseEther("0.005"); // Below MIN_FACTOR (0.01)

      // Should revert with InvalidFactor
      await expect(
        test.applyRangeFactor(2, 4, verySmall)
      ).to.be.revertedWithCustomError(test, "InvalidFactor");
    });

    it("Should handle very large factors", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      const veryLarge = ethers.parseEther("150"); // Above MAX_FACTOR (100)

      // Should revert with InvalidFactor
      await expect(
        test.applyRangeFactor(2, 4, veryLarge)
      ).to.be.revertedWithCustomError(test, "InvalidFactor");
    });

    it("Should handle zero factors", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // Should revert with InvalidFactor (not ZeroFactor)
      await expect(
        test.applyRangeFactor(3, 6, 0)
      ).to.be.revertedWithCustomError(test, "InvalidFactor");
    });

    it("Should handle factor of exactly 1", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // Update some values first
      await test.update(2, TWO_WAD);
      await test.update(4, ethers.parseEther("3"));

      const initialSum = await test.getTotalSum();

      // Multiply by 1 (should be no-op)
      await test.applyRangeFactor(0, 9, WAD);

      // Values should be unchanged - getRangeSum includes lazy calculation
      expect(await test.getRangeSum(2, 2)).to.equal(TWO_WAD);
      expect(await test.getRangeSum(4, 4)).to.equal(ethers.parseEther("3"));
      expect(await test.getTotalSum()).to.equal(initialSum);
    });
  });

  describe("Complex Interaction Tests", function () {
    it("Should handle interleaved updates and range multiplications", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // Complex sequence simulating real-world usage
      await test.update(1, ethers.parseEther("2"));
      await test.applyRangeFactor(0, 3, ethers.parseEther("1.5"));
      await test.update(5, ethers.parseEther("3"));
      await test.applyRangeFactor(2, 7, ethers.parseEther("0.8"));
      await test.update(6, ethers.parseEther("5"));
      await test.applyRangeFactor(4, 8, ethers.parseEther("1.2"));

      // Verify final state - getRangeSum includes lazy calculation
      for (let i = 0; i < 10; i++) {
        const value = await test.getRangeSum(i, i);
        expect(value).to.be.gt(0);
      }

      // Verify some range queries - getRangeSum includes lazy calculation
      const fullRange = await test.getRangeSum(0, 9);
      expect(fullRange).to.be.gt(0);
    });

    it("Should handle cascading multiplications", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // Apply range factors
      await test.applyRangeFactor(0, 9, ethers.parseEther("2")); // Global
      await test.applyRangeFactor(2, 7, ethers.parseEther("3")); // Nested
      await test.applyRangeFactor(4, 5, ethers.parseEther("0.5")); // Deep nested

      // Check specific indices - getRangeSum includes lazy calculation
      const result1 = await test.getRangeSum(1, 1);
      expect(result1).to.equal(ethers.parseEther("2")); // Only global factor

      const result3 = await test.getRangeSum(3, 3);
      expect(result3).to.equal(ethers.parseEther("6")); // Global(2) * nested(3) = 6

      const result4 = await test.getRangeSum(4, 4);
      expect(result4).to.equal(ethers.parseEther("3")); // Global * nested * deep = 2 * 3 * 0.5 = 3

      const result8 = await test.getRangeSum(8, 8);
      expect(result8).to.equal(ethers.parseEther("2"));
    });

    it("Should maintain invariants under complex operations", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // Set up some initial state
      await test.update(0, ethers.parseEther("100"));
      await test.update(5, ethers.parseEther("200"));

      const operations = [
        () => test.applyRangeFactor(0, 2, ethers.parseEther("1.1")),
        () => test.update(1, ethers.parseEther("150")),
        () => test.applyRangeFactor(3, 7, ethers.parseEther("0.9")),
        () => test.update(6, ethers.parseEther("300")),
        () => test.applyRangeFactor(1, 8, ethers.parseEther("1.05")),
      ];

      // Execute operations in sequence
      for (const op of operations) {
        await op();

        // Verify tree is still valid after each operation
        const totalSum = await test.getTotalSum();
        expect(totalSum).to.be.gt(0);

        // Check that no individual value is corrupted
        for (let i = 0; i < 10; i++) {
          const value = await test.getRangeSum(i, i);
          expect(value).to.be.gte(0);
        }
      }
    });
  });

  describe("Recovery and Consistency Tests", function () {
    it("Should recover from extreme operations", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // Extreme down scaling followed by up scaling - but within valid range
      await test.applyRangeFactor(0, 9, MIN_FACTOR); // Use MIN_FACTOR instead of invalid value
      await test.applyRangeFactor(0, 9, MAX_FACTOR); // Use MAX_FACTOR instead of invalid value

      // Should be back to approximately original values
      for (let i = 0; i < 10; i++) {
        const value = await test.getRangeSum(i, i);
        expect(value).to.be.closeTo(WAD, ethers.parseEther("0.1"));
      }
    });

    it("Should handle alternating zero and non-zero operations", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // Zero operations should revert, so test with valid small factor instead
      await expect(
        test.applyRangeFactor(0, 4, 0)
      ).to.be.revertedWithCustomError(test, "InvalidFactor");

      // Test with valid operations instead
      await test.applyRangeFactor(0, 4, MIN_FACTOR); // Use minimum valid factor
      await test.applyRangeFactor(5, 9, ethers.parseEther("5")); // Boost second half
      await test.update(2, ethers.parseEther("10")); // Restore one element

      // Check results - getRangeSum includes lazy calculation
      for (let i = 0; i < 10; i++) {
        const value = await test.getRangeSum(i, i);
        expect(value).to.be.gt(0);
      }

      // Range queries should work correctly
      const fullRange = await test.getRangeSum(0, 9);
      expect(fullRange).to.be.gt(0); // No zeros
    });

    it("Should maintain precision through repeated operations", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // Use factors within valid range
      const factor = ethers.parseEther("1.01"); // Valid small increment
      const inverse = ethers.parseEther("0.99"); // Valid approximate inverse

      for (let i = 0; i < 10; i++) {
        // Reduce iterations to avoid overflow
        await test.applyRangeFactor(0, 9, factor);
        await test.applyRangeFactor(0, 9, inverse);
      }

      // Values should still be reasonable
      for (let i = 0; i < 10; i++) {
        const value = await test.getRangeSum(i, i);
        expect(value).to.be.gt(ethers.parseEther("0.1"));
        expect(value).to.be.lt(ethers.parseEther("10"));
      }
    });
  });
});
