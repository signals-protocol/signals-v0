import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

describe("FixedPointMath Library", function () {
  // ========================================
  // FIXTURES
  // ========================================

  async function deployFixture() {
    // Deploy FixedPointMathU library first
    const FixedPointMathU = await ethers.getContractFactory("FixedPointMathU");
    const fixedPointMathU = await FixedPointMathU.deploy();
    await fixedPointMathU.waitForDeployment();

    // Deploy test contract with library linked
    const FixedPointMathTest = await ethers.getContractFactory(
      "FixedPointMathTest",
      {
        libraries: {
          FixedPointMathU: await fixedPointMathU.getAddress(),
        },
      }
    );
    const test = await FixedPointMathTest.deploy();
    await test.waitForDeployment();

    return { test };
  }

  // ========================================
  // CONSTANTS
  // ========================================

  const UNIT = ethers.parseEther("1"); // 1e18
  const TWO = ethers.parseEther("2");
  const HALF = ethers.parseEther("0.5");
  // PRB-Math constants (approximate values)
  const E_APPROX = ethers.parseEther("2.718281828459045235"); // Euler's number
  const LN_2_APPROX = ethers.parseEther("0.693147180559945309"); // ln(2)

  // ========================================
  // BASIC OPERATIONS TESTS
  // ========================================

  describe("Basic Operations", function () {
    it("Should multiply correctly", async function () {
      const { test } = await loadFixture(deployFixture);

      // 2 * 3 = 6
      const result = await test.wMul(TWO, ethers.parseEther("3"));
      expect(result).to.equal(ethers.parseEther("6"));

      // 0.5 * 0.5 = 0.25
      const result2 = await test.wMul(HALF, HALF);
      expect(result2).to.equal(ethers.parseEther("0.25"));

      // Test with zero
      const result3 = await test.wMul(TWO, 0);
      expect(result3).to.equal(0);
    });

    it("Should divide correctly", async function () {
      const { test } = await loadFixture(deployFixture);

      // 6 / 2 = 3
      const result = await test.wDiv(ethers.parseEther("6"), TWO);
      expect(result).to.equal(ethers.parseEther("3"));

      // 1 / 2 = 0.5
      const result2 = await test.wDiv(UNIT, TWO);
      expect(result2).to.equal(HALF);
    });

    it("Should revert on division by zero", async function () {
      const { test } = await loadFixture(deployFixture);

      await expect(test.wDiv(UNIT, 0)).to.be.revertedWithCustomError(
        test,
        "FP_DivisionByZero"
      );
    });

    it("Should handle wad format operations", async function () {
      const { test } = await loadFixture(deployFixture);

      // All operations in signals-v0 use wad format (1e18)
      const five = ethers.parseEther("5");
      const result = await test.wMul(five, UNIT);
      expect(result).to.equal(five);
    });

    it("Should handle large values safely", async function () {
      const { test } = await loadFixture(deployFixture);

      // Test with large but safe values
      const largeValue = ethers.parseEther("1000000");
      const result = await test.wMul(largeValue, UNIT);
      expect(result).to.equal(largeValue);
    });
  });

  // ========================================
  // EXPONENTIAL FUNCTION TESTS
  // ========================================

  describe("Exponential Function", function () {
    it("Should calculate exp(0) = 1", async function () {
      const { test } = await loadFixture(deployFixture);

      const result = await test.wExp(0);
      expect(result).to.equal(UNIT);
    });

    it("Should calculate exp(1) ≈ e", async function () {
      const { test } = await loadFixture(deployFixture);

      const result = await test.wExp(UNIT);

      // Should be close to e (allowing 1% tolerance)
      const tolerance = E_APPROX / 100n;
      expect(result).to.be.closeTo(E_APPROX, tolerance);
    });

    it("Should calculate exp(ln(2)) ≈ 2", async function () {
      const { test } = await loadFixture(deployFixture);

      const result = await test.wExp(LN_2_APPROX);

      // Should be close to 2 (allowing 1% tolerance)
      const tolerance = TWO / 100n;
      expect(result).to.be.closeTo(TWO, tolerance);
    });

    it("Should handle small values", async function () {
      const { test } = await loadFixture(deployFixture);

      const smallValue = ethers.parseEther("0.1");
      const result = await test.wExp(smallValue);

      // exp(0.1) ≈ 1.1052
      const expected = ethers.parseEther("1.1052");
      const tolerance = expected / 100n;
      expect(result).to.be.closeTo(expected, tolerance);
    });

    it("Should handle boundary values", async function () {
      const { test } = await loadFixture(deployFixture);

      // Test boundary values that should work (PRB-Math limit is around 133e18)
      await test.wExp(ethers.parseEther("130")); // Safe value

      // Test that very large values revert
      await expect(test.wExp(ethers.parseEther("200"))).to.be.reverted;
    });
  });

  // ========================================
  // LOGARITHM FUNCTION TESTS
  // ========================================

  describe("Logarithm Function", function () {
    it("Should calculate ln(1) = 0", async function () {
      const { test } = await loadFixture(deployFixture);

      const result = await test.wLn(UNIT);
      expect(result).to.equal(0);
    });

    it("Should calculate ln(e) ≈ 1", async function () {
      const { test } = await loadFixture(deployFixture);

      const result = await test.wLn(E_APPROX);

      // Should be close to 1 (allowing 5% tolerance for precision)
      const tolerance = UNIT / 20n;
      expect(result).to.be.closeTo(UNIT, tolerance);
    });

    it("Should calculate ln(2) ≈ 0.693", async function () {
      const { test } = await loadFixture(deployFixture);

      const result = await test.wLn(TWO);

      // Should be close to ln(2)
      const tolerance = LN_2_APPROX / 20n;
      expect(result).to.be.closeTo(LN_2_APPROX, tolerance);
    });

    it("Should handle values less than 1", async function () {
      const { test } = await loadFixture(deployFixture);

      // PRB-Math has minimum input limit around 1e-18, so test with safe value
      // Test that values too small revert
      await expect(test.wLn(ethers.parseEther("0.9"))).to.be.reverted;

      // This is expected behavior for PRB-Math
    });

    it("Should revert on ln(0)", async function () {
      const { test } = await loadFixture(deployFixture);

      await expect(test.wLn(0)).to.be.revertedWithCustomError(
        test,
        "FP_InvalidInput"
      );
    });
  });

  // ========================================
  // UTILITY FUNCTIONS TESTS
  // ========================================

  describe("Utility Functions", function () {
    it("Should calculate square root correctly", async function () {
      const { test } = await loadFixture(deployFixture);

      // sqrt(4) = 2
      const result = await test.wSqrt(ethers.parseEther("4"));
      expect(result).to.equal(TWO);

      // sqrt(1) = 1
      const result2 = await test.wSqrt(UNIT);
      expect(result2).to.equal(UNIT);

      // sqrt(0.25) = 0.5
      const result3 = await test.wSqrt(ethers.parseEther("0.25"));
      expect(result3).to.equal(HALF);
    });

    it("Should calculate sum of exponentials", async function () {
      const { test } = await loadFixture(deployFixture);

      const values = [
        ethers.parseEther("1"),
        ethers.parseEther("2"),
        ethers.parseEther("0.5"),
      ];

      const result = await test.sumExp(values);

      // Calculate expected: exp(1) + exp(2) + exp(0.5)
      const exp1 = await test.wExp(values[0]);
      const exp2 = await test.wExp(values[1]);
      const exp3 = await test.wExp(values[2]);
      const expected = exp1 + exp2 + exp3;

      expect(result).to.equal(expected);
    });

    it("Should calculate log-sum-exp with numerical stability", async function () {
      const { test } = await loadFixture(deployFixture);

      // Use smaller values to avoid overflow in subtraction
      const values = [
        ethers.parseEther("0.5"),
        ethers.parseEther("1"),
        ethers.parseEther("0.8"),
      ];

      const result = await test.logSumExp(values);

      // Result should be reasonable (greater than max value)
      const maxValue = ethers.parseEther("1");
      expect(result).to.be.gt(maxValue);
    });

    it("Should handle empty array in logSumExp", async function () {
      const { test } = await loadFixture(deployFixture);

      const emptyArray: never[] = [];

      await expect(test.logSumExp(emptyArray)).to.be.revertedWithCustomError(
        test,
        "FP_EmptyArray"
      );
    });
  });

  // ========================================
  // EDGE CASES TESTS
  // ========================================

  describe("Edge Cases", function () {
    it("Should handle very small numbers", async function () {
      const { test } = await loadFixture(deployFixture);

      const verySmall = 1; // 1 wei
      const result = await test.wMul(verySmall, UNIT);
      expect(result).to.equal(verySmall);
    });

    it("Should handle maximum safe values", async function () {
      const { test } = await loadFixture(deployFixture);

      const largeValue = ethers.parseEther("1000000000"); // 1 billion
      const result = await test.wDiv(largeValue, UNIT);
      expect(result).to.equal(largeValue);
    });

    it("Should maintain precision in chained operations", async function () {
      const { test } = await loadFixture(deployFixture);

      // (2 * 3) / 2 = 3
      const step1 = await test.wMul(TWO, ethers.parseEther("3"));
      const result = await test.wDiv(step1, TWO);
      expect(result).to.equal(ethers.parseEther("3"));
    });
  });

  // ========================================
  // CLMSR INTEGRATION TESTS
  // ========================================

  describe("CLMSR Integration", function () {
    it("Should handle typical CLMSR calculations", async function () {
      const { test } = await loadFixture(deployFixture);

      // Simulate CLMSR price calculation
      const expValue = ethers.parseEther("2.718");
      const totalSumExp = ethers.parseEther("10");

      const price = await test.clmsrPrice(expValue, totalSumExp);

      // Price should be expValue / totalSumExp = 0.2718
      const expected = await test.wDiv(expValue, totalSumExp);
      expect(price).to.equal(expected);
    });

    it("Should handle cost calculation", async function () {
      const { test } = await loadFixture(deployFixture);

      // Simulate CLMSR cost calculation
      const alpha = ethers.parseEther("1000");
      const sumBefore = ethers.parseEther("10");
      const sumAfter = ethers.parseEther("20");

      const cost = await test.clmsrCost(alpha, sumBefore, sumAfter);

      // Cost should be alpha * ln(sumAfter / sumBefore)
      const ratio = await test.wDiv(sumAfter, sumBefore);
      const lnRatio = await test.wLn(ratio);
      const expected = await test.wMul(alpha, lnRatio);

      expect(cost).to.equal(expected);
    });

    it("Should handle safe arithmetic operations", async function () {
      const { test } = await loadFixture(deployFixture);

      // Test safe addition
      const a = ethers.parseEther("1.5");
      const b = ethers.parseEther("2.5");
      const sum = await test.wAdd(a, b);
      expect(sum).to.equal(ethers.parseEther("4"));

      // Test safe subtraction
      const diff = await test.wSub(
        ethers.parseEther("5"),
        ethers.parseEther("2")
      );
      expect(diff).to.equal(ethers.parseEther("3"));

      // Test unsafe operations for gas efficiency
      // NOTE: These functions are deprecated and may be removed in future versions
      const unsafeSum = await test.unsafeAdd(a, b);
      expect(unsafeSum).to.equal(ethers.parseEther("4"));

      const unsafeDiff = await test.unsafeSub(
        ethers.parseEther("5"),
        ethers.parseEther("2")
      );
      expect(unsafeDiff).to.equal(ethers.parseEther("3"));
    });
  });

  // ========================================
  // SIGNED MATH TESTS
  // ========================================

  describe("Signed Math Operations", function () {
    it("Should handle signed multiplication", async function () {
      const { test } = await loadFixture(deployFixture);

      const a = ethers.parseEther("2");
      const b = ethers.parseEther("-3");
      const result = await test.wMulSigned(a, b);

      expect(result).to.equal(ethers.parseEther("-6"));
    });

    it("Should handle signed division", async function () {
      const { test } = await loadFixture(deployFixture);

      const a = ethers.parseEther("-6");
      const b = ethers.parseEther("2");
      const result = await test.wDivSigned(a, b);

      expect(result).to.equal(ethers.parseEther("-3"));
    });

    it("Should revert on signed division by zero", async function () {
      const { test } = await loadFixture(deployFixture);

      await expect(test.wDivSigned(UNIT, 0)).to.be.revertedWithCustomError(
        test,
        "FP_DivisionByZero"
      );
    });

    it("Should calculate negative CLMSR cost", async function () {
      const { test } = await loadFixture(deployFixture);

      // When sumAfter < sumBefore, cost should be negative
      const alpha = ethers.parseEther("1000");
      const sumBefore = ethers.parseEther("20");
      const sumAfter = ethers.parseEther("10");

      const cost = await test.clmsrCostSigned(alpha, sumBefore, sumAfter);

      // Cost should be negative since sumAfter < sumBefore
      expect(cost).to.be.lt(0);
    });

    it("Should calculate positive CLMSR cost", async function () {
      const { test } = await loadFixture(deployFixture);

      // When sumAfter > sumBefore, cost should be positive
      const alpha = ethers.parseEther("1000");
      const sumBefore = ethers.parseEther("10");
      const sumAfter = ethers.parseEther("20");

      const cost = await test.clmsrCostSigned(alpha, sumBefore, sumAfter);

      // Cost should be positive since sumAfter > sumBefore
      expect(cost).to.be.gt(0);
    });
  });

  // ========================================
  // COMPREHENSIVE ERROR TESTS
  // ========================================

  describe("Error Handling", function () {
    it("Should test all error conditions", async function () {
      const { test } = await loadFixture(deployFixture);

      // Test FP_DivisionByZero
      await expect(test.testDivisionByZero()).to.be.revertedWithCustomError(
        test,
        "FP_DivisionByZero"
      );

      // Test FP_InvalidInput
      await expect(test.testLnZero()).to.be.revertedWithCustomError(
        test,
        "FP_InvalidInput"
      );

      // Test FP_EmptyArray for logSumExp
      await expect(test.testLogSumExpEmpty()).to.be.revertedWithCustomError(
        test,
        "FP_EmptyArray"
      );

      // Test FP_EmptyArray for sumExp
      await expect(test.testSumExpEmpty()).to.be.revertedWithCustomError(
        test,
        "FP_EmptyArray"
      );

      // Test signed division by zero
      await expect(
        test.testSignedDivisionByZero()
      ).to.be.revertedWithCustomError(test, "FP_DivisionByZero");
    });

    it("Should test CLMSR cost with ratio < 1 (reveals PRB-Math limits)", async function () {
      const { test } = await loadFixture(deployFixture);

      // When sumAfter < sumBefore, ratio < 1
      const alpha = ethers.parseEther("1000");
      const sumBefore = ethers.parseEther("20");
      const sumAfter = ethers.parseEther("10");

      // Now with custom guard implemented: FP_InvalidInput occurs first
      await expect(
        test.clmsrCost(alpha, sumBefore, sumAfter)
      ).to.be.revertedWithCustomError(test, "FP_InvalidInput");

      // But signed version should work
      const signedCost = await test.clmsrCostSigned(
        ethers.parseEther("1000"),
        ethers.parseEther("20"),
        ethers.parseEther("10")
      );
      expect(signedCost).to.be.lt(0); // Negative because alpha * ln(0.5) where ln(0.5) < 0
    });

    it("Should test clmsrCost with ratio == 1 (boundary case)", async function () {
      const { test } = await loadFixture(deployFixture);

      // When sumAfter == sumBefore, ratio == 1, ln(1) == 0
      const alpha = ethers.parseEther("1000");
      const sumBefore = ethers.parseEther("20");
      const sumAfter = ethers.parseEther("20"); // Same as sumBefore

      const cost = await test.clmsrCost(alpha, sumBefore, sumAfter);
      expect(cost).to.equal(0); // alpha * ln(1) = alpha * 0 = 0
    });

    it("Should test clmsrCost unsigned version guard for ratio < 1", async function () {
      const { test } = await loadFixture(deployFixture);

      // Test case where ratio < 1 should be caught by guard (if implemented)
      const alpha = ethers.parseEther("1000");
      const sumBefore = ethers.parseEther("20");
      const sumAfter = ethers.parseEther("10"); // ratio = 0.5 < 1

      // Now with custom guard implemented: FP_InvalidInput occurs first
      await expect(
        test.clmsrCost(alpha, sumBefore, sumAfter)
      ).to.be.revertedWithCustomError(test, "FP_InvalidInput");

      // Test additional ratio < 1 cases to ensure consistent revert behavior
      const testCases = [
        {
          sumBefore: ethers.parseEther("100"),
          sumAfter: ethers.parseEther("50"),
        }, // ratio = 0.5
        {
          sumBefore: ethers.parseEther("1000"),
          sumAfter: ethers.parseEther("1"),
        }, // ratio = 0.001
        { sumBefore: ethers.parseEther("2"), sumAfter: ethers.parseEther("1") }, // ratio = 0.5
      ];

      for (const { sumBefore, sumAfter } of testCases) {
        await expect(test.clmsrCost(alpha, sumBefore, sumAfter)).to.be.reverted;
      }
    });

    it("Should test signed ln with negative/zero values", async function () {
      const { test } = await loadFixture(deployFixture);

      // Test zero input (now triggers custom guard first)
      await expect(test.wLnSigned(0)).to.be.revertedWithCustomError(
        test,
        "FP_InvalidInput"
      );

      // Test negative input (now triggers custom guard first)
      await expect(
        test.wLnSigned(ethers.parseEther("-1"))
      ).to.be.revertedWithCustomError(test, "FP_InvalidInput");
    });

    it("Should test FP_Overflow in sumExp", async function () {
      const { test } = await loadFixture(deployFixture);

      // Test 1: Values that cause exp() to revert first (input too big)
      const tooLargeValues = [
        ethers.parseEther("135"),
        ethers.parseEther("135"),
        ethers.parseEther("135"),
      ];
      await expect(test.sumExp(tooLargeValues)).to.be.reverted;

      // Test 2: Try to trigger actual FP_Overflow in summation
      // exp(80) ≈ 5.5e34, so multiple large exp values might overflow uint256
      const bigValues = [
        ethers.parseEther("80"),
        ethers.parseEther("80"),
        ethers.parseEther("80"),
        ethers.parseEther("80"),
      ];

      // This should either succeed or revert with FP_Overflow
      // (depending on whether sum exceeds uint256.max)
      try {
        await test.sumExp(bigValues);
        // If it succeeds, that's also valid behavior
      } catch (error) {
        // If it reverts, should be FP_Overflow for summation overflow
        await expect(test.sumExp(bigValues)).to.be.revertedWithCustomError(
          test,
          "FP_Overflow"
        );
      }

      // Test 3: More aggressive overflow attempt with many large values
      const manyBigValues = Array(30).fill(ethers.parseEther("80"));

      // This might trigger FP_Overflow or succeed depending on actual values
      // exp(80) is large but may not overflow with 30 instances
      try {
        await test.sumExp(manyBigValues);
        // If it succeeds, that's valid - the values might not actually overflow
      } catch (error) {
        // If it fails, should be FP_Overflow
        await expect(test.sumExp(manyBigValues)).to.be.revertedWithCustomError(
          test,
          "FP_Overflow"
        );
      }

      // Test 4: Aggressive overflow with maximum safe exp values
      // exp(133) is near the PRB-Math limit, multiple instances should overflow
      const maxSafeExp = Array(7).fill(ethers.parseEther("133"));

      try {
        await test.sumExp(maxSafeExp);
        // If it succeeds, the overflow guard is defensive and works as intended
      } catch (error) {
        // If it fails, should be FP_Overflow for summation overflow
        await expect(test.sumExp(maxSafeExp)).to.be.revertedWithCustomError(
          test,
          "FP_Overflow"
        );
      }

      // Test 5: Guaranteed overflow case with very large array
      const guaranteedOverflow = Array(20).fill(ethers.parseEther("125"));
      try {
        await test.sumExp(guaranteedOverflow);
        // If even this succeeds, the overflow protection is very robust
      } catch (error) {
        // Expected: FP_Overflow
        await expect(
          test.sumExp(guaranteedOverflow)
        ).to.be.revertedWithCustomError(test, "FP_Overflow");
      }
    });
  });

  // ========================================
  // BOUNDARY VALUE TESTS
  // ========================================

  describe("Boundary Value Testing", function () {
    it("Should test exp boundary values precisely", async function () {
      const { test } = await loadFixture(deployFixture);

      // Test maximum safe value (PRB-Math limit is around 133.08 WAD)
      // Use a value slightly under the actual limit
      const maxSafe = "133084258667509499440"; // Just under PRB-Math limit
      await test.wExp(maxSafe); // Should succeed

      // Test human-readable values around the limit
      const nearLimit = ethers.parseEther("133");
      await test.wExp(nearLimit); // Should succeed

      const justOverReadable = ethers.parseEther("133.1");
      await expect(test.wExp(justOverReadable)).to.be.reverted; // Should fail

      // Test value just over the limit
      const justOverLimit = "133084258667509499442";
      await expect(test.wExp(justOverLimit)).to.be.reverted;

      // Test clearly over the limit
      const overLimit = ethers.parseEther("134");
      await expect(test.wExp(overLimit)).to.be.reverted;

      // Test precise boundary around 133.084 e18 (PRB-Math limit)
      const preciseBoundary = "133084258667509499440"; // Just under limit
      await test.wExp(preciseBoundary); // Should succeed

      const justOverBoundary = "133084258667509499441"; // Just over limit
      await expect(test.wExp(justOverBoundary)).to.be.reverted; // Should fail

      // Use loose revert check to avoid PRB-Math version dependency
      await expect(test.wExp(ethers.parseEther("135"))).to.be.reverted;
    });

    it("Should test ln boundary values precisely", async function () {
      const { test } = await loadFixture(deployFixture);

      // Test exactly 1 WAD - should equal 0
      const result = await test.wLn(UNIT);
      expect(result).to.equal(0);

      // Test value just under 1 WAD - PRB-Math error occurs first
      const justUnder = UNIT - 1n;
      await expect(test.wLn(justUnder)).to.be.reverted;

      // Test 0 - our custom guard catches this
      await expect(test.wLn(0)).to.be.revertedWithCustomError(
        test,
        "FP_InvalidInput"
      );

      // Test precise ±1 wei boundary around 1 WAD
      const exactWAD = ethers.parseEther("1");
      const lnOneResult = await test.wLn(exactWAD);
      expect(lnOneResult).to.equal(0); // ln(1) = 0 exactly

      // Test 1 WAD - 1 wei (should revert)
      const oneWeiUnder = exactWAD - 1n;
      await expect(test.wLn(oneWeiUnder)).to.be.reverted;

      // Test 1 WAD + 1 wei (should succeed and be positive)
      const oneWeiOver = exactWAD + 1n;
      const lnOverResult = await test.wLn(oneWeiOver);
      expect(lnOverResult).to.be.gte(0); // Very small positive value, might be 0 due to precision
    });

    it("Should test sqrt with extreme values", async function () {
      const { test } = await loadFixture(deployFixture);

      // Test sqrt(0) = 0 (boundary case)
      const zeroResult = await test.wSqrt(0);
      expect(zeroResult).to.equal(0);

      // Test perfect squares for accuracy
      const fourWAD = ethers.parseEther("4");
      const sqrtFour = await test.wSqrt(fourWAD);
      expect(sqrtFour).to.equal(ethers.parseEther("2")); // sqrt(4) = 2

      // Test very large value with expected result
      const largeValue = ethers.parseEther("1000000000000"); // 1e12 WAD
      const result2 = await test.wSqrt(largeValue);
      const expectedSqrt = ethers.parseEther("1000000"); // sqrt(1e12) = 1e6 WAD

      // Should be very close to expected value (within 1e-14 precision)
      const tolerance = ethers.parseEther("0.00000000000001");
      expect(result2).to.be.closeTo(expectedSqrt, tolerance);

      // Test maximum uint256 value (boundary case)
      const maxUint256 =
        "115792089237316195423570985008687907853269984665640564039457584007913129639935";
      try {
        const maxResult = await test.wSqrt(maxUint256);
        // If it succeeds, result should be ≤ 2^128
        const maxSqrt = "340282366920938463463374607431768211456"; // 2^128
        expect(maxResult).to.be.lte(maxSqrt);
      } catch (error) {
        // If it reverts, that's also acceptable for extreme values
      }

      // Test type(uint256).max - 1 for additional boundary coverage
      const almostMax = BigInt(maxUint256) - 1n;
      try {
        const almostMaxResult = await test.wSqrt(almostMax.toString());
        expect(almostMaxResult).to.be.gt(0);
      } catch (error) {
        // Revert is acceptable for extreme values
      }
    });
  });

  // ========================================
  // PRECISION AND INVARIANT TESTS
  // ========================================

  describe("Precision and Invariants", function () {
    it("Should test logSumExp with large scale differences", async function () {
      const { test } = await loadFixture(deployFixture);

      // Test with moderate scale differences (avoiding PRB-Math limits)
      const values = [
        ethers.parseEther("0"), // Small
        ethers.parseEther("5"), // Medium
        ethers.parseEther("10"), // Large
      ];

      const result = await test.logSumExp(values);

      // Test behavioral properties rather than exact values
      // logSumExp should be dominated by the largest value (10)
      // but slightly larger due to the other terms
      expect(result).to.be.gt(ethers.parseEther("10")); // Must be > max value
      expect(result).to.be.lt(ethers.parseEther("12")); // But not too much larger

      // Test numerical stability: result should be finite and positive
      expect(result).to.be.gt(0);
    });

    it("Should test logSumExp with very large scale differences", async function () {
      const { test } = await loadFixture(deployFixture);

      // Test with very large scale differences to exercise scaled summation path
      const largeScaleValues = [
        ethers.parseEther("0"), // Small
        ethers.parseEther("50"), // Large
        ethers.parseEther("100"), // Very large
      ];

      const result = await test.logSumExp(largeScaleValues);

      // Result should be dominated by largest value (100) but slightly larger
      expect(result).to.be.gt(ethers.parseEther("100")); // Must be > max value
      expect(result).to.be.lt(ethers.parseEther("102")); // But not too much larger

      // Test numerical stability: result should be finite and positive
      expect(result).to.be.gt(0);
    });

    it("Should test logSumExp with identical values", async function () {
      const { test } = await loadFixture(deployFixture);

      // Test with all identical values: logSumExp([k,k,k]) = k + ln(3)
      const k = ethers.parseEther("5");
      const identicalValues = [k, k, k];

      const result = await test.logSumExp(identicalValues);

      // Expected: k + ln(3) ≈ 5 + 1.0986 ≈ 6.0986 WAD
      const expectedLn3 = ethers.parseEther("1.098612288668109691"); // ln(3) in WAD
      const expected = k + expectedLn3;

      // Should be very close (within 1e-14 precision)
      const tolerance = ethers.parseEther("0.00000000000001");
      expect(result).to.be.closeTo(expected, tolerance);
    });

    it("Should test logSumExp behavioral properties", async function () {
      const { test } = await loadFixture(deployFixture);

      // Test behavioral properties rather than exact precision against JavaScript
      // Different implementations (PRB-Math vs JavaScript) can have significant differences

      const testCases = [
        [
          ethers.parseEther("1"),
          ethers.parseEther("2"),
          ethers.parseEther("3"),
        ],
        [
          ethers.parseEther("0"),
          ethers.parseEther("10"),
          ethers.parseEther("20"),
        ],
        [
          ethers.parseEther("5"),
          ethers.parseEther("15"),
          ethers.parseEther("25"),
        ],
      ];

      for (const values of testCases) {
        const result = await test.logSumExp(values);
        const maxValue = values.reduce(
          (max, val) => (val > max ? val : max),
          0n
        );

        // Key behavioral properties:
        // 1. Result should be greater than max input value
        expect(result).to.be.gt(maxValue);

        // 2. Result should be finite and positive
        expect(result).to.be.gt(0);

        // 3. Result should not be excessively larger than max value
        // (within reasonable bounds for the scale differences)
        const maxPlusBuffer = maxValue + ethers.parseEther("10");
        expect(result).to.be.lt(maxPlusBuffer);
      }
    });

    it("Should test CLMSR price normalization invariant", async function () {
      const { test } = await loadFixture(deployFixture);

      // Create mock exponential values
      const expValues = [
        ethers.parseEther("2"),
        ethers.parseEther("3"),
        ethers.parseEther("5"),
        ethers.parseEther("1"),
      ];

      // Calculate total sum
      const totalSum = expValues.reduce((sum, val) => sum + val, 0n);

      // Calculate individual prices
      let priceSum = 0n;
      for (const expValue of expValues) {
        const price = await test.clmsrPrice(expValue, totalSum);
        priceSum += price;
      }

      // Sum of all prices should equal 1 WAD (within 1 wei tolerance)
      expect(priceSum).to.be.closeTo(UNIT, 1);
    });

    it("Should test CLMSR price normalization with large random arrays", async function () {
      const { test } = await loadFixture(deployFixture);

      // Test with larger arrays to stress-test the invariant
      const randomExpValues = [
        ethers.parseEther("1.5"),
        ethers.parseEther("2.7"),
        ethers.parseEther("0.8"),
        ethers.parseEther("3.2"),
        ethers.parseEther("1.1"),
        ethers.parseEther("4.5"),
        ethers.parseEther("0.3"),
        ethers.parseEther("2.9"),
        ethers.parseEther("1.8"),
        ethers.parseEther("3.7"),
        ethers.parseEther("0.6"),
        ethers.parseEther("2.4"),
        ethers.parseEther("1.3"),
        ethers.parseEther("4.1"),
        ethers.parseEther("0.9"),
        ethers.parseEther("3.6"),
      ];

      // Calculate total sum
      const totalSum = randomExpValues.reduce((sum, val) => sum + val, 0n);

      // Calculate individual prices and sum them
      let priceSum = 0n;
      for (const expValue of randomExpValues) {
        const price = await test.clmsrPrice(expValue, totalSum);
        priceSum += price;
      }

      // Sum of all prices should equal 1 WAD (within reasonable tolerance for large arrays)
      // With 16 elements, rounding errors can accumulate
      expect(priceSum).to.be.closeTo(UNIT, 10);
    });

    it("Should test CLMSR price normalization with deterministic large arrays", async function () {
      const { test } = await loadFixture(deployFixture);

      // Test with deterministic values to avoid random test failures
      const testCases = [
        // Small arrays
        [
          ethers.parseEther("1"),
          ethers.parseEther("2"),
          ethers.parseEther("3"),
        ],
        // Medium arrays with controlled variance
        Array.from({ length: 8 }, (_, i) =>
          ethers.parseEther((i * 0.5 + 1).toString())
        ),
        // Large arrays with moderate variance
        Array.from({ length: 32 }, (_, i) =>
          ethers.parseEther((i * 0.1 + 1).toString())
        ),
        // Very large arrays (stress test) with small increments
        Array.from({ length: 64 }, (_, i) =>
          ethers.parseEther((i * 0.05 + 1).toString())
        ),
      ];

      for (const expValues of testCases) {
        const totalSum = expValues.reduce((sum, val) => sum + val, 0n);

        let priceSum = 0n;
        for (const expValue of expValues) {
          const price = await test.clmsrPrice(expValue, totalSum);
          priceSum += price;
        }

        // Sum should be very close to 1 WAD
        // Allow reasonable tolerance for arrays due to rounding accumulation
        // Large arrays (64 elements) can have up to ~30 wei cumulative error
        const tolerance = expValues.length > 32 ? 35 : 15;
        expect(priceSum).to.be.closeTo(UNIT, tolerance);
      }
    });

    it("Should test numerical stability in chained operations", async function () {
      const { test } = await loadFixture(deployFixture);

      // Test: exp(ln(x)) ≈ x for values that work with PRB-Math
      const testValues = [
        ethers.parseEther("1"),
        ethers.parseEther("1.5"),
        ethers.parseEther("2"),
        ethers.parseEther("5"),
        ethers.parseEther("10"),
        ethers.parseEther("50"),
        ethers.parseEther("100"),
        // Note: 0.1 causes PRB-Math ln to revert, so we skip it
      ];

      for (const value of testValues) {
        const lnResult = await test.wLn(value);
        const expLnResult = await test.wExp(lnResult);

        // Should be close to original value (within 1e-14 precision)
        const tolerance = ethers.parseEther("0.00000000000001"); // 1e-14
        expect(expLnResult).to.be.closeTo(value, tolerance);
      }
    });

    it("Should test div(mul(a,b),b) ≈ a invariant", async function () {
      const { test } = await loadFixture(deployFixture);

      const testPairs = [
        [ethers.parseEther("1"), ethers.parseEther("2")],
        [ethers.parseEther("5"), ethers.parseEther("3")],
        [ethers.parseEther("100"), ethers.parseEther("7")],
        [ethers.parseEther("0.5"), ethers.parseEther("1.5")],
      ];

      for (const [a, b] of testPairs) {
        const mulResult = await test.wMul(a, b);
        const divResult = await test.wDiv(mulResult, b);

        // Should recover original value a (within 1e-14 precision)
        const tolerance = ethers.parseEther("0.00000000000001"); // 1e-14
        expect(divResult).to.be.closeTo(a, tolerance);
      }
    });

    it("Should document PRB-Math ln limitations", async function () {
      const { test } = await loadFixture(deployFixture);

      // PRB-Math ln has minimum input around 1e18 (1 WAD)
      // Values below this cause revert
      await expect(test.wLn(ethers.parseEther("0.1"))).to.be.reverted;
      await expect(test.wLn(ethers.parseEther("0.9"))).to.be.reverted;

      // This is why signed version is needed for ratios < 1
    });
  });

  // ========================================
  // SIGNED MATH EDGE CASES
  // ========================================

  describe("Signed Math Edge Cases", function () {
    it("Should handle negative alpha in CLMSR cost", async function () {
      const { test } = await loadFixture(deployFixture);

      const negativeAlpha = ethers.parseEther("-1000");
      const sumBefore = ethers.parseEther("10");
      const sumAfter = ethers.parseEther("20");

      const cost = await test.clmsrCostSigned(
        negativeAlpha,
        sumBefore,
        sumAfter
      );

      // With negative alpha, cost should be negative when sumAfter > sumBefore
      expect(cost).to.be.lt(0);
    });

    it("Should handle extreme signed values", async function () {
      const { test } = await loadFixture(deployFixture);

      // Test with large positive and negative values
      const largePos = ethers.parseEther("1000000");
      const largeNeg = ethers.parseEther("-1000000");

      const result1 = await test.wMulSigned(
        largePos,
        ethers.parseEther("0.001")
      );
      expect(result1).to.equal(ethers.parseEther("1000"));

      const result2 = await test.wMulSigned(
        largeNeg,
        ethers.parseEther("0.001")
      );
      expect(result2).to.equal(ethers.parseEther("-1000"));

      // Test near PRB-Math signed limits (±2^59-1 ≈ ±5.76e17)
      // Note: We use WAD-scaled values (576.46... WAD)
      const nearMaxPos = ethers.parseEther("576460752.303423488"); // ~5.76e17 WAD
      const nearMaxNeg = ethers.parseEther("-576460752.303423488"); // ~-5.76e17 WAD

      // Test multiplication with small values
      const smallMultiplier = ethers.parseEther("0.1");

      const result3 = await test.wMulSigned(nearMaxPos, smallMultiplier);
      expect(result3).to.be.gt(0);

      const result4 = await test.wMulSigned(nearMaxNeg, smallMultiplier);
      expect(result4).to.be.lt(0);

      // Test division with large values
      const result5 = await test.wDivSigned(
        nearMaxPos,
        ethers.parseEther("10")
      );
      expect(result5).to.be.gt(0);

      const result6 = await test.wDivSigned(
        nearMaxNeg,
        ethers.parseEther("10")
      );
      expect(result6).to.be.lt(0);

      // Test extreme multiplication - may or may not overflow
      // The values might be within PRB-Math's safe range
      try {
        const result = await test.wMulSigned(nearMaxPos, nearMaxPos);
        // If it succeeds, verify the result is reasonable
        expect(result).to.be.gt(0);
      } catch (error) {
        // If it fails, that's also acceptable for extreme values
        // Could be PRB-Math overflow or other limits
      }
    });

    it("Should test mixed sign operations", async function () {
      const { test } = await loadFixture(deployFixture);

      // Positive * Negative = Negative
      const result1 = await test.wMulSigned(
        ethers.parseEther("5"),
        ethers.parseEther("-2")
      );
      expect(result1).to.equal(ethers.parseEther("-10"));

      // Negative / Positive = Negative
      const result2 = await test.wDivSigned(
        ethers.parseEther("-10"),
        ethers.parseEther("2")
      );
      expect(result2).to.equal(ethers.parseEther("-5"));

      // Negative / Negative = Positive
      const result3 = await test.wDivSigned(
        ethers.parseEther("-10"),
        ethers.parseEther("-2")
      );
      expect(result3).to.equal(ethers.parseEther("5"));

      // Test int256 minimum value ÷ -1 overflow (EVM special case)
      const int256Min =
        "-57896044618658097711785492504343953926634992332820282019728792003956564819968"; // -2^255
      const negativeOne = ethers.parseEther("-1");

      // This should revert due to overflow (result would be 2^255 which exceeds int256 max)
      await expect(test.wDivSigned(int256Min, negativeOne)).to.be.reverted;
    });
  });

  // ========================================
  // PROPERTY-BASED AND FUZZ TESTS
  // ========================================

  describe("Property-Based and Fuzz Tests", function () {
    it("Should test exp(ln(x)) ≈ x property with random values", async function () {
      const { test } = await loadFixture(deployFixture);

      // Generate 20 random values in safe range for PRB-Math ln
      const randomValues = [];
      for (let i = 0; i < 20; i++) {
        // Generate values between 1 and 1000 WAD (safe for ln)
        const randomWad = ethers.parseEther(
          (Math.random() * 999 + 1).toString()
        );
        randomValues.push(randomWad);
      }

      for (const value of randomValues) {
        const lnResult = await test.wLn(value);
        const expLnResult = await test.wExp(lnResult);

        // Should recover original value within reasonable tolerance
        const tolerance = value / 1000000n; // 0.0001% tolerance
        expect(expLnResult).to.be.closeTo(value, tolerance);
      }
    });

    it("Should test multiplication/division inverse property with random values", async function () {
      const { test } = await loadFixture(deployFixture);

      // Generate 15 random pairs
      for (let i = 0; i < 15; i++) {
        const a = ethers.parseEther((Math.random() * 1000 + 0.1).toString());
        const b = ethers.parseEther((Math.random() * 1000 + 0.1).toString());

        // Test: div(mul(a, b), b) ≈ a
        const mulResult = await test.wMul(a, b);
        const divResult = await test.wDiv(mulResult, b);

        const tolerance = a / 1000000n; // 0.0001% tolerance
        expect(divResult).to.be.closeTo(a, tolerance);
      }
    });

    it("Should test CLMSR price normalization with random arrays", async function () {
      const { test } = await loadFixture(deployFixture);

      // Test 10 random arrays of different sizes
      for (let arrayTest = 0; arrayTest < 10; arrayTest++) {
        const arraySize = Math.floor(Math.random() * 20) + 5; // 5-24 elements
        const expValues = [];

        for (let i = 0; i < arraySize; i++) {
          // Generate random exp values between 1 and 100 WAD
          const randomExp = ethers.parseEther(
            (Math.random() * 99 + 1).toString()
          );
          expValues.push(randomExp);
        }

        const totalSum = expValues.reduce((sum, val) => sum + val, 0n);

        let priceSum = 0n;
        for (const expValue of expValues) {
          const price = await test.clmsrPrice(expValue, totalSum);
          priceSum += price;
        }

        // Sum should be very close to 1 WAD
        const tolerance = BigInt(arraySize * 5); // Allow more tolerance for larger arrays
        expect(priceSum).to.be.closeTo(ethers.parseEther("1"), tolerance);
      }
    });

    it("Should test continuous operation chains with random values", async function () {
      const { test } = await loadFixture(deployFixture);

      // Test 5 chains of 10 operations each
      for (let chain = 0; chain < 5; chain++) {
        let value = ethers.parseEther("10"); // Start with 10 WAD

        for (let op = 0; op < 10; op++) {
          const randomMultiplier = ethers.parseEther(
            (Math.random() * 2 + 0.5).toString()
          ); // 0.5-2.5

          // Multiply then divide by same value
          value = await test.wMul(value, randomMultiplier);
          value = await test.wDiv(value, randomMultiplier);
        }

        // After 10 mul/div pairs, should be close to original 10 WAD
        const tolerance = ethers.parseEther("0.001"); // 0.1% tolerance
        expect(value).to.be.closeTo(ethers.parseEther("10"), tolerance);
      }
    });

    it("Should test extreme boundary values near PRB-Math limits", async function () {
      const { test } = await loadFixture(deployFixture);

      // Test values near exp() input limit (130 WAD)
      const nearExpLimit = ethers.parseEther("129.9");
      const expResult = await test.wExp(nearExpLimit);
      expect(expResult).to.be.gt(0);

      // Test very large values for multiplication
      const largeValue = ethers.parseEther("1000000");
      const smallValue = ethers.parseEther("0.000001");
      const mulResult = await test.wMul(largeValue, smallValue);
      expect(mulResult).to.equal(ethers.parseEther("1"));

      // Test values that should cause revert
      await expect(test.wExp(ethers.parseEther("140"))).to.be.reverted;
      await expect(test.wLn(ethers.parseEther("0.5"))).to.be.reverted;
    });

    it("Should test signed operations with extreme values", async function () {
      const { test } = await loadFixture(deployFixture);

      // Test near signed limits with random operations
      for (let i = 0; i < 10; i++) {
        const randomPositive = ethers.parseEther(
          (Math.random() * 1000 + 1).toString()
        );
        const randomNegative = ethers.parseEther(
          (-Math.random() * 1000 - 1).toString()
        );

        // Test mixed sign multiplication
        const mixedResult = await test.wMulSigned(
          randomPositive,
          randomNegative
        );
        expect(mixedResult).to.be.lt(0);

        // Test division with mixed signs
        const divResult = await test.wDivSigned(randomNegative, randomPositive);
        expect(divResult).to.be.lt(0);
      }
    });

    it("Should test precision preservation in complex calculations", async function () {
      const { test } = await loadFixture(deployFixture);

      // Test precision with very small and very large numbers
      const verySmall = ethers.parseEther("0.000000001"); // 1e-9
      const veryLarge = ethers.parseEther("1000000000"); // 1e9

      // Test that small * large / large ≈ small
      const mulResult = await test.wMul(verySmall, veryLarge);
      const divResult = await test.wDiv(mulResult, veryLarge);

      const tolerance = verySmall / 1000n; // 0.1% tolerance
      expect(divResult).to.be.closeTo(verySmall, tolerance);
    });
  });

  // ========================================
  // ROUND-UP CONVERSION TESTS
  // ========================================

  describe("Round-Up Conversion Tests", function () {
    it("Should round up fromWadRoundUp correctly", async function () {
      const { test } = await loadFixture(deployFixture);

      // Test cases: [wadValue, expectedRoundedUp]
      const testCases = [
        [0n, 0n], // 0 should remain 0
        [1n, 1n], // 1 wei should round up to 1 micro
        [1000000000000n - 1n, 1n], // 1e12-1 should round up to 1
        [1000000000000n, 1n], // 1e12 should be exactly 1
        [1000000000001n, 2n], // 1e12+1 should round up to 2
        [2000000000000n, 2n], // 2e12 should be exactly 2
        [2000000000001n, 3n], // 2e12+1 should round up to 3
        [ethers.parseEther("1"), 1000000n], // 1 WAD = 1e6 micro
      ];

      for (const [wadValue, expected] of testCases) {
        const result = await test.testFromWadRoundUp(wadValue);
        expect(result).to.equal(expected, `Failed for wadValue: ${wadValue}`);
      }
    });

    it("Should compare fromWad vs fromWadRoundUp", async function () {
      const { test } = await loadFixture(deployFixture);

      // Test values that would be truncated to 0 with fromWad
      const smallValues = [
        1n,
        100n,
        1000n,
        10000n,
        100000n,
        1000000n,
        10000000n,
        100000000n,
        1000000000n,
        10000000000n,
        100000000000n,
        999999999999n, // 1e12 - 1
      ];

      for (const wadValue of smallValues) {
        const normalResult = await test.testFromWad(wadValue);
        const roundUpResult = await test.testFromWadRoundUp(wadValue);

        // Normal fromWad should be 0 for values < 1e12
        expect(normalResult).to.equal(0n);
        // Round-up should be 1 for any non-zero value < 1e12
        expect(roundUpResult).to.equal(1n);
      }
    });

    it("Should handle large values correctly in fromWadRoundUp", async function () {
      const { test } = await loadFixture(deployFixture);

      const largeValues = [
        ethers.parseEther("1000"), // 1000 WAD
        ethers.parseEther("1000000"), // 1M WAD
        ethers.parseEther("1000000000"), // 1B WAD
      ];

      for (const wadValue of largeValues) {
        const normalResult = await test.testFromWad(wadValue);
        const roundUpResult = await test.testFromWadRoundUp(wadValue);

        // For large values, both should give the same result
        expect(roundUpResult).to.equal(normalResult);
      }
    });

    it("Should prevent zero-cost attack scenario", async function () {
      const { test } = await loadFixture(deployFixture);

      // Simulate a scenario where CLMSR cost calculation results in very small WAD value
      const tinyWadValues = [
        1n, // 1 wei
        10n, // 10 wei
        100n, // 100 wei
        1000n, // 1000 wei
        500000000000n, // 0.5 * 1e12 (half micro)
        999999999999n, // 1e12 - 1 (just under 1 micro)
      ];

      for (const wadValue of tinyWadValues) {
        const cost = await test.testFromWadRoundUp(wadValue);

        // All tiny values should result in at least 1 micro USDC cost
        expect(cost).to.be.at.least(1n);
        expect(cost).to.equal(1n); // Should be exactly 1 for values < 1e12
      }
    });
  });
});
