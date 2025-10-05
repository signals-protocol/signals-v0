// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC721Receiver } from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import { ICLMSRMarketCore } from "../interfaces/ICLMSRMarketCore.sol";

/// @title ReentrantPositionAttacker
/// @notice Malicious receiver contract used to simulate ERC721 reentrancy against core operations
contract ReentrantPositionAttacker is IERC721Receiver {
    ICLMSRMarketCore public immutable core;
    address public immutable paymentToken;

    uint256 private targetMarketId;
    int256 private targetLowerTick;
    int256 private targetUpperTick;
    uint128 private targetQuantity;
    uint256 private targetMaxCost;
    bool private shouldReenter;

    constructor(address coreAddress, address paymentTokenAddress) {
        core = ICLMSRMarketCore(coreAddress);
        paymentToken = paymentTokenAddress;
    }

    function configureAttack(
        uint256 marketId,
        int256 lowerTick,
        int256 upperTick,
        uint128 quantity,
        uint256 maxCost
    ) external {
        targetMarketId = marketId;
        targetLowerTick = lowerTick;
        targetUpperTick = upperTick;
        targetQuantity = quantity;
        targetMaxCost = maxCost;
    }

    function approvePayment() external {
        IERC20(paymentToken).approve(address(core), type(uint256).max);
    }

    function attackOpenPosition() external {
        shouldReenter = true;
        core.openPosition(
            targetMarketId,
            targetLowerTick,
            targetUpperTick,
            targetQuantity,
            targetMaxCost
        );
    }

    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external override returns (bytes4) {
        if (shouldReenter) {
            shouldReenter = false;
            core.openPosition(
                targetMarketId,
                targetLowerTick,
                targetUpperTick,
                targetQuantity,
                targetMaxCost
            );
        }
        return IERC721Receiver.onERC721Received.selector;
    }
}
