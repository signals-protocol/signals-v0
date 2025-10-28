// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {FixedPointMathU, FP_DivisionByZero, FP_InvalidInput} from "../libraries/FixedPointMath.sol";
import {sqrt} from "@prb/math/src/ud60x18/Math.sol";
import {wrap as wrapUd, unwrap as unwrapUd} from "@prb/math/src/ud60x18/Casting.sol";
import {mul as mulSd, div as divSd} from "@prb/math/src/sd59x18/Math.sol";
import {wrap as wrapSd, unwrap as unwrapSd} from "@prb/math/src/sd59x18/Casting.sol";

error FP_EmptyArray();
error FP_Overflow();
error FP_SignedOverflow();

contract FixedPointMathTest {
    uint256 public constant WAD = 1e18;
    uint256 public constant UNIT = 1e18;

    // ---------------------------------------------------------------------
    // Core math wrappers
    // ---------------------------------------------------------------------

    function wExp(uint256 x) public pure returns (uint256) {
        return FixedPointMathU.wExp(x);
    }

    function wLn(uint256 x) public pure returns (uint256) {
        return FixedPointMathU.wLn(x);
    }

    function wLnSigned(uint256 x) external pure returns (int256) {
        return int256(FixedPointMathU.wLn(x));
    }

    function wMul(uint256 a, uint256 b) public pure returns (uint256) {
        return FixedPointMathU.wMul(a, b);
    }

    function wDiv(uint256 a, uint256 b) public pure returns (uint256) {
        return FixedPointMathU.wDiv(a, b);
    }

    function wSqrt(uint256 x) public pure returns (uint256) {
        return unwrapUd(sqrt(wrapUd(x)));
    }

    function wMulSigned(int256 a, int256 b) public pure returns (int256) {
        if (a == type(int256).min || b == type(int256).min) revert FP_SignedOverflow();

        bool negative = (a < 0) != (b < 0);
        uint256 aAbs = _abs(a);
        uint256 bAbs = _abs(b);
        uint256 unsignedResult = FixedPointMathU.wMul(aAbs, bAbs);
        if (unsignedResult > uint256(type(int256).max)) revert FP_Overflow();

        int256 signedResult = int256(unsignedResult);
        return negative ? -signedResult : signedResult;
    }

    function wDivSigned(int256 a, int256 b) public pure returns (int256) {
        if (b == 0) revert FP_DivisionByZero();
        if (a == type(int256).min || b == type(int256).min) revert FP_SignedOverflow();

        bool negative = (a < 0) != (b < 0);
        uint256 aAbs = _abs(a);
        uint256 bAbs = _abs(b);
        uint256 unsignedResult = FixedPointMathU.wDiv(aAbs, bAbs);
        if (unsignedResult > uint256(type(int256).max)) revert FP_Overflow();

        int256 signedResult = int256(unsignedResult);
        return negative ? -signedResult : signedResult;
    }

    // ---------------------------------------------------------------------
    // CLMSR helpers
    // ---------------------------------------------------------------------

    function clmsrCost(
        uint256 alpha,
        uint256 sumBefore,
        uint256 sumAfter
    ) public pure returns (uint256) {
        uint256 ratio = FixedPointMathU.wDiv(sumAfter, sumBefore);
        uint256 lnRatio = FixedPointMathU.wLn(ratio);
        return FixedPointMathU.wMul(alpha, lnRatio);
    }

    function clmsrCostSigned(
        int256 alpha,
        uint256 sumBefore,
        uint256 sumAfter
    ) public pure returns (int256) {
        if (sumBefore == 0 || sumAfter == 0) revert FP_InvalidInput();

        int256 lnRatioSigned;
        if (sumAfter >= sumBefore) {
            uint256 ratio = FixedPointMathU.wDiv(sumAfter, sumBefore);
            uint256 lnRatio = FixedPointMathU.wLn(ratio);
            lnRatioSigned = int256(lnRatio);
        } else {
            uint256 ratio = FixedPointMathU.wDiv(sumBefore, sumAfter);
            uint256 lnRatio = FixedPointMathU.wLn(ratio);
            lnRatioSigned = -int256(lnRatio);
        }

        return wMulSigned(alpha, lnRatioSigned);
    }

    function clmsrPrice(uint256 expValue, uint256 totalSumExp) external pure returns (uint256) {
        return FixedPointMathU.wDiv(expValue, totalSumExp);
    }

    // ---------------------------------------------------------------------
    // Array operations
    // ---------------------------------------------------------------------

    function sumExp(uint256[] memory values) public pure returns (uint256) {
        return _sumExp(values);
    }

    function logSumExp(uint256[] memory values) public pure returns (uint256) {
        uint256 total = _sumExp(values);
        return FixedPointMathU.wLn(total);
    }

    // ---------------------------------------------------------------------
    // Utility & conversion helpers
    // ---------------------------------------------------------------------

    function testToWad(uint256 amt6) external pure returns (uint256) {
        return FixedPointMathU.toWad(amt6);
    }

    function testFromWad(uint256 amtWad) external pure returns (uint256) {
        return FixedPointMathU.fromWad(amtWad);
    }

    function testFromWadRoundUp(uint256 amtWad) external pure returns (uint256) {
        return FixedPointMathU.fromWadRoundUp(amtWad);
    }

    // ---------------------------------------------------------------------
    // Signed math via PRB SD59x18 wrappers
    // ---------------------------------------------------------------------

    function sdMul(int256 a, int256 b) external pure returns (int256) {
        return unwrapSd(mulSd(wrapSd(a), wrapSd(b)));
    }

    function sdDiv(int256 a, int256 b) external pure returns (int256) {
        return unwrapSd(divSd(wrapSd(a), wrapSd(b)));
    }

    // ---------------------------------------------------------------------
    // Internal helpers
    // ---------------------------------------------------------------------

    function _sumExp(uint256[] memory values) private pure returns (uint256 sum) {
        uint256 len = values.length;
        if (len == 0) revert FP_EmptyArray();

        for (uint256 i = 0; i < len; i++) {
            uint256 term = FixedPointMathU.wExp(values[i]);
            sum = _safeAdd(sum, term);
        }
    }

    function _safeAdd(uint256 a, uint256 b) private pure returns (uint256) {
        unchecked {
            uint256 c = a + b;
            if (c < a) revert FP_Overflow();
            return c;
        }
    }

    function _abs(int256 value) private pure returns (uint256) {
        if (value >= 0) {
            return uint256(value);
        }
        if (value == type(int256).min) revert FP_SignedOverflow();
        return uint256(-value);
    }
}
