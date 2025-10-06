// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../../interfaces/ICLMSRMarketCore.sol";
import "../../interfaces/ICLMSRPosition.sol";
import {LazyMulSegmentTree} from "../../libraries/LazyMulSegmentTree.sol";

/// @dev 공유 스토리지 레이아웃: Core와 Manager가 동일 순서로 상속해야 슬롯이 일치한다.
abstract contract CLMSRMarketCoreStorage {
    IERC20 public paymentToken;
    ICLMSRPosition public positionContract;
    mapping(uint256 => ICLMSRMarketCore.Market) public markets;
    mapping(uint256 => LazyMulSegmentTree.Tree) public marketTrees;
    uint256 public _nextMarketId;
    mapping(uint256 => bool) public positionSettledEmitted;
    address public manager;
    uint256[47] internal __gap;
}
