// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "./interfaces/ICLMSRFeePolicy.sol";

/// @title PercentFeePolicy
/// @notice Overlay fee policy that charges a percentage-based fee on settled amounts
contract PercentFeePolicy is ICLMSRFeePolicy, Ownable {
    using Strings for uint256;

    /// @notice Emitted when the fee basis points are updated
    event FeeBpsUpdated(uint256 previousBps, uint256 newBps);

    uint256 private constant _BPS_DENOMINATOR = 10_000;
    uint256 private _feeBps;

    constructor(uint256 initialFeeBps) Ownable(msg.sender) {
        _setFeeBps(initialFeeBps);
    }

    /// @notice Returns the current fee in basis points (1 bps = 0.01%)
    function feeBps() external view returns (uint256) {
        return _feeBps;
    }

    /// @notice Updates the fee basis points
    /// @dev Only callable by the owner (typically governance or treasury)
    function setFeeBps(uint256 newFeeBps) external onlyOwner {
        _setFeeBps(newFeeBps);
    }

    /// @inheritdoc ICLMSRFeePolicy
    function quoteFee(QuoteParams calldata params) external view override returns (uint256) {
        if (_feeBps == 0) {
            return 0;
        }
        return (params.baseAmount * _feeBps) / _BPS_DENOMINATOR;
    }

    /// @inheritdoc ICLMSRFeePolicy
    function name() external pure override returns (string memory) {
        return "PercentFeePolicy";
    }

    /// @notice Returns a JSON descriptor for off-chain SDK consumption
    function descriptor() external view override returns (string memory) {
        return string(
            abi.encodePacked(
                '{"policy":"percentage","params":{"bps":"',
                _feeBps.toString(),
                '","name":"PercentFeePolicy"}}'
            )
        );
    }

    function _setFeeBps(uint256 newFeeBps) internal {
        require(newFeeBps <= _BPS_DENOMINATOR, "Fee exceeds 100%");
        uint256 previous = _feeBps;
        _feeBps = newFeeBps;
        emit FeeBpsUpdated(previous, newFeeBps);
    }
}
