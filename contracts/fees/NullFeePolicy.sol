// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "./interfaces/ICLMSRFeePolicy.sol";

/// @title NullFeePolicy
/// @notice Baseline fee policy returning zero overlay fees
contract NullFeePolicy is ICLMSRFeePolicy {
    function quoteFee(QuoteParams calldata) external pure override returns (uint256) {
        return 0;
    }

    function name() external pure override returns (string memory) {
        return "NullFeePolicy";
    }

    function descriptor() external pure override returns (string memory) {
        return '{"policy":"null","params":{"name":"NullFeePolicy"}}';
    }
}
