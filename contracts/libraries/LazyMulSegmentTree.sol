// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {FixedPointMathU} from "./FixedPointMath.sol";
import {CLMSRErrors as CE} from "../errors/CLMSRErrors.sol";

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
    /// @dev Optimized for 2-slot storage: pendingFactor(192bit) + childPtr(64bit) in slot 1, sum in slot 2
    struct Node {
        uint256 sum;            // Sum of exponential values in subtree
        uint192 pendingFactor;  // Lazy multiplication factor (ONE_WAD = no-op) - 192 bits sufficient
        uint64 childPtr;        // Packed: left(32bit) + right(32bit)
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
    // ERRORS
    // ========================================
    
    error IndexOutOfBounds(uint32 index, uint32 size);
    error InvalidRange(uint32 lo, uint32 hi);
    error TreeNotInitialized();
    error InvalidFactor(uint256 factor);

    // ========================================
    // CONSTANTS
    // ========================================
    
    uint256 public constant ONE_WAD = 1e18;
    uint256 public constant MIN_FACTOR = 0.01e18;  // 0.01% minimum - allow wide range for CLMSR
    uint256 public constant MAX_FACTOR = 100e18;   // 100x maximum - allow wide range for CLMSR
    uint256 public constant FLUSH_THRESHOLD = 1e21; // 1,000,000,000,000 WAD - auto-flush when pendingFactor exceeds this

    // ========================================
    // HELPER FUNCTIONS
    // ========================================
    
    /// @notice Calculate default sum for empty range (all leaves = 1 WAD)
    /// @param l Left boundary (inclusive)
    /// @param r Right boundary (inclusive)
    /// @return sum Default sum for range
    function _defaultSum(uint32 l, uint32 r) private pure returns (uint256 sum) {
        unchecked { 
            return uint256(r - l + 1) * ONE_WAD; 
        }
    }

    /// @notice Pack two uint32 values into uint64 child pointer
    function _packChildPtr(uint32 left, uint32 right) private pure returns (uint64) {
        return (uint64(left) << 32) | uint64(right);
    }
    
    /// @notice Unpack uint64 child pointer into two uint32 values
    function _unpackChildPtr(uint64 packed) private pure returns (uint32 left, uint32 right) {
        left = uint32(packed >> 32);
        right = uint32(packed);
    }

    // ========================================
    // INITIALIZATION
    // ========================================
    
    /// @notice Initialize a new lazy multiplication segment tree
    /// @param tree Tree storage reference
    /// @param treeSize Number of leaves in the tree
    function init(Tree storage tree, uint32 treeSize) external {
        require(treeSize != 0, CE.TreeSizeZero());
        require(treeSize <= type(uint32).max / 2, CE.TreeSizeTooLarge());
        require(tree.size == 0, CE.TreeAlreadyInitialized());
        
        tree.size = treeSize;
        tree.nextIndex = 0; // Start from 0
        tree.root = _allocateNode(tree, 0, treeSize - 1);
        tree.cachedRootSum = uint256(treeSize) * ONE_WAD; // All leaves default to ONE_WAD
    }
    
    /// @notice Allocate a new node with range boundaries
    /// @param tree Tree storage reference
    /// @param l Left boundary
    /// @param r Right boundary
    /// @return newIndex Newly allocated index
    function _allocateNode(Tree storage tree, uint32 l, uint32 r) private returns (uint32 newIndex) {
        newIndex = ++tree.nextIndex;
        Node storage node = tree.nodes[newIndex];
        node.pendingFactor = uint192(ONE_WAD); // No pending operations
        node.sum = _defaultSum(l, r); // Default sum for range
    }

    // ========================================
    // CORE OPERATIONS
    // ========================================
    
    /// @notice Update a single leaf value
    /// @param tree Tree storage reference
    /// @param index Leaf index (0-based)
    /// @param value New value to set
    function update(Tree storage tree, uint32 index, uint256 value) external {
        require(tree.size != 0, TreeNotInitialized());
        require(index < tree.size, IndexOutOfBounds(index, tree.size));
        
        _updateRecursive(tree, tree.root, 0, tree.size - 1, index, value);
        tree.cachedRootSum = tree.nodes[tree.root].sum;
    }
    
    /// @notice Apply lazy propagation to a node
    /// @param tree Tree storage reference
    /// @param nodeIndex Node index to apply to
    /// @param factor Multiplication factor
    function _applyFactorToNode(Tree storage tree, uint32 nodeIndex, uint256 factor) private {
        if (nodeIndex == 0 || factor == ONE_WAD) return;
        
        Node storage node = tree.nodes[nodeIndex];
        node.sum = node.sum.wMul(factor);
        
        uint256 newPendingFactor = uint256(node.pendingFactor).wMul(factor);
        
        // 🔧 FIXED: No auto-flush here to prevent factor loss
        // Auto-flush decision moved to _applyFactorRecursive where l,r bounds are known
        require(newPendingFactor <= 1e50, CE.LazyFactorOverflow()); // Ultimate safety limit
        node.pendingFactor = uint192(newPendingFactor);
        
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
    function _pushPendingFactor(Tree storage tree, uint32 nodeIndex, uint32 l, uint32 r) private {
        if (nodeIndex == 0) return;
        
        Node storage node = tree.nodes[nodeIndex];
        uint192 nodePendingFactor = node.pendingFactor;
        
        if (nodePendingFactor != uint192(ONE_WAD)) {
            uint32 mid = l + (r - l) / 2;
            (uint32 left, uint32 right) = _unpackChildPtr(node.childPtr);
            
            uint256 pendingFactorVal = uint256(nodePendingFactor);
            
            // Auto-allocate left child if needed
            if (left == 0) {
                left = _allocateNode(tree, l, mid);
            }
            _applyFactorToNode(tree, left, pendingFactorVal);
            
            // Auto-allocate right child if needed
            if (right == 0) {
                right = _allocateNode(tree, mid + 1, r);
            }
            _applyFactorToNode(tree, right, pendingFactorVal);
            
            // Update packed children
            node.childPtr = _packChildPtr(left, right);
            node.pendingFactor = uint192(ONE_WAD);
        }
    }
    
    /// @notice Pull values up from children
    /// @param tree Tree storage reference
    /// @param nodeIndex Current node index
    /// @param l Left boundary
    /// @param r Right boundary
    function _pullUpSum(Tree storage tree, uint32 nodeIndex, uint32 l, uint32 r) private {
        if (nodeIndex == 0) return;
        
        Node storage node = tree.nodes[nodeIndex];
        (uint32 left, uint32 right) = _unpackChildPtr(node.childPtr);
        
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
            leaf.pendingFactor = uint192(ONE_WAD);  // Clear any pending lazy factor
            return;
        }
        
        _pushPendingFactor(tree, nodeIndex, l, r);
        
        uint32 mid = l + (r - l) / 2;
        (uint32 leftChild, uint32 rightChild) = _unpackChildPtr(tree.nodes[nodeIndex].childPtr);
        
        if (index <= mid) {
            // Auto-allocate left child if needed
            if (leftChild == 0) {
                leftChild = _allocateNode(tree, l, mid);
                tree.nodes[nodeIndex].childPtr = _packChildPtr(leftChild, rightChild);
            }
            _updateRecursive(tree, leftChild, l, mid, index, value);
        } else {
            // Auto-allocate right child if needed
            if (rightChild == 0) {
                rightChild = _allocateNode(tree, mid + 1, r);
                tree.nodes[nodeIndex].childPtr = _packChildPtr(leftChild, rightChild);
            }
            _updateRecursive(tree, rightChild, mid + 1, r, index, value);
        }
        
        _pullUpSum(tree, nodeIndex, l, r);
    }

    /// @notice Apply range multiplication factor
    /// @param tree Tree storage reference
    /// @param lo Bin index lower bound (inclusive)
    /// @param hi Bin index upper bound (inclusive)
    /// @param factor Multiplication factor in WAD format
    // lo/hi are bin indices (inclusive)
    function applyRangeFactor(Tree storage tree, uint32 lo, uint32 hi, uint256 factor) external {
        require(tree.size != 0, TreeNotInitialized());
        require(lo <= hi, InvalidRange(lo, hi));
        require(hi < tree.size, IndexOutOfBounds(hi, tree.size));
        require(
            factor != 0 && factor >= MIN_FACTOR && factor <= MAX_FACTOR,
            InvalidFactor(factor)
        );
        
        _applyFactorRecursive(tree, tree.root, 0, tree.size - 1, lo, hi, factor);
        
        // Update cached root sum if affecting entire tree
        if (lo == 0 && hi == tree.size - 1) {
            tree.cachedRootSum = tree.nodes[tree.root].sum;
        }
    
    }
    
    /// @notice Recursive range multiplication implementation
    /// @dev 🔧 FIXED: Auto-flush decision moved here where l,r bounds are known
    /// @param tree Tree storage reference
    /// @param nodeIndex Current node index
    /// @param l Left boundary of current segment
    /// @param r Right boundary of current segment
    /// @param lo Query left boundary
    /// @param hi Query right boundary
    /// @param factor Multiplication factor
    function _applyFactorRecursive(
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
        
        Node storage node = tree.nodes[nodeIndex];
        
        // Complete overlap - apply lazy update with smart auto-flush
        if (l >= lo && r <= hi) {
            node.sum = node.sum.wMul(factor);
            
            uint256 newPendingFactor = uint256(node.pendingFactor).wMul(factor);
            
            // 🔧 FIXED: Smart auto-flush decision with range knowledge
            if (newPendingFactor > FLUSH_THRESHOLD) {
                // Force push current pendingFactor first, then apply new factor
                if (node.pendingFactor != uint192(ONE_WAD)) {
                    _pushPendingFactor(tree, nodeIndex, l, r);
                }
                // Now apply the new factor
                node.pendingFactor = uint192(factor);
            } else {
                // Normal case: accumulate the factor
                require(newPendingFactor <= 1e50, CE.LazyFactorOverflow());
                node.pendingFactor = uint192(newPendingFactor);
            }
            
            // Update cached root sum if this is root
            if (nodeIndex == tree.root) {
                tree.cachedRootSum = node.sum;
            }
            return;
        }
        
        // Partial overlap - push down and recurse
        _pushPendingFactor(tree, nodeIndex, l, r);
        
        (uint32 leftChild, uint32 rightChild) = _unpackChildPtr(node.childPtr);
        uint32 mid = l + (r - l) / 2;
        
        // Auto-allocate children if needed for partial overlap
        if (leftChild == 0 && lo <= mid) {
            leftChild = _allocateNode(tree, l, mid);
        }
        if (rightChild == 0 && hi > mid) {
            rightChild = _allocateNode(tree, mid + 1, r);
        }
        
        // Update children references
        node.childPtr = _packChildPtr(leftChild, rightChild);
        
        _applyFactorRecursive(tree, leftChild, l, mid, lo, hi, factor);
        _applyFactorRecursive(tree, rightChild, mid + 1, r, lo, hi, factor);
        
        _pullUpSum(tree, nodeIndex, l, r);
    }

    /// @notice Get range sum (on-the-fly calculation, view function)
    /// @param tree Tree storage reference
    /// @param lo Left boundary (inclusive)
    /// @param hi Right boundary (inclusive)
    /// @return sum Sum of values in range
    function getRangeSum(Tree storage tree, uint32 lo, uint32 hi) 
        external 
        view
        returns (uint256 sum) 
    {
        require(tree.size != 0, TreeNotInitialized());
        require(lo <= hi, InvalidRange(lo, hi));
        require(hi < tree.size, IndexOutOfBounds(hi, tree.size));
        
        return _sumRangeWithAccFactor(tree, tree.root, 0, tree.size - 1, lo, hi, ONE_WAD);
    }
    
    /// @notice Propagate lazy values and return range sum (state-changing function)
    /// @param tree Tree storage reference
    /// @param lo Bin index lower bound (inclusive)
    /// @param hi Bin index upper bound (inclusive)
    /// @return sum Sum of values in range
    // lo/hi are bin indices (inclusive)
    function propagateLazy(Tree storage tree, uint32 lo, uint32 hi)
        external
        returns (uint256 sum)
    {
        require(tree.size != 0, TreeNotInitialized());
        require(lo <= hi, InvalidRange(lo, hi));
        require(hi < tree.size, IndexOutOfBounds(hi, tree.size));
        
        sum = _queryRecursive(tree, tree.root, 0, tree.size - 1, lo, hi);
        
        // Update cached root sum if affecting entire tree
        if (lo == 0 && hi == tree.size - 1) {
            tree.cachedRootSum = tree.nodes[tree.root].sum;
        }
        
        return sum;
    }
    
    /// @notice On-the-fly query with accumulated lazy (true view function)
    /// @dev Renamed from _queryOnTheFly to _sumRangeWithAccFactor
    /// @param tree Tree storage reference
    /// @param nodeIndex Current node index
    /// @param l Left boundary of current segment
    /// @param r Right boundary of current segment
    /// @param lo Query left boundary
    /// @param hi Query right boundary
    /// @param accFactor Accumulated lazy factor from ancestors
    /// @return sum Sum in the queried range with all lazy values applied
    function _sumRangeWithAccFactor(
        Tree storage tree,
        uint32 nodeIndex,
        uint32 l,
        uint32 r,
        uint32 lo,
        uint32 hi,
        uint256 accFactor
    ) private view returns (uint256 sum) {
        // Handle empty nodes with default sum
        if (nodeIndex == 0) {
            if (r < lo || l > hi) return 0;
            uint32 overlapL = lo > l ? lo : l;
            uint32 overlapR = hi < r ? hi : r;
            return _defaultSum(overlapL, overlapR).wMul(accFactor);
        }
        
        // No overlap
        if (r < lo || l > hi) return 0;
        
        Node storage node = tree.nodes[nodeIndex];

        // Complete overlap
        if (l >= lo && r <= hi) {
            // node.sum already contains pendingFactor, so only apply ancestor accumulated factor
            return node.sum.wMul(accFactor);
        }
        
        // Apply current node's lazy to accumulated lazy
        uint256 newAccFactor = accFactor.wMul(node.pendingFactor);
        
        // Partial overlap - recurse with accumulated lazy
        uint32 mid = l + (r - l) / 2;
        (uint32 leftChild, uint32 rightChild) = _unpackChildPtr(node.childPtr);
        
        uint256 leftSum = _sumRangeWithAccFactor(tree, leftChild, l, mid, lo, hi, newAccFactor);
        uint256 rightSum = _sumRangeWithAccFactor(tree, rightChild, mid + 1, r, lo, hi, newAccFactor);
        
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
        _pushPendingFactor(tree, nodeIndex, l, r);
        
        uint32 mid = l + (r - l) / 2;
        (uint32 leftChild, uint32 rightChild) = _unpackChildPtr(node.childPtr);
        
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
    function getTotalSum(Tree storage tree) external view returns (uint256 sum) {
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
    ) external {
        require(indices.length == values.length, CE.ArrayLengthMismatch());
        require(tree.size != 0, TreeNotInitialized());
        
        uint256 len = indices.length;
        unchecked {
            for (uint256 i; i < len; ++i) {
                require(indices[i] < tree.size, IndexOutOfBounds(indices[i], tree.size));
                _updateRecursive(tree, tree.root, 0, tree.size - 1, indices[i], values[i]);
            }
        }
        
        // Update cached root sum only once at the end
        tree.cachedRootSum = tree.nodes[tree.root].sum;
    }
} 