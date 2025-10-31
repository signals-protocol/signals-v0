// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {CLMSRErrors as CE} from "../errors/CLMSRErrors.sol";
import {FixedPointMathU} from "../libraries/FixedPointMath.sol";

/// @title LazyMulSegmentTreeTest
/// @notice Simplified reference contract that mimics LazyMulSegmentTree behaviour for unit tests
contract LazyMulSegmentTreeTest {
    using FixedPointMathU for uint256;

    uint256 public constant ONE_WAD = 1e18;
    uint256 public constant MIN_FACTOR = 0.01e18;
    uint256 public constant MAX_FACTOR = 100e18;

    enum OpKind { Factor, Update }

    struct Operation {
        OpKind kind;
        uint32 lo;
        uint32 hi;
        uint256 factorOrValue;
    }

    uint32 private _size;
    bool private _initialized;
    Operation[] private _ops;

    event Initialized(uint256 size);
    event NodeUpdated(uint256 index, uint256 newValue);
    event RangeFactorApplied(uint256 lo, uint256 hi, uint256 factor);

    modifier onlyInitialized() {
        if (!_initialized) revert CE.TreeNotInitialized();
        _;
    }

    function init(uint256 size) external {
        if (size == 0) revert CE.TreeSizeZero();
        if (_initialized) revert CE.TreeAlreadyInitialized();
        if (size > type(uint32).max / 2) revert CE.TreeSizeTooLarge();

        _size = uint32(size);
        _initialized = true;
        delete _ops;

        emit Initialized(size);
    }

    function update(uint256 index, uint256 newValue) external onlyInitialized {
        if (index >= _size) revert CE.IndexOutOfBounds(uint32(index), _size);

        _ops.push(Operation({ kind: OpKind.Update, lo: uint32(index), hi: uint32(index), factorOrValue: newValue }));
        emit NodeUpdated(index, newValue);
    }

    function batchUpdate(uint32[] calldata indices, uint256[] calldata values) external onlyInitialized {
        if (indices.length != values.length) revert CE.ArrayLengthMismatch();
        for (uint256 i = 0; i < indices.length; i++) {
            if (indices[i] >= _size) revert CE.IndexOutOfBounds(indices[i], _size);
            _ops.push(Operation({ kind: OpKind.Update, lo: indices[i], hi: indices[i], factorOrValue: values[i] }));
            emit NodeUpdated(indices[i], values[i]);
        }
    }

    function applyRangeFactor(uint256 lo, uint256 hi, uint256 factor) external onlyInitialized {
        if (lo > hi) revert CE.InvalidRange(uint32(lo), uint32(hi));
        if (hi >= _size) revert CE.IndexOutOfBounds(uint32(hi), _size);
        if (factor < MIN_FACTOR || factor > MAX_FACTOR) revert CE.InvalidFactor(factor);

        _ops.push(Operation({ kind: OpKind.Factor, lo: uint32(lo), hi: uint32(hi), factorOrValue: factor }));
        emit RangeFactorApplied(lo, hi, factor);
    }

    function getRangeSum(uint256 lo, uint256 hi) public view onlyInitialized returns (uint256 sum) {
        if (lo > hi) revert CE.InvalidRange(uint32(lo), uint32(hi));
        if (hi >= _size) revert CE.IndexOutOfBounds(uint32(hi), _size);

        for (uint256 idx = lo; idx <= hi; idx++) {
            sum += _valueAt(uint32(idx));
        }
    }

    function getTotalSum() external view onlyInitialized returns (uint256) {
        if (_size == 0) return 0;
        return getRangeSum(0, _size - 1);
    }

    function getTreeSize() external view returns (uint256) {
        return _size;
    }

    function getNodeValue(uint256 index) external view onlyInitialized returns (uint256) {
        if (index >= _size) revert CE.IndexOutOfBounds(uint32(index), _size);
        return _valueAt(uint32(index));
    }

    function getLazyValue(uint256) external pure returns (uint256) {
        return 0;
    }

    function _valueAt(uint32 index) internal view returns (uint256 value) {
        value = ONE_WAD;
        for (uint256 i = 0; i < _ops.length; i++) {
            Operation memory op = _ops[i];
            if (op.kind == OpKind.Update) {
                if (op.lo == index) {
                    value = op.factorOrValue;
                }
            } else {
                if (index >= op.lo && index <= op.hi) {
                    value = _mulWad(value, op.factorOrValue);
                }
            }
        }
    }

    function _mulWad(uint256 a, uint256 b) private pure returns (uint256) {
        if (a == 0 || b == 0) return 0;
        return a.wMulNearest(b);
    }
}
