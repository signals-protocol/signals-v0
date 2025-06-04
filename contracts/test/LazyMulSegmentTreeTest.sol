// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../libraries/LazyMulSegmentTree.sol";

/// @title LazyMulSegmentTreeTest
/// @notice Test contract for LazyMulSegmentTree library
/// @dev Exposes library functions for testing with comprehensive debugging capabilities
contract LazyMulSegmentTreeTest {
    using LazyMulSegmentTree for LazyMulSegmentTree.Tree;

    LazyMulSegmentTree.Tree private tree;

    // ========================================
    // EVENTS FOR TESTING
    // ========================================
    
    event TreeInitialized(uint32 size);
    event NodeUpdated(uint32 index, uint256 value);
    event RangeMultiplied(uint32 lo, uint32 hi, uint256 factor);

    // ========================================
    // INITIALIZATION
    // ========================================
    
    function init(uint32 treeSize) external {
        tree.init(treeSize);
        emit TreeInitialized(treeSize);
    }

    // ========================================
    // CORE OPERATIONS
    // ========================================
    
    function update(uint32 index, uint256 value) external {
        tree.update(index, value);
        emit NodeUpdated(index, value);
    }
    

    
    function query(uint32 lo, uint32 hi) external view returns (uint256) {
        return tree.query(lo, hi);
    }
    
    function queryWithLazy(uint32 lo, uint32 hi) external returns (uint256) {
        return tree.queryWithLazy(lo, hi);
    }
    
    function mulRange(uint32 lo, uint32 hi, uint256 factor) external {
        tree.mulRange(lo, hi, factor);
        emit RangeMultiplied(lo, hi, factor);
    }

    // ========================================
    // BULK OPERATIONS
    // ========================================
    
    function batchUpdate(uint32[] memory indices, uint256[] memory values) external {
        tree.batchUpdate(indices, values);
    }
    
    function getNonZeroRange(uint32 lo, uint32 hi) 
        external 
        view 
        returns (uint32[] memory indices, uint256[] memory values) 
    {
        return tree.getNonZeroRange(lo, hi);
    }

    // ========================================
    // UTILITY FUNCTIONS
    // ========================================
    
    function getTotalSum() external view returns (uint256) {
        return tree.getTotalSum();
    }
    
    function isEmpty() external view returns (bool) {
        return tree.isEmpty();
    }
    
    function getStats() external view returns (uint32 size, uint32 nodeCount, uint256 totalSum) {
        return tree.getStats();
    }

    // ========================================
    // CLMSR-SPECIFIC FUNCTIONS
    // ========================================
    
    function updateExp(uint32 tick, uint256 expValue) external {
        tree.updateExp(tick, expValue);
    }
    
    function getSumExp(uint32 lo, uint32 hi) external view returns (uint256) {
        return tree.getSumExp(lo, hi);
    }
    
    function findMaxTick(uint32 lo, uint32 hi) 
        external 
        view 
        returns (uint32 maxTick, uint256 maxValue) 
    {
        return tree.findMaxTick(lo, hi);
    }

    // ========================================
    // DEBUG FUNCTIONS
    // ========================================
    
    /// @notice Get node information for debugging (updated for new structure)
    /// @param nodeIndex Node index to inspect
    /// @return sum Node sum value
    /// @return lazy Node lazy multiplication factor
    /// @return left Left child index
    /// @return right Right child index
    function getNodeInfo(uint32 nodeIndex) 
        external 
        view 
        returns (uint256 sum, uint192 lazy, uint32 left, uint32 right) 
    {
        LazyMulSegmentTree.Node storage node = tree.nodes[nodeIndex];
        (left, right) = _unpackChildren(node.children);
        return (node.sum, node.lazy, left, right);
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
    function _unpackChildren(uint64 packed) private pure returns (uint32 left, uint32 right) {
        left = uint32(packed >> 32);
        right = uint32(packed);
    }
    
    /// @notice Check if a specific node exists (for debugging)
    /// @param nodeIndex Node index to check
    /// @return exists True if node has been initialized
    function nodeExists(uint32 nodeIndex) external view returns (bool exists) {
        LazyMulSegmentTree.Node storage node = tree.nodes[nodeIndex];
        return node.sum != 0 || node.lazy != 1e18;
    }

    // ========================================
    // STRESS TESTING FUNCTIONS
    // ========================================
    
    /// @notice Perform multiple range multiplications for stress testing
    /// @param factor Multiplication factor to apply repeatedly
    /// @param count Number of times to apply
    function stressTestMulRange(uint256 factor, uint32 count) external {
        for (uint32 i = 0; i < count; i++) {
            tree.mulRange(0, tree.size - 1, factor);
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
        tree.mulRange(lo, hi, factor);
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
} 