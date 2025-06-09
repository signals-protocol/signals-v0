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
    
    uint256[] private _allTokens;
    mapping(uint256 => uint256) private _allTokensIndex;
    mapping(address => mapping(uint256 => uint256)) private _ownedTokens;
    mapping(uint256 => uint256) private _ownedTokensIndex;

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
    // ERC721 ENUMERABLE FUNCTIONS
    // ========================================
    
    function totalSupply() external view returns (uint256) {
        return _allTokens.length;
    }

    function tokenByIndex(uint256 index) external view returns (uint256) {
        require(index < _allTokens.length, "Index out of bounds");
        return _allTokens[index];
    }

    function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256) {
        require(index < _balances[owner], "Index out of bounds");
        return _ownedTokens[owner][index];
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
        uint256 balance = _balances[owner];
        positionIds = new uint256[](balance);
        for (uint256 i = 0; i < balance; i++) {
            positionIds[i] = _ownedTokens[owner][i];
        }
    }

    function getPositionsByMarket(address owner, uint256 marketId) external view returns (uint256[] memory positionIds) {
        uint256 balance = _balances[owner];
        uint256[] memory temp = new uint256[](balance);
        uint256 count = 0;
        
        for (uint256 i = 0; i < balance; i++) {
            uint256 tokenId = _ownedTokens[owner][i];
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

    function isAuthorizedCaller(address caller) external view returns (bool) {
        return caller == coreContract;
    }

    // ========================================
    // ERC165 SUPPORT
    // ========================================
    
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == 0x01ffc9a7 || // ERC165
               interfaceId == 0x80ac58cd || // ERC721
               interfaceId == 0x780e9d63;   // ERC721Enumerable
    }

    // ========================================
    // INTERNAL FUNCTIONS
    // ========================================
    
    function _mint(address to, uint256 tokenId) internal {
        _owners[tokenId] = to;
        _balances[to]++;
        
        _addTokenToAllTokensEnumeration(tokenId);
        _addTokenToOwnerEnumeration(to, tokenId);
    }

    function _burn(uint256 tokenId) internal {
        address owner = _owners[tokenId];
        
        delete _tokenApprovals[tokenId];
        _balances[owner]--;
        delete _owners[tokenId];
        
        _removeTokenFromAllTokensEnumeration(tokenId);
        _removeTokenFromOwnerEnumeration(owner, tokenId);
    }

    function _transfer(address from, address to, uint256 tokenId) internal {
        if (_owners[tokenId] != from) revert UnauthorizedCaller(msg.sender);
        if (to == address(0)) revert ZeroAddress();
        
        delete _tokenApprovals[tokenId];
        _balances[from]--;
        _balances[to]++;
        _owners[tokenId] = to;
        
        _removeTokenFromOwnerEnumeration(from, tokenId);
        _addTokenToOwnerEnumeration(to, tokenId);
    }

    function _isApprovedOrOwner(address spender, uint256 tokenId) internal view returns (bool) {
        address owner = _owners[tokenId];
        if (owner == address(0)) return false;
        return (spender == owner || _tokenApprovals[tokenId] == spender || _operatorApprovals[owner][spender]);
    }

    function _addTokenToAllTokensEnumeration(uint256 tokenId) internal {
        _allTokensIndex[tokenId] = _allTokens.length;
        _allTokens.push(tokenId);
    }

    function _removeTokenFromAllTokensEnumeration(uint256 tokenId) internal {
        uint256 lastTokenIndex = _allTokens.length - 1;
        uint256 tokenIndex = _allTokensIndex[tokenId];
        uint256 lastTokenId = _allTokens[lastTokenIndex];
        
        _allTokens[tokenIndex] = lastTokenId;
        _allTokensIndex[lastTokenId] = tokenIndex;
        
        delete _allTokensIndex[tokenId];
        _allTokens.pop();
    }

    function _addTokenToOwnerEnumeration(address to, uint256 tokenId) internal {
        uint256 length = _balances[to] - 1;
        _ownedTokens[to][length] = tokenId;
        _ownedTokensIndex[tokenId] = length;
    }

    function _removeTokenFromOwnerEnumeration(address from, uint256 tokenId) internal {
        uint256 lastTokenIndex = _balances[from];
        uint256 tokenIndex = _ownedTokensIndex[tokenId];
        
        if (tokenIndex != lastTokenIndex) {
            uint256 lastTokenId = _ownedTokens[from][lastTokenIndex];
            _ownedTokens[from][tokenIndex] = lastTokenId;
            _ownedTokensIndex[lastTokenId] = tokenIndex;
        }
        
        delete _ownedTokensIndex[tokenId];
        delete _ownedTokens[from][lastTokenIndex];
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