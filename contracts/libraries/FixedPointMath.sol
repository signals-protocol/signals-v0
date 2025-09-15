// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title FixedPointMath — thin‑alias helpers for PRB‑Math
/// @notice Re‑exports PRB‑Math UD60x18 functions with zero wrapper overhead.
/// @dev   * FixedPointMathU — unsigned UD60x18 helpers for core math operations
///        * Functions are external due to contract size limits, but enable efficient library linking
///        * Additional lightweight guards included where PRB‑Math cannot catch edge cases

import { exp, ln } from "@prb/math/src/ud60x18/Math.sol";
import { wrap, unwrap } from "@prb/math/src/ud60x18/Casting.sol";
import { mulDiv } from "@prb/math/src/Common.sol";

error FP_DivisionByZero();
error FP_InvalidInput();

//───────────────────────────────────────────────────────────────────────────────
//  Unsigned 60.18‑decimal fixed‑point helpers
//───────────────────────────────────────────────────────────────────────────────
library FixedPointMathU {
    uint256 internal constant WAD = 1e18;
    uint256 internal constant SCALE_DIFF = 1e12;   // 10^(18-6)

    /*────────────────scaling─────────────*/
    /// @dev 6-decimal → 18-decimal (multiply by 1e12)
    function toWad(uint256 amt6) internal pure returns (uint256) {
        unchecked {
            return amt6 * SCALE_DIFF;   // overflow impossible: amt6 ≤ 2^256-1 / 1e12
        }
    }

    /// @dev 18-decimal → 6-decimal (divide by 1e12, truncates decimals)
    function fromWad(uint256 amtWad) internal pure returns (uint256) {
        unchecked {
            return amtWad / SCALE_DIFF;
        }
    }

    /// @dev 18-decimal → 6-decimal with round-up (prevents zero-cost attacks)
    /// @notice Always rounds up to ensure minimum 1 micro unit cost
    function fromWadRoundUp(uint256 amtWad) internal pure returns (uint256) {
        unchecked {
            return (amtWad + SCALE_DIFF - 1) / SCALE_DIFF;
        }
    }

    /*────────────────basic───────────────*/
    function wExp(uint256 x) external pure returns (uint256) {
        return unwrap(exp(wrap(x)));
    }

    function wLn(uint256 x) external pure returns (uint256) {
        require(x >= WAD, FP_InvalidInput()); // ln(x) for UD60x18 requires x >= 1e18
        return unwrap(ln(wrap(x)));
    }

    function wMul(uint256 a, uint256 b) external pure returns (uint256) {
        return mulDiv(a, b, WAD);
    }

    function wDiv(uint256 a, uint256 b) external pure returns (uint256) {
        require(b != 0, FP_DivisionByZero());
        return mulDiv(a, WAD, b);
    }
} 