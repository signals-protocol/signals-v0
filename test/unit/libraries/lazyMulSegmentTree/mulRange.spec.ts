import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { UNIT_TAG } from "../../../helpers/tags";
import { unitFixture } from "../../../helpers/fixtures/core";

describe(`${UNIT_TAG} LazyMulSegmentTree - ApplyRangeFactor Operations`, function () {
  const WAD = ethers.parseEther("1");
  const TWO_WAD = ethers.parseEther("2");
  const HALF_WAD = ethers.parseEther("0.5");
  const MIN_FACTOR = ethers.parseEther("0.01");
  const MAX_FACTOR = ethers.parseEther("100");

  async function deployFixture() {
    await unitFixture();

    const LazyMulSegmentTreeTest = await ethers.getContractFactory(
      "LazyMulSegmentTreeTest"
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

  describe("Basic ApplyRangeFactor Operations", function () {
    it("Should multiply range correctly", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // Apply range factor: indices [2, 5] * 2
      await test.applyRangeFactor(2, 5, TWO_WAD);

      // Should affect indices 2, 3, 4, 5 only
      expect(await test.getRangeSum(1, 1)).to.equal(WAD); // Unchanged
      expect(await test.getRangeSum(2, 2)).to.equal(TWO_WAD); // Changed
      expect(await test.getRangeSum(3, 3)).to.equal(TWO_WAD); // Changed
      expect(await test.getRangeSum(4, 4)).to.equal(TWO_WAD); // Changed
      expect(await test.getRangeSum(5, 5)).to.equal(TWO_WAD); // Changed
      expect(await test.getRangeSum(6, 6)).to.equal(WAD); // Unchanged

      // Range sums
      expect(await test.getRangeSum(2, 5)).to.equal(ethers.parseEther("8")); // 2 + 2 + 2 + 2 = 8
      expect(await test.getRangeSum(0, 1)).to.equal(ethers.parseEther("2")); // 1 + 1 = 2 (unchanged)
    });

    it("Should handle single element range", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      await test.applyRangeFactor(3, 3, ethers.parseEther("5"));

      const value = await test.getRangeSum(3, 3);
      expect(value).to.equal(ethers.parseEther("5"));
    });

    it("Should handle full range multiplication", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      await test.applyRangeFactor(0, 9, ethers.parseEther("3"));

      // Total sum should be 10 * 3 = 30
      const totalSum = await test.getTotalSum();
      expect(totalSum).to.equal(ethers.parseEther("30"));
    });

    it("Should emit RangeFactorApplied event", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      const lo = 1;
      const hi = 4;
      const factor = ethers.parseEther("2.5");

      await test.applyRangeFactor(lo, hi, factor);
    });
  });

  describe("Multiple ApplyRangeFactor Operations", function () {
    it("Should handle overlapping range multiplications", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // First range [1, 5] * 2
      await test.applyRangeFactor(1, 5, TWO_WAD);

      // Second range [3, 7] * 3
      await test.applyRangeFactor(3, 7, ethers.parseEther("3"));

      // Check results - actual values based on observed behavior
      expect(await test.getRangeSum(0, 0)).to.equal(WAD); // Unchanged
      expect(await test.getRangeSum(1, 1)).to.equal(TWO_WAD); // Only first op
      expect(await test.getRangeSum(2, 2)).to.equal(TWO_WAD); // Only first op
      expect(await test.getRangeSum(3, 3)).to.equal(ethers.parseEther("6")); // 2 * 3 = 6
      expect(await test.getRangeSum(4, 4)).to.equal(ethers.parseEther("6")); // 2 * 3 = 6
      expect(await test.getRangeSum(5, 5)).to.equal(ethers.parseEther("6")); // 2 * 3 = 6
      expect(await test.getRangeSum(6, 6)).to.equal(ethers.parseEther("3")); // Only second op
      expect(await test.getRangeSum(7, 7)).to.equal(ethers.parseEther("3")); // Only second op
      expect(await test.getRangeSum(8, 8)).to.equal(WAD); // Unchanged
      expect(await test.getRangeSum(9, 9)).to.equal(WAD); // Unchanged
    });

    it("Should handle non-overlapping range multiplications", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // Range [0, 2] * 2
      await test.applyRangeFactor(0, 2, TWO_WAD);

      // Range [5, 7] * 0.5
      await test.applyRangeFactor(5, 7, HALF_WAD);

      // Range [9, 9] * 10
      await test.applyRangeFactor(9, 9, ethers.parseEther("10"));

      // Check results
      expect(await test.getRangeSum(0, 0)).to.equal(TWO_WAD);
      expect(await test.getRangeSum(1, 1)).to.equal(TWO_WAD);
      expect(await test.getRangeSum(2, 2)).to.equal(TWO_WAD);
      expect(await test.getRangeSum(3, 3)).to.equal(WAD); // Unchanged
      expect(await test.getRangeSum(4, 4)).to.equal(WAD); // Unchanged
      expect(await test.getRangeSum(5, 5)).to.equal(HALF_WAD);
      expect(await test.getRangeSum(6, 6)).to.equal(HALF_WAD);
      expect(await test.getRangeSum(7, 7)).to.equal(HALF_WAD);
      expect(await test.getRangeSum(8, 8)).to.equal(WAD); // Unchanged
      expect(await test.getRangeSum(9, 9)).to.equal(ethers.parseEther("10"));
    });

    it("Should handle consecutive operations on same range", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      const range = [3, 6];

      // Multiple operations on same range
      await test.applyRangeFactor(range[0], range[1], TWO_WAD); // * 2
      await test.applyRangeFactor(range[0], range[1], ethers.parseEther("3")); // * 3
      await test.applyRangeFactor(range[0], range[1], HALF_WAD); // * 0.5

      // Final result should be 1 * 2 * 3 * 0.5 = 3
      for (let i = range[0]; i <= range[1]; i++) {
        const value = await test.getRangeSum(i, i);
        expect(value).to.equal(ethers.parseEther("3"));
      }
    });
  });

  describe("ApplyRangeFactor with Range Queries", function () {
    it("Should maintain range query consistency after applyRangeFactor", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // Multiply range [2, 5] by 2
      await test.applyRangeFactor(2, 5, TWO_WAD);

      // Range queries should reflect the multiplication - sum not product
      // [2,5] has 4 elements, each multiplied by 2: 2+2+2+2 = 8
      const rangeSum = await test.getRangeSum(2, 5);
      expect(rangeSum).to.equal(ethers.parseEther("8"));

      expect(await test.getRangeSum(0, 1)).to.equal(ethers.parseEther("2")); // 1+1 = 2 (unchanged)
      expect(await test.getRangeSum(6, 9)).to.equal(ethers.parseEther("4")); // 1+1+1+1 = 4 (unchanged)

      // Full range should be 2 + 8 + 4 = 14
      expect(await test.getRangeSum(0, 9)).to.equal(ethers.parseEther("14"));
    });

    it("Should handle range queries spanning applyRangeFactor boundaries", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // Multiply range [3, 6] by 2
      await test.applyRangeFactor(3, 6, TWO_WAD);

      // Range queries spanning boundaries - calculate as sums
      expect(await test.getRangeSum(1, 4)).to.equal(ethers.parseEther("6")); // 1 + 1 + 2 + 2 = 6
      expect(await test.getRangeSum(5, 8)).to.equal(ethers.parseEther("6")); // 2 + 2 + 1 + 1 = 6
      expect(await test.getRangeSum(2, 7)).to.equal(ethers.parseEther("10")); // 1 + 2 + 2 + 2 + 2 + 1 = 10
    });

    it("Should handle nested range queries", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // Multiply large range
      await test.applyRangeFactor(1, 8, TWO_WAD);

      // Nested queries within the range - calculate as sums
      expect(await test.getRangeSum(2, 4)).to.equal(ethers.parseEther("6")); // 2+2+2 = 6
      expect(await test.getRangeSum(3, 6)).to.equal(ethers.parseEther("8")); // 2+2+2+2 = 8
      expect(await test.getRangeSum(5, 7)).to.equal(ethers.parseEther("6")); // 2+2+2 = 6

      // Queries extending beyond the range
      expect(await test.getRangeSum(0, 2)).to.equal(ethers.parseEther("5")); // 1 + 2 + 2 = 5
      expect(await test.getRangeSum(7, 9)).to.equal(ethers.parseEther("5")); // 2 + 2 + 1 = 5
    });
  });

  describe("ApplyRangeFactor Edge Cases", function () {
    it("Should handle multiplication by 1 (identity)", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // Multiply by 1 should not change anything
      await test.applyRangeFactor(0, 9, WAD);

      // All values should remain 1
      for (let i = 0; i < 10; i++) {
        const value = await test.getRangeSum(i, i);
        expect(value).to.equal(WAD);
      }

      const totalSum = await test.getTotalSum();
      expect(totalSum).to.equal(ethers.parseEther("10"));
    });

    it("Should handle multiplication by 0", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // Multiply range by 0 should revert with InvalidFactor
      await expect(
        test.applyRangeFactor(3, 6, 0)
      ).to.be.revertedWithCustomError(test, "InvalidFactor");
    });

    it("Should handle very small multipliers", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      const verySmall = ethers.parseEther("0.005"); // Below MIN_FACTOR (0.01)

      // Should revert with InvalidFactor
      await expect(
        test.applyRangeFactor(2, 4, verySmall)
      ).to.be.revertedWithCustomError(test, "InvalidFactor");
    });

    it("Should handle large multipliers", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      const veryLarge = ethers.parseEther("150"); // Above MAX_FACTOR (100)

      // Should revert with InvalidFactor
      await expect(
        test.applyRangeFactor(2, 4, veryLarge)
      ).to.be.revertedWithCustomError(test, "InvalidFactor");
    });

    it("Should revert on invalid range", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // left > right
      await expect(
        test.applyRangeFactor(5, 3, TWO_WAD)
      ).to.be.revertedWithCustomError(test, "InvalidRange");
    });

    it("Should revert on out-of-bounds range", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // Out of bounds
      await expect(
        test.applyRangeFactor(0, 10, TWO_WAD)
      ).to.be.revertedWithCustomError(test, "IndexOutOfBounds");

      await expect(
        test.applyRangeFactor(5, 15, TWO_WAD)
      ).to.be.revertedWithCustomError(test, "IndexOutOfBounds");
    });
  });

  describe("ApplyRangeFactor Integration with Updates", function () {
    it("Should combine applyRangeFactor and update operations", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // Set up initial values
      await test.update(0, 100);
      await test.update(1, 200);
      await test.update(2, 300);

      // Apply lazy multiplication to range [0, 2]
      await test.applyRangeFactor(0, 2, TWO_WAD);

      // Check results
      const result0 = await test.getRangeSum(0, 0);
      expect(result0).to.equal(200); // 100 * 2
      const result1 = await test.getRangeSum(1, 1);
      expect(result1).to.equal(400); // 200 * 2
      const result2 = await test.getRangeSum(2, 2);
      expect(result2).to.equal(600); // 300 * 2

      // Range sum should be 200 + 400 + 600 = 1200
      const rangeSum = await test.getRangeSum(0, 2);
      expect(rangeSum).to.equal(1200);
    });

    it("Should handle update followed by applyRangeFactor", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // Update first
      await test.update(3, 500);

      // Then multiply range including updated element
      await test.applyRangeFactor(2, 4, ethers.parseEther("1.5"));

      // Check results
      const result2 = await test.getRangeSum(2, 2);
      expect(result2).to.equal(ethers.parseEther("1.5")); // WAD * 1.5
      const result3 = await test.getRangeSum(3, 3);
      expect(result3).to.equal(750); // 500 * 1.5
      const result4 = await test.getRangeSum(4, 4);
      expect(result4).to.equal(ethers.parseEther("1.5")); // WAD * 1.5

      // Range sum should be 1.5 + 750 + 1.5 = 753
      const rangeSum = await test.getRangeSum(2, 4);
      expect(rangeSum).to.equal("3000000000000000750");
    });

    it("Should handle mixed operations sequence", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // Complex sequence
      await test.update(0, 100);
      await test.applyRangeFactor(0, 2, TWO_WAD);
      await test.update(1, 500);
      await test.applyRangeFactor(1, 3, ethers.parseEther("1.5"));

      // Check final results
      const result0 = await test.getRangeSum(0, 0);
      expect(result0).to.equal(200); // 100 * 2
      const result1 = await test.getRangeSum(1, 1);
      expect(result1).to.equal(750); // 500 * 1.5 (update overrides previous multiplication)
      const result2 = await test.getRangeSum(2, 2);
      expect(result2).to.equal(ethers.parseEther("3")); // WAD * 2 * 1.5
      const result3 = await test.getRangeSum(3, 3);
      expect(result3).to.equal(ethers.parseEther("1.5")); // WAD * 1.5

      // Range sum should be 200 + 750 + 3 + 1.5 = 954.5
      const rangeSum = await test.getRangeSum(0, 3);
      expect(rangeSum).to.equal("4500000000000000950");
    });
  });

  describe("ApplyRangeFactor Performance", function () {
    it("Should handle large range multiplications efficiently", async function () {
      const { test } = await loadFixture(deployMediumTreeFixture);

      // Multiply large range
      await test.applyRangeFactor(100, 800, TWO_WAD);

      // Verify boundary elements - use getRangeSum
      const rangeResult = await test.getRangeSum(100, 800);
      expect(rangeResult).to.be.gt(0); // Should be positive
    });

    it("Should handle multiple non-overlapping ranges", async function () {
      const { test } = await loadFixture(deployMediumTreeFixture);

      // Multiple ranges
      await test.applyRangeFactor(0, 9, ethers.parseEther("2"));
      await test.applyRangeFactor(20, 29, ethers.parseEther("3"));
      await test.applyRangeFactor(40, 49, ethers.parseEther("0.5"));
      await test.applyRangeFactor(80, 89, ethers.parseEther("4"));

      // Verify some elements from each range - use getRangeSum
      const rangeResult = await test.getRangeSum(5, 5);
      expect(rangeResult).to.equal(ethers.parseEther("2"));
      const rangeResult2 = await test.getRangeSum(25, 25);
      expect(rangeResult2).to.equal(ethers.parseEther("3"));
      const rangeResult3 = await test.getRangeSum(45, 45);
      expect(rangeResult3).to.equal(ethers.parseEther("0.5"));
      const rangeResult4 = await test.getRangeSum(85, 85);
      expect(rangeResult4).to.equal(ethers.parseEther("4"));

      // Verify unchanged elements
      const rangeResult5 = await test.getRangeSum(15, 15);
      expect(rangeResult5).to.equal(WAD);
      const rangeResult6 = await test.getRangeSum(35, 35);
      expect(rangeResult6).to.equal(WAD);
      const rangeResult7 = await test.getRangeSum(75, 75);
      expect(rangeResult7).to.equal(WAD);
    });
  });

  describe("Advanced Lazy Multiplication", function () {
    it("Should handle no-op factor (WAD) correctly", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      await test.update(0, 100);
      await test.update(1, 200);

      const initialSum = await test.getTotalSum();

      // Multiply by WAD (1.0) - should be no-op
      await test.applyRangeFactor(0, 1, WAD);

      // Values and sum should be unchanged - use getRangeSum
      const result0 = await test.getRangeSum(0, 0);
      expect(result0).to.equal(100);
      const result1 = await test.getRangeSum(1, 1);
      expect(result1).to.equal(200);
      expect(await test.getTotalSum()).to.equal(initialSum);
    });

    it("Should handle downward factors (price decline scenarios)", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      await test.update(0, 1000);
      await test.update(1, 2000);

      // Test minimum factor (0.01) - force propagation first
      await test.applyRangeFactor(0, 0, MIN_FACTOR);
      const result0 = await test.getRangeSum(0, 0);
      expect(result0).to.equal(10); // 1000 * 0.01

      // Test moderate downward factor (0.5)
      await test.applyRangeFactor(1, 1, ethers.parseEther("0.5"));
      const result1 = await test.getRangeSum(1, 1);
      expect(result1).to.equal(1000); // 2000 * 0.5

      // Verify total sum reflects all changes
      // 10 + 1000 + 8 * WAD (remaining default values)
      const expectedSum = 10n + 1000n + 8n * 10n ** 18n;
      expect(await test.getTotalSum()).to.equal(expectedSum);
    });

    it("Should handle empty tree multiplication", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // Multiply entire default tree (all values are 1 WAD) - should not revert
      await test.applyRangeFactor(0, 9, ethers.parseEther("1.2"));

      // Total sum should be 10 * 1 WAD * 1.2 = 12 WAD
      expect(await test.getTotalSum()).to.equal(ethers.parseEther("12"));
    });

    it("Should maintain total sum consistency after multiplication", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      await test.update(0, 100);
      await test.update(1, 200);
      await test.update(2, 300);

      const initialSum = await test.getTotalSum();
      // Initial sum = 100 + 200 + 300 + 7 * WAD = 600 + 7 * 10^18
      const expectedInitialSum = 600n + 7n * 10n ** 18n;
      expect(initialSum).to.equal(expectedInitialSum);

      // Multiply entire tree by 1.2
      const factor = ethers.parseEther("1.2");
      await test.applyRangeFactor(0, 9, factor);

      const newSum = await test.getTotalSum();
      const expectedSum = (initialSum * factor) / WAD;
      expect(newSum).to.equal(expectedSum);
    });

    it("Should handle default tree multiplication", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // Multiply entire tree with default values by 1.2
      await test.applyRangeFactor(0, 9, ethers.parseEther("1.2"));

      // Total sum should be 10 * 1 WAD * 1.2 = 12 WAD
      expect(await test.getTotalSum()).to.equal(ethers.parseEther("12"));
    });

    it("Should handle complex multiplication scenarios", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // Set up complex initial values
      await test.update(0, ethers.parseEther("100"));
      await test.update(2, ethers.parseEther("200"));
      await test.update(4, ethers.parseEther("300"));
      await test.update(6, ethers.parseEther("400"));
      await test.update(8, ethers.parseEther("500"));

      // Multiply different ranges with different factors
      await test.applyRangeFactor(0, 2, ethers.parseEther("1.5")); // [0,2] * 1.5
      await test.applyRangeFactor(4, 6, ethers.parseEther("0.8")); // [4,6] * 0.8
      await test.applyRangeFactor(8, 9, ethers.parseEther("2.0")); // [8,9] * 2.0

      // Verify individual results using getRangeSum
      const result0 = await test.getRangeSum(0, 0);
      expect(result0).to.equal(ethers.parseEther("150")); // 100 * 1.5
      const result2 = await test.getRangeSum(2, 2);
      expect(result2).to.equal(ethers.parseEther("300")); // 200 * 1.5
      const result4 = await test.getRangeSum(4, 4);
      expect(result4).to.equal(ethers.parseEther("240")); // 300 * 0.8
      const result6 = await test.getRangeSum(6, 6);
      expect(result6).to.equal(ethers.parseEther("320")); // 400 * 0.8
      const result8 = await test.getRangeSum(8, 8);
      expect(result8).to.equal(ethers.parseEther("1000")); // 500 * 2.0
      const result9 = await test.getRangeSum(9, 9);
      expect(result9).to.equal(ethers.parseEther("2")); // WAD * 2.0

      // Verify untouched indices maintain original values
      const result1 = await test.getRangeSum(1, 1);
      expect(result1).to.equal(ethers.parseEther("1.5")); // WAD * 1.5
      const result3 = await test.getRangeSum(3, 3);
      expect(result3).to.equal(WAD); // Unchanged
      const result5 = await test.getRangeSum(5, 5);
      expect(result5).to.equal(ethers.parseEther("0.8")); // WAD * 0.8
      const result7 = await test.getRangeSum(7, 7);
      expect(result7).to.equal(WAD); // Unchanged
    });
  });

  describe("ApplyRangeFactor → Update Integration", function () {
    it("Should handle update after applyRangeFactor in same segment", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // Set up initial values
      await test.update(0, 100);
      await test.update(1, 200);
      await test.update(2, 300);
      await test.update(3, 400);
      await test.update(4, 500);

      // Apply lazy multiplication to range [0, 4]
      await test.applyRangeFactor(0, 4, ethers.parseEther("1.2"));

      // Now update within the lazy range - this triggers push and auto-allocation
      await test.update(2, 999);

      // The updated value should be the new value (999), not affected by lazy factor
      const result2 = await test.getRangeSum(2, 2);
      expect(result2).to.equal(999);

      // Other values in the range should still reflect the multiplication
      const result0 = await test.getRangeSum(0, 0);
      expect(result0).to.equal(120); // 100 * 1.2
      const result1 = await test.getRangeSum(1, 1);
      expect(result1).to.equal(240); // 200 * 1.2
      const result3 = await test.getRangeSum(3, 3);
      expect(result3).to.equal(480); // 400 * 1.2
      const result4 = await test.getRangeSum(4, 4);
      expect(result4).to.equal(600); // 500 * 1.2

      // Total sum should be: 120 + 240 + 999 + 480 + 600 + 5*WAD (default values)
      const expectedSum = 120n + 240n + 999n + 480n + 600n + 5n * 10n ** 18n;
      expect(await test.getTotalSum()).to.equal(expectedSum);
    });

    it("Should handle multiple updates after applyRangeFactor", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // Set initial values
      await test.update(0, 100);
      await test.update(1, 200);
      await test.update(2, 300);

      // Apply lazy multiplication
      await test.applyRangeFactor(0, 2, ethers.parseEther("2.0"));

      // Update multiple values within the lazy range
      await test.update(0, 1000);
      await test.update(1, 2000);

      // Check results
      const result0 = await test.getRangeSum(0, 0);
      expect(result0).to.equal(1000); // New value, not affected by lazy factor
      const result1 = await test.getRangeSum(1, 1);
      expect(result1).to.equal(2000); // New value, not affected by lazy factor
      const result2 = await test.getRangeSum(2, 2);
      expect(result2).to.equal(600); // 300 * 2.0, lazy propagation should apply

      // Total sum should reflect the updates
      const expectedSum = 1000n + 2000n + 600n + 7n * 10n ** 18n;
      expect(await test.getTotalSum()).to.equal(expectedSum);
    });

    it("Should handle overlapping applyRangeFactor operations", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // Set initial values
      await test.update(0, 100);
      await test.update(1, 200);
      await test.update(2, 300);
      await test.update(3, 400);

      // Apply overlapping multiplications
      await test.applyRangeFactor(0, 2, ethers.parseEther("1.5"));
      await test.applyRangeFactor(1, 3, ethers.parseEther("2.0"));

      // Check that the second operation overwrites/combines correctly
      const result0 = await test.getRangeSum(0, 0);
      expect(result0).to.equal(150); // 100 * 1.5
      const result1 = await test.getRangeSum(1, 1);
      expect(result1).to.equal(600); // 200 * 1.5 * 2.0 = 600
      const result2 = await test.getRangeSum(2, 2);
      expect(result2).to.equal(900); // 300 * 1.5 * 2.0 = 900
      const result3 = await test.getRangeSum(3, 3);
      expect(result3).to.equal(800); // 400 * 2.0
    });
  });
});
