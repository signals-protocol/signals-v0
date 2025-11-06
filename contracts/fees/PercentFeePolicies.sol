// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "./interfaces/ICLMSRFeePolicy.sol";

abstract contract FixedPercentFeePolicy is ICLMSRFeePolicy {
    uint256 private constant _BPS_DENOMINATOR = 10_000;

    function _feeBps() internal pure virtual returns (uint256);

    function _name() internal pure virtual returns (string memory);

    function _descriptor() internal pure virtual returns (string memory);

    /// @inheritdoc ICLMSRFeePolicy
    function quoteFee(QuoteParams calldata params) external pure override returns (uint256) {
        uint256 feeBps = _feeBps();
        if (feeBps == 0 || params.baseAmount == 0) {
            return 0;
        }
        return (params.baseAmount * feeBps) / _BPS_DENOMINATOR;
    }

    /// @inheritdoc ICLMSRFeePolicy
    function name() external pure override returns (string memory) {
        return _name();
    }

    /// @inheritdoc ICLMSRFeePolicy
    function descriptor() external pure override returns (string memory) {
        return _descriptor();
    }
}

contract PercentFeePolicy10bps is FixedPercentFeePolicy {
    function _feeBps() internal pure override returns (uint256) {
        return 10;
    }

    function _name() internal pure override returns (string memory) {
        return "PercentFeePolicy10bps";
    }

    function _descriptor() internal pure override returns (string memory) {
        return '{"policy":"percentage","params":{"bps":"10","name":"PercentFeePolicy10bps"}}';
    }
}

contract PercentFeePolicy50bps is FixedPercentFeePolicy {
    function _feeBps() internal pure override returns (uint256) {
        return 50;
    }

    function _name() internal pure override returns (string memory) {
        return "PercentFeePolicy50bps";
    }

    function _descriptor() internal pure override returns (string memory) {
        return '{"policy":"percentage","params":{"bps":"50","name":"PercentFeePolicy50bps"}}';
    }
}

contract PercentFeePolicy100bps is FixedPercentFeePolicy {
    function _feeBps() internal pure override returns (uint256) {
        return 100;
    }

    function _name() internal pure override returns (string memory) {
        return "PercentFeePolicy100bps";
    }

    function _descriptor() internal pure override returns (string memory) {
        return '{"policy":"percentage","params":{"bps":"100","name":"PercentFeePolicy100bps"}}';
    }
}

contract PercentFeePolicy200bps is FixedPercentFeePolicy {
    function _feeBps() internal pure override returns (uint256) {
        return 200;
    }

    function _name() internal pure override returns (string memory) {
        return "PercentFeePolicy200bps";
    }

    function _descriptor() internal pure override returns (string memory) {
        return '{"policy":"percentage","params":{"bps":"200","name":"PercentFeePolicy200bps"}}';
    }
}
