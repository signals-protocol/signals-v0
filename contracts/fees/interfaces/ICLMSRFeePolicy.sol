// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title ICLMSRFeePolicy
/// @notice Strategy interface for overlay trade fees applied after core settlement
interface ICLMSRFeePolicy {
    struct QuoteParams {
        address trader;
        uint256 marketId;
        int256 lowerTick;
        int256 upperTick;
        uint128 quantity;
        uint256 baseAmount;
        bool isBuy;
        bytes32 context;
    }

    /// @notice Quotes the overlay fee in 6-decimal units
    /// @dev baseAmount corresponds to the settled cost (for buys) or proceeds (for sells)
    function quoteFee(QuoteParams calldata params) external view returns (uint256 feeAmount);

    /// @notice Optional human-readable identifier for the policy
    function name() external view returns (string memory);

    /// @notice Returns a JSON descriptor describing the policy configuration
    function descriptor() external view returns (string memory);
}
