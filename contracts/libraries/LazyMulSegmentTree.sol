// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FixedPointMathU} from "./FixedPointMath.sol";

/// @title LazyMulSegmentTree
/// @notice Gas-optimized sparse lazy multiplication segment tree for CLMSR tick data management
/// @dev Supports efficient range multiplication and queries with minimal storage.
///      All leaves default to 1 WAD (e^0 = 1), nodes created only when needed.
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
    
    uint256 public constant WAD = 1e18;
    uint256 public constant MIN_FACTOR = 0.01e18;  // 1% minimum - allow wide range for CLMSR
    uint256 public constant MAX_FACTOR = 100e18;   // 100x maximum - allow wide range for CLMSR

    // ========================================
    // HELPER FUNCTIONS
    // ========================================
    
    /// @notice Calculate default sum for empty range (all leaves = 1 WAD)
    /// @param l Left boundary (inclusive)
    /// @param r Right boundary (inclusive)
    /// @return sum Default sum for range
    function _defaultSum(uint32 l, uint32 r) private pure returns (uint256 sum) {
        unchecked { 
            return uint256(r - l + 1) * WAD; 
        }
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
    // INITIALIZATION
    // ========================================
    
    /// @notice Initialize a new lazy multiplication segment tree
    /// @param tree Tree storage reference
    /// @param treeSize Number of leaves in the tree
    function init(Tree storage tree, uint32 treeSize) internal {
        require(treeSize > 0, "Tree size must be positive");
        require(treeSize <= type(uint32).max / 2, "Tree size too large");
        require(tree.size == 0, "Tree already initialized");
        
        tree.size = treeSize;
        tree.nextIndex = 0; // Start from 0
        tree.root = _allocateNode(tree, 0, treeSize - 1);
        tree.cachedRootSum = uint256(treeSize) * WAD; // All leaves default to WAD
    }
    
    /// @notice Allocate a new node with range boundaries
    /// @param tree Tree storage reference
    /// @param l Left boundary
    /// @param r Right boundary
    /// @return newIndex Newly allocated index
    function _allocateNode(Tree storage tree, uint32 l, uint32 r) private returns (uint32 newIndex) {
        newIndex = ++tree.nextIndex;
        Node storage node = tree.nodes[newIndex];
        node.lazy = uint192(WAD); // No pending operations
        node.sum = _defaultSum(l, r); // Default sum for range
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
        
        _updateRecursive(tree, tree.root, 0, tree.size - 1, index, value);
        tree.cachedRootSum = tree.nodes[tree.root].sum;
    }
    
    /// @notice Apply lazy propagation to a node
    /// @param tree Tree storage reference
    /// @param nodeIndex Node index to apply to
    /// @param factor Multiplication factor
    function _apply(Tree storage tree, uint32 nodeIndex, uint256 factor) private {
        if (nodeIndex == 0 || factor == WAD) return;
        
        Node storage node = tree.nodes[nodeIndex];
        node.sum = node.sum.wMul(factor);
        
        uint256 newLazy = uint256(node.lazy).wMul(factor);
        require(newLazy <= 5e36, "Lazy factor overflow protection");
        node.lazy = uint192(newLazy);
        
        // Update cached root sum if this is root
        if (nodeIndex == tree.root) {
            tree.cachedRootSum = node.sum;
        }
    }
    
    /// @notice Push lazy values down to children (with auto-allocation)
    /// @param tree Tree storage reference
    /// @param nodeIndex Current node index
    /// @param l Left boundary
    /// @param r Right boundary
    function _push(Tree storage tree, uint32 nodeIndex, uint32 l, uint32 r) private {
        if (nodeIndex == 0) return;
        
        Node storage node = tree.nodes[nodeIndex];
        uint192 nodeLazy = node.lazy;
        
        if (nodeLazy != uint192(WAD)) {
            uint32 mid = l + (r - l) / 2;
            (uint32 left, uint32 right) = _unpackChildren(node.children);
            
            uint256 lazyFactor = uint256(nodeLazy);
            
            // Auto-allocate left child if needed
            if (left == 0) {
                left = _allocateNode(tree, l, mid);
            }
            _apply(tree, left, lazyFactor);
            
            // Auto-allocate right child if needed
            if (right == 0) {
                right = _allocateNode(tree, mid + 1, r);
            }
            _apply(tree, right, lazyFactor);
            
            // Update packed children
            node.children = _packChildren(left, right);
            node.lazy = uint192(WAD);
        }
    }
    
    /// @notice Pull values up from children
    /// @param tree Tree storage reference
    /// @param nodeIndex Current node index
    /// @param l Left boundary
    /// @param r Right boundary
    function _pull(Tree storage tree, uint32 nodeIndex, uint32 l, uint32 r) private {
        if (nodeIndex == 0) return;
        
        Node storage node = tree.nodes[nodeIndex];
        (uint32 left, uint32 right) = _unpackChildren(node.children);
        
        uint32 mid = l + (r - l) / 2;
        
        uint256 leftSum = (left != 0) ? tree.nodes[left].sum : _defaultSum(l, mid);
        uint256 rightSum = (right != 0) ? tree.nodes[right].sum : _defaultSum(mid + 1, r);
        
        node.sum = leftSum + rightSum;
        
        // Update cached root sum if this is root
        if (nodeIndex == tree.root) {
            tree.cachedRootSum = node.sum;
        }
    }

    /// @notice Recursive update implementation
    /// @param tree Tree storage reference
    /// @param nodeIndex Current node index
    /// @param l Left boundary of current segment
    /// @param r Right boundary of current segment
    /// @param index Target index to update
    /// @param value New value
    function _updateRecursive(
        Tree storage tree,
        uint32 nodeIndex,
        uint32 l,
        uint32 r,
        uint32 index,
        uint256 value
    ) private {
        if (l == r) {
            // Leaf node
            Node storage leaf = tree.nodes[nodeIndex];
            leaf.sum = value;
            leaf.lazy = uint192(WAD);  // Clear any pending lazy factor
            return;
        }
        
        _push(tree, nodeIndex, l, r);
        
        uint32 mid = l + (r - l) / 2;
        (uint32 leftChild, uint32 rightChild) = _unpackChildren(tree.nodes[nodeIndex].children);
        
        if (index <= mid) {
            // Auto-allocate left child if needed
            if (leftChild == 0) {
                leftChild = _allocateNode(tree, l, mid);
                tree.nodes[nodeIndex].children = _packChildren(leftChild, rightChild);
            }
            _updateRecursive(tree, leftChild, l, mid, index, value);
        } else {
            // Auto-allocate right child if needed
            if (rightChild == 0) {
                rightChild = _allocateNode(tree, mid + 1, r);
                tree.nodes[nodeIndex].children = _packChildren(leftChild, rightChild);
            }
            _updateRecursive(tree, rightChild, mid + 1, r, index, value);
        }
        
        _pull(tree, nodeIndex, l, r);
    }

    /// @notice Apply range multiplication
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
        
        _mulRangeRecursive(tree, tree.root, 0, tree.size - 1, lo, hi, factor);
        tree.cachedRootSum = tree.nodes[tree.root].sum;
        
        emit RangeMul(lo, hi, factor);
    }
    
    /// @notice Recursive range multiplication implementation
    /// @param tree Tree storage reference
    /// @param nodeIndex Current node index
    /// @param l Left boundary of current segment
    /// @param r Right boundary of current segment
    /// @param lo Query left boundary
    /// @param hi Query right boundary
    /// @param factor Multiplication factor
    function _mulRangeRecursive(
        Tree storage tree,
        uint32 nodeIndex,
        uint32 l,
        uint32 r,
        uint32 lo,
        uint32 hi,
        uint256 factor
    ) private {
        // No overlap
        if (r < lo || l > hi) return;
        
        // If no node exists, nothing to do
        if (nodeIndex == 0) return;
        
        // Complete overlap - apply lazy update
        if (l >= lo && r <= hi) {
            _apply(tree, nodeIndex, factor);
            return;
        }
        
        // Partial overlap - push down and recurse
        _push(tree, nodeIndex, l, r);
        
        Node storage node = tree.nodes[nodeIndex];
        (uint32 leftChild, uint32 rightChild) = _unpackChildren(node.children);
        uint32 mid = l + (r - l) / 2;
        
        // Auto-allocate children if needed for partial overlap
        if (leftChild == 0 && lo <= mid) {
            leftChild = _allocateNode(tree, l, mid);
        }
        if (rightChild == 0 && hi > mid) {
            rightChild = _allocateNode(tree, mid + 1, r);
        }
        
        // Update children references
        node.children = _packChildren(leftChild, rightChild);
        
        _mulRangeRecursive(tree, leftChild, l, mid, lo, hi, factor);
        _mulRangeRecursive(tree, rightChild, mid + 1, r, lo, hi, factor);
        
        _pull(tree, nodeIndex, l, r);
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
        
        return _queryRecursive(tree, tree.root, 0, tree.size - 1, lo, hi);
    }
    
    /// @notice Recursive query implementation (view version)
    /// @param tree Tree storage reference
    /// @param nodeIndex Current node index
    /// @param l Left boundary of current segment
    /// @param r Right boundary of current segment
    /// @param lo Query left boundary
    /// @param hi Query right boundary
    /// @return sum Sum in the queried range
    function _queryRecursiveView(
        Tree storage tree,
        uint32 nodeIndex,
        uint32 l,
        uint32 r,
        uint32 lo,
        uint32 hi
    ) private view returns (uint256 sum) {
        // Handle empty nodes with default sum
        if (nodeIndex == 0) {
            if (r < lo || l > hi) return 0;
            uint32 overlapL = lo > l ? lo : l;
            uint32 overlapR = hi < r ? hi : r;
            return _defaultSum(overlapL, overlapR);
        }
        
        // No overlap
        if (r < lo || l > hi) return 0;
        
        Node storage node = tree.nodes[nodeIndex];
        
        // Complete overlap
        if (l >= lo && r <= hi) {
            return node.sum;
        }
        
        // Partial overlap
        uint32 mid = l + (r - l) / 2;
        (uint32 leftChild, uint32 rightChild) = _unpackChildren(node.children);
        
        uint256 leftSum = _queryRecursiveView(tree, leftChild, l, mid, lo, hi);
        uint256 rightSum = _queryRecursiveView(tree, rightChild, mid + 1, r, lo, hi);
        
        return leftSum + rightSum;
    }
    
    /// @notice Recursive query implementation with lazy propagation
    /// @param tree Tree storage reference
    /// @param nodeIndex Current node index
    /// @param l Left boundary of current segment
    /// @param r Right boundary of current segment
    /// @param lo Query left boundary
    /// @param hi Query right boundary
    /// @return sum Sum in the queried range
    function _queryRecursive(
        Tree storage tree,
        uint32 nodeIndex,
        uint32 l,
        uint32 r,
        uint32 lo,
        uint32 hi
    ) private returns (uint256 sum) {
        // Handle empty nodes with default sum
        if (nodeIndex == 0) {
            if (r < lo || l > hi) return 0;
            uint32 overlapL = lo > l ? lo : l;
            uint32 overlapR = hi < r ? hi : r;
            return _defaultSum(overlapL, overlapR);
        }
        
        // No overlap
        if (r < lo || l > hi) return 0;
        
        Node storage node = tree.nodes[nodeIndex];
        
        // Complete overlap
        if (l >= lo && r <= hi) {
            return node.sum;
        }
        
        // Partial overlap - push lazy values first
        _push(tree, nodeIndex, l, r);
        
        uint32 mid = l + (r - l) / 2;
        (uint32 leftChild, uint32 rightChild) = _unpackChildren(node.children);
        
        uint256 leftSum = _queryRecursive(tree, leftChild, l, mid, lo, hi);
        uint256 rightSum = _queryRecursive(tree, rightChild, mid + 1, r, lo, hi);
        
        return leftSum + rightSum;
    }

    // ========================================
    // UTILITY FUNCTIONS
    // ========================================
    
    /// @notice Get total sum of all elements (O(1) cached access)
    /// @param tree Tree storage reference
    /// @return sum Total sum
    function getTotalSum(Tree storage tree) internal view returns (uint256 sum) {
        return tree.cachedRootSum;
    }

    // ========================================
    // BULK OPERATIONS
    // ========================================
    
    /// @notice Batch update multiple values efficiently
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
} 