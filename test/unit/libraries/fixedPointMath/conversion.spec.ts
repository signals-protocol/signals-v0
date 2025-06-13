import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { UNIT_TAG } from "../../../helpers/tags";
import { unitFixture } from "../../../helpers/fixtures/core";

describe(`${UNIT_TAG} FixedPointMath - Conversion & Utility Functions`, function () {
  const WAD = ethers.parseEther("1");

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

  describe("Conversion Functions", function () {
    it("Should convert from 6-decimal to WAD format", async function () {
      const { test } = await loadFixture(deployFixture);

      // 1 USDC (6 decimals) -> 1 WAD (18 decimals)
      const oneUSDC = ethers.parseUnits("1", 6);
      const result = await test.testToWad(oneUSDC);
      expect(result).to.equal(WAD);

      // 1000 USDC -> 1000 WAD
      const thousandUSDC = ethers.parseUnits("1000", 6);
      const result2 = await test.testToWad(thousandUSDC);
      expect(result2).to.equal(ethers.parseEther("1000"));

      // 0.001 USDC -> 0.001 WAD
      const fractionalUSDC = ethers.parseUnits("0.001", 6);
      const result3 = await test.testToWad(fractionalUSDC);
      expect(result3).to.equal(ethers.parseEther("0.001"));
    });

    it("Should convert from WAD to 6-decimal format", async function () {
      const { test } = await loadFixture(deployFixture);

      // 1 WAD -> 1 USDC (6 decimals)
      const result = await test.testFromWad(WAD);
      expect(result).to.equal(ethers.parseUnits("1", 6));

      // 1000 WAD -> 1000 USDC
      const result2 = await test.testFromWad(ethers.parseEther("1000"));
      expect(result2).to.equal(ethers.parseUnits("1000", 6));

      // 0.001 WAD -> 0.001 USDC
      const result3 = await test.testFromWad(ethers.parseEther("0.001"));
      expect(result3).to.equal(ethers.parseUnits("0.001", 6));
    });

    it("Should round up in fromWadRoundUp conversion", async function () {
      const { test } = await loadFixture(deployFixture);

      // Exact conversion should work the same
      const exactResult = await test.testFromWadRoundUp(WAD);
      expect(exactResult).to.equal(ethers.parseUnits("1", 6));

      // Fractional amount should round up
      const fractionalWad = WAD + 1n; // 1.000000000000000001 WAD
      const roundedResult = await test.testFromWadRoundUp(fractionalWad);
      expect(roundedResult).to.equal(ethers.parseUnits("1", 6) + 1n); // Should round up

      // Another fractional test
      const smallFraction = ethers.parseEther("0.0000001"); // 0.0000001 WAD
      const roundedResult2 = await test.testFromWadRoundUp(smallFraction);
      expect(roundedResult2).to.equal(1n); // Should round up to 1 micro-unit
    });

    it("Should maintain precision in round-trip conversions", async function () {
      const { test } = await loadFixture(deployFixture);

      const testValues = [
        ethers.parseUnits("1", 6),
        ethers.parseUnits("100", 6),
        ethers.parseUnits("0.5", 6),
        ethers.parseUnits("999999", 6), // Large value
      ];

      for (const value6 of testValues) {
        // 6-decimal -> WAD -> 6-decimal should preserve value
        const wad = await test.testToWad(value6);
        const backTo6 = await test.testFromWad(wad);
        expect(backTo6).to.equal(value6);
      }
    });
  });

  describe("Utility Functions", function () {
    it("Should calculate square root correctly", async function () {
      const { test } = await loadFixture(deployFixture);

      // sqrt(4) = 2
      const result = await test.wSqrt(ethers.parseEther("4"));
      expect(result).to.equal(ethers.parseEther("2"));

      // sqrt(1) = 1
      const result2 = await test.wSqrt(WAD);
      expect(result2).to.equal(WAD);

      // sqrt(0.25) = 0.5
      const result3 = await test.wSqrt(ethers.parseEther("0.25"));
      expect(result3).to.equal(ethers.parseEther("0.5"));
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

    it("Should calculate sum of exponentials with empty check", async function () {
      const { test } = await loadFixture(deployFixture);

      // Test empty array handling
      await expect(test.sumExp([])).to.be.revertedWithCustomError(
        test,
        "FP_EmptyArray"
      );

      // Test single value
      const singleValue = [ethers.parseEther("2")];
      const result = await test.sumExp(singleValue);
      const expected = await test.wExp(singleValue[0]);
      expect(result).to.equal(expected);
    });
  });

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

  describe("Edge Cases", function () {
    it("Should handle very small numbers", async function () {
      const { test } = await loadFixture(deployFixture);

      const verySmall = 1; // 1 wei
      const result = await test.wMul(verySmall, WAD);
      expect(result).to.equal(verySmall);
    });

    it("Should handle maximum safe values", async function () {
      const { test } = await loadFixture(deployFixture);

      const largeValue = ethers.parseEther("1000000000"); // 1 billion
      const result = await test.wDiv(largeValue, WAD);
      expect(result).to.equal(largeValue);
    });

    it("Should maintain precision in chained operations", async function () {
      const { test } = await loadFixture(deployFixture);

      // (2 * 3) / 2 = 3
      const step1 = await test.wMul(
        ethers.parseEther("2"),
        ethers.parseEther("3")
      );
      const result = await test.wDiv(step1, ethers.parseEther("2"));
      expect(result).to.equal(ethers.parseEther("3"));
    });

    it("Should handle conversion edge cases", async function () {
      const { test } = await loadFixture(deployFixture);

      // Test zero conversion
      const zeroWad = await test.testToWad(0);
      expect(zeroWad).to.equal(0);

      const zeroUsdc = await test.testFromWad(0);
      expect(zeroUsdc).to.equal(0);

      // Test maximum 6-decimal value (type(uint64).max for USDC-like tokens)
      const maxUsdc = ethers.parseUnits("18446744073709.551615", 6); // ~18.4 trillion USDC
      const maxWad = await test.testToWad(maxUsdc);
      const backToUsdc = await test.testFromWad(maxWad);
      expect(backToUsdc).to.equal(maxUsdc);
    });
  });

  describe("Precision and Round-Up Behavior", function () {
    it("Should demonstrate precision loss and recovery", async function () {
      const { test } = await loadFixture(deployFixture);

      // Small fractional amounts that lose precision in 6-decimal
      const tinyWad = ethers.parseEther("0.0000001"); // 0.1 micro-USDC equivalent

      // Regular conversion loses precision (rounds down to 0)
      const lostPrecision = await test.testFromWad(tinyWad);
      expect(lostPrecision).to.equal(0);

      // Round-up conversion preserves minimum unit
      const preserved = await test.testFromWadRoundUp(tinyWad);
      expect(preserved).to.equal(1); // 1 micro-USDC
    });

    it("Should handle round-up behavior consistently", async function () {
      const { test } = await loadFixture(deployFixture);

      const testCases = [
        { input: WAD + 1n, expectedRoundUp: ethers.parseUnits("1", 6) + 1n },
        {
          input: WAD / 2n + 1n,
          expectedRoundUp: ethers.parseUnits("0.5", 6) + 1n,
        },
        { input: ethers.parseEther("0.000001") + 1n, expectedRoundUp: 2n }, // Just over 1 micro-USDC
      ];

      for (const { input, expectedRoundUp } of testCases) {
        const result = await test.testFromWadRoundUp(input);
        expect(result).to.equal(expectedRoundUp);
      }
    });

    it("Should handle constants correctly", async function () {
      const { test } = await loadFixture(deployFixture);

      // Test WAD constant
      const wadConstant = await test.WAD();
      expect(wadConstant).to.equal(WAD);

      // Test legacy UNIT constant (should be same as WAD)
      const unitConstant = await test.UNIT();
      expect(unitConstant).to.equal(WAD);
    });
  });

  describe("Gas Optimization Validation", function () {
    it("Should validate unchecked arithmetic is safe", async function () {
      const { test } = await loadFixture(deployFixture);

      // Test that conversion operations work within expected ranges
      const reasonableValues = [
        ethers.parseUnits("1", 6),
        ethers.parseUnits("1000000", 6), // 1M USDC
        ethers.parseUnits("0.000001", 6), // 1 micro-USDC
      ];

      for (const value of reasonableValues) {
        // toWad should never overflow for reasonable USDC amounts
        const wad = await test.testToWad(value);
        expect(wad).to.be.gt(0);

        // Round trip should work
        const backTo6 = await test.testFromWad(wad);
        expect(backTo6).to.equal(value);
      }
    });

    it("Should verify conversion scale factor consistency", async function () {
      const { test } = await loadFixture(deployFixture);

      // 1 USDC (10^6) * 10^12 = 1 WAD (10^18)
      const oneUsdc = ethers.parseUnits("1", 6);
      const oneWad = await test.testToWad(oneUsdc);

      // Verify the scale difference is exactly 10^12
      expect(oneWad / oneUsdc).to.equal(1000000000000n); // 10^12
    });
  });
});
