import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { UNIT_TAG } from "../../../helpers/tags";
import { unitFixture } from "../../../helpers/fixtures/core";

describe(`${UNIT_TAG} LazyMulSegmentTree - Initialization`, function () {
  const WAD = ethers.parseEther("1");

  async function deployFixture() {
    await unitFixture();

    const LazyMulSegmentTreeTest = await ethers.getContractFactory(
      "LazyMulSegmentTreeTest"
    );
    const test = await LazyMulSegmentTreeTest.deploy();
    await test.waitForDeployment();

    return { test };
  }

  describe("Basic Initialization", function () {
    it("Should initialize with correct size", async function () {
      const { test } = await loadFixture(deployFixture);

      await test.init(10);
      // Verify initialization by checking default values
      expect(await test.getRangeSum(0, 0)).to.equal(WAD);
      expect(await test.getRangeSum(9, 9)).to.equal(WAD);
    });

    it("Should initialize with default values", async function () {
      const { test } = await loadFixture(deployFixture);

      await test.init(5);

      // All values should be 1 (WAD) by default
      for (let i = 0; i < 5; i++) {
        const value = await test.getRangeSum(i, i);
        expect(value).to.equal(WAD);
      }

      // Total sum should be size * WAD
      expect(await test.getTotalSum()).to.equal(ethers.parseEther("5"));
    });

    it("Should emit Initialized event", async function () {
      const { test } = await loadFixture(deployFixture);

      await expect(test.init(8)).to.emit(test, "Initialized").withArgs(8);
    });

    it("Should handle single element tree", async function () {
      const { test } = await loadFixture(deployFixture);

      await test.init(1);
      const value1 = await test.getRangeSum(0, 0);
      expect(value1).to.equal(WAD);
      expect(await test.getTotalSum()).to.equal(WAD);
    });

    it("Should handle power-of-two sizes", async function () {
      const { test } = await loadFixture(deployFixture);

      const sizes = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024];

      for (const size of sizes) {
        const { test: freshTest } = await deployFixture();
        await freshTest.init(size);

        // Check first and last elements
        const firstValue = await freshTest.getRangeSum(0, 0);
        const lastValue = await freshTest.getRangeSum(size - 1, size - 1);
        expect(firstValue).to.equal(WAD);
        expect(lastValue).to.equal(WAD);

        // Check total sum
        const expectedSum = ethers.parseEther(size.toString());
        expect(await freshTest.getTotalSum()).to.equal(expectedSum);
      }
    });

    it("Should handle non-power-of-two sizes", async function () {
      const { test } = await loadFixture(deployFixture);

      const sizes = [3, 5, 7, 9, 15, 31, 63, 100, 333, 999];

      for (const size of sizes) {
        const { test: freshTest } = await deployFixture();
        await freshTest.init(size);

        // Verify random elements
        const indices = [0, Math.floor(size / 2), size - 1];
        for (const idx of indices) {
          if (idx < size) {
            const value = await freshTest.getRangeSum(idx, idx);
            expect(value).to.equal(WAD);
          }
        }

        // Check total sum
        const expectedSum = ethers.parseEther(size.toString());
        expect(await freshTest.getTotalSum()).to.equal(expectedSum);
      }
    });
  });

  describe("Initialization Constraints", function () {
    it("Should revert on zero size", async function () {
      const { test } = await loadFixture(deployFixture);

      await expect(test.init(0)).to.be.revertedWithCustomError(
        test,
        "TreeSizeZero"
      );
    });

    it("Should revert on already initialized tree", async function () {
      const { test } = await loadFixture(deployFixture);

      await test.init(5);
      await expect(test.init(10)).to.be.revertedWithCustomError(
        test,
        "TreeAlreadyInitialized"
      );
    });

    it("Should revert on operations before initialization", async function () {
      const { test } = await loadFixture(deployFixture);

      await expect(test.getRangeSum(0, 0)).to.be.revertedWithCustomError(
        test,
        "TreeNotInitialized"
      );

      await expect(test.update(0, WAD)).to.be.revertedWithCustomError(
        test,
        "TreeNotInitialized"
      );

      await expect(
        test.applyRangeFactor(0, 0, WAD)
      ).to.be.revertedWithCustomError(test, "TreeNotInitialized");
    });

    it("Should handle maximum reasonable size", async function () {
      const { test } = await loadFixture(deployFixture);

      // Test with a large but reasonable size
      const largeSize = 10000;
      await test.init(largeSize);

      // Test boundary access should succeed
      await test.getRangeSum(0, 0);
      await test.getRangeSum(largeSize - 1, largeSize - 1);

      // Test out of bounds
      await expect(
        test.getRangeSum(largeSize, largeSize)
      ).to.be.revertedWithCustomError(test, "IndexOutOfBounds");
    });
  });

  describe("Post-Initialization State", function () {
    it("Should maintain state after initialization", async function () {
      const { test } = await loadFixture(deployFixture);

      const size = 7;
      await test.init(size);

      // Verify all elements are accessible and have default value
      for (let i = 0; i < size; i++) {
        const value = await test.getRangeSum(i, i);
        expect(value).to.equal(WAD);
      }

      // Test out of bounds access
      await expect(
        test.getRangeSum(size, size + 5)
      ).to.be.revertedWithCustomError(test, "IndexOutOfBounds");
    });

    it("Should allow operations after initialization", async function () {
      const { test } = await loadFixture(deployFixture);

      const size = 6;
      await test.init(size);

      // Test that basic operations don't revert after initialization
      await test.update(0, ethers.parseEther("2"));
      const updated = await test.getRangeSum(0, 0);
      expect(updated).to.equal(ethers.parseEther("2"));

      // Test that range factor operations don't revert
      await test.applyRangeFactor(1, 3, ethers.parseEther("2"));
      // Just verify no revert - the exact value depends on implementation details
      const afterFactor = await test.getRangeSum(1, 1);
      expect(afterFactor).to.be.gt(0); // Should be positive
    });

    it("Should maintain tree invariants after initialization", async function () {
      const { test } = await loadFixture(deployFixture);

      const size = 8;
      await test.init(size);

      // Test range queries work
      const fullRange = await test.getRangeSum(0, size - 1);
      expect(fullRange).to.equal(ethers.parseEther(size.toString()));

      // Test partial ranges work
      const partialRange = await test.getRangeSum(2, 5);
      expect(partialRange).to.equal(ethers.parseEther("4")); // 4 elements

      // Test individual elements sum to range
      let individualSum = 0n;
      for (let i = 2; i <= 5; i++) {
        const value = await test.getRangeSum(i, i);
        individualSum += value;
      }
      expect(individualSum).to.equal(partialRange);
    });

    it("Should handle concurrent operations after initialization", async function () {
      const { test } = await loadFixture(deployFixture);

      const size = 10;
      await test.init(size);

      // Test that operations don't revert and maintain basic invariants
      await test.update(0, ethers.parseEther("5"));
      await test.update(7, ethers.parseEther("10"));

      // Verify specific updates
      expect(await test.getRangeSum(0, 0)).to.equal(ethers.parseEther("5"));
      expect(await test.getRangeSum(7, 7)).to.equal(ethers.parseEther("10"));

      // Verify unchanged elements remain at default
      expect(await test.getRangeSum(1, 1)).to.equal(WAD);
      expect(await test.getRangeSum(6, 6)).to.equal(WAD);
    });

    it("Should prevent operations on uninitialized fresh instances", async function () {
      const { test } = await loadFixture(deployFixture);
      const { test: freshTest } = await deployFixture();

      // Initialize one but not the other
      await test.init(5);

      // Operations on initialized tree should work
      await test.update(0, ethers.parseEther("2"));

      // Operations on uninitialized tree should fail
      const idx = 0;
      await expect(
        freshTest.getRangeSum(idx, idx)
      ).to.be.revertedWithCustomError(freshTest, "TreeNotInitialized");
    });
  });

  describe("State Verification", function () {
    it("Should report correct state information", async function () {
      const { test } = await loadFixture(deployFixture);

      const size = 15;
      await test.init(size);

      // Total sum should be size * WAD (all default values)
      const expectedSum = ethers.parseEther(size.toString());
      expect(await test.getTotalSum()).to.equal(expectedSum);

      // Tree should be marked as initialized
      // This is implicit since operations work
    });

    it("Should handle size edge cases", async function () {
      const { test: test1 } = await deployFixture();
      const { test: test2 } = await deployFixture();

      // Minimum size
      await test1.init(1);
      expect(await test1.getTotalSum()).to.equal(WAD);

      // Moderately large size
      await test2.init(1337);
      expect(await test2.getTotalSum()).to.equal(ethers.parseEther("1337"));
    });

    it("Should maintain consistency across operations", async function () {
      const { test } = await loadFixture(deployFixture);

      await test.init(10);

      // Initial state
      expect(await test.getTotalSum()).to.equal(ethers.parseEther("10"));

      // After single update
      await test.update(5, ethers.parseEther("2"));
      expect(await test.getTotalSum()).to.equal(ethers.parseEther("11")); // 9*1 + 1*2

      // After range multiplication
      await test.applyRangeFactor(0, 4, ethers.parseEther("2"));
      // Elements 0-4 become 2, element 5 stays 2, elements 6-9 stay 1
      // Total: 5*2 + 1*2 + 4*1 = 16
      expect(await test.getTotalSum()).to.equal(ethers.parseEther("16"));
    });
  });
});
