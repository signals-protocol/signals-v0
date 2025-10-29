// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {CLMSRMarketCore} from "../core/CLMSRMarketCore.sol";

/// @dev Thin harness to expose internal math helpers from CLMSRMarketCore for testing parity.
contract CLMSRMathHarness is CLMSRMarketCore {
    /// @notice Expose the internal _safeExp helper for tests.
    function exposedSafeExp(uint256 q, uint256 alpha) external pure returns (uint256) {
        return _safeExp(q, alpha);
    }
}
