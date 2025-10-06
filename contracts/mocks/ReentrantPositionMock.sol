// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ICLMSRPosition} from "../interfaces/ICLMSRPosition.sol";
import {ICLMSRMarketCore} from "../interfaces/ICLMSRMarketCore.sol";
import {CLMSRErrors as CE} from "../errors/CLMSRErrors.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title ReentrantPositionMock
/// @notice Malicious position contract used to simulate reentrant behaviours against the core contract
contract ReentrantPositionMock is ERC721Enumerable, Ownable, ICLMSRPosition {
    enum AttackMode {
        None,
        Decrease,
        Close,
        Claim,
        EmitBatch
    }

    address public core;
    uint256 private _nextId;

    mapping(uint256 positionId => Position) private _positions;
    mapping(uint256 marketId => uint256[]) private _marketTokenList;
    mapping(uint256 positionId => uint256) private _positionMarket;
    mapping(uint256 positionId => uint256) private _positionMarketIndex;

    AttackMode public attackMode;
    uint256 public attackTargetPosition;
    uint128 public attackQuantity;
    uint256 public attackMinProceeds;
    uint256 public attackEmitLimit;

    constructor() ERC721("Reentrant CLMSR Position", "RCLMSR-POS") Ownable(msg.sender) {
        _nextId = 1;
    }

    modifier onlyCore() {
        require(msg.sender == core, CE.UnauthorizedCaller(msg.sender));
        _;
    }

    function setCore(address newCore) external onlyOwner {
        require(newCore != address(0), CE.ZeroAddress());
        core = newCore;
    }

    function updateCore(address newCore) external onlyOwner {
        require(newCore != address(0), CE.ZeroAddress());
        core = newCore;
    }

    function configureAttack(
        AttackMode mode,
        uint256 targetPosition,
        uint128 quantity,
        uint256 minProceeds,
        uint256 emitLimit
    ) external onlyOwner {
        attackMode = mode;
        attackTargetPosition = targetPosition;
        attackQuantity = quantity;
        attackMinProceeds = minProceeds;
        attackEmitLimit = emitLimit;
    }

    function getCoreContract() external view returns (address) {
        return core;
    }

    function isAuthorizedCaller(address account) external view returns (bool) {
        return account == core;
    }

    function getNextId() external view returns (uint256) {
        return _nextId;
    }

    function mintPosition(
        address trader,
        uint256 marketId,
        int256 lowerTick,
        int256 upperTick,
        uint128 quantity
    ) external onlyCore returns (uint256 positionId) {
        require(trader != address(0), CE.ZeroAddress());
        require(quantity != 0, CE.InvalidQuantity(quantity));

        positionId = _nextId++;

        _positions[positionId] = Position({
            marketId: marketId,
            lowerTick: lowerTick,
            upperTick: upperTick,
            quantity: quantity,
            createdAt: uint64(block.timestamp)
        });

        _safeMint(trader, positionId);

        _marketTokenList[marketId].push(positionId);
        _positionMarket[positionId] = marketId;
        _positionMarketIndex[positionId] = _marketTokenList[marketId].length;

        emit PositionMinted(positionId, trader, marketId, lowerTick, upperTick, quantity);
    }

    function updateQuantity(uint256 positionId, uint128 newQuantity) public onlyCore {
        require(_positionExists(positionId), CE.PositionNotFound(positionId));
        require(newQuantity != 0, CE.InvalidQuantity(newQuantity));

        if (attackMode == AttackMode.Decrease) {
            attackMode = AttackMode.None;
            uint256 targetId = attackTargetPosition == 0 ? positionId : attackTargetPosition;
            uint128 qty = attackQuantity == 0 ? 1 : attackQuantity;
            ICLMSRMarketCore(core).decreasePosition(targetId, qty, attackMinProceeds);
        }

        uint128 oldQuantity = _positions[positionId].quantity;
        _positions[positionId].quantity = newQuantity;

        emit PositionUpdated(positionId, oldQuantity, newQuantity);
    }

    function setPositionQuantity(uint256 positionId, uint128 newQuantity) external onlyCore {
        updateQuantity(positionId, newQuantity);
    }

    function burn(uint256 positionId) public onlyCore {
        require(_positionExists(positionId), CE.PositionNotFound(positionId));

        address owner = ownerOf(positionId);
        uint256 marketId = _positionMarket[positionId];
        uint256 index = _positionMarketIndex[positionId];

        if (attackMode == AttackMode.Close) {
            attackMode = AttackMode.None;
            uint256 targetId = attackTargetPosition == 0 ? positionId : attackTargetPosition;
            ICLMSRMarketCore(core).closePosition(targetId, attackMinProceeds);
        } else if (attackMode == AttackMode.Claim) {
            attackMode = AttackMode.None;
            uint256 targetId = attackTargetPosition == 0 ? positionId : attackTargetPosition;
            ICLMSRMarketCore(core).claimPayout(targetId);
        } else if (attackMode == AttackMode.EmitBatch) {
            attackMode = AttackMode.None;
            uint256 limit = attackEmitLimit == 0 ? 1 : attackEmitLimit;
            ICLMSRMarketCore(core).emitPositionSettledBatch(marketId, limit);
        }

        _burn(positionId);
        delete _positions[positionId];

        if (index != 0) {
            uint256 arrayIndex = index - 1;
            if (arrayIndex < _marketTokenList[marketId].length) {
                _marketTokenList[marketId][arrayIndex] = 0;
            }
            delete _positionMarketIndex[positionId];
        }
        delete _positionMarket[positionId];

        emit PositionBurned(positionId, owner);
    }

    function burnPosition(uint256 positionId) external onlyCore {
        burn(positionId);
    }

    function getPosition(uint256 positionId) external view returns (Position memory data) {
        require(_positionExists(positionId), CE.PositionNotFound(positionId));
        data = _positions[positionId];
    }

    function exists(uint256 positionId) external view returns (bool) {
        return _positionExists(positionId);
    }

    function coreContract() external view returns (address) {
        return core;
    }

    function getPositionsByOwner(address owner) external view returns (uint256[] memory positions_) {
        uint256 count = balanceOf(owner);
        positions_ = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            positions_[i] = tokenOfOwnerByIndex(owner, i);
        }
    }

    function getMarketTokenLength(uint256 marketId) external view returns (uint256 length) {
        length = _marketTokenList[marketId].length;
    }

    function getMarketTokenAt(uint256 marketId, uint256 index) external view returns (uint256 tokenId) {
        tokenId = _marketTokenList[marketId][index];
    }

    function getMarketPositions(uint256 marketId) external view returns (uint256[] memory positions_) {
        uint256[] storage tokens = _marketTokenList[marketId];
        uint256 count;

        for (uint256 i = 0; i < tokens.length; i++) {
            uint256 tokenId = tokens[i];
            if (tokenId != 0 && _positionExists(tokenId)) {
                count++;
            }
        }

        positions_ = new uint256[](count);
        uint256 idx;
        for (uint256 i = 0; i < tokens.length; i++) {
            uint256 tokenId = tokens[i];
            if (tokenId != 0 && _positionExists(tokenId)) {
                positions_[idx++] = tokenId;
            }
        }
    }

    function getUserPositionsInMarket(address owner, uint256 marketId) external view returns (uint256[] memory positions_) {
        uint256 length = _marketTokenList[marketId].length;
        uint256 count;
        for (uint256 i = 0; i < length; i++) {
            uint256 tokenId = _marketTokenList[marketId][i];
            if (tokenId != 0 && ownerOf(tokenId) == owner) {
                count++;
            }
        }

        positions_ = new uint256[](count);
        uint256 idx;
        for (uint256 i = 0; i < length; i++) {
            uint256 tokenId = _marketTokenList[marketId][i];
            if (tokenId != 0 && ownerOf(tokenId) == owner) {
                positions_[idx++] = tokenId;
            }
        }
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721Enumerable, IERC165)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function _positionExists(uint256 positionId) internal view returns (bool) {
        return _ownerOf(positionId) != address(0);
    }
}
