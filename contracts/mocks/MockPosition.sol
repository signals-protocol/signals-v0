// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/ICLMSRPosition.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title MockPosition
/// @notice Mock implementation of ICLMSRPosition for testing
contract MockPosition is ICLMSRPosition, Ownable {
    // ========================================
    // STORAGE
    // ========================================
    
    uint256 private _nextId = 1;
    address public coreContract;
    
    mapping(uint256 => Position) private _positions;
    mapping(uint256 => address) private _owners;
    mapping(address => uint256) private _balances;
    mapping(uint256 => address) private _tokenApprovals;
    mapping(address => mapping(address => bool)) private _operatorApprovals;
    
    // For tracking owner's tokens (simplified, no enumerable index tracking)
    mapping(address => uint256[]) private _ownedTokens;

    // ========================================
    // MODIFIERS
    // ========================================
    
    modifier onlyCore() {
        if (msg.sender != coreContract) revert UnauthorizedCaller(msg.sender);
        _;
    }

    // ========================================
    // CONSTRUCTOR
    // ========================================
    
    constructor() Ownable(msg.sender) {}

    // ========================================
    // ADMIN FUNCTIONS
    // ========================================
    
    function setCore(address _coreContract) external onlyOwner {
        if (_coreContract == address(0)) revert ZeroAddress();
        coreContract = _coreContract;
    }

    // ========================================
    // ERC721 STANDARD FUNCTIONS
    // ========================================
    
    function name() external pure returns (string memory) {
        return "Mock CLMSR Position";
    }

    function symbol() external pure returns (string memory) {
        return "MOCK-POS";
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        if (_owners[tokenId] == address(0)) revert PositionNotFound(tokenId);
        return string(abi.encodePacked("https://mock.position/", _toString(tokenId)));
    }
    
    function balanceOf(address owner) external view returns (uint256) {
        if (owner == address(0)) revert ZeroAddress();
        return _balances[owner];
    }

    function ownerOf(uint256 tokenId) external view returns (address) {
        address owner = _owners[tokenId];
        if (owner == address(0)) revert PositionNotFound(tokenId);
        return owner;
    }

    function transferFrom(address from, address to, uint256 tokenId) external {
        if (!_isApprovedOrOwner(msg.sender, tokenId)) revert UnauthorizedCaller(msg.sender);
        _transfer(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) external {
        if (!_isApprovedOrOwner(msg.sender, tokenId)) revert UnauthorizedCaller(msg.sender);
        _transfer(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId, bytes calldata) external {
        if (!_isApprovedOrOwner(msg.sender, tokenId)) revert UnauthorizedCaller(msg.sender);
        _transfer(from, to, tokenId);
    }

    function approve(address to, uint256 tokenId) external {
        address owner = _owners[tokenId];
        if (owner == address(0)) revert PositionNotFound(tokenId);
        if (msg.sender != owner && !_operatorApprovals[owner][msg.sender]) {
            revert UnauthorizedCaller(msg.sender);
        }
        _tokenApprovals[tokenId] = to;
    }

    function setApprovalForAll(address operator, bool approved) external {
        _operatorApprovals[msg.sender][operator] = approved;
    }

    function getApproved(uint256 tokenId) external view returns (address) {
        if (_owners[tokenId] == address(0)) revert PositionNotFound(tokenId);
        return _tokenApprovals[tokenId];
    }

    function isApprovedForAll(address owner, address operator) external view returns (bool) {
        return _operatorApprovals[owner][operator];
    }

    // ========================================
    // POSITION MANAGEMENT
    // ========================================
    
    function mintPosition(
        address to,
        uint256 marketId,
        uint32 lowerTick,
        uint32 upperTick,
        uint128 quantity
    ) external onlyCore returns (uint256 positionId) {
        if (to == address(0)) revert ZeroAddress();
        if (quantity == 0) revert InvalidQuantity(quantity);
        
        positionId = _nextId++;
        
        _positions[positionId] = Position({
            marketId: marketId,
            lowerTick: lowerTick,
            upperTick: upperTick,
            quantity: quantity,
            createdAt: uint64(block.timestamp)
        });
        
        _mint(to, positionId);
        
        emit PositionMinted(positionId, to, marketId, lowerTick, upperTick, quantity);
    }

    function setPositionQuantity(uint256 positionId, uint128 newQuantity) external onlyCore {
        if (_owners[positionId] == address(0)) revert PositionNotFound(positionId);
        if (newQuantity == 0) revert InvalidQuantity(newQuantity);
        
        uint128 oldQuantity = _positions[positionId].quantity;
        _positions[positionId].quantity = newQuantity;
        
        emit PositionUpdated(positionId, oldQuantity, newQuantity);
    }

    function burnPosition(uint256 positionId) external onlyCore {
        address owner = _owners[positionId];
        if (owner == address(0)) revert PositionNotFound(positionId);
        
        _burn(positionId);
        delete _positions[positionId];
        
        emit PositionBurned(positionId, owner);
    }

    // ========================================
    // POSITION QUERIES
    // ========================================
    
    function getPosition(uint256 positionId) external view returns (Position memory data) {
        if (_owners[positionId] == address(0)) revert PositionNotFound(positionId);
        return _positions[positionId];
    }

    function getPositionsByOwner(address owner) external view returns (uint256[] memory positionIds) {
        return _ownedTokens[owner];
    }

    function getUserPositionsInMarket(address owner, uint256 marketId) external view returns (uint256[] memory positionIds) {
        uint256[] memory allTokens = _ownedTokens[owner];
        uint256[] memory temp = new uint256[](allTokens.length);
        uint256 count = 0;
        
        for (uint256 i = 0; i < allTokens.length; i++) {
            uint256 tokenId = allTokens[i];
            if (_positions[tokenId].marketId == marketId) {
                temp[count] = tokenId;
                count++;
            }
        }
        
        positionIds = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            positionIds[i] = temp[i];
        }
    }

    function getAllPositionsInMarket(uint256 marketId) external view returns (uint256[] memory positionIds) {
        // Count positions for this market
        uint256 count = 0;
        uint256 totalPositions = _nextId - 1;
        
        // First pass: count matching positions
        for (uint256 i = 1; i <= totalPositions; i++) {
            if (_owners[i] != address(0) && _positions[i].marketId == marketId) {
                count++;
            }
        }
        
        // Second pass: collect matching positions
        positionIds = new uint256[](count);
        uint256 index = 0;
        for (uint256 i = 1; i <= totalPositions; i++) {
            if (_owners[i] != address(0) && _positions[i].marketId == marketId) {
                positionIds[index] = i;
                index++;
            }
        }
    }

    function isAuthorizedCaller(address caller) external view returns (bool) {
        return caller == coreContract;
    }

    function totalSupply() external view returns (uint256) {
        return _nextId - 1;
    }



    // ========================================
    // ERC165 SUPPORT
    // ========================================
    
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == 0x01ffc9a7 || // ERC165
               interfaceId == 0x80ac58cd;   // ERC721
    }

    // ========================================
    // INTERNAL FUNCTIONS
    // ========================================
    
    function _mint(address to, uint256 tokenId) internal {
        _owners[tokenId] = to;
        _balances[to]++;
        
        _ownedTokens[to].push(tokenId);
    }

    function _burn(uint256 tokenId) internal {
        address owner = _owners[tokenId];
        
        delete _tokenApprovals[tokenId];
        _balances[owner]--;
        delete _owners[tokenId];
        
        _removeTokenFromOwner(owner, tokenId);
    }

    function _transfer(address from, address to, uint256 tokenId) internal {
        if (_owners[tokenId] != from) revert UnauthorizedCaller(msg.sender);
        if (to == address(0)) revert ZeroAddress();
        
        delete _tokenApprovals[tokenId];
        _balances[from]--;
        _balances[to]++;
        _owners[tokenId] = to;
        
        _removeTokenFromOwner(from, tokenId);
        _ownedTokens[to].push(tokenId);
    }

    function _isApprovedOrOwner(address spender, uint256 tokenId) internal view returns (bool) {
        address owner = _owners[tokenId];
        if (owner == address(0)) return false;
        return (spender == owner || _tokenApprovals[tokenId] == spender || _operatorApprovals[owner][spender]);
    }

    function _removeTokenFromOwner(address owner, uint256 tokenId) internal {
        uint256[] storage tokens = _ownedTokens[owner];
        for (uint256 i = 0; i < tokens.length; i++) {
            if (tokens[i] == tokenId) {
                tokens[i] = tokens[tokens.length - 1];
                tokens.pop();
                break;
            }
        }
    }

    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
} 