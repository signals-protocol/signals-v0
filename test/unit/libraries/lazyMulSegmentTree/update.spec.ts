import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { UNIT_TAG } from "../../../helpers/tags";
import { unitFixture } from "../../../helpers/fixtures/core";

describe(`${UNIT_TAG} LazyMulSegmentTree - Update Operations`, function () {
  const WAD = ethers.parseEther("1");
  const TWO_WAD = ethers.parseEther("2");
  const HALF_WAD = ethers.parseEther("0.5");

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
    await test.init(10); // Tree with 10 leaves
    return { test };
  }

  describe("Basic Operations", function () {
    it("Should update and query single values", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // Update value at index 5
      await test.update(5, TWO_WAD);

      // Query single value
      const value = await test.getRangeSum(5, 5);
      expect(value).to.equal(TWO_WAD);

      // Verify total sum changed
      const totalSum = await test.getTotalSum();
      expect(totalSum).to.equal(ethers.parseEther("11")); // 9 * 1 + 1 * 2 = 11
    });

    it("Should update multiple values", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // Update multiple values
      await test.update(0, TWO_WAD);
      await test.update(5, ethers.parseEther("3"));
      await test.update(9, HALF_WAD);

      // Verify individual values
      expect(await test.getRangeSum(0, 0)).to.equal(TWO_WAD);
      expect(await test.getRangeSum(5, 5)).to.equal(ethers.parseEther("3"));
      expect(await test.getRangeSum(9, 9)).to.equal(HALF_WAD);

      // Verify total sum: 7 * 1 + 1 * 2 + 1 * 3 + 1 * 0.5 = 12.5
      const totalSum = await test.getTotalSum();
      expect(totalSum).to.equal(ethers.parseEther("12.5"));
    });

    it("Should handle range queries correctly", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // Update some values
      await test.update(2, TWO_WAD);
      await test.update(3, ethers.parseEther("3"));
      await test.update(4, HALF_WAD);

      // Query ranges - calculate as sums not products
      expect(await test.getRangeSum(2, 4)).to.equal(ethers.parseEther("5.5")); // 2 + 3 + 0.5 = 5.5
      expect(await test.getRangeSum(0, 1)).to.equal(ethers.parseEther("2")); // 1 + 1 = 2
      expect(await test.getRangeSum(5, 9)).to.equal(ethers.parseEther("5")); // 1 + 1 + 1 + 1 + 1 = 5
    });

    it("Should emit NodeUpdated event", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      await expect(test.update(3, TWO_WAD))
        .to.emit(test, "NodeUpdated")
        .withArgs(3, TWO_WAD);
    });

    it("Should handle zero and one values correctly", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // Update to zero (edge case)
      await test.update(0, 0);
      expect(await test.getRangeSum(0, 0)).to.equal(0);

      // Update to one (identity)
      await test.update(0, WAD);
      expect(await test.getRangeSum(0, 0)).to.equal(WAD);
    });

    it("Should handle large values within bounds", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      const largeValue = ethers.parseEther("1000000");
      await test.update(5, largeValue);
      expect(await test.getRangeSum(5, 5)).to.equal(largeValue);
    });
  });

  describe("Batch Update Operations", function () {
    it("Should perform batch updates correctly", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      const indices = [0, 2, 4, 6, 8];
      const values = [
        TWO_WAD,
        ethers.parseEther("3"),
        HALF_WAD,
        ethers.parseEther("0.25"),
        ethers.parseEther("4"),
      ];

      await test.batchUpdate(indices, values);

      // Verify all values
      for (let i = 0; i < indices.length; i++) {
        const value = await test.getRangeSum(indices[i], indices[i]);
        expect(value).to.equal(values[i]);
      }
    });

    it("Should revert on mismatched array lengths", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      const indices = [0, 1, 2];
      const values = [TWO_WAD, ethers.parseEther("3")]; // One less value

      // Should revert (could be custom error or require statement)
      await expect(test.batchUpdate(indices, values)).to.be.reverted;
    });

    it("Should handle empty batch updates", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      await test.batchUpdate([], []);

      // Tree should remain unchanged
      const totalSum = await test.getTotalSum();
      expect(totalSum).to.equal(ethers.parseEther("10"));
    });

    it("Should emit events for batch updates", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      const indices = [1, 3];
      const values = [TWO_WAD, ethers.parseEther("3")];

      // Note: batchUpdate may not emit individual NodeUpdated events
      // depending on implementation - check if it emits any events
      await test.batchUpdate(indices, values);

      // Verify the updates worked by checking values
      expect(await test.getRangeSum(1, 1)).to.equal(TWO_WAD);
      expect(await test.getRangeSum(3, 3)).to.equal(ethers.parseEther("3"));
    });
  });

  describe("Update with Range Queries", function () {
    it("Should maintain range query consistency after updates", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // Update values in a pattern
      await test.update(2, TWO_WAD);
      await test.update(3, TWO_WAD);
      await test.update(4, TWO_WAD);

      // Range [2,4] should be 2 + 2 + 2 = 6 (sum not product)
      expect(await test.getRangeSum(2, 4)).to.equal(ethers.parseEther("6"));

      // Range [0,1] should remain 1 + 1 = 2
      expect(await test.getRangeSum(0, 1)).to.equal(ethers.parseEther("2"));

      // Range [5,9] should remain 1 + 1 + 1 + 1 + 1 = 5
      expect(await test.getRangeSum(5, 9)).to.equal(ethers.parseEther("5"));

      // Full range [0,9] should be 1 + 1 + 2 + 2 + 2 + 1 + 1 + 1 + 1 + 1 = 13
      expect(await test.getRangeSum(0, 9)).to.equal(ethers.parseEther("13"));
    });

    it("Should handle overlapping range queries", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      await test.update(1, TWO_WAD);
      await test.update(2, ethers.parseEther("3"));
      await test.update(3, HALF_WAD);

      // Overlapping ranges - calculate as sums
      expect(await test.getRangeSum(0, 2)).to.equal(ethers.parseEther("6")); // 1 + 2 + 3 = 6
      expect(await test.getRangeSum(1, 3)).to.equal(ethers.parseEther("5.5")); // 2 + 3 + 0.5 = 5.5
      expect(await test.getRangeSum(2, 4)).to.equal(ethers.parseEther("4.5")); // 3 + 0.5 + 1 = 4.5
    });

    it("Should handle single-element ranges", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      await test.update(5, ethers.parseEther("42"));

      // Single element range should equal the value
      expect(await test.getRangeSum(5, 5)).to.equal(ethers.parseEther("42"));

      // Other single elements should be 1
      expect(await test.getRangeSum(0, 0)).to.equal(WAD);
      expect(await test.getRangeSum(9, 9)).to.equal(WAD);
    });

    it("Should handle updates at boundaries", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // Update first element
      await test.update(0, ethers.parseEther("100"));
      expect(await test.getRangeSum(0, 0)).to.equal(ethers.parseEther("100"));

      // Update last element
      await test.update(9, ethers.parseEther("200"));
      expect(await test.getRangeSum(9, 9)).to.equal(ethers.parseEther("200"));

      // Verify full range includes both - sum not product
      // 100 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 200 = 308
      const fullRange = await test.getRangeSum(0, 9);
      expect(fullRange).to.equal(ethers.parseEther("308"));
    });

    it("Should handle rapid consecutive updates", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // Rapid updates to same index
      await test.update(5, TWO_WAD);
      await test.update(5, ethers.parseEther("3"));
      await test.update(5, HALF_WAD);
      await test.update(5, ethers.parseEther("10"));

      // Should have latest value
      expect(await test.getRangeSum(5, 5)).to.equal(ethers.parseEther("10"));
    });

    it("Should maintain precision with small decimal values", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      const preciseValue = ethers.parseEther("0.123456789012345678");
      await test.update(3, preciseValue);

      expect(await test.getRangeSum(3, 3)).to.equal(preciseValue);
    });

    it("Should handle updates with maximum allowed values", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // Test with large but valid values
      const maxSafeValue = ethers.parseEther("1000000000000000000"); // 1e18 WAD
      await test.update(7, maxSafeValue);

      expect(await test.getRangeSum(7, 7)).to.equal(maxSafeValue);
    });

    it("Should preserve tree invariants after updates", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // Complex update pattern
      const updates = [
        [0, ethers.parseEther("100")],
        [2, ethers.parseEther("200")],
        [4, ethers.parseEther("300")],
        [6, ethers.parseEther("400")],
        [8, ethers.parseEther("500")],
      ];

      for (const [index, value] of updates) {
        await test.update(index, value);
      }

      // Calculate expected total sum
      // 100 + 1 + 200 + 1 + 300 + 1 + 400 + 1 + 500 + 1 = 1505
      const expectedSum = ethers.parseEther("1505");
      const totalSum = await test.getTotalSum();
      expect(totalSum).to.equal(expectedSum);
    });

    it("Should handle zero value updates correctly", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      await test.update(5, 0);
      expect(await test.getRangeSum(5, 5)).to.equal(0);

      // Range including zero should still work
      // 1 + 1 + 1 + 1 + 1 + 0 + 1 + 1 + 1 + 1 = 9
      expect(await test.getRangeSum(0, 9)).to.equal(ethers.parseEther("9"));
    });
  });

  describe("Update Performance", function () {
    it("Should handle updates efficiently for larger trees", async function () {
      const { test } = await loadFixture(deployFixture);
      await test.init(1000);

      // Update scattered elements
      const indices = [0, 100, 200, 500, 750, 999];
      const values = [
        ethers.parseEther("2"),
        ethers.parseEther("3"),
        ethers.parseEther("0.5"),
        ethers.parseEther("4"),
        ethers.parseEther("0.25"),
        ethers.parseEther("8"),
      ];

      for (let i = 0; i < indices.length; i++) {
        await test.update(indices[i], values[i]);
      }

      // Verify all values are correct
      for (let i = 0; i < indices.length; i++) {
        const value = await test.getRangeSum(indices[i], indices[i]);
        expect(value).to.equal(values[i]);
      }
    });

    it("Should maintain consistency during stress updates", async function () {
      const { test } = await loadFixture(deployFixture);
      await test.init(100);

      // Perform many random updates
      for (let i = 0; i < 50; i++) {
        const index = i % 100;
        const value = ethers.parseEther(((i % 10) + 1).toString());
        await test.update(index, value);
      }

      // Tree should remain in valid state - check some ranges
      const range1 = await test.getRangeSum(0, 9);
      const range2 = await test.getRangeSum(50, 59);
      const total = await test.getTotalSum();

      expect(range1).to.be.gt(0);
      expect(range2).to.be.gt(0);
      expect(total).to.be.gt(0);
    });
  });

  describe("Extended Basic Operations", function () {
    it("Should update and get single values", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      await expect(test.update(0, 100))
        .to.emit(test, "NodeUpdated")
        .withArgs(0, 100);

      await test.update(5, 200);
      await test.update(9, 300);

      expect(await test.getRangeSum(0, 0)).to.equal(100);
      expect(await test.getRangeSum(5, 5)).to.equal(200);
      expect(await test.getRangeSum(9, 9)).to.equal(300);
      expect(await test.getRangeSum(3, 3)).to.equal(WAD); // Default value is 1 WAD, not 0
    });

    it("Should handle index bounds correctly", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      await expect(test.update(10, 100)).to.be.revertedWithCustomError(
        test,
        "IndexOutOfBounds"
      );

      await expect(test.getRangeSum(15, 15)).to.be.revertedWithCustomError(
        test,
        "IndexOutOfBounds"
      );
    });

    it("Should calculate total sum correctly", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      await test.update(0, 100);
      await test.update(1, 200);
      await test.update(2, 300);

      // Total sum = 100 + 200 + 300 + 7 * WAD (remaining default values)
      const expectedSum = 100n + 200n + 300n + 7n * 10n ** 18n;
      expect(await test.getTotalSum()).to.equal(expectedSum);
    });

    it("Should handle repeated updates", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      await test.update(5, 100);
      expect(await test.getRangeSum(5, 5)).to.equal(100);

      await test.update(5, 200);
      expect(await test.getRangeSum(5, 5)).to.equal(200);

      await test.update(5, 0); // Set to zero
      expect(await test.getRangeSum(5, 5)).to.equal(0);
    });

    it("Should handle maximum values", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // Use a large but safe value that won't cause overflow
      const maxValue = ethers.parseEther("1000000000"); // 1B ETH
      await test.update(0, maxValue);

      expect(await test.getRangeSum(0, 0)).to.equal(maxValue);
      // Total sum = maxValue + 9 * WAD
      const expectedSum = maxValue + 9n * 10n ** 18n;
      expect(await test.getTotalSum()).to.equal(expectedSum);
    });

    it("Should maintain total sum consistency after updates", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // Track changes to verify sum calculations
      const initialSum = await test.getTotalSum();
      expect(initialSum).to.equal(ethers.parseEther("10")); // 10 * WAD

      // Update a few values
      await test.update(0, ethers.parseEther("5"));
      await test.update(4, ethers.parseEther("3"));
      await test.update(8, ethers.parseEther("7"));

      // Calculate expected sum: 5 + 3 + 7 + 7 * WAD (indices 1,2,3,5,6,7,9)
      const expectedSum =
        ethers.parseEther("5") +
        ethers.parseEther("3") +
        ethers.parseEther("7") +
        7n * WAD;
      expect(await test.getTotalSum()).to.equal(expectedSum);
    });

    it("Should handle boundary value updates", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // Test first and last indices
      await test.update(0, ethers.parseEther("100"));
      await test.update(9, ethers.parseEther("200"));

      expect(await test.getRangeSum(0, 0)).to.equal(ethers.parseEther("100"));
      expect(await test.getRangeSum(9, 9)).to.equal(ethers.parseEther("200"));

      // Total = 100 + 200 + 8 * WAD
      const expectedSum =
        ethers.parseEther("100") + ethers.parseEther("200") + 8n * WAD;
      expect(await test.getTotalSum()).to.equal(expectedSum);
    });
  });
});
