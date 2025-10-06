// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {LazyMulSegmentTree} from "../libraries/LazyMulSegmentTree.sol";

/// @dev Direct harness around LazyMulSegmentTree for white-box unit tests
contract LazyMulSegmentTreeHarness {
    using LazyMulSegmentTree for LazyMulSegmentTree.Tree;

    LazyMulSegmentTree.Tree internal _tree;

    function init(uint32 size) external {
        _tree.init(size);
    }

    function applyFactor(uint32 lo, uint32 hi, uint256 factor) external {
        _tree.applyRangeFactor(lo, hi, factor);
    }

    function rangeSum(uint32 lo, uint32 hi) external view returns (uint256) {
        return _tree.getRangeSum(lo, hi);
    }

    function propagate(uint32 lo, uint32 hi) external returns (uint256) {
        return _tree.propagateLazy(lo, hi);
    }

    function root() external view returns (uint32) {
        return _tree.root;
    }

    function cachedRootSum() external view returns (uint256) {
        return _tree.cachedRootSum;
    }

    function getNode(uint32 idx)
        external
        view
        returns (uint256 sum, uint256 pendingFactor, uint64 childPtr)
    {
        LazyMulSegmentTree.Node storage node = _tree.nodes[idx];
        return (node.sum, uint256(node.pendingFactor), node.childPtr);
    }
}
