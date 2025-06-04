// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FixedPointMathU} from "./FixedPointMath.sol";

/// @title LazyMulSegmentTree
/// @notice Gas-optimized lazy multiplication segment tree for CLMSR tick data management
/// @dev Supports efficient range multiplication and queries with minimal storage.
///      Specifically designed for CLMSR exp(q/α) vector updates via multiplicative factors.
library LazyMulSegmentTree {
    using FixedPointMathU for uint256;

    // ========================================
    // STRUCTS & STORAGE
    // ========================================
    
    /// @notice Packed node structure for lazy multiplication segment tree
    /// @dev Optimized for 2-slot storage: lazy(192bit) + children(64bit) in slot 1, sum in slot 2
    struct Node {
        uint256 sum;        // Sum of exponential values in subtree
        uint192 lazy;       // Lazy multiplication factor (WAD = no-op) - 192 bits sufficient
        uint64 children;    // Packed: left(32bit) + right(32bit)
    }
    
    /// @notice Complete lazy multiplication segment tree structure
    struct Tree {
        mapping(uint32 => Node) nodes;  // Node storage
        uint32 root;                    // Root node index
        uint32 nextIndex;               // Next available node index
        uint32 size;                    // Tree size (number of leaves)
        uint256 cachedRootSum;          // Cached total sum for O(1) access
    }

    // ========================================
    // EVENTS & ERRORS
    // ========================================
    
    /// @notice Emitted when range multiplication is applied
    /// @param lo Left boundary (inclusive)
    /// @param hi Right boundary (inclusive) 
    /// @param factor Multiplication factor in WAD format
    event RangeMul(uint32 indexed lo, uint32 indexed hi, uint256 factor);
    
    error IndexOutOfBounds(uint32 index, uint32 size);
    error InvalidRange(uint32 lo, uint32 hi);
    error TreeNotInitialized();
    error ZeroFactor();
    error InvalidFactor(uint256 factor);

    // ========================================
    // CONSTANTS
    // ========================================
    
    uint256 private constant WAD = FixedPointMathU.WAD;
    uint256 private constant MIN_FACTOR = 0.8e18;  // 80% minimum
    uint256 private constant MAX_FACTOR = 1.25e18; // 125% maximum

    // ========================================
    // INITIALIZATION
    // ========================================
    
    /// @notice Initialize a new lazy multiplication segment tree
    /// @param tree Tree storage reference
    /// @param treeSize Number of leaves in the tree
    function init(Tree storage tree, uint32 treeSize) internal {
        require(treeSize > 0, "Tree size must be positive");
        require(treeSize <= type(uint32).max / 2, "Tree size too large");
        
        tree.size = treeSize;
        tree.nextIndex = 1; // Start from 1, 0 means "no node"
        tree.root = 0; // Will be created on first update
        tree.cachedRootSum = 0;
    }
    
    /// @notice Allocate a new node index and initialize it with lazy factor
    /// @param tree Tree storage reference
    /// @param lazyFactor Initial lazy factor to apply
    /// @return newIndex Newly allocated index
    function _allocateNodeWithLazy(Tree storage tree, uint256 lazyFactor) private returns (uint32 newIndex) {
        newIndex = tree.nextIndex;
        unchecked { tree.nextIndex++; }
        
        // Overflow protection for uint192 lazy field
        require(lazyFactor <= 5e36, "Lazy factor too large for uint192");
        tree.nodes[newIndex].lazy = uint192(lazyFactor);
    }
    
    /// @notice Allocate a new node index
    /// @param tree Tree storage reference
    /// @return newIndex Newly allocated index
    function _allocateNode(Tree storage tree) private returns (uint32 newIndex) {
        newIndex = tree.nextIndex;
        unchecked { tree.nextIndex++; }
        tree.nodes[newIndex].lazy = uint192(WAD); // Safe: WAD = 1e18 << 5e36
    }

    /// @notice Pack two uint32 values into uint64
    function _packChildren(uint32 left, uint32 right) private pure returns (uint64) {
        return (uint64(left) << 32) | uint64(right);
    }
    
    /// @notice Unpack uint64 into two uint32 values
    function _unpackChildren(uint64 packed) private pure returns (uint32 left, uint32 right) {
        left = uint32(packed >> 32);
        right = uint32(packed);
    }

    // ========================================
    // CORE OPERATIONS
    // ========================================
    
    /// @notice Update a single leaf value
    /// @param tree Tree storage reference
    /// @param index Leaf index (0-based)
    /// @param value New value to set
    function update(Tree storage tree, uint32 index, uint256 value) internal {
        if (tree.size == 0) revert TreeNotInitialized();
        if (index >= tree.size) revert IndexOutOfBounds(index, tree.size);
        
        // Create root if doesn't exist
        if (tree.root == 0) {
            tree.root = _allocateNode(tree);
        }
        
        _updateRecursive(tree, tree.root, 0, tree.size - 1, index, value);
        tree.cachedRootSum = tree.nodes[tree.root].sum;
    }
    
    /// @notice Apply lazy propagation to a node
    /// @param tree Tree storage reference
    /// @param nodeIndex Node index to apply to
    /// @param factor Multiplication factor
    function _apply(Tree storage tree, uint32 nodeIndex, uint256 factor) private {
        if (nodeIndex == 0) return;
        if (factor == WAD) return; // No-op optimization
        
        Node storage node = tree.nodes[nodeIndex];
        node.sum = node.sum.wMul(factor);
        
        uint256 newLazy = uint256(node.lazy).wMul(factor);
        require(newLazy <= 5e36, "Lazy factor overflow protection");
        node.lazy = uint192(newLazy);
    }
    
    /// @notice Push lazy values down to children (with auto-allocation)
    /// @param tree Tree storage reference
    /// @param nodeIndex Current node index
    function _push(Tree storage tree, uint32 nodeIndex) private {
        if (nodeIndex == 0) return;
        
        Node storage node = tree.nodes[nodeIndex];
        uint192 nodeLazy = node.lazy;
        if (nodeLazy != uint192(WAD)) {
            (uint32 left, uint32 right) = _unpackChildren(node.children);
            
            // Auto-allocate children if they don't exist and lazy needs to be applied
            uint256 lazyFactor = uint256(nodeLazy);
            if (left == 0) {
                left = _allocateNodeWithLazy(tree, lazyFactor);
            } else {
                _apply(tree, left, lazyFactor);
            }
            
            if (right == 0) {
                right = _allocateNodeWithLazy(tree, lazyFactor);
            } else {
                _apply(tree, right, lazyFactor);
            }
            
            // Update packed children if any were allocated
            node.children = _packChildren(left, right);
            node.lazy = uint192(WAD);
        }
    }
    
    /// @notice Pull values up from children
    /// @param tree Tree storage reference
    /// @param nodeIndex Current node index
    function _pull(Tree storage tree, uint32 nodeIndex) private {
        if (nodeIndex == 0) return;
        
        Node storage node = tree.nodes[nodeIndex];
        (uint32 left, uint32 right) = _unpackChildren(node.children);
        
        uint256 leftSum = (left != 0) ? tree.nodes[left].sum : 0;
        uint256 rightSum = (right != 0) ? tree.nodes[right].sum : 0;
        node.sum = leftSum + rightSum;
    }

    /// @notice Recursive update implementation
    /// @param tree Tree storage reference
    /// @param nodeIndex Current node index
    /// @param left Left boundary of current segment
    /// @param right Right boundary of current segment
    /// @param index Target index to update
    /// @param value New value
    function _updateRecursive(
        Tree storage tree,
        uint32 nodeIndex,
        uint32 left,
        uint32 right,
        uint32 index,
        uint256 value
    ) private {
        Node storage node = tree.nodes[nodeIndex];
        
        // Leaf node
        if (left == right) {
            node.sum = value;
            return;
        }
        
        _push(tree, nodeIndex);
        
        uint32 mid = left + (right - left) / 2;
        (uint32 leftChild, uint32 rightChild) = _unpackChildren(node.children);
        
        if (index <= mid) {
            // Update left child
            if (leftChild == 0) {
                leftChild = _allocateNode(tree);
                node.children = _packChildren(leftChild, rightChild);
            }
            _updateRecursive(tree, leftChild, left, mid, index, value);
        } else {
            // Update right child
            if (rightChild == 0) {
                rightChild = _allocateNode(tree);
                node.children = _packChildren(leftChild, rightChild);
            }
            _updateRecursive(tree, rightChild, mid + 1, right, index, value);
        }
        
        _pull(tree, nodeIndex);
    }
    
    /// @notice Multiply range [lo, hi] by factor (CLMSR core operation)
    /// @param tree Tree storage reference
    /// @param lo Left boundary (inclusive)
    /// @param hi Right boundary (inclusive)
    /// @param factor Multiplication factor in wad format
    function mulRange(Tree storage tree, uint32 lo, uint32 hi, uint256 factor) internal {
        if (tree.size == 0) revert TreeNotInitialized();
        if (lo > hi) revert InvalidRange(lo, hi);
        if (hi >= tree.size) revert IndexOutOfBounds(hi, tree.size);
        if (factor == 0) revert ZeroFactor();
        if (factor < MIN_FACTOR || factor > MAX_FACTOR) revert InvalidFactor(factor);
        if (tree.root == 0) return; // Nothing to multiply
        
        _mulRangeRecursive(tree, tree.root, 0, tree.size - 1, lo, hi, factor);
        tree.cachedRootSum = tree.nodes[tree.root].sum;
        
        emit RangeMul(lo, hi, factor);
    }
    
    /// @notice Recursive range multiplication implementation
    /// @param tree Tree storage reference
    /// @param nodeIndex Current node index
    /// @param left Left boundary of current segment
    /// @param right Right boundary of current segment
    /// @param lo Query left boundary
    /// @param hi Query right boundary
    /// @param factor Multiplication factor
    function _mulRangeRecursive(
        Tree storage tree,
        uint32 nodeIndex,
        uint32 left,
        uint32 right,
        uint32 lo,
        uint32 hi,
        uint256 factor
    ) private {
        if (nodeIndex == 0) return;
        
        // No overlap
        if (right < lo || left > hi) return;
        
        // Complete overlap - apply lazy update
        if (left >= lo && right <= hi) {
            _apply(tree, nodeIndex, factor);
            return;
        }
        
        // Partial overlap - push down and recurse
        _push(tree, nodeIndex);
        
        Node storage node = tree.nodes[nodeIndex];
        (uint32 leftChild, uint32 rightChild) = _unpackChildren(node.children);
        uint32 mid = left + (right - left) / 2;
        
        _mulRangeRecursive(tree, leftChild, left, mid, lo, hi, factor);
        _mulRangeRecursive(tree, rightChild, mid + 1, right, lo, hi, factor);
        
        _pull(tree, nodeIndex);
    }

    /// @notice Query sum over a range [lo, hi] (view version)
    /// @param tree Tree storage reference
    /// @param lo Left boundary (inclusive)
    /// @param hi Right boundary (inclusive)
    /// @return sum Sum of values in range
    function query(Tree storage tree, uint32 lo, uint32 hi) 
        internal 
        view
        returns (uint256 sum) 
    {
        if (tree.size == 0) revert TreeNotInitialized();
        if (lo > hi) revert InvalidRange(lo, hi);
        if (hi >= tree.size) revert IndexOutOfBounds(hi, tree.size);
        if (tree.root == 0) return 0;
        
        return _queryRecursiveView(tree, tree.root, 0, tree.size - 1, lo, hi);
    }
    
    /// @notice Query sum over a range [lo, hi] (with lazy propagation)
    /// @param tree Tree storage reference
    /// @param lo Left boundary (inclusive)
    /// @param hi Right boundary (inclusive)
    /// @return sum Sum of values in range
    function queryWithLazy(Tree storage tree, uint32 lo, uint32 hi) 
        internal 
        returns (uint256 sum) 
    {
        if (tree.size == 0) revert TreeNotInitialized();
        if (lo > hi) revert InvalidRange(lo, hi);
        if (hi >= tree.size) revert IndexOutOfBounds(hi, tree.size);
        if (tree.root == 0) return 0;
        
        return _queryRecursive(tree, tree.root, 0, tree.size - 1, lo, hi);
    }
    
    /// @notice Recursive query implementation (view version)
    /// @param tree Tree storage reference
    /// @param nodeIndex Current node index
    /// @param left Left boundary of current segment
    /// @param right Right boundary of current segment
    /// @param lo Query left boundary
    /// @param hi Query right boundary
    /// @return sum Sum in the queried range
    function _queryRecursiveView(
        Tree storage tree,
        uint32 nodeIndex,
        uint32 left,
        uint32 right,
        uint32 lo,
        uint32 hi
    ) private view returns (uint256 sum) {
        if (nodeIndex == 0) return 0;
        
        // No overlap
        if (right < lo || left > hi) return 0;
        
        Node storage node = tree.nodes[nodeIndex];
        
        // Complete overlap
        if (left >= lo && right <= hi) {
            return node.sum;
        }
        
        // Partial overlap
        uint32 mid = left + (right - left) / 2;
        (uint32 leftChild, uint32 rightChild) = _unpackChildren(node.children);
        
        uint256 leftSum = _queryRecursiveView(tree, leftChild, left, mid, lo, hi);
        uint256 rightSum = _queryRecursiveView(tree, rightChild, mid + 1, right, lo, hi);
        
        return leftSum + rightSum;
    }
    
    /// @notice Recursive query implementation with lazy propagation
    /// @param tree Tree storage reference
    /// @param nodeIndex Current node index
    /// @param left Left boundary of current segment
    /// @param right Right boundary of current segment
    /// @param lo Query left boundary
    /// @param hi Query right boundary
    /// @return sum Sum in the queried range
    function _queryRecursive(
        Tree storage tree,
        uint32 nodeIndex,
        uint32 left,
        uint32 right,
        uint32 lo,
        uint32 hi
    ) private returns (uint256 sum) {
        if (nodeIndex == 0) return 0;
        
        // No overlap
        if (right < lo || left > hi) return 0;
        
        Node storage node = tree.nodes[nodeIndex];
        
        // Complete overlap
        if (left >= lo && right <= hi) {
            return node.sum;
        }
        
        // Partial overlap - push lazy values first
        _push(tree, nodeIndex);
        
        uint32 mid = left + (right - left) / 2;
        (uint32 leftChild, uint32 rightChild) = _unpackChildren(node.children);
        
        uint256 leftSum = _queryRecursive(tree, leftChild, left, mid, lo, hi);
        uint256 rightSum = _queryRecursive(tree, rightChild, mid + 1, right, lo, hi);
        
        return leftSum + rightSum;
    }

    // ========================================
    // BULK OPERATIONS
    // ========================================
    
    /// @notice Batch update multiple values efficiently (optimized to avoid repeated root sum updates)
    /// @param tree Tree storage reference
    /// @param indices Array of indices to update
    /// @param values Array of new values
    function batchUpdate(
        Tree storage tree,
        uint32[] memory indices,
        uint256[] memory values
    ) internal {
        require(indices.length == values.length, "Array length mismatch");
        if (tree.size == 0) revert TreeNotInitialized();
        
        // Create root if doesn't exist
        if (tree.root == 0) {
            tree.root = _allocateNode(tree);
        }
        
        uint256 len = indices.length;
        unchecked {
            for (uint256 i; i < len; ++i) {
                if (indices[i] >= tree.size) revert IndexOutOfBounds(indices[i], tree.size);
                _updateRecursive(tree, tree.root, 0, tree.size - 1, indices[i], values[i]);
            }
        }
        
        // Update cached root sum only once at the end
        tree.cachedRootSum = tree.nodes[tree.root].sum;
    }
    
    /// @notice Get all non-zero values in range [lo, hi]
    /// @param tree Tree storage reference
    /// @param lo Left boundary (inclusive)
    /// @param hi Right boundary (inclusive)
    /// @return indices Array of indices with non-zero values
    /// @return values Array of corresponding values
    function getNonZeroRange(Tree storage tree, uint32 lo, uint32 hi)
        internal
        view
        returns (uint32[] memory indices, uint256[] memory values)
    {
        if (tree.size == 0) revert TreeNotInitialized();
        if (lo > hi) revert InvalidRange(lo, hi);
        if (hi >= tree.size) revert IndexOutOfBounds(hi, tree.size);
        
        // First pass: count non-zero values
        uint256 count = 0;
        unchecked {
            for (uint32 i = lo; i <= hi; ++i) {
                if (query(tree, i, i) != 0) count++;
            }
        }
        
        // Second pass: collect values
        indices = new uint32[](count);
        values = new uint256[](count);
        uint256 idx = 0;
        
        unchecked {
            for (uint32 i = lo; i <= hi; ++i) {
                uint256 value = query(tree, i, i);
                if (value != 0) {
                    indices[idx] = i;
                    values[idx] = value;
                    ++idx;
                }
            }
        }
    }

    // ========================================
    // UTILITY FUNCTIONS
    // ========================================
    

    
    /// @notice Get total sum of all values in tree (O(1) cached)
    /// @param tree Tree storage reference
    /// @return sum Total sum
    function getTotalSum(Tree storage tree) internal view returns (uint256 sum) {
        if (tree.size == 0) revert TreeNotInitialized();
        return tree.cachedRootSum;
    }
    
    /// @notice Check if tree is empty (all values are zero)
    /// @param tree Tree storage reference
    /// @return result True if tree is empty
    function isEmpty(Tree storage tree) internal view returns (bool result) {
        if (tree.size == 0) revert TreeNotInitialized();
        return tree.cachedRootSum == 0;
    }
    
    /// @notice Get tree statistics for debugging
    /// @param tree Tree storage reference
    /// @return size Tree size
    /// @return nodeCount Number of allocated nodes
    /// @return totalSum Total sum of all values
    function getStats(Tree storage tree) 
        internal 
        view 
        returns (uint32 size, uint32 nodeCount, uint256 totalSum) 
    {
        size = tree.size;
        nodeCount = tree.nextIndex;
        totalSum = tree.cachedRootSum;
    }

    // ========================================
    // CLMSR-SPECIFIC FUNCTIONS
    // ========================================
    
    /// @notice Update exponential value for CLMSR
    /// @param tree Tree storage reference
    /// @param tick Tick index
    /// @param expValue Pre-calculated exponential value
    function updateExp(Tree storage tree, uint32 tick, uint256 expValue) internal {
        update(tree, tick, expValue);
    }
    
    /// @notice Get sum of exponentials in range for CLMSR pricing
    /// @param tree Tree storage reference
    /// @param lo Lower tick bound
    /// @param hi Upper tick bound
    /// @return sumExp Sum of exponential values
    function getSumExp(Tree storage tree, uint32 lo, uint32 hi) 
        internal 
        view 
        returns (uint256 sumExp) 
    {
        return query(tree, lo, hi);
    }
    
    /// @notice Find tick with largest exponential value for pricing (basic O(N) version)
    /// @param tree Tree storage reference
    /// @param lo Lower bound
    /// @param hi Upper bound
    /// @return maxTick Tick with maximum value
    /// @return maxValue Maximum exponential value
    function findMaxTick(Tree storage tree, uint32 lo, uint32 hi)
        internal
        view
        returns (uint32 maxTick, uint256 maxValue)
    {
        if (tree.size == 0) revert TreeNotInitialized();
        if (lo > hi) revert InvalidRange(lo, hi);
        if (hi >= tree.size) revert IndexOutOfBounds(hi, tree.size);
        
        maxValue = 0;
        maxTick = lo;
        
        unchecked {
            for (uint32 i = lo; i <= hi; ++i) {
                uint256 value = query(tree, i, i);
                if (value > maxValue) {
                    maxValue = value;
                    maxTick = i;
                }
            }
        }
    }
} 