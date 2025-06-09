// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FixedPointMathU, FixedPointMathS} from "../libraries/FixedPointMath.sol";

/// @title FixedPointMathTest
/// @notice Test contract for FixedPointMath library
/// @dev Exposes library functions for testing with new dual-library structure
contract FixedPointMathTest {
    // Re-export errors for testing
    error FP_Overflow();
    error FP_EmptyArray();
    error FP_DivisionByZero();
    error FP_InvalidInput();
    error PRBMath_UD60x18_Log_InputTooSmall();
    // ========================================
    // UNSIGNED MATH TESTS
    // ========================================
    
    function wMul(uint256 a, uint256 b) external pure returns (uint256) {
        return FixedPointMathU.wMul(a, b);
    }
    
    function wDiv(uint256 a, uint256 b) external pure returns (uint256) {
        return FixedPointMathU.wDiv(a, b);
    }
    
    function wExp(uint256 x) external pure returns (uint256) {
        return FixedPointMathU.wExp(x);
    }
    
    function wLn(uint256 x) external pure returns (uint256) {
        return FixedPointMathU.wLn(x);
    }
    
    function wSqrt(uint256 x) external pure returns (uint256) {
        return FixedPointMathU.wSqrt(x);
    }
    
    function sumExp(uint256[] memory values) external pure returns (uint256) {
        return FixedPointMathU.sumExp(values);
    }
    
    function logSumExp(uint256[] memory values) external pure returns (uint256) {
        return FixedPointMathU.logSumExp(values);
    }
    
    function clmsrPrice(
        uint256 expValue,
        uint256 totalSumExp
    ) external pure returns (uint256) {
        return FixedPointMathU.clmsrPrice(expValue, totalSumExp);
    }
    
    function clmsrCost(
        uint256 alpha,
        uint256 sumBefore,
        uint256 sumAfter
    ) external pure returns (uint256) {
        return FixedPointMathU.clmsrCost(alpha, sumBefore, sumAfter);
    }
    
    function testFromWad(uint256 amtWad) external pure returns (uint256) {
        return FixedPointMathU.fromWad(amtWad);
    }
    
    function testFromWadRoundUp(uint256 amtWad) external pure returns (uint256) {
        return FixedPointMathU.fromWadRoundUp(amtWad);
    }
    
    function testToWad(uint256 amt6) external pure returns (uint256) {
        return FixedPointMathU.toWad(amt6);
    }

    // ========================================
    // SIGNED MATH TESTS
    // ========================================
    
    function wLnSigned(int256 x) external pure returns (int256) {
        return FixedPointMathS.wLn(x);
    }
    
    function wMulSigned(int256 a, int256 b) external pure returns (int256) {
        return FixedPointMathS.wMul(a, b);
    }
    
    function wDivSigned(int256 a, int256 b) external pure returns (int256) {
        return FixedPointMathS.wDiv(a, b);
    }
    
    function clmsrCostSigned(
        int256 alpha,
        int256 sumBefore,
        int256 sumAfter
    ) external pure returns (int256) {
        return FixedPointMathS.clmsrCost(alpha, sumBefore, sumAfter);
    }

    // ========================================
    // CONSTANTS ACCESS
    // ========================================
    
    function WAD() external pure returns (uint256) {
        return FixedPointMathU.WAD;
    }

    // ========================================
    // LEGACY COMPATIBILITY (for old tests)
    // ========================================
    
    // These functions maintain compatibility with existing test cases
    function UNIT() external pure returns (uint256) {
        return FixedPointMathU.WAD;
    }

    // Safe arithmetic operations (basic implementations for testing)
    function wAdd(uint256 a, uint256 b) external pure returns (uint256) {
        return a + b; // Simple addition for testing
    }
    
    function wSub(uint256 a, uint256 b) external pure returns (uint256) {
        return a - b; // Simple subtraction for testing
    }

    function unsafeAdd(uint256 a, uint256 b) external pure returns (uint256) {
        unchecked {
            return a + b;
        }
    }
    
    function unsafeSub(uint256 a, uint256 b) external pure returns (uint256) {
        unchecked {
            return a - b;
        }
    }

    // ========================================
    // BOUNDARY TESTS
    // ========================================
    
    /// @notice Test exp with boundary values
    function testExpBoundary() external pure returns (bool) {
        // Test safe values
        FixedPointMathU.wExp(0);           // Should return 1e18
        FixedPointMathU.wExp(1e18);        // Should work (e ≈ 2.718e18)
        FixedPointMathU.wExp(135e18);      // Near the limit
        
        return true;
    }
    
    /// @notice Test ln with boundary values
    function testLnBoundary() external pure returns (bool) {
        // Test safe values
        FixedPointMathU.wLn(1e18);         // ln(1) = 0
        FixedPointMathU.wLn(2718281828459045235); // ln(e) ≈ 1e18
        
        return true;
    }

    /// @notice Test logSumExp accuracy improvement
    function testLogSumExpAccuracy() external pure returns (uint256) {
        uint256[] memory values = new uint256[](3);
        values[0] = 50e18;   // Reasonable value
        values[1] = 51e18;   // Slightly larger  
        values[2] = 30e18;   // Much smaller
        
        return FixedPointMathU.logSumExp(values);
    }

    /// @notice Test signed CLMSR cost calculation (can be negative)
    function testSignedClmsrCost() external pure returns (int256) {
        int256 alpha = int256(1e18);
        int256 sumBefore = int256(2e18);
        int256 sumAfter = int256(1e18);  // Smaller than before -> negative cost
        
        return FixedPointMathS.clmsrCost(alpha, sumBefore, sumAfter);
    }

    // ========================================
    // ERROR TESTING HELPERS
    // ========================================
    
    /// @notice Test division by zero (should revert)
    function testDivisionByZero() external pure {
        FixedPointMathU.wDiv(1e18, 0); // Should revert with FP_DivisionByZero
    }
    
    /// @notice Test ln(0) (should revert)
    function testLnZero() external pure {
        FixedPointMathU.wLn(0); // Should revert with FP_InvalidInput
    }
    
    /// @notice Test empty array in logSumExp (should revert)
    function testLogSumExpEmpty() external pure {
        uint256[] memory empty = new uint256[](0);
        FixedPointMathU.logSumExp(empty); // Should revert with FP_EmptyArray
    }
    
    /// @notice Test empty array in sumExp (should revert)
    function testSumExpEmpty() external pure {
        uint256[] memory empty = new uint256[](0);
        FixedPointMathU.sumExp(empty); // Should revert with FP_EmptyArray
    }

    /// @notice Test signed division by zero (should revert)
    function testSignedDivisionByZero() external pure {
        FixedPointMathS.wDiv(int256(1e18), 0); // Should revert with FP_DivisionByZero
    }
} 