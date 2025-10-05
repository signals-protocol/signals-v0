// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ICLMSRPosition} from "../interfaces/ICLMSRPosition.sol";
import {CLMSRErrors as CE} from "../errors/CLMSRErrors.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title MockPosition
/// @notice Test helper contract that mimics the production CLMSR position manager
/// @dev Provides additional view helpers for tests while enforcing core-only mutations
contract MockPosition is ERC721Enumerable, Ownable, ICLMSRPosition {
    address public core;
    uint256 private _nextId;

    mapping(uint256 positionId => Position) private _positions;

    mapping(uint256 marketId => uint256[]) private _marketTokenList;
    mapping(uint256 positionId => uint256) private _positionMarket;
    mapping(uint256 positionId => uint256) private _positionMarketIndex;

    constructor() ERC721("Mock CLMSR Position", "MCLMSR-POS") Ownable(msg.sender) {
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
        _positionMarketIndex[positionId] = _marketTokenList[marketId].length; // 1-based index

        emit PositionMinted(positionId, trader, marketId, lowerTick, upperTick, quantity);
    }

    function updateQuantity(uint256 positionId, uint128 newQuantity) public onlyCore {
        require(_positionExists(positionId), CE.PositionNotFound(positionId));
        require(newQuantity != 0, CE.InvalidQuantity(newQuantity));

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

    function updateCore(address newCore) external onlyOwner {
        require(newCore != address(0), CE.ZeroAddress());
        core = newCore;
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
