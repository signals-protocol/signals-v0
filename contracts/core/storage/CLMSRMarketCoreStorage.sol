// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../../interfaces/ICLMSRMarketCore.sol";
import "../../interfaces/ICLMSRPosition.sol";
import "../../fees/interfaces/ICLMSRFeePolicy.sol";
import {LazyMulSegmentTree} from "../../libraries/LazyMulSegmentTree.sol";

/// @dev 공유 스토리지 레이아웃: Core와 Manager가 동일 순서로 상속해야 슬롯이 일치한다.
abstract contract CLMSRMarketCoreStorage {
    uint64 internal constant SETTLEMENT_SUBMIT_WINDOW = 10 minutes;
    uint64 internal constant SETTLEMENT_FINALIZE_DEADLINE = 15 minutes;

    IERC20 public paymentToken;
    ICLMSRPosition public positionContract;
    mapping(uint256 => ICLMSRMarketCore.Market) public markets;
    mapping(uint256 => LazyMulSegmentTree.Tree) public marketTrees;
    uint256 public _nextMarketId;
    mapping(uint256 => bool) public positionSettledEmitted;
    address public manager;
    ICLMSRFeePolicy public deprecatedFeePolicy;
    address public feeRecipient;

    struct SettlementOracleState {
        int256 candidateValue;
        uint64 candidatePriceTimestamp;
    }

    mapping(uint256 => SettlementOracleState) internal settlementOracleState;
    address public settlementOracleSigner;

    uint256[43] internal __gap;
}
