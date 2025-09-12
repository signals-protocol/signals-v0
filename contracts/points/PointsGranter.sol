// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {PointsErrors as PE} from "../errors/PointsErrors.sol";

/**
 * @title PointsGranter
 * @notice UUPS 패턴. 온체인 스토리지는 없고 이벤트만 발생시켜 인덱싱용으로 사용.
 */
contract PointsGranter is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    /// reason: 1=ACTIVITY, 2=PERFORMANCE, 3=RISK_BONUS, 100+=MANUAL
    /// contextTs: 0이면 인덱서에서 block.timestamp 사용
    event PointsGranted(address indexed user, uint256 amount, uint8 reason, uint64 contextTs);

    function initialize(address initialOwner) public initializer {
        __Ownable_init(initialOwner);
        __UUPSUpgradeable_init();
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}



    function grantPoints(
        address user,
        uint256 amount, // 6 decimals
        uint8 reason,
        uint64 contextTs // 0 or backfill timestamp
    ) external onlyOwner {
        require(user != address(0) && amount > 0, PE.InvalidParameters());
        emit PointsGranted(user, amount, reason, contextTs);
    }

    function batchGrantPoints(
        address[] calldata users,
        uint256[] calldata amounts,
        uint8[] calldata reasons,
        uint64[] calldata contextTs
    ) external onlyOwner {
        uint256 n = users.length;
        require(n == amounts.length && n == reasons.length && n == contextTs.length, PE.ParameterArrayLengthMismatch());
        for (uint256 i = 0; i < n; i++) {
            emit PointsGranted(users[i], amounts[i], reasons[i], contextTs[i]);
        }
    }
}

 