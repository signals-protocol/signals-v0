// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "../core/CLMSRPosition.sol";

/// @notice 테스트 전용 V2 구현 (업그레이드 회귀 검증용)
contract CLMSRPositionV2Mock is CLMSRPosition {
    /// @notice V2 식별자를 노출해 업그레이드 성공 여부를 확인한다.
    function version() external pure returns (string memory) {
        return "position-v2-mock";
    }
}
