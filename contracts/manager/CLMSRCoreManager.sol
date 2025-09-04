// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import {CLMSRCoreOps} from "./CLMSRCoreOps.sol";

interface ICoreAdminGateway {
    function adminCall(bytes calldata data) external returns (bytes memory result);
}

/// @title CLMSRCoreManager
/// @notice 운영자용 엔드포인트. Core.adminCall을 통해 Core 컨텍스트로 delegatecall 실행
contract CLMSRCoreManager is Ownable {
    address public immutable core;
    address public operator;

    error Unauthorized();
    error ZeroAddress();

    event OperatorChanged(address indexed previousOperator, address indexed newOperator);

    constructor(address _core, address _owner) Ownable(_owner) {
        if (_core == address(0) || _owner == address(0)) revert ZeroAddress();
        core = _core;
    }

    modifier onlyOperator() {
        if (msg.sender != operator) revert Unauthorized();
        _;
    }

    function setOperator(address _op) external onlyOwner {
        if (_op == address(0)) revert ZeroAddress();
        emit OperatorChanged(operator, _op);
        operator = _op;
    }

    // ===== Admin functions forwarding to Core via adminCall =====

    function createMarket(
        int256 minTick,
        int256 maxTick,
        int256 tickSpacing,
        uint64 startTimestamp,
        uint64 endTimestamp,
        uint256 liquidityParameter
    ) external onlyOperator returns (uint256 marketId) {
        bytes memory ret = ICoreAdminGateway(core).adminCall(
            abi.encodeWithSelector(
                CLMSRCoreOps.opCreateMarket.selector,
                minTick,
                maxTick,
                tickSpacing,
                startTimestamp,
                endTimestamp,
                liquidityParameter
            )
        );
        marketId = abi.decode(ret, (uint256));
    }

    function settleMarket(uint256 marketId, int256 settlementValue) external onlyOperator {
        ICoreAdminGateway(core).adminCall(
            abi.encodeWithSelector(CLMSRCoreOps.opSettleMarket.selector, marketId, settlementValue)
        );
    }

    function emitPositionSettledBatch(uint256 marketId, uint256 limit) external onlyOperator {
        ICoreAdminGateway(core).adminCall(
            abi.encodeWithSelector(CLMSRCoreOps.opEmitPositionSettledBatch.selector, marketId, limit)
        );
    }

    function updateMarketTiming(
        uint256 marketId,
        uint64 newStartTimestamp,
        uint64 newEndTimestamp
    ) external onlyOperator {
        ICoreAdminGateway(core).adminCall(
            abi.encodeWithSelector(
                CLMSRCoreOps.opUpdateMarketTiming.selector,
                marketId,
                newStartTimestamp,
                newEndTimestamp
            )
        );
    }

    function propagateLazy(uint256 marketId, int256 lo, int256 hi) external onlyOperator returns (uint256 sum) {
        bytes memory ret = ICoreAdminGateway(core).adminCall(
            abi.encodeWithSelector(CLMSRCoreOps.opPropagateLazy.selector, marketId, lo, hi)
        );
        sum = abi.decode(ret, (uint256));
    }

    function applyRangeFactor(uint256 marketId, int256 lo, int256 hi, uint256 factor) external onlyOperator {
        ICoreAdminGateway(core).adminCall(
            abi.encodeWithSelector(CLMSRCoreOps.opApplyRangeFactor.selector, marketId, lo, hi, factor)
        );
    }
}


