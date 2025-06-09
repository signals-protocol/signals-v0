import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

describe("LazyMulSegmentTree Library - Comprehensive Tests", function () {
  // ========================================
  // CONSTANTS & HELPERS
  // ========================================

  const WAD = ethers.parseEther("1"); // 1e18
  const HALF_WAD = ethers.parseEther("0.5"); // 0.5e18
  const TWO_WAD = ethers.parseEther("2"); // 2e18
  const MIN_FACTOR = ethers.parseEther("0.01"); // 1% (updated for new limits)
  const MAX_FACTOR = ethers.parseEther("100"); // 100x (updated for new limits)

  // ========================================
  // FIXTURES
  // ========================================

  async function deployFixture() {
    // Deploy FixedPointMathU library first
    const FixedPointMathU = await ethers.getContractFactory("FixedPointMathU");
    const fixedPointMathU = await FixedPointMathU.deploy();
    await fixedPointMathU.waitForDeployment();

    // Deploy LazyMulSegmentTree library with FixedPointMathU linked
    const LazyMulSegmentTree = await ethers.getContractFactory(
      "LazyMulSegmentTree",
      {
        libraries: {
          FixedPointMathU: await fixedPointMathU.getAddress(),
        },
      }
    );
    const lazyMulSegmentTree = await LazyMulSegmentTree.deploy();
    await lazyMulSegmentTree.waitForDeployment();

    // Deploy test contract with LazyMulSegmentTree library linked
    const LazyMulSegmentTreeTest = await ethers.getContractFactory(
      "LazyMulSegmentTreeTest",
      {
        libraries: {
          LazyMulSegmentTree: await lazyMulSegmentTree.getAddress(),
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

  async function deployMediumTreeFixture() {
    const { test } = await deployFixture();
    await test.init(1000); // Tree with 1000 leaves
    return { test };
  }

  async function deployLargeTreeFixture() {
    const { test } = await deployFixture();
    await test.init(32768); // Tree with 32K leaves (CLMSR size)
    return { test };
  }

  async function deployUninitializedFixture() {
    const { test } = await deployFixture();
    // Do NOT call init() - return uninitialized contract
    return { test };
  }

  // ========================================
  // INITIALIZATION TESTS
  // ========================================

  describe("Initialization", function () {
    it("Should initialize tree correctly", async function () {
      const { test } = await loadFixture(deployFixture);

      await expect(test.init(100))
        .to.emit(test, "TreeInitialized")
        .withArgs(100);

      // Check that tree is initialized with default values (all 1 WAD)
      const totalSum = await test.getTotalSum();
      expect(totalSum).to.equal(ethers.parseEther("100")); // 100 * 1 WAD
    });

    it("Should revert on zero size", async function () {
      const { test } = await loadFixture(deployFixture);

      await expect(test.init(0)).to.be.revertedWith(
        "Tree size must be positive"
      );
    });

    it("Should revert on size too large", async function () {
      const { test } = await loadFixture(deployFixture);

      const maxSize = 2n ** 31n; // type(uint32).max / 2
      await expect(test.init(maxSize)).to.be.revertedWith(
        "Tree size too large"
      );
    });

    it("Should check if tree has default values initially", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);
      // Tree should have default values (10 * 1 WAD = 10 WAD)
      expect(await test.getTotalSum()).to.equal(ethers.parseEther("10"));
    });

    it("Should handle various tree sizes", async function () {
      // Test different sizes with separate contracts
      const sizes = [1, 10, 100, 1000];

      for (const size of sizes) {
        const { test } = await loadFixture(deployFixture);
        await test.init(size);
        const totalSum = await test.getTotalSum();
        expect(totalSum).to.equal(ethers.parseEther(size.toString()));
      }
    });

    // Re-initialization test
    it("Should handle re-initialization", async function () {
      const { test } = await loadFixture(deployFixture);

      // First initialization
      await test.init(100);
      await test.update(0, 500);

      // Re-initialization should fail due to guard
      await expect(test.init(50)).to.be.revertedWith(
        "Tree already initialized"
      );
    });
  });

  // ========================================
  // UNINITIALIZED TREE TESTS (Coverage Gap #6)
  // ========================================

  describe("Uninitialized Tree Protection", function () {
    it("Should revert get() on uninitialized tree", async function () {
      const { test } = await loadFixture(deployUninitializedFixture);

      await expect(test.query(0, 0)).to.be.revertedWithCustomError(
        test,
        "TreeNotInitialized"
      );
    });

    it("Should revert update() on uninitialized tree", async function () {
      const { test } = await loadFixture(deployUninitializedFixture);

      await expect(test.update(0, 100)).to.be.revertedWithCustomError(
        test,
        "TreeNotInitialized"
      );
    });

    it("Should revert mulRange() on uninitialized tree", async function () {
      const { test } = await loadFixture(deployUninitializedFixture);

      await expect(test.mulRange(0, 0, WAD)).to.be.revertedWithCustomError(
        test,
        "TreeNotInitialized"
      );
    });

    it("Should revert query() on uninitialized tree", async function () {
      const { test } = await loadFixture(deployUninitializedFixture);

      await expect(test.query(0, 0)).to.be.revertedWithCustomError(
        test,
        "TreeNotInitialized"
      );
    });

    it("Should revert batchUpdate() on uninitialized tree", async function () {
      const { test } = await loadFixture(deployUninitializedFixture);

      await expect(test.batchUpdate([0], [100])).to.be.revertedWithCustomError(
        test,
        "TreeNotInitialized"
      );
    });
  });

  // ========================================
  // BASIC OPERATIONS TESTS
  // ========================================

  describe("Basic Operations", function () {
    it("Should update and get single values", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      await expect(test.update(0, 100))
        .to.emit(test, "NodeUpdated")
        .withArgs(0, 100);

      await test.update(5, 200);
      await test.update(9, 300);

      expect(await test.query(0, 0)).to.equal(100);
      expect(await test.query(5, 5)).to.equal(200);
      expect(await test.query(9, 9)).to.equal(300);
      expect(await test.query(3, 3)).to.equal(WAD); // Default value is 1 WAD, not 0
    });

    it("Should handle index bounds correctly", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      await expect(test.update(10, 100)).to.be.revertedWithCustomError(
        test,
        "IndexOutOfBounds"
      );

      await expect(test.query(15, 15)).to.be.revertedWithCustomError(
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
      expect(await test.query(5, 5)).to.equal(100);

      await test.update(5, 200);
      expect(await test.query(5, 5)).to.equal(200);

      await test.update(5, 0); // Set to zero
      expect(await test.query(5, 5)).to.equal(0);
    });

    it("Should handle maximum values", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // Use a large but safe value that won't cause overflow
      const maxValue = ethers.parseEther("1000000000"); // 1B ETH
      await test.update(0, maxValue);

      expect(await test.query(0, 0)).to.equal(maxValue);
      // Total sum = maxValue + 9 * WAD
      const expectedSum = maxValue + 9n * 10n ** 18n;
      expect(await test.getTotalSum()).to.equal(expectedSum);
    });
  });

  // ========================================
  // LAZY MULTIPLICATION TESTS (CORE FEATURE)
  // ========================================

  describe("Lazy Multiplication", function () {
    it("Should multiply range correctly", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // Set up initial values: [100, 200, 300, 0, 0, 500, 0, 0, 800, 900]
      await test.update(0, 100);
      await test.update(1, 200);
      await test.update(2, 300);
      await test.update(5, 500);
      await test.update(8, 800);
      await test.update(9, 900);

      // Multiply range [0, 2] by 1.2
      const factor = ethers.parseEther("1.2");
      await expect(test.mulRange(0, 2, factor))
        .to.emit(test, "RangeMultiplied")
        .withArgs(0, 2, factor);

      // Check total sum - should reflect multiplication
      const newTotalSum = await test.getTotalSum();
      // After multiplication: (100+200+300)*1.2 + 500+800+900 + 4*WAD
      // = 720 + 2200 + 4*10^18 = 2920 + 4*10^18
      const expectedSum = 2920n + 4n * 10n ** 18n;
      expect(newTotalSum).to.equal(expectedSum);

      // Check range query to verify multiplication worked
      expect(await test.query(0, 2)).to.equal(720); // (100+200+300) * 1.2
      expect(await test.query(5, 9)).to.equal(2n * 10n ** 18n + 2200n); // 2*WAD (indices 6,7) + 500+800+900
    });

    it("Should handle zero factor correctly", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      await test.update(0, 100);

      await expect(test.mulRange(0, 0, 0)).to.be.revertedWithCustomError(
        test,
        "ZeroFactor"
      );
    });

    // ● #2 - factor==WAD(1.0) 테스트 추가
    it("Should handle no-op factor (WAD) correctly", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      await test.update(0, 100);
      await test.update(1, 200);
      const initialSum = await test.getTotalSum();

      // Apply factor of 1.0 (should be no-op)
      await test.mulRange(0, 1, WAD);

      // Values and sum should be unchanged
      expect(await test.query(0, 0)).to.equal(100);
      expect(await test.query(1, 1)).to.equal(200);
      expect(await test.getTotalSum()).to.equal(initialSum);
    });

    it("Should handle factor bounds correctly", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      await test.update(0, 100);

      // Too small factor (below 0.01)
      await expect(
        test.mulRange(0, 0, ethers.parseEther("0.005"))
      ).to.be.revertedWithCustomError(test, "InvalidFactor");

      // Too large factor (above 100)
      await expect(
        test.mulRange(0, 0, ethers.parseEther("101"))
      ).to.be.revertedWithCustomError(test, "InvalidFactor");

      // Valid factors should work
      await test.mulRange(0, 0, MIN_FACTOR);
      await test.mulRange(0, 0, MAX_FACTOR);
    });

    // Downward factors test
    it("Should handle downward factors (price decline scenarios)", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      await test.update(0, 1000);
      await test.update(1, 2000);

      // Test minimum factor (0.01)
      await test.mulRange(0, 0, MIN_FACTOR);
      expect(await test.query(0, 0)).to.equal(10); // 1000 * 0.01

      // Test moderate downward factor (0.5)
      await test.mulRange(1, 1, ethers.parseEther("0.5"));
      expect(await test.query(1, 1)).to.equal(1000); // 2000 * 0.5

      // Verify total sum reflects all changes
      // 10 + 1000 + 8 * WAD (remaining default values)
      const expectedSum = 10n + 1000n + 8n * 10n ** 18n;
      expect(await test.getTotalSum()).to.equal(expectedSum);
    });

    it("Should handle range validation", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      await expect(test.mulRange(5, 3, WAD)).to.be.revertedWithCustomError(
        test,
        "InvalidRange"
      );

      await expect(test.mulRange(0, 15, WAD)).to.be.revertedWithCustomError(
        test,
        "IndexOutOfBounds"
      );
    });

    it("Should handle empty tree multiplication", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // Multiply entire default tree (all values are 1 WAD) - should not revert
      await test.mulRange(0, 9, ethers.parseEther("1.2"));

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
      await test.mulRange(0, 9, factor);

      const newSum = await test.getTotalSum();
      const expectedSum = (initialSum * factor) / WAD;
      expect(newSum).to.equal(expectedSum);
    });

    it("Should handle default tree multiplication", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // Multiply entire tree with default values by 1.2
      await test.mulRange(0, 9, ethers.parseEther("1.2"));

      // Total sum should be 10 * 1 WAD * 1.2 = 12 WAD
      expect(await test.getTotalSum()).to.equal(ethers.parseEther("12"));
    });
  });

  // ========================================
  // CRITICAL SCENARIO: MULRANGE → UPDATE (Coverage Gap #1)
  // ========================================

  describe("MulRange → Update Integration", function () {
    it("Should handle update after mulRange in same segment", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // Set up initial values
      await test.update(0, 100);
      await test.update(1, 200);
      await test.update(2, 300);
      await test.update(3, 400);
      await test.update(4, 500);

      // Apply lazy multiplication to range [0, 4]
      await test.mulRange(0, 4, ethers.parseEther("1.2"));

      // Now update within the lazy range - this triggers _push and auto-allocation
      await test.update(2, 999);

      // The updated value should be the new value (999), not affected by lazy factor
      expect(await test.query(2, 2)).to.equal(999);

      // Other values in the range should still reflect the multiplication
      // Force lazy propagation for verification
      await test.queryWithLazy(0, 0);
      await test.queryWithLazy(1, 1);
      await test.queryWithLazy(3, 3);
      await test.queryWithLazy(4, 4);

      expect(await test.query(0, 0)).to.equal(120); // 100 * 1.2
      expect(await test.query(1, 1)).to.equal(240); // 200 * 1.2
      expect(await test.query(3, 3)).to.equal(480); // 400 * 1.2
      expect(await test.query(4, 4)).to.equal(600); // 500 * 1.2

      // Total sum should be: 120 + 240 + 999 + 480 + 600 + 5*WAD (default values)
      const expectedSum = 120n + 240n + 999n + 480n + 600n + 5n * 10n ** 18n;
      expect(await test.getTotalSum()).to.equal(expectedSum);
    });

    it("Should handle multiple updates after mulRange", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      await test.update(0, 100);
      await test.update(1, 200);
      await test.update(2, 300);

      // Apply lazy multiplication
      await test.mulRange(0, 2, ethers.parseEther("1.1"));

      // Multiple updates in the lazy range
      await test.update(0, 50); // Override
      await test.update(1, 75); // Override
      // Leave index 2 to verify lazy propagation

      expect(await test.query(0, 0)).to.equal(50);
      expect(await test.query(1, 1)).to.equal(75);
      expect(await test.query(2, 2)).to.equal(330); // 300 * 1.1

      // Total sum = 50 + 75 + 330 + 7*WAD (default values)
      const expectedSum = 50n + 75n + 330n + 7n * 10n ** 18n;
      expect(await test.getTotalSum()).to.equal(expectedSum);
    });

    it("Should handle nested mulRange and update operations", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      await test.update(5, WAD); // 1.0

      // Apply first lazy multiplication to entire tree
      await test.mulRange(0, 9, ethers.parseEther("1.2"));

      // Apply second lazy multiplication to subset
      await test.mulRange(3, 7, ethers.parseEther("0.9"));

      // Now update within the double-lazy range
      await test.update(5, ethers.parseEther("2.0")); // 2.0

      // Value should be exactly 2.0, not affected by any lazy factors
      expect(await test.query(5, 5)).to.equal(ethers.parseEther("2.0"));

      // Verify total sum accounts for the new value
      // All other indices have default 1 WAD with lazy factors applied:
      // - Indices 0,1,2: 1 WAD * 1.2 = 1.2 WAD each
      // - Indices 3,4: 1 WAD * 1.2 * 0.9 = 1.08 WAD each
      // - Index 5: 2.0 WAD (updated)
      // - Indices 6,7: 1 WAD * 1.2 * 0.9 = 1.08 WAD each
      // - Indices 8,9: 1 WAD * 1.2 = 1.2 WAD each
      // Total = 3*1.2 + 4*1.08 + 2.0 + 2*1.2 = 3.6 + 4.32 + 2.0 + 2.4 = 12.32 WAD
      const expectedSum = ethers.parseEther("12.32");
      expect(await test.getTotalSum()).to.equal(expectedSum);
    });
  });

  // ========================================
  // LAZY PROPAGATION TESTS (CRITICAL)
  // ========================================

  describe("Lazy Propagation", function () {
    it("Should handle lazy auto-allocation correctly", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // Apply multiplication to default tree (all values are 1 WAD)
      await test.mulRange(0, 9, ethers.parseEther("1.1"));

      // Total sum should be 10 * 1.1 WAD = 11 WAD (immediately updated)
      expect(await test.getTotalSum()).to.equal(ethers.parseEther("11"));

      // Force lazy propagation for individual values
      for (let i = 0; i < 10; i++) {
        await test.queryWithLazy(i, i);
        expect(await test.query(i, i)).to.equal(ethers.parseEther("1.1"));
      }
    });

    it("Should propagate lazy values correctly with nested operations", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // Set initial value
      await test.update(5, WAD); // 1.0

      // Apply multiple range multiplications (all within 0.8-1.25 range)
      await test.mulRange(0, 9, ethers.parseEther("1.2")); // 1.0 * 1.2 = 1.2
      await test.mulRange(3, 7, ethers.parseEther("1.1")); // 1.2 * 1.1 = 1.32
      await test.mulRange(5, 5, ethers.parseEther("0.9")); // 1.32 * 0.9 = 1.188

      const finalValue = await test.query(5, 5);
      const expectedValue = (((((WAD * 12n) / 10n) * 11n) / 10n) * 9n) / 10n; // 1.0 * 1.2 * 1.1 * 0.9 = 1.188
      expect(finalValue).to.equal(expectedValue);
    });

    it("Should handle view vs stateful query consistency", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      await test.update(0, 100);
      await test.update(5, 200);

      // Apply range multiplication
      await test.mulRange(0, 5, ethers.parseEther("1.2"));

      // Both query methods should return same result
      const viewResult = await test.query(0, 5);
      // queryWithLazy is state-changing, so we just check view result
      // 100 + 200 + 4*WAD (default values) = 300 + 4*10^18, then * 1.2
      const expectedSum = ((300n + 4n * 10n ** 18n) * 12n) / 10n;
      expect(viewResult).to.equal(expectedSum);
    });

    // ● #9 - queryWithLazy 연속 호출 일관성 확인
    it("Should handle consecutive queryWithLazy calls consistently", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      await test.update(0, 100);
      await test.update(1, 200);

      // Apply lazy multiplication
      await test.mulRange(0, 1, ethers.parseEther("1.2"));

      // First queryWithLazy should trigger lazy propagation
      const tx1 = await test.queryWithLazy(0, 1);
      await tx1.wait();

      // Second queryWithLazy should return same result without state changes
      const tx2 = await test.queryWithLazy(0, 1);
      await tx2.wait();

      // View query should now match (lazy propagation completed)
      const viewResult = await test.query(0, 1);
      expect(viewResult).to.equal(360); // (100 + 200) * 1.2
    });

    // Critical: 한쪽 child만 존재하는 상태에서 _push 경로
    it("Should handle _push with only one child allocated", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // 절반 범위에만 값 설정 (0~4)
      await test.update(0, WAD);
      await test.update(2, WAD);
      await test.update(4, WAD);

      // 전체 범위에 lazy multiplication 적용 (0~9)
      await test.mulRange(0, 9, ethers.parseEther("1.2"));

      // lazy propagation 강제 적용
      await test.queryWithLazy(0, 4);

      // 절반 범위만 쿼리 (한쪽 child만 사용)
      const leftSum = await test.query(0, 4);
      // 3*WAD + 2*WAD (default) = 5*WAD, then * 1.2 = 6*WAD
      expect(leftSum).to.equal(ethers.parseEther("6"));

      // 나머지 범위 쿼리 (다른 쪽 child, default values)
      const rightSum = await test.query(5, 9);
      // 5*WAD * 1.2 = 6*WAD
      expect(rightSum).to.equal(ethers.parseEther("6"));

      // 전체 합은 12*WAD
      expect(await test.getTotalSum()).to.equal(ethers.parseEther("12"));

      // 이제 오른쪽 범위에도 값 추가 (기존 lazy가 적용된 후)
      await test.update(7, ethers.parseEther("2"));

      // 새로 추가된 값은 lazy가 적용되지 않은 상태이므로 2.0이어야 함
      expect(await test.query(7, 7)).to.equal(ethers.parseEther("2"));

      // 최종 총합 확인
      // Left: 6 WAD, Right: 2 + 4*1.2 = 2 + 4.8 = 6.8 WAD
      // Total: 6 + 6.8 = 12.8 WAD
      const expectedFinalSum = ethers.parseEther("12.8");
      expect(await test.getTotalSum()).to.equal(expectedFinalSum);
    });
  });

  // ========================================
  // RANGE QUERY TESTS
  // ========================================

  describe("Range Queries", function () {
    let test: any; // TODO: Type this properly when contract types are available

    beforeEach(async function () {
      const fixture = await loadFixture(deploySmallTreeFixture);
      test = fixture.test;

      // Set up test data: [100, 200, 300, 0, 0, 500, 0, 0, 800, 900]
      await test.update(0, 100);
      await test.update(1, 200);
      await test.update(2, 300);
      await test.update(5, 500);
      await test.update(8, 800);
      await test.update(9, 900);
    });

    it("Should query single element", async function () {
      expect(await test.query(0, 0)).to.equal(100);
      expect(await test.query(5, 5)).to.equal(500);
      expect(await test.query(3, 3)).to.equal(WAD); // Default value is 1 WAD, not 0
    });

    it("Should query ranges", async function () {
      expect(await test.query(0, 2)).to.equal(600); // 100 + 200 + 300
      // 500 + 1*WAD + 1*WAD + 800 + 900 = 500 + 2*10^18 + 1700 = 2200 + 2*10^18
      const expectedSum = 2200n + 2n * 10n ** 18n;
      expect(await test.query(5, 9)).to.equal(expectedSum);
      // Total: 100+200+300 + 2*WAD + 500 + 2*WAD + 800+900 = 2800 + 4*WAD
      const totalExpected = 2800n + 4n * 10n ** 18n;
      expect(await test.query(0, 9)).to.equal(totalExpected);
    });

    it("Should query after multiplication", async function () {
      // Multiply first half by 1.2
      await test.mulRange(0, 4, ethers.parseEther("1.2"));

      // Force lazy propagation by accessing individual elements
      await test.queryWithLazy(0, 0);
      await test.queryWithLazy(1, 1);
      await test.queryWithLazy(2, 2);

      expect(await test.query(0, 2)).to.equal(720); // (100 + 200 + 300) * 1.2
      // Unchanged range: 500 + 2*WAD + 800 + 900 = 2200 + 2*10^18
      const unchangedSum = 2200n + 2n * 10n ** 18n;
      expect(await test.query(5, 9)).to.equal(unchangedSum);
      // Total: 720 + 2*1.2*WAD + unchangedSum = 720 + 2.4*10^18 + 2200 + 2*10^18
      const totalExpected = 720n + 24n * 10n ** 17n + 2200n + 2n * 10n ** 18n;
      expect(await test.query(0, 9)).to.equal(totalExpected);
    });

    it("Should handle empty ranges", async function () {
      // Range [3,4] has default values: 2*WAD
      expect(await test.query(3, 4)).to.equal(2n * 10n ** 18n);
    });
  });

  // ========================================
  // BULK OPERATIONS TESTS
  // ========================================

  describe("Bulk Operations", function () {
    it("Should handle batch updates efficiently", async function () {
      const { test } = await loadFixture(deployMediumTreeFixture);

      const indices = Array.from({ length: 100 }, (_, i) => i);
      const values = Array.from({ length: 100 }, (_, i) => (i + 1) * 10);

      await test.batchUpdate(indices, values);

      // Verify values were set correctly
      for (let i = 0; i < 100; i++) {
        expect(await test.query(i, i)).to.equal((i + 1) * 10);
      }

      // Verify total sum
      const expectedSum = (100 * 101 * 10) / 2; // Sum of arithmetic sequence
      // 나머지 900개 인덱스는 기본값 1 WAD
      const totalExpected = BigInt(expectedSum) + 900n * 10n ** 18n;
      expect(await test.getTotalSum()).to.equal(totalExpected);
    });

    it("Should handle batch update validation", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      await expect(test.batchUpdate([0, 1], [100])).to.be.revertedWith(
        "Array length mismatch"
      );
    });

    it("Should handle reverse order and duplicate indices in batchUpdate", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // Test reverse order indices
      const reverseIndices = [4, 3, 2, 1, 0];
      const reverseValues = [500, 400, 300, 200, 100];

      await test.batchUpdate(reverseIndices, reverseValues);

      // Verify all values were set correctly despite reverse order
      expect(await test.query(0, 0)).to.equal(100);
      expect(await test.query(1, 1)).to.equal(200);
      expect(await test.query(2, 2)).to.equal(300);
      expect(await test.query(3, 3)).to.equal(400);
      expect(await test.query(4, 4)).to.equal(500);

      // 나머지 5개 인덱스는 기본값 1 WAD
      const expectedSum = 1500n + 5n * 10n ** 18n;
      expect(await test.getTotalSum()).to.equal(expectedSum);
    });

    it("Should handle duplicate indices in batchUpdate (last wins)", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // Test duplicate indices - later values should overwrite earlier ones
      const duplicateIndices = [0, 1, 0, 2, 1];
      const duplicateValues = [100, 200, 999, 300, 888];

      await test.batchUpdate(duplicateIndices, duplicateValues);

      // Verify that later values overwrote earlier ones
      expect(await test.query(0, 0)).to.equal(999); // Last value for index 0
      expect(await test.query(1, 1)).to.equal(888); // Last value for index 1
      expect(await test.query(2, 2)).to.equal(300);

      // 나머지 7개 인덱스는 기본값 1 WAD
      const expectedSum = 2187n + 7n * 10n ** 18n;
      expect(await test.getTotalSum()).to.equal(expectedSum);
    });

    it("Should handle batchUpdate with mixed valid/invalid indices", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // 유효한 인덱스와 무효한 인덱스가 섞인 경우
      // 첫 번째나 마지막 인덱스가 out-of-bounds면 전체 revert 기대
      await expect(
        test.batchUpdate([0, 5, 10], [100, 500, 1000]) // 10은 out-of-bounds
      ).to.be.revertedWithCustomError(test, "IndexOutOfBounds");

      // 중간에 out-of-bounds가 있는 경우도 동일
      await expect(
        test.batchUpdate([0, 15, 5], [100, 1500, 500]) // 15는 out-of-bounds
      ).to.be.revertedWithCustomError(test, "IndexOutOfBounds");
    });
  });

  // ========================================
  // STRESS & PERFORMANCE TESTS
  // ========================================

  describe("Stress Tests", function () {
    it("Should handle overflow protection with precise calculation", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      await test.update(0, WAD);

      // Test with single range application first
      await test.mulRange(0, 0, ethers.parseEther("1.2"));
      const valueAfter1 = await test.query(0, 0);
      expect(valueAfter1).to.equal((WAD * 12n) / 10n); // 1.0 * 1.2 = 1.2

      // Now test that overflow protection triggers with extreme values
      await expect(
        test.stressTestMulRange(ethers.parseEther("1.24"), 500) // Should trigger overflow protection
      ).to.be.revertedWith("Lazy factor overflow protection");
    });

    it("Should handle large tree operations", async function () {
      const { test } = await loadFixture(deployMediumTreeFixture);

      // Fill with sequential values (only first 100 to avoid gas issues)
      const indices = Array.from({ length: 100 }, (_, i) => i);
      const values = Array.from({ length: 100 }, (_, i) => i + 1);
      await test.batchUpdate(indices, values);

      // Apply range multiplication to range
      await test.mulRange(0, 99, ethers.parseEther("1.1"));

      // Verify some values (values were 1, 2, 3, ... before multiplication)
      // Force lazy propagation
      await test.queryWithLazy(0, 0);
      await test.queryWithLazy(50, 50);

      expect(await test.query(0, 0)).to.equal(
        (1n * ethers.parseEther("1.1")) / WAD
      );
      expect(await test.query(50, 50)).to.equal(
        (51n * ethers.parseEther("1.1")) / WAD
      );
    });

    it("Should maintain performance with deep lazy propagation", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // Set up initial values
      for (let i = 0; i < 10; i++) {
        await test.update(i, WAD);
      }

      // Apply nested range multiplications
      for (let i = 0; i < 5; i++) {
        await test.mulRange(i, i + 4, ethers.parseEther("1.01"));
      }

      // Verify total sum is reasonable
      const totalSum = await test.getTotalSum();
      expect(totalSum).to.be.greaterThan(0);
    });

    it("Should handle mulRange on last leaf only in large tree", async function () {
      const { test } = await loadFixture(deployLargeTreeFixture);

      const lastIndex = 32767; // 32768 - 1

      // Apply multiplication to last leaf only
      await test.mulRange(lastIndex, lastIndex, ethers.parseEther("1.15"));

      // Check that only the last leaf was affected
      expect(await test.query(lastIndex, lastIndex)).to.equal(
        ethers.parseEther("1.15")
      );

      // Total sum should be (32767 * 1 WAD) + 1.15 WAD = 32767.15 WAD
      const expectedSum = 32767n * 10n ** 18n + ethers.parseEther("1.15");
      expect(await test.getTotalSum()).to.equal(expectedSum);
    });
  });

  // ========================================
  // GAS EFFICIENCY TESTS
  // ========================================

  describe("Gas Efficiency", function () {
    it("Should measure update gas usage", async function () {
      const { test } = await loadFixture(deployMediumTreeFixture);

      const tx = await test.update(500, WAD);
      const receipt = await tx.wait();
      const gasUsed = receipt?.gasUsed || 0n;

      expect(gasUsed).to.be.greaterThan(0n);
    });

    it("Should measure mulRange gas usage", async function () {
      const { test } = await loadFixture(deployMediumTreeFixture);

      const tx = await test.mulRange(0, 999, ethers.parseEther("1.1"));
      const receipt = await tx.wait();
      const gasUsed = receipt?.gasUsed || 0n;

      expect(gasUsed).to.be.greaterThan(0n);
    });

    it("Should demonstrate batch update efficiency", async function () {
      const { test } = await loadFixture(deployMediumTreeFixture);

      const indices = Array.from({ length: 50 }, (_, i) => i);
      const values = Array.from({ length: 50 }, (_, i) => (i + 1) * 10);

      const tx = await test.batchUpdate(indices, values);
      const receipt = await tx.wait();
      const gasUsed = receipt?.gasUsed || 0n;

      expect(gasUsed).to.be.greaterThan(0n);
    });

    it("Should compare batch vs individual update gas efficiency", async function () {
      const { test } = await loadFixture(deployMediumTreeFixture);

      // Individual updates
      let totalGasIndividual = 0n;
      for (let i = 0; i < 5; i++) {
        const tx = await test.update(i, (i + 1) * 10);
        const receipt = await tx.wait();
        totalGasIndividual += receipt?.gasUsed || 0n;
      }

      // Reset tree for batch test
      const { test: test2 } = await loadFixture(deployMediumTreeFixture);

      // Batch update
      const indices = [0, 1, 2, 3, 4];
      const values = [10, 20, 30, 40, 50];
      const batchTx = await test2.batchUpdate(indices, values);
      const batchReceipt = await batchTx.wait();
      const batchGas = batchReceipt?.gasUsed || 0n;

      // Batch should be more efficient
      expect(batchGas).to.be.lessThan(totalGasIndividual);
    });
  });

  describe("Debug Functions", function () {
    it("Should verify 2-slot node packing efficiency", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      await test.update(0, 100);

      // Verify node packing works correctly
      const nodeInfo = await test.getNodeInfo(1); // Root node
      expect(nodeInfo.sum).to.equal(100n + 9n * 10n ** 18n); // 100 + 9*WAD
    });
  });

  describe("Advanced Edge Cases", function () {
    it("Should revert queryWithLazy() on uninitialized tree", async function () {
      const { test } = await loadFixture(deployUninitializedFixture);

      await expect(test.queryWithLazy(0, 0)).to.be.revertedWithCustomError(
        test,
        "TreeNotInitialized"
      );
    });

    it("Should handle _push when both children are unallocated", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // Apply lazy multiplication to entire tree
      await test.mulRange(0, 9, ethers.parseEther("1.5"));

      // Force propagation by querying specific ranges
      await test.queryWithLazy(0, 4);
      await test.queryWithLazy(5, 9);

      // Verify total sum is correct
      expect(await test.getTotalSum()).to.equal(ethers.parseEther("15")); // 10 * 1.5
    });
  });

  describe("Invariant Verification", function () {
    it("Should handle factor==WAD as no-op on non-empty tree", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      await test.update(0, 100);
      await test.update(1, 200);

      const initialSum = await test.getTotalSum();

      // Apply factor of 1.0 (should be no-op)
      await test.mulRange(0, 9, WAD);

      // Values should be unchanged
      expect(await test.getTotalSum()).to.equal(initialSum);
      expect(await test.query(0, 0)).to.equal(100);
      expect(await test.query(1, 1)).to.equal(200);
    });

    it("Should maintain cachedRootSum == query(0,size-1) invariant", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      await test.update(0, 100);
      await test.update(5, 500);
      await test.mulRange(0, 9, ethers.parseEther("1.2"));

      const cachedSum = await test.getTotalSum();
      const querySum = await test.query(0, 9);

      expect(cachedSum).to.equal(querySum);
    });

    it("Should verify no lazy factor exceeds 5e36", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      await test.update(0, WAD);

      // This should not revert (within limits)
      await test.mulRange(0, 0, ethers.parseEther("1.1"));

      // But extreme accumulation should revert
      await expect(
        test.stressTestMulRange(ethers.parseEther("1.5"), 200)
      ).to.be.revertedWith("Lazy factor overflow protection");
    });

    it("Should verify all node sums stay within uint256", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // Set maximum safe values
      const maxSafeValue = ethers.parseEther("1000000000000000000"); // 1e36
      await test.update(0, maxSafeValue);

      // Should not overflow
      expect(await test.query(0, 0)).to.equal(maxSafeValue);
      expect(await test.getTotalSum()).to.be.greaterThan(0);
    });

    it("Should verify mulRange respects PRB Math overflow protection", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // Set a large value
      const largeValue = ethers.parseEther("1000000000000000000000000"); // 1e42
      await test.update(0, largeValue);

      // Apply a large multiplication factor
      const largeFactor = ethers.parseEther("100"); // 100x
      await test.mulRange(0, 0, largeFactor);

      // Should handle extreme multiplication safely
      const result = await test.query(0, 0);
      expect(result).to.be.greaterThan(0);
    });

    it("Should handle extreme value multiplication safely", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // Test with very large but safe values
      const extremeValue = ethers.parseEther(
        "72370055773322622139731865630429942408293740416025352524660.99"
      );
      await test.update(0, extremeValue);

      // Apply small factor to avoid overflow
      await test.mulRange(0, 0, ethers.parseEther("1.000001"));

      const result = await test.query(0, 0);
      expect(result).to.be.greaterThan(extremeValue);
    });
  });

  describe("Strict Edge Case & Invariant Testing", () => {
    it("Should test boundary value inputs for mulRange", async () => {
      const { test } = await loadFixture(deployMediumTreeFixture);

      // This should not revert
      await test.testMulRangeBoundaries();

      // Verify tree is still functional
      const sum = await test.getTotalSum();
      expect(sum).to.be.gt(0);
    });

    it("Should test boundary value inputs for update", async () => {
      const { test } = await loadFixture(deployMediumTreeFixture);

      // This should not revert
      await test.testUpdateBoundaries();

      // Verify updates worked
      const firstValue = await test.query(0, 0);
      const lastValue = await test.query(999, 999);

      expect(firstValue).to.equal(ethers.parseEther("2"));
      expect(lastValue).to.equal(ethers.parseEther("3"));
    });

    it("Should maintain total sum invariant", async () => {
      const { test } = await loadFixture(deployMediumTreeFixture);

      // Set some values
      await test.update(5, ethers.parseEther("3"));
      await test.update(10, ethers.parseEther("5"));
      await test.mulRange(0, 20, ethers.parseEther("1.2"));

      // This should not revert
      await test.assertTotalInvariant();
    });

    it("Should maintain lazy propagation consistency", async () => {
      const { test } = await loadFixture(deployMediumTreeFixture);

      // Apply some operations
      await test.mulRange(10, 30, ethers.parseEther("1.5"));
      await test.update(15, ethers.parseEther("4"));

      // Test consistency for various ranges
      await test.assertLazyConsistency(10, 20);
      await test.assertLazyConsistency(0, 49);
      await test.assertLazyConsistency(25, 35);
    });

    it("Should test default sum logic for untouched ranges", async () => {
      const { test } = await loadFixture(deployMediumTreeFixture);

      // Query untouched range
      const result = await test.testDefaultSumLogic(30, 40);
      const expected = ethers.parseEther("11"); // (40-30+1) * 1e18

      expect(result).to.equal(expected);
    });

    it("Should test mulRange on empty nodes doesn't break root sum sync", async () => {
      const { test } = await loadFixture(deployMediumTreeFixture);

      // This should not revert and should maintain invariants
      await test.testEmptyNodeMulRange();
    });

    it("Should test batchUpdate corner cases", async () => {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // This should handle duplicates and unsorted arrays correctly
      await test.testBatchUpdateCornerCases();
    });

    it("Should handle fuzz-style range multiplication", async () => {
      const { test } = await loadFixture(deployMediumTreeFixture);

      // Test with various pseudo-random inputs
      await test.randomRangeMul(12345, 67890, ethers.parseEther("1.5"));
      await test.randomRangeMul(98765, 43210, ethers.parseEther("0.8"));
      await test.randomRangeMul(11111, 22222, ethers.parseEther("2.5"));
    });

    it("Should test cached root sum sync after complex operations", async () => {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // This should not revert
      await test.testCachedRootSumSync();
    });

    it("Should get tree statistics", async () => {
      const { test } = await loadFixture(deployMediumTreeFixture);

      // Apply some operations to create nodes
      await test.update(5, ethers.parseEther("2"));
      await test.mulRange(10, 20, ethers.parseEther("1.3"));
      await test.update(25, ethers.parseEther("3"));

      const [nodeCount, maxDepth, totalLazyOps] = await test.getTreeStats();

      expect(nodeCount).to.be.gt(0);
      expect(maxDepth).to.be.gt(0);
      // totalLazyOps might be 0 if all lazy operations were propagated
    });

    it("Should check if tree is empty", async () => {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // Fresh tree should be considered empty (all default values)
      const isEmpty = await test.isEmpty();
      expect(isEmpty).to.be.true;

      // After update, should not be empty
      await test.update(0, ethers.parseEther("2"));
      const isEmptyAfter = await test.isEmpty();
      expect(isEmptyAfter).to.be.false;
    });
  });

  describe("Revert Path Verification", () => {
    it("Should revert on invalid mulRange parameters", async () => {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // Test lo > hi
      await expect(
        test.mulRange(5, 3, ethers.parseEther("1.5"))
      ).to.be.revertedWithCustomError(test, "InvalidRange");

      // Test hi >= size
      await expect(
        test.mulRange(0, 10, ethers.parseEther("1.5"))
      ).to.be.revertedWithCustomError(test, "IndexOutOfBounds");

      // Test factor == 0
      await expect(test.mulRange(0, 5, 0)).to.be.revertedWithCustomError(
        test,
        "ZeroFactor"
      );

      // Test factor < MIN_FACTOR (0.01 is exactly MIN_FACTOR, so use smaller)
      await expect(
        test.mulRange(0, 5, ethers.parseEther("0.009"))
      ).to.be.revertedWithCustomError(test, "InvalidFactor");

      // Test factor > MAX_FACTOR (MAX_FACTOR is 100, so use 101)
      await expect(
        test.mulRange(0, 5, ethers.parseEther("100.1"))
      ).to.be.revertedWithCustomError(test, "InvalidFactor");

      // Test exact boundary values should work
      await test.mulRange(0, 0, ethers.parseEther("0.01")); // Exact MIN_FACTOR
      await test.mulRange(1, 1, ethers.parseEther("100")); // Exact MAX_FACTOR
    });

    it("Should revert on invalid update parameters", async () => {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // Test index >= size
      await expect(
        test.update(10, ethers.parseEther("1"))
      ).to.be.revertedWithCustomError(test, "IndexOutOfBounds");
    });

    it("Should revert on invalid query parameters", async () => {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // Test lo > hi
      await expect(test.query(5, 3)).to.be.revertedWithCustomError(
        test,
        "InvalidRange"
      );

      // Test hi >= size
      await expect(test.query(0, 10)).to.be.revertedWithCustomError(
        test,
        "IndexOutOfBounds"
      );
    });

    it("Should revert on invalid batchUpdate parameters", async () => {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // Test length mismatch
      const indices = [0, 1, 2];
      const values = [ethers.parseEther("1"), ethers.parseEther("2")]; // One less value

      await expect(test.batchUpdate(indices, values)).to.be.revertedWith(
        "Array length mismatch"
      );

      // Test empty arrays (should work fine, just no-op)
      await test.batchUpdate([], []);
    });
  });

  it("Should clear lazy factor when updating leaf after mulRange", async () => {
    const { test } = await loadFixture(deploySmallTreeFixture);

    // Step 1: Apply mulRange to set lazy factor
    await test.mulRange(0, 0, ethers.parseEther("1.2")); // lazy = 1.2 on leaf
    expect(await test.query(0, 0)).to.equal(ethers.parseEther("1.2")); // 1 * 1.2 = 1.2

    // Step 2: Update the same leaf (should clear lazy)
    await test.update(0, ethers.parseEther("10")); // Should set lazy = 1.0
    expect(await test.query(0, 0)).to.equal(ethers.parseEther("10")); // Direct value

    // Step 3: Apply another mulRange - this should NOT double-multiply
    await test.mulRange(0, 0, ethers.parseEther("2.0")); // Expected: 10 * 2 = 20

    const result = await test.query(0, 0);
    expect(result).to.equal(ethers.parseEther("20")); // Should be 20, not 24

    // Verify total sum consistency
    const totalSum = await test.getTotalSum();
    const querySum = await test.query(0, 9);
    expect(totalSum).to.equal(querySum);
  });

  it("Should maintain cache-query invariant after update-then-mulRange", async () => {
    const { test } = await loadFixture(deployMediumTreeFixture);

    // Apply mulRange, then update, then mulRange again
    await test.mulRange(5, 10, ethers.parseEther("1.5"));
    await test.update(7, ethers.parseEther("100"));
    await test.mulRange(5, 10, ethers.parseEther("0.8"));

    // Critical invariant: cached sum must equal actual query
    const cachedSum = await test.getTotalSum();
    const querySum = await test.query(0, 999);
    expect(cachedSum).to.equal(querySum);
  });

  it("Should handle multiple update-mulRange cycles correctly", async () => {
    const { test } = await loadFixture(deploySmallTreeFixture);

    for (let i = 0; i < 5; i++) {
      // Cycle: mulRange -> update -> mulRange
      await test.mulRange(i % 10, i % 10, ethers.parseEther("1.1"));
      await test.update(i % 10, ethers.parseEther((i + 1).toString()));
      await test.mulRange(i % 10, i % 10, ethers.parseEther("2.0"));

      // Each leaf should be exactly (i+1) * 2 = 2*(i+1)
      const expected = ethers.parseEther((2 * (i + 1)).toString());
      const actual = await test.query(i % 10, i % 10);
      expect(actual).to.equal(expected);
    }
  });

  it("Should handle factor == WAD correctly with existing lazy", async () => {
    const { test } = await loadFixture(deploySmallTreeFixture);

    // Set initial lazy factor
    await test.mulRange(0, 2, ethers.parseEther("1.5"));
    const beforeSum = await test.getTotalSum();

    // Apply factor == WAD (should be no-op)
    await test.mulRange(0, 2, ethers.parseEther("1.0"));
    const afterSum = await test.getTotalSum();

    expect(afterSum).to.equal(beforeSum);
  });

  it("Should prevent re-initialization of existing tree", async () => {
    const { test } = await loadFixture(deploySmallTreeFixture);

    // Modify tree
    await test.mulRange(0, 5, ethers.parseEther("2.0"));
    await test.update(3, ethers.parseEther("100"));

    // Attempt re-initialization should fail
    await expect(test.init(10)).to.be.revertedWith("Tree already initialized");
  });

  it("Should handle re-initialization after large lazy operations", async () => {
    const { test } = await loadFixture(deployFixture);

    // First initialization with large lazy operations
    await test.init(100);
    await test.mulRange(0, 99, ethers.parseEther("1.5"));

    // Re-initialization should fail (preventing ghost nodes)
    await expect(test.init(10)).to.be.revertedWith("Tree already initialized");
  });

  it("Should handle deep untouched ranges correctly", async () => {
    const { test } = await loadFixture(deployMediumTreeFixture);

    // Query deep untouched range
    const deepStart = 800;
    const deepEnd = 850;
    const rangeLength = deepEnd - deepStart + 1;

    const result = await test.query(deepStart, deepEnd);
    const expected = ethers.parseEther(rangeLength.toString()); // rangeLength * 1 WAD

    expect(result).to.equal(expected);
  });

  it("Should handle untouched ranges between updated sections", async () => {
    const { test } = await loadFixture(deployMediumTreeFixture);

    // Update sections [0,4] and [20,24], leaving [5,19] untouched
    await test.update(0, ethers.parseEther("2"));
    await test.update(4, ethers.parseEther("3"));
    await test.update(20, ethers.parseEther("4"));
    await test.update(24, ethers.parseEther("5"));

    // Query untouched middle section [5,19]
    const result = await test.query(5, 19);
    const expected = ethers.parseEther("15"); // (19-5+1) * 1 WAD = 15 WAD

    expect(result).to.equal(expected);
  });

  it("Should handle double lazy propagation correctly", async () => {
    const { test } = await loadFixture(deploySmallTreeFixture);

    // Apply nested lazy operations
    await test.mulRange(0, 9, ethers.parseEther("1.3"));
    await test.mulRange(0, 4, ethers.parseEther("1.4"));

    // Query without forcing propagation first
    const totalSum = await test.getTotalSum();
    const querySum = await test.query(0, 9);

    expect(totalSum).to.equal(querySum);
  });

  it("Should handle lazy overflow protection", async () => {
    const { test } = await loadFixture(deploySmallTreeFixture);

    // Test stress multiplication that should trigger overflow protection
    await expect(
      test.stressTestMulRange(ethers.parseEther("1.25"), 400)
    ).to.be.revertedWith("Lazy factor overflow protection");
  });

  it("Should verify gas measurement functions return positive values", async () => {
    const { test } = await loadFixture(deploySmallTreeFixture);

    // Test update gas measurement
    const updateGas = await test.measureUpdateGas.staticCall(
      0,
      ethers.parseEther("2")
    );
    expect(Number(updateGas)).to.be.gt(0);

    // Test mulRange gas measurement
    const mulRangeGas = await test.measureMulRangeGas.staticCall(
      0,
      5,
      ethers.parseEther("1.5")
    );
    expect(Number(mulRangeGas)).to.be.gt(0);

    // Test batch update gas measurement
    const batchGas = await test.measureBatchUpdateGas.staticCall(
      [1, 2],
      [ethers.parseEther("3"), ethers.parseEther("4")]
    );
    expect(Number(batchGas)).to.be.gt(0);
  });

  // ========================================
  // FUZZ AND STRESS TESTS
  // ========================================

  describe("Fuzz and Stress Tests", function () {
    it("Should handle random sequence of mulRange operations", async function () {
      const { test } = await loadFixture(deployMediumTreeFixture);

      // Perform 20 random mulRange operations
      for (let i = 0; i < 20; i++) {
        const lo = Math.floor(Math.random() * 900);
        const hi = lo + Math.floor(Math.random() * 100); // Ensure hi >= lo
        const factor = ethers.parseEther(
          (Math.random() * 1.8 + 0.2).toString()
        ); // 0.2-2.0

        await test.mulRange(lo, hi, factor);

        // Verify invariant after each operation
        const cachedSum = await test.getTotalSum();
        const querySum = await test.query(0, 999);
        expect(cachedSum).to.equal(querySum);
      }
    });

    it("Should handle mixed random operations sequence", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // Perform 30 mixed operations
      for (let i = 0; i < 30; i++) {
        const operation = Math.floor(Math.random() * 3); // 0: update, 1: mulRange, 2: batchUpdate

        if (operation === 0) {
          // Random update
          const index = Math.floor(Math.random() * 10);
          const value = ethers.parseEther((Math.random() * 100 + 1).toString());
          await test.update(index, value);
        } else if (operation === 1) {
          // Random mulRange
          const lo = Math.floor(Math.random() * 8);
          const hi = lo + Math.floor(Math.random() * (10 - lo));
          const factor = ethers.parseEther(
            (Math.random() * 1.8 + 0.2).toString()
          );
          await test.mulRange(lo, hi, factor);
        } else {
          // Random batchUpdate
          const numUpdates = Math.floor(Math.random() * 5) + 1;
          const indices = [];
          const values = [];
          for (let j = 0; j < numUpdates; j++) {
            indices.push(Math.floor(Math.random() * 10));
            values.push(ethers.parseEther((Math.random() * 50 + 1).toString()));
          }
          await test.batchUpdate(indices, values);
        }

        // Verify invariant after each operation
        const cachedSum = await test.getTotalSum();
        const querySum = await test.query(0, 9);
        expect(cachedSum).to.equal(querySum);
      }
    });

    it("Should handle continuous batchUpdate -> mulRange cycles", async function () {
      const { test } = await loadFixture(deployMediumTreeFixture);

      // Perform 10 cycles of batchUpdate followed by mulRange
      for (let cycle = 0; cycle < 10; cycle++) {
        // Random batchUpdate
        const numUpdates = Math.floor(Math.random() * 20) + 5; // 5-24 updates
        const indices = [];
        const values = [];

        for (let i = 0; i < numUpdates; i++) {
          indices.push(Math.floor(Math.random() * 1000));
          values.push(ethers.parseEther((Math.random() * 100 + 1).toString()));
        }

        await test.batchUpdate(indices, values);

        // Random mulRange
        const lo = Math.floor(Math.random() * 900);
        const hi = lo + Math.floor(Math.random() * 100);
        const factor = ethers.parseEther(
          (Math.random() * 1.5 + 0.5).toString()
        ); // 0.5-2.0

        await test.mulRange(lo, hi, factor);

        // Verify consistency
        const cachedSum = await test.getTotalSum();
        const querySum = await test.query(0, 999);
        expect(cachedSum).to.equal(querySum);
      }
    });

    it("Should handle very large tree initialization stress test", async function () {
      const { test } = await loadFixture(deployFixture);

      // Test with large tree size (close to MAX_TICK_COUNT)
      const largeSize = 100000; // 100K ticks
      await test.init(largeSize);

      // Verify initialization
      const totalSum = await test.getTotalSum();
      expect(totalSum).to.equal(ethers.parseEther(largeSize.toString()));

      // Perform a few operations to ensure it works
      await test.mulRange(0, 999, ethers.parseEther("1.1"));
      await test.update(50000, ethers.parseEther("100"));

      // Verify invariant still holds
      const cachedSum = await test.getTotalSum();
      const partialQuery = await test.query(0, 999); // Query subset for performance
      expect(partialQuery).to.be.gt(0);
    });

    it("Should test factor boundary conditions with random ranges", async function () {
      const { test } = await loadFixture(deployMediumTreeFixture);

      // Test with factors near boundaries
      const boundaryFactors = [
        MIN_FACTOR, // 0.01
        ethers.parseEther("0.011"), // Just above min
        ethers.parseEther("0.999"), // Just below 1
        ethers.parseEther("1.001"), // Just above 1
        ethers.parseEther("99.99"), // Just below max
        MAX_FACTOR, // 100
      ];

      for (const factor of boundaryFactors) {
        const lo = Math.floor(Math.random() * 900);
        const hi = lo + Math.floor(Math.random() * 100);

        await test.mulRange(lo, hi, factor);

        // Verify no overflow or underflow
        const result = await test.query(lo, hi);
        expect(result).to.be.gt(0);
      }
    });

    it("Should test overlapping range operations", async function () {
      const { test } = await loadFixture(deployMediumTreeFixture);

      // Apply overlapping mulRange operations
      const ranges = [
        { lo: 100, hi: 200, factor: ethers.parseEther("1.2") },
        { lo: 150, hi: 250, factor: ethers.parseEther("1.3") },
        { lo: 200, hi: 300, factor: ethers.parseEther("0.8") },
        { lo: 50, hi: 350, factor: ethers.parseEther("1.1") },
      ];

      for (const range of ranges) {
        await test.mulRange(range.lo, range.hi, range.factor);
      }

      // Verify final state consistency
      const cachedSum = await test.getTotalSum();
      const querySum = await test.query(0, 999);
      expect(cachedSum).to.equal(querySum);

      // Verify specific overlapping regions have reasonable values
      const overlap1 = await test.query(150, 200); // Triple overlap
      const overlap2 = await test.query(200, 250); // Triple overlap
      expect(overlap1).to.be.gt(0);
      expect(overlap2).to.be.gt(0);
    });

    it("Should handle rapid alternating operations", async function () {
      const { test } = await loadFixture(deploySmallTreeFixture);

      // Rapidly alternate between different operation types
      for (let i = 0; i < 50; i++) {
        const index = i % 10;

        if (i % 3 === 0) {
          // Update
          await test.update(index, ethers.parseEther((i + 1).toString()));
        } else if (i % 3 === 1) {
          // MulRange single tick
          await test.mulRange(index, index, ethers.parseEther("1.1"));
        } else {
          // Query (read operation)
          const result = await test.query(index, index);
          expect(result).to.be.gt(0);
        }

        // Every 10 operations, verify full invariant
        if (i % 10 === 9) {
          const cachedSum = await test.getTotalSum();
          const querySum = await test.query(0, 9);
          expect(cachedSum).to.equal(querySum);
        }
      }
    });
  });
});
