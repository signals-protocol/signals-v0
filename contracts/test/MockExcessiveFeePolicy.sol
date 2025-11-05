// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "../fees/interfaces/ICLMSRFeePolicy.sol";

/// @title MockExcessiveFeePolicy
/// @notice 테스트용 정책으로 baseAmount보다 큰 수수료를 강제로 반환한다.
contract MockExcessiveFeePolicy is ICLMSRFeePolicy {
    function quoteFee(QuoteParams calldata params) external pure override returns (uint256) {
        return params.baseAmount + 1;
    }

    function name() external pure override returns (string memory) {
        return "MockExcessiveFeePolicy";
    }

    function descriptor() external pure override returns (string memory) {
        return '{"policy":"mock","params":{"behavior":"excessive"}}';
    }
}
