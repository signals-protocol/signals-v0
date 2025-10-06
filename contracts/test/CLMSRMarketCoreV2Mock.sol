// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "../core/CLMSRMarketCore.sol";

/// @notice 테스트 전용 V2 구현으로, 업그레이드 경로 검증을 위한 최소 확장 버전
contract CLMSRMarketCoreV2Mock is CLMSRMarketCore {
    /// @notice V2 구현임을 나타내는 식별자
    function version() external pure returns (string memory) {
        return "v2-mock";
    }

    /// @notice 업그레이드 후 상태 보존 확인을 위한 헬퍼
    function snapshotState()
        external
        view
        returns (address currentManager, uint256 nextMarketId)
    {
        return (manager, _nextMarketId);
    }
}
