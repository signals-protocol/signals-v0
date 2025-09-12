// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "../libraries/LazyMulSegmentTree.sol";
import {CLMSRErrors as CE} from "../errors/CLMSRErrors.sol";

/// @title LazyMulSegmentTreeTest
/// @notice Test contract for LazyMulSegmentTree library
/// @dev Exposes library functions for testing with comprehensive debugging capabilities
contract LazyMulSegmentTreeTest {
    using LazyMulSegmentTree for LazyMulSegmentTree.Tree;

    LazyMulSegmentTree.Tree private tree;

    // Re-export errors for testing
    error TreeNotInitialized();
    error IndexOutOfBounds(uint32 index, uint32 size);
    error InvalidRange(uint32 lo, uint32 hi);
    error ZeroFactor();
    error InvalidFactor(uint256 factor);
    
    // Re-export CLMSRErrors for testing
    error TreeSizeZero();
    error TreeSizeTooLarge();
    error TreeAlreadyInitialized();
    error LazyFactorOverflow();
    error ArrayLengthMismatch();

    // ========================================
    // EVENTS FOR TESTING
    // ========================================
    
    event Initialized(uint32 size);
    event NodeUpdated(uint32 index, uint256 value);
    event RangeFactorApplied(uint32 indexed lo, uint32 indexed hi, uint256 factor);

    // ========================================
    // INITIALIZATION
    // ========================================
    
    /// @notice Initialize the segment tree
    /// @param treeSize Number of leaves in the tree
    function init(uint32 treeSize) external {
        tree.init(treeSize);
        emit Initialized(treeSize);
    }

    // ========================================
    // CORE OPERATIONS
    // ========================================
    
    /// @notice Update a single leaf value
    /// @param index Leaf index to update
    /// @param value New value to set
    function update(uint32 index, uint256 value) external {
        tree.update(index, value);
        emit NodeUpdated(index, value);
    }
    
    /// @notice Get range sum (view function)
    /// @param lo Left boundary (inclusive)
    /// @param hi Right boundary (inclusive)
    /// @return sum Sum of values in range
    function getRangeSum(uint32 lo, uint32 hi) external view returns (uint256) {
        return tree.getRangeSum(lo, hi);
    }
    
    /// @notice Propagate lazy values and return range sum (state-changing)
    /// @param lo Left boundary (inclusive)
    /// @param hi Right boundary (inclusive)
    /// @return sum Sum of values in range
    function propagateLazy(uint32 lo, uint32 hi) external returns (uint256) {
        return tree.propagateLazy(lo, hi);
    }
    
    /// @notice Apply range multiplication factor
    /// @param lo Left boundary (inclusive)
    /// @param hi Right boundary (inclusive)
    /// @param factor Multiplication factor
    function applyRangeFactor(uint32 lo, uint32 hi, uint256 factor) external {
        tree.applyRangeFactor(lo, hi, factor);
        emit RangeFactorApplied(lo, hi, factor);
    }

    // ========================================
    // BULK OPERATIONS
    // ========================================
    
    function batchUpdate(uint32[] memory indices, uint256[] memory values) external {
        tree.batchUpdate(indices, values);
    }

    // ========================================
    // UTILITY FUNCTIONS
    // ========================================
    
    function getTotalSum() external view returns (uint256) {
        return tree.getTotalSum();
    }

    // ========================================
    // DEBUG FUNCTIONS
    // ========================================
    
    /// @notice Get node information for debugging (updated for new structure)
    /// @param nodeIndex Node index to inspect
    /// @return sum Node sum value
    /// @return pendingFactor Node pending multiplication factor
    /// @return left Left child index
    /// @return right Right child index
    function getNodeInfo(uint32 nodeIndex) 
        external 
        view 
        returns (uint256 sum, uint192 pendingFactor, uint32 left, uint32 right) 
    {
        LazyMulSegmentTree.Node storage node = tree.nodes[nodeIndex];
        (left, right) = _unpackChildPtr(node.childPtr);
        return (node.sum, node.pendingFactor, left, right);
    }
    
    /// @notice Get tree structure info for debugging
    /// @return root Root node index
    /// @return nextIndex Next available node index
    /// @return size Tree size
    /// @return cachedRootSum Cached root sum
    function getTreeInfo() 
        external 
        view 
        returns (uint32 root, uint32 nextIndex, uint32 size, uint256 cachedRootSum) 
    {
        return (tree.root, tree.nextIndex, tree.size, tree.cachedRootSum);
    }
    
    /// @notice Helper to unpack children for testing
    function _unpackChildPtr(uint64 packed) private pure returns (uint32 left, uint32 right) {
        left = uint32(packed >> 32);
        right = uint32(packed);
    }
    
    /// @notice Check if a specific node exists (for debugging)
    /// @param nodeIndex Node index to check
    /// @return exists True if node has been initialized
    function nodeExists(uint32 nodeIndex) external view returns (bool exists) {
        LazyMulSegmentTree.Node storage node = tree.nodes[nodeIndex];
        return node.sum != 0 || node.pendingFactor != 1e18 || node.childPtr != 0;
    }

    // ========================================
    // STRESS TESTING FUNCTIONS
    // ========================================
    
    /// @notice Perform multiple range multiplications for stress testing
    /// @param factor Multiplication factor to apply repeatedly
    /// @param count Number of times to apply
    function stressTestMulRange(uint256 factor, uint32 count) external {
        for (uint32 i = 0; i < count; i++) {
            tree.applyRangeFactor(0, tree.size - 1, factor);
        }
    }
    
    /// @notice Fill tree with sequential values for testing
    /// @param start Starting value
    /// @param increment Increment between values
    function fillSequential(uint256 start, uint256 increment) external {
        uint32 size = tree.size;
        for (uint32 i = 0; i < size; i++) {
            tree.update(i, start + uint256(i) * increment);
        }
    }
    
    /// @notice Fill tree with exponential values (simulating CLMSR)
    /// @param base Base value (simulates exp(q0/α))
    /// @param multiplier Multiplier between ticks
    function fillExponential(uint256 base, uint256 multiplier) external {
        uint32 size = tree.size;
        uint256 current = base;
        
        for (uint32 i = 0; i < size; i++) {
            tree.update(i, current);
            current = (current * multiplier) / 1e18; // WAD multiplication
        }
    }

    // ========================================
    // GAS MEASUREMENT HELPERS
    // ========================================
    
    /// @notice Measure gas for single update
    /// @param index Index to update
    /// @param value Value to set
    /// @return gasUsed Gas consumed
    function measureUpdateGas(uint32 index, uint256 value) external returns (uint256 gasUsed) {
        uint256 gasBefore = gasleft();
        tree.update(index, value);
        gasUsed = gasBefore - gasleft();
    }
    
    /// @notice Measure gas for range multiplication
    /// @param lo Range start
    /// @param hi Range end  
    /// @param factor Multiplication factor
    /// @return gasUsed Gas consumed
    function measureMulRangeGas(uint32 lo, uint32 hi, uint256 factor) external returns (uint256 gasUsed) {
        uint256 gasBefore = gasleft();
        tree.applyRangeFactor(lo, hi, factor);
        gasUsed = gasBefore - gasleft();
    }
    
    /// @notice Measure gas for batch update
    /// @param indices Indices to update
    /// @param values Values to set
    /// @return gasUsed Gas consumed
    function measureBatchUpdateGas(
        uint32[] memory indices, 
        uint256[] memory values
    ) external returns (uint256 gasUsed) {
        uint256 gasBefore = gasleft();
        tree.batchUpdate(indices, values);
        gasUsed = gasBefore - gasleft();
    }

    // ========================================
    // STRICT EDGE CASE & INVARIANT TESTING
    // ========================================
    
    /// @notice Test boundary value inputs for mulRange
    /// @dev Tests lo==hi==0, hi==size-1, factor==MIN/MAX_FACTOR
    function testMulRangeBoundaries() external {
        require(tree.size > 0, "Tree not initialized");
        
        // Test single element at start
        tree.applyRangeFactor(0, 0, 1.5e18);
        
        // Test single element at end
        tree.applyRangeFactor(tree.size - 1, tree.size - 1, 1.5e18);
        
        // Test full range
        tree.applyRangeFactor(0, tree.size - 1, 1.1e18);
        
        // Test minimum factor
        tree.applyRangeFactor(0, 0, 0.01e18); // Exact MIN_FACTOR
        
        // Test maximum factor
        tree.applyRangeFactor(0, 0, 100e18); // Exact MAX_FACTOR
    }
    
    /// @notice Test boundary value inputs for update
    /// @dev Tests index==0, index==size-1
    function testUpdateBoundaries() external {
        require(tree.size > 0, "Tree not initialized");
        
        // Test first index
        tree.update(0, 2e18);
        
        // Test last index
        tree.update(tree.size - 1, 3e18);
    }
    
    /// @notice Assert total sum invariant: totalSum == Σ getRangeSum(i,i)
    /// @dev Critical invariant that must always hold
    function assertTotalInvariant() external {
        uint32 size = tree.size;
        require(size > 0, "Tree not initialized");
        
        uint256 manual = 0;
        for (uint32 i = 0; i < size; i++) {
            manual += tree.propagateLazy(i, i); // Use propagateLazy to force propagation
        }
        
        uint256 cached = tree.getTotalSum();
        require(manual == cached, "Total sum invariant violated");
    }
    
    /// @notice Test lazy propagation consistency
    /// @dev Ensures getRangeSum() and propagateLazy() return same results after propagation
    function assertLazyConsistency(uint32 lo, uint32 hi) external {
        require(lo <= hi && hi < tree.size, "Invalid range");
        
        // First force propagation with propagateLazy
        uint256 lazyResult = tree.propagateLazy(lo, hi);
        // Then check that view query matches
        uint256 viewResult = tree.getRangeSum(lo, hi);
        
        require(viewResult == lazyResult, "Lazy propagation inconsistency");
    }
    
    /// @notice Test default sum logic for untouched ranges
    /// @dev Queries range that has never been accessed should return len*WAD
    function testDefaultSumLogic(uint32 lo, uint32 hi) external view returns (uint256) {
        require(lo <= hi && hi < tree.size, "Invalid range");
        
        uint256 result = tree.getRangeSum(lo, hi);
        // For completely untouched ranges, should equal (hi - lo + 1) * WAD
        // Note: This test is most meaningful on fresh tree sections
        return result;
    }
    
    /// @notice Test applyRangeFactor on empty nodes doesn't break root sum sync
    /// @dev Critical test for recent fix
    function testEmptyNodeMulRange() external {
        require(tree.size >= 21, "Tree too small for test");
        
        // Apply applyRangeFactor to potentially empty range
        uint256 beforeSum = tree.getTotalSum();
        tree.applyRangeFactor(10, 20, 1.1e18);
        uint256 afterSum = tree.getTotalSum();
        
        // Verify sum increased appropriately
        require(afterSum > beforeSum, "Sum should increase");
        
        // Verify invariant still holds
        this.assertTotalInvariant();
    }
    
    /// @notice Test batchUpdate corner cases
    /// @dev Tests duplicate indices, unsorted arrays, length mismatches
    function testBatchUpdateCornerCases() external {
        require(tree.size >= 5, "Tree too small for test");
        
        // Test duplicate indices (last value should win)
        uint32[] memory dupIndices = new uint32[](3);
        uint256[] memory dupValues = new uint256[](3);
        dupIndices[0] = 1;
        dupIndices[1] = 2;
        dupIndices[2] = 1; // Duplicate
        dupValues[0] = 10e18;
        dupValues[1] = 20e18;
        dupValues[2] = 15e18; // This should win for index 1
        
        tree.batchUpdate(dupIndices, dupValues);
        
        // Verify last value won
        require(tree.getRangeSum(1, 1) == 15e18, "Duplicate index handling failed");
        
        // Test unsorted indices
        uint32[] memory unsortedIndices = new uint32[](3);
        uint256[] memory unsortedValues = new uint256[](3);
        unsortedIndices[0] = 3;
        unsortedIndices[1] = 0;
        unsortedIndices[2] = 2;
        unsortedValues[0] = 30e18;
        unsortedValues[1] = 5e18;
        unsortedValues[2] = 25e18;
        
        tree.batchUpdate(unsortedIndices, unsortedValues);
        
        // Verify all values set correctly
        require(tree.getRangeSum(0, 0) == 5e18, "Unsorted batch update failed");
        require(tree.getRangeSum(2, 2) == 25e18, "Unsorted batch update failed");
        require(tree.getRangeSum(3, 3) == 30e18, "Unsorted batch update failed");
    }
    
    /// @notice Fuzz-style range multiplication test
    /// @dev Tests random ranges with bounded factors
    function randomRangeMul(uint32 lo, uint32 hi, uint256 factor) external {
        require(tree.size > 0, "Tree not initialized");
        
        // Bound inputs to valid ranges
        lo = lo % tree.size;
        hi = hi % tree.size;
        if (lo > hi) {
            (lo, hi) = (hi, lo);
        }
        
        // Bound factor to valid range (MIN_FACTOR to MAX_FACTOR)
        // MIN_FACTOR = 0.01e18, MAX_FACTOR = 100e18
        unchecked {
            uint256 range = 100e18 - 0.01e18; // Safe: 100e18 > 0.01e18
            factor = 0.01e18 + (factor % range); // Safe: modulo prevents overflow
        }
        
        uint256 beforeSum = tree.getTotalSum();
        tree.applyRangeFactor(lo, hi, factor);
        uint256 afterSum = tree.getTotalSum();
        
        // Basic sanity checks
        if (factor > 1e18) {
            require(afterSum >= beforeSum, "Sum should not decrease with factor > 1");
        }
        
        // Light-weight verification: just check that cached sum is reasonable
        require(afterSum > 0, "Sum should be positive");
        require(afterSum < type(uint256).max / 2, "Sum should not overflow");
    }
    
    /// @notice Test that cachedRootSum stays in sync after complex operations
    /// @dev Performs sequence of operations then verifies sync
    function testCachedRootSumSync() external {
        require(tree.size >= 10, "Tree too small for test");
        
        // Perform sequence of operations
        tree.update(0, 5e18);
        tree.applyRangeFactor(0, 4, 1.2e18);
        tree.update(5, 3e18);
        tree.applyRangeFactor(2, 7, 0.8e18);
        
        // Force lazy propagation by querying with lazy
        tree.propagateLazy(0, tree.size - 1);
        
        // Verify cached sum matches actual sum
        this.assertTotalInvariant();
    }
    
    /// @notice Get tree statistics for debugging
    /// @dev WARNING: O(N) complexity - for testing only, not production use
    /// @return nodeCount Number of allocated nodes
    /// @return maxDepth Maximum depth reached
    /// @return totalLazyOps Total pending lazy operations
    function getTreeStats() external view returns (uint32 nodeCount, uint32 maxDepth, uint32 totalLazyOps) {
        nodeCount = tree.nextIndex;
        
        // Calculate max depth and lazy ops by traversing tree
        maxDepth = _calculateMaxDepth(tree.root, 0);
        totalLazyOps = _countLazyOps(tree.root);
        
        return (nodeCount, maxDepth, totalLazyOps);
    }
    
    /// @notice Check if tree is effectively empty (all default values)
    /// @return isTreeEmpty True if all values are default (1 WAD)
    function isEmpty() external view returns (bool isTreeEmpty) {
        if (tree.size == 0) return true;
        
        uint256 totalSum = tree.getTotalSum();
        uint256 expectedDefault = uint256(tree.size) * 1e18;
        
        return totalSum == expectedDefault;
    }
    
    // ========================================
    // PRIVATE HELPER FUNCTIONS
    // ========================================
    
    /// @notice Calculate maximum depth of tree recursively
    function _calculateMaxDepth(uint32 nodeIndex, uint32 currentDepth) private view returns (uint32) {
        if (nodeIndex == 0) return currentDepth;
        
        LazyMulSegmentTree.Node storage node = tree.nodes[nodeIndex];
        (uint32 left, uint32 right) = _unpackChildPtr(node.childPtr);
        
        uint32 leftDepth = _calculateMaxDepth(left, currentDepth + 1);
        uint32 rightDepth = _calculateMaxDepth(right, currentDepth + 1);
        
        return leftDepth > rightDepth ? leftDepth : rightDepth;
    }
    
    /// @notice Count nodes with pending lazy operations
    function _countLazyOps(uint32 nodeIndex) private view returns (uint32) {
        if (nodeIndex == 0) return 0;
        
        LazyMulSegmentTree.Node storage node = tree.nodes[nodeIndex];
        (uint32 left, uint32 right) = _unpackChildPtr(node.childPtr);
        
        uint32 count = (node.pendingFactor != 1e18) ? 1 : 0;
        count += _countLazyOps(left);
        count += _countLazyOps(right);
        
        return count;
    }
} 