import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { UNIT_TAG } from "../../../helpers/tags";
import { unitFixture } from "../../../helpers/fixtures/core";
import { createDeterministicRandom } from "../../../helpers/utils/random";

describe(`${UNIT_TAG} FixedPointMath - Basic Operations`, function () {
  const WAD = ethers.parseEther("1");
  const TWO = ethers.parseEther("2");
  const HALF = ethers.parseEther("0.5");

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

  describe("Unsigned Math Operations", function () {
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
      const result2 = await test.wDiv(WAD, TWO);
      expect(result2).to.equal(HALF);
    });

    it("Should revert on division by zero", async function () {
      const { test } = await loadFixture(deployFixture);

      await expect(test.wDiv(WAD, 0)).to.be.revertedWithCustomError(
        test,
        "FP_DivisionByZero"
      );
    });

    it("Should handle WAD format operations", async function () {
      const { test } = await loadFixture(deployFixture);

      // All operations in signals-v0 use WAD format (1e18)
      const five = ethers.parseEther("5");
      const result = await test.wMul(five, WAD);
      expect(result).to.equal(five);
    });

    it("Should handle large values safely", async function () {
      const { test } = await loadFixture(deployFixture);

      // Test with large but safe values
      const largeValue = ethers.parseEther("1000000");
      const result = await test.wMul(largeValue, WAD);
      expect(result).to.equal(largeValue);
    });

    it("Should calculate exponential correctly", async function () {
      const { test } = await loadFixture(deployFixture);

      // exp(0) = 1
      const result1 = await test.wExp(0);
      expect(result1).to.equal(WAD);

      // exp(1) ≈ 2.718...
      const result2 = await test.wExp(WAD);
      expect(result2).to.be.closeTo(
        ethers.parseEther("2.718281828459045235"),
        ethers.parseEther("0.000000000000000001")
      );
    });

    it("Should calculate natural logarithm correctly", async function () {
      const { test } = await loadFixture(deployFixture);

      // ln(1) = 0
      const result1 = await test.wLn(WAD);
      expect(result1).to.equal(0);

      // ln(e) ≈ 1 (with more generous tolerance for floating point precision)
      const e = ethers.parseEther("2.718281828459045235");
      const result2 = await test.wLn(e);
      expect(result2).to.be.closeTo(
        WAD,
        ethers.parseEther("0.000000000000001")
      ); // More generous tolerance
    });

    it("Should calculate square root correctly", async function () {
      const { test } = await loadFixture(deployFixture);

      // sqrt(1) = 1
      const result1 = await test.wSqrt(WAD);
      expect(result1).to.equal(WAD);

      // sqrt(4) = 2
      const result2 = await test.wSqrt(ethers.parseEther("4"));
      expect(result2).to.equal(TWO);
    });

    it("Should calculate CLMSR cost correctly", async function () {
      const { test } = await loadFixture(deployFixture);

      const alpha = ethers.parseEther("1000");
      const sumBefore = ethers.parseEther("10");
      const sumAfter = ethers.parseEther("20");

      const cost = await test.clmsrCost(alpha, sumBefore, sumAfter);
      expect(cost).to.be.gt(0);
    });

    it("Should calculate CLMSR price correctly", async function () {
      const { test } = await loadFixture(deployFixture);

      const expValue = ethers.parseEther("2");
      const totalSumExp = ethers.parseEther("10");

      const price = await test.clmsrPrice(expValue, totalSumExp);
      expect(price).to.equal(ethers.parseEther("0.2")); // 2/10 = 0.2
    });

    it("Should handle conversion functions correctly", async function () {
      const { test } = await loadFixture(deployFixture);

      // toWad: 1 USDC (6 decimals) -> 1e18 WAD
      const oneUSDC = ethers.parseUnits("1", 6);
      const wadResult = await test.testToWad(oneUSDC);
      expect(wadResult).to.equal(WAD);

      // fromWad: 1e18 WAD -> 1 USDC (6 decimals)
      const usdcResult = await test.testFromWad(WAD);
      expect(usdcResult).to.equal(oneUSDC);

      // fromWadRoundUp: should round up fractional amounts
      const wadWithFraction = WAD + 1n; // 1.000000000000000001 WAD
      const roundedResult = await test.testFromWadRoundUp(wadWithFraction);
      expect(roundedResult).to.equal(oneUSDC + 1n); // Should round up to next USDC unit
    });

    it("Should round up conversion for boundary and random samples", async function () {
      const { test } = await loadFixture(deployFixture);
      const rng = createDeterministicRandom(20241024);

      const SCALE_DIFF = 1_000_000_000_000n;
      const FRACTION_SCALE = 1_000_000n;
      const FRACTION_STEP = WAD / FRACTION_SCALE;

      const MAX_UINT256 = (1n << 256n) - 1n;

      const samples: bigint[] = [0n, 1n, SCALE_DIFF, SCALE_DIFF + 1n, MAX_UINT256];

      while (samples.length < 100) {
        const integerPart = BigInt(Math.floor(rng() * 1_000_000));
        const fractionalPart = BigInt(Math.floor(rng() * Number(FRACTION_SCALE)));
        const wadValue = integerPart * WAD + fractionalPart * FRACTION_STEP;
        samples.push(wadValue);
      }

      for (const wadValue of samples) {
        const floor = await test.testFromWad(wadValue);
        const ceil = await test.testFromWadRoundUp(wadValue);

        expect(ceil).to.be.gte(floor);

        const hasFraction = wadValue % SCALE_DIFF !== 0n;

        if (wadValue === 0n) {
          expect(floor).to.equal(0n);
          expect(ceil).to.equal(0n);
          continue;
        }

        if (hasFraction) {
          expect(ceil - floor).to.equal(1n);
          expect(ceil).to.be.gt(0n);
        } else {
          expect(ceil).to.equal(floor);
        }

        const lowerBound = (ceil - 1n) * SCALE_DIFF;
        const upperBound = ceil * SCALE_DIFF;

        expect(wadValue).to.be.gt(lowerBound);
        expect(wadValue).to.be.lte(upperBound);
      }
    });
  });

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

      await expect(test.wDivSigned(WAD, 0)).to.be.revertedWithCustomError(
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

    it("Should handle signed natural logarithm", async function () {
      const { test } = await loadFixture(deployFixture);

      // ln(1) = 0 (signed)
      const result1 = await test.wLnSigned(WAD);
      expect(result1).to.equal(0);

      // Test with negative alpha in CLMSR cost
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
  });

  describe("Array Operations", function () {
    it("Should calculate sum of exponentials", async function () {
      const { test } = await loadFixture(deployFixture);

      const values = [WAD, TWO, ethers.parseEther("3")];
      const result = await test.sumExp(values);

      // Should be approximately exp(1) + exp(2) + exp(3)
      expect(result).to.be.gt(0);
    });

    it("Should calculate log-sum-exp", async function () {
      const { test } = await loadFixture(deployFixture);

      const values = [
        ethers.parseEther("50"),
        ethers.parseEther("51"),
        ethers.parseEther("30"),
      ];
      const result = await test.logSumExp(values);

      // logSumExp should handle large values without overflow
      expect(result).to.be.gt(0);
    });

    it("Should revert on empty arrays", async function () {
      const { test } = await loadFixture(deployFixture);

      await expect(test.sumExp([])).to.be.revertedWithCustomError(
        test,
        "FP_EmptyArray"
      );

      await expect(test.logSumExp([])).to.be.revertedWithCustomError(
        test,
        "FP_EmptyArray"
      );
    });
  });

  describe("Edge Cases and Error Handling", function () {
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
    });

    it("Should revert on ln(0)", async function () {
      const { test } = await loadFixture(deployFixture);

      await expect(test.wLn(0)).to.be.revertedWithCustomError(
        test,
        "FP_InvalidInput"
      );
    });

    it("Should handle boundary values in exp", async function () {
      const { test } = await loadFixture(deployFixture);

      // Test safe boundary values
      const result1 = await test.wExp(0);
      expect(result1).to.equal(WAD);

      const result2 = await test.wExp(WAD);
      expect(result2).to.be.gt(WAD);

      // Test near a safe limit (133e18 is safer than 135e18)
      const result3 = await test.wExp(ethers.parseEther("133"));
      expect(result3).to.be.gt(0);
    });

    it("Should access constants correctly", async function () {
      const { test } = await loadFixture(deployFixture);

      const wadConstant = await test.WAD();
      expect(wadConstant).to.equal(WAD);

      // Legacy compatibility
      const unitConstant = await test.UNIT();
      expect(unitConstant).to.equal(WAD);
    });
  });
});
