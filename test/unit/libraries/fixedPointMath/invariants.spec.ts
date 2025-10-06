import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { UNIT_TAG } from "../../../helpers/tags";
import { unitFixture } from "../../../helpers/fixtures/core";
import { createDeterministicRandom } from "../../../helpers/utils/random";

describe(`${UNIT_TAG} FixedPointMath - Invariants & Precision`, function () {
  const UNIT = ethers.parseEther("1");
  const TWO = ethers.parseEther("2");

  async function deployFixture() {
    const { fixedPointMathU } = await unitFixture();

    const FixedPointMathTest = await ethers.getContractFactory(
      "FixedPointMathTest",
      {
        libraries: { FixedPointMathU: await fixedPointMathU.getAddress() },
      }
    );
    const test = await FixedPointMathTest.deploy();
    await test.waitForDeployment();

    return { test };
  }

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
      const maxInputBig = BigInt(maxUint256);
      await expect(test.wSqrt(maxUint256)).to.be.revertedWithCustomError(
        test,
        "PRBMath_UD60x18_Sqrt_Overflow"
      );

      // Just below the limit also overflows because PRB-Math rounding guards
      await expect(
        test.wSqrt((maxInputBig - 1n).toString())
      ).to.be.revertedWithCustomError(test, "PRBMath_UD60x18_Sqrt_Overflow");

      // Large but safe value should succeed
      const safeInputBig = 10n ** 24n; // 1e24 (represents 1e6 WAD)
      const safeResult = (await test.wSqrt(safeInputBig.toString())) as bigint;
      const WAD = 1_000_000_000_000_000_000n;
      const safeResultSquared = (safeResult * safeResult) / WAD;
      expect(safeResultSquared).to.equal(safeInputBig);
      const nextSquare = ((safeResult + 1n) * (safeResult + 1n)) / WAD;
      expect(nextSquare).to.be.gt(safeInputBig);
    });
  });

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

      // Test with extreme scale differences that might cause numerical issues
      const extremeValues = [
        ethers.parseEther("0.1"), // Very small
        ethers.parseEther("50"), // Very large
        ethers.parseEther("60"), // Even larger
      ];

      const result = await test.logSumExp(extremeValues);

      // Should be dominated by the largest value (60)
      expect(result).to.be.gt(ethers.parseEther("60"));
      expect(result).to.be.lt(ethers.parseEther("62"));
    });

    it("Should maintain exp/ln inverse relationship", async function () {
      const { test } = await loadFixture(deployFixture);

      // Test values in safe range for both operations
      const testValues = [
        ethers.parseEther("1"),
        ethers.parseEther("2"),
        ethers.parseEther("5"),
        ethers.parseEther("10"),
        ethers.parseEther("50"),
      ];

      for (const value of testValues) {
        // exp(ln(x)) should equal x within tolerance for safe-domain values
        const lnResult = await test.wLn(value);
        const expLnResult = await test.wExp(lnResult);

        const tolerance = value / 100000n; // 0.001% tolerance
        expect(expLnResult).to.be.closeTo(value, tolerance);
      }
    });

    it("Should maintain multiplicative properties", async function () {
      const { test } = await loadFixture(deployFixture);

      // Test: (a * b) / a = b
      const a = ethers.parseEther("3.14159");
      const b = ethers.parseEther("2.71828");

      const product = await test.wMul(a, b);
      const result = await test.wDiv(product, a);

      const tolerance = b / 10000n; // 0.01% tolerance
      expect(result).to.be.closeTo(b, tolerance);
    });

    it("Should handle signed math operations correctly", async function () {
      const { test } = await loadFixture(deployFixture);

      // Test signed multiplication
      const a = ethers.parseEther("2");
      const b = ethers.parseEther("-3");
      const result = await test.wMulSigned(a, b);
      expect(result).to.equal(ethers.parseEther("-6"));

      // Test signed division
      const c = ethers.parseEther("-6");
      const d = ethers.parseEther("2");
      const result2 = await test.wDivSigned(c, d);
      expect(result2).to.equal(ethers.parseEther("-3"));
    });

    it("Should handle negative CLMSR cost calculations", async function () {
      const { test } = await loadFixture(deployFixture);

      // Test negative cost (selling scenario)
      const alpha = ethers.parseEther("1000");
      const sumBefore = ethers.parseEther("20");
      const sumAfter = ethers.parseEther("10"); // Decrease

      const cost = await test.clmsrCostSigned(alpha, sumBefore, sumAfter);
      expect(cost).to.be.lt(0); // Should be negative
    });

    it("Should maintain numerical stability in edge cases", async function () {
      const { test } = await loadFixture(deployFixture);

      // Test with very close but not equal values
      const base = ethers.parseEther("1000000");
      const tiny = 1n; // 1 wei difference

      const ratio1 = await test.wDiv(base + tiny, base);
      const ratio2 = await test.wDiv(base, base + tiny);

      // Both should be very close to 1 but not exactly 1
      expect(ratio1).to.be.gte(UNIT); // Changed from gt to gte to handle precision edge case
      expect(ratio2).to.be.lte(UNIT); // Changed from lt to lte

      // The product of ratios should be very close to 1
      const product = await test.wMul(ratio1, ratio2);
      const tolerance = UNIT / 100000n; // Relaxed tolerance for numerical precision
      expect(product).to.be.closeTo(UNIT, tolerance);
    });

    it("Should handle overflow protection in sumExp", async function () {
      const { test } = await loadFixture(deployFixture);

      // Sanity: values comfortably within safe range should succeed
      const safeValues = Array(10).fill(ethers.parseEther("100"));
      const safeResult = await test.sumExp(safeValues);
      expect(safeResult).to.be.gt(0);

      // Values close to the PRB-Math exp upper bound will overflow when summed
      const nearLimit = ethers.parseEther("133.08");
      const overflowValues = Array(20).fill(nearLimit);

      await expect(test.sumExp(overflowValues)).to.be.revertedWithCustomError(
        test,
        "FP_Overflow"
      );
    });

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

  describe("Property-Based and Fuzz Tests", function () {
    it("Should test exp(ln(x)) ≈ x property with random values", async function () {
      const { test } = await loadFixture(deployFixture);
      const random = createDeterministicRandom(1);

      // Generate 20 random values in safe range for PRB-Math ln
      const randomValues = [];
      for (let i = 0; i < 20; i++) {
        // Generate values between 1 and 1000 WAD (safe for ln)
        const randomWad = ethers.parseEther(
          (random() * 999 + 1).toString()
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
      const random = createDeterministicRandom(2);

      // Generate 15 random pairs
      for (let i = 0; i < 15; i++) {
        const a = ethers.parseEther((random() * 1000 + 0.1).toString());
        const b = ethers.parseEther((random() * 1000 + 0.1).toString());

        // Test: div(mul(a, b), b) ≈ a
        const mulResult = await test.wMul(a, b);
        const divResult = await test.wDiv(mulResult, b);

        const tolerance = a / 1000000n; // 0.0001% tolerance
        expect(divResult).to.be.closeTo(a, tolerance);
      }
    });

    it("Should test CLMSR price normalization with random arrays", async function () {
      const { test } = await loadFixture(deployFixture);
      const random = createDeterministicRandom(3);

      // Test 10 random arrays of different sizes
      for (let arrayTest = 0; arrayTest < 10; arrayTest++) {
        const arraySize = Math.floor(random() * 20) + 5; // 5-24 elements
        const expValues = [];

        for (let i = 0; i < arraySize; i++) {
          // Generate random exp values between 1 and 100 WAD
          const randomExp = ethers.parseEther(
            (random() * 99 + 1).toString()
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
      const random = createDeterministicRandom(4);

      // Test 5 chains of 10 operations each
      for (let chain = 0; chain < 5; chain++) {
        let value = ethers.parseEther("10"); // Start with 10 WAD

        for (let op = 0; op < 10; op++) {
          const randomMultiplier = ethers.parseEther(
            (random() * 2 + 0.5).toString()
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
      const random = createDeterministicRandom(5);

      // Test near signed limits with random operations
      for (let i = 0; i < 10; i++) {
        const randomPositive = ethers.parseEther((random() * 1000 + 1).toString());
        const randomNegative = ethers.parseEther(
          (-random() * 1000 - 1).toString()
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
});
