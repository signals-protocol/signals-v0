// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "../interfaces/ICLMSRPosition.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/// @title CLMSRPosition
/// @notice ERC721 implementation for CLMSR position management
/// @dev 가스 최적화된 포지션 토큰과 코어 인증
contract CLMSRPosition is 
    Initializable,
    ICLMSRPosition, 
    ERC721Upgradeable,
    OwnableUpgradeable,
    UUPSUpgradeable
{
    using EnumerableSet for EnumerableSet.UintSet;
    using Strings for uint256;

    // ========================================
    // STORAGE LAYOUT (Gas Optimized)
    // ========================================
    
    /// @notice Core contract address for authorization
    address public core;
    
    /// @notice Next position ID to mint (starts at 1)
    uint256 private _nextId;
    
    /// @notice Current total supply (excluding burned tokens)
    uint256 private _totalSupply;
    
    /// @notice Position data mapping
    mapping(uint256 => ICLMSRPosition.Position) private _positions;
    
    /// @notice Owner to position IDs mapping (gas-optimized with EnumerableSet)
    mapping(address => EnumerableSet.UintSet) private _ownedTokens;
    
    /// @dev Gap for future storage variables
    // MARKET-LOCAL TOKEN INDEXING (NEW)
    // - _marketTokenList: per-market ordered list of positionIds; 0 marks burned holes
    // - _positionMarket: reverse lookup for positionId -> marketId
    // - _positionMarketIndex: 1-based index into _marketTokenList[marketId]
    mapping(uint256 => uint256[]) private _marketTokenList;
    mapping(uint256 => uint256) private _positionMarket;
    mapping(uint256 => uint256) private _positionMarketIndex;
    uint256[47] private __gap;

    // ========================================
    // MODIFIERS
    // ========================================
    
    /// @notice Restricts access to core contract only
    modifier onlyCore() {
        require(msg.sender == core, UnauthorizedCaller(msg.sender));
        _;
    }

    // ========================================
    // INITIALIZER
    // ========================================
    
    /// @notice Initialize the upgradeable position contract
    /// @param _core Core contract address
    function initialize(address _core) external initializer {
        // Allow ZeroAddress temporarily for deployment, will be updated later
        
        __ERC721_init("CLMSR Position", "CLMSR-POS");
        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
        
        core = _core;
        _nextId = 1;
    }
    
    /// @notice Authorize upgrade (only owner)
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
    
    /// @notice Update core contract address (only owner)
    /// @param _newCore New core contract address
    function updateCore(address _newCore) external onlyOwner {
        require(_newCore != address(0), ZeroAddress());
        core = _newCore;
    }

    // ========================================
    // ERC721 OVERRIDES
    // ========================================
    
    /// @notice Override tokenURI to provide dynamic metadata
    /// @param tokenId Position token ID
    /// @return URI string with base64-encoded JSON metadata
    function tokenURI(uint256 tokenId) public view override(ERC721Upgradeable) returns (string memory) {
        require(_exists(tokenId), PositionNotFound(tokenId));
        
        ICLMSRPosition.Position memory position = _positions[tokenId];
        
        // Generate dynamic JSON metadata
        string memory json = string(abi.encodePacked(
            '{"name":"CLMSR Position #', tokenId.toString(), '",',
            '"description":"CLMSR Range Position",',
            '"attributes":[',
                '{"trait_type":"Market ID","value":', position.marketId.toString(), '},',
                '{"trait_type":"Lower Tick","value":', _int256ToString(position.lowerTick), '},',
                '{"trait_type":"Upper Tick","value":', _int256ToString(position.upperTick), '},',
                '{"trait_type":"Quantity","value":', uint256(position.quantity).toString(), '},',
                '{"trait_type":"Created At","value":', uint256(position.createdAt).toString(), '}',
            ']}'
        ));
        
        return string(abi.encodePacked(
            "data:application/json;base64,",
            Base64.encode(bytes(json))
        ));
    }

    /// @notice Override _update to maintain owner token tracking
    /// @param to Recipient address
    /// @param tokenId Token ID being transferred
    /// @param auth Authorized address
    /// @return Previous owner
        function _update(address to, uint256 tokenId, address auth) 
        internal 
        override(ERC721Upgradeable) 
        returns (address) 
    {
        address from = _ownerOf(tokenId);
        
        // Call parent implementation
        address previousOwner = super._update(to, tokenId, auth);
        
        // Update owner token tracking
        if (from != address(0)) {
            _ownedTokens[from].remove(tokenId);
        }
        if (to != address(0)) {
            _ownedTokens[to].add(tokenId);
        }
        
        return previousOwner;
    }

    // ========================================
    // POSITION MANAGEMENT (Core Only)
    // ========================================
    
    /// @inheritdoc ICLMSRPosition
    function mintPosition(
        address to,
        uint256 marketId,
        int256 lowerTick,
        int256 upperTick,
        uint128 quantity
    ) external onlyCore returns (uint256 positionId) {
        require(to != address(0), ZeroAddress());
        require(quantity != 0, InvalidQuantity(quantity));
        
        positionId = _nextId++;
        
        // Store position data with gas-optimized packing
        _positions[positionId] = ICLMSRPosition.Position({
            marketId: marketId,
            lowerTick: lowerTick,
            upperTick: upperTick,
            quantity: quantity,
            createdAt: uint64(block.timestamp)
        });
        
        // Mint NFT (this will trigger _update and add to _ownedTokens)
        _safeMint(to, positionId);
        
        // Increment total supply (only if not already handled by ERC721)
        _totalSupply++;
        
        // Market-local indexing
        _positionMarket[positionId] = marketId;
        _marketTokenList[marketId].push(positionId);
        _positionMarketIndex[positionId] = _marketTokenList[marketId].length; // 1-based index
        
        emit PositionMinted(positionId, to, marketId, lowerTick, upperTick, quantity);
    }

    /// @inheritdoc ICLMSRPosition
    function updateQuantity(uint256 positionId, uint128 newQuantity) external onlyCore {
        require(_exists(positionId), PositionNotFound(positionId));
        require(newQuantity != 0, InvalidQuantity(newQuantity));
        
        uint128 oldQuantity = _positions[positionId].quantity;
        _positions[positionId].quantity = newQuantity;
        
        emit PositionUpdated(positionId, oldQuantity, newQuantity);
    }

    /// @inheritdoc ICLMSRPosition
    function burn(uint256 positionId) external onlyCore {
        require(_exists(positionId), PositionNotFound(positionId));
        
        address owner = ownerOf(positionId);
        uint256 marketId = _positions[positionId].marketId;
        uint256 idx1 = _positionMarketIndex[positionId];
        
        // Burn NFT (this will trigger _update and remove from _ownedTokens)
        _burn(positionId);
        
        // Decrement total supply
        _totalSupply--;
        
        // Mark hole in market-local list and clear indexes
        if (idx1 != 0) {
            uint256 arrIndex = idx1 - 1; // convert to 0-based
            if (arrIndex < _marketTokenList[marketId].length) {
                _marketTokenList[marketId][arrIndex] = 0; // hole mark
            }
            delete _positionMarketIndex[positionId];
        }
        delete _positionMarket[positionId];

        // Clean up position data
        delete _positions[positionId];
        
        emit PositionBurned(positionId, owner);
    }



    // ========================================
    // POSITION QUERIES
    // ========================================
    
    /// @inheritdoc ICLMSRPosition
    function getPosition(uint256 positionId) external view returns (ICLMSRPosition.Position memory data) {
        require(_exists(positionId), PositionNotFound(positionId));
        return _positions[positionId];
    }

    /// @inheritdoc ICLMSRPosition
    function getOwnerPositions(address owner) external view returns (uint256[] memory positionIds) {
        return _ownedTokens[owner].values();
    }

    /// @inheritdoc ICLMSRPosition
    function getUserPositionsInMarket(address owner, uint256 marketId) 
        external 
        view 
        returns (uint256[] memory positionIds) 
    {
        uint256[] memory allTokens = _ownedTokens[owner].values();
        uint256[] memory temp = new uint256[](allTokens.length);
        uint256 count = 0;
        
        unchecked {
            for (uint256 i = 0; i < allTokens.length; ++i) {
                uint256 tokenId = allTokens[i];
                if (_positions[tokenId].marketId == marketId) {
                    temp[count] = tokenId;
                    ++count;
                }
            }
        }
        
        // Create result array with exact size
        positionIds = new uint256[](count);
        unchecked {
            for (uint256 i = 0; i < count; ++i) {
                positionIds[i] = temp[i];
            }
        }
    }

    /// @inheritdoc ICLMSRPosition
    function getMarketPositions(uint256 marketId) 
        external 
        view 
        returns (uint256[] memory positionIds) 
    {
        // Count positions for this market
        uint256 count = 0;
        uint256 totalPositions = _nextId - 1;
        
        // First pass: count matching positions
        unchecked {
            for (uint256 i = 1; i <= totalPositions; ++i) {
                if (_exists(i) && _positions[i].marketId == marketId) {
                    ++count;
                }
            }
        }
        
        // Second pass: collect matching positions
        positionIds = new uint256[](count);
        uint256 index = 0;
        unchecked {
            for (uint256 i = 1; i <= totalPositions; ++i) {
                if (_exists(i) && _positions[i].marketId == marketId) {
                    positionIds[index] = i;
                    ++index;
                }
            }
        }
    }

    /// @inheritdoc ICLMSRPosition
    function exists(uint256 positionId) external view returns (bool) {
        return _exists(positionId);
    }

    /// @notice Check if caller is authorized (core contract)
    function isAuthorizedCaller(address caller) external view returns (bool) {
        return caller == core;
    }

    // ========================================
    // ERC165 SUPPORT
    // ========================================
    
    /// @notice ERC165 interface support
    function supportsInterface(bytes4 interfaceId) 
        public 
        view 
        override(ERC721Upgradeable, IERC165) 
        returns (bool) 
    {
        return interfaceId == type(ICLMSRPosition).interfaceId || 
               super.supportsInterface(interfaceId);
    }





    // ========================================
    // INTERNAL HELPERS
    // ========================================
    
    /// @notice Convert int256 to string
    function _int256ToString(int256 value) internal pure returns (string memory) {
        if (value == 0) {
            return "0";
        }
        
        bool negative = value < 0;
        uint256 temp = negative ? uint256(-value) : uint256(value);
        
        bytes memory buffer = new bytes(78); // max length for int256
        uint256 digits;
        
        while (temp != 0) {
            digits++;
            buffer[78 - digits] = bytes1(uint8(48 + temp % 10));
            temp /= 10;
        }
        
        if (negative) {
            digits++;
            buffer[78 - digits] = "-";
        }
        
        bytes memory result = new bytes(digits);
        for (uint256 i = 0; i < digits; i++) {
            result[i] = buffer[78 - digits + i];
        }
        
        return string(result);
    }

    /// @notice Check if token exists
    /// @param tokenId Token ID to check
    /// @return True if token exists
    function _exists(uint256 tokenId) internal view returns (bool) {
        return _ownerOf(tokenId) != address(0);
    }

    // ========================================
    // VIEW FUNCTIONS FOR ANALYTICS
    // ========================================
    
    /// @notice Get total supply of position tokens
    /// @return Total number of existing positions (excluding burned)
    function totalSupply() external view returns (uint256) {
        return _totalSupply;
    }
    
    /// @notice Get total number of positions owned by address
    /// @param owner Address to query
    /// @return count Number of positions owned
    function balanceOf(address owner) public view override(ERC721Upgradeable, IERC721) returns (uint256 count) {
        require(owner != address(0), ERC721InvalidOwner(address(0)));
        return _ownedTokens[owner].length();
    }

    /// @notice Find the owner of a token
    /// @param tokenId The identifier for a token
    /// @return The address of the owner of the token
    function ownerOf(uint256 tokenId) public view override(ERC721Upgradeable, IERC721) returns (address) {
        return super.ownerOf(tokenId);
    }

    /// @notice Get next position ID that will be minted
    /// @return Next position ID
    function getNextId() external view returns (uint256) {
        return _nextId;
    }

    /// @notice Get core contract address
    /// @return Core contract address
    function getCoreContract() external view returns (address) {
        return core;
    }


    // ========================================
    // MARKET-LOCAL TOKEN INDEXING VIEWS
    // ========================================

    /// @inheritdoc ICLMSRPosition
    function getMarketTokenLength(uint256 marketId) external view override returns (uint256 length) {
        return _marketTokenList[marketId].length;
    }

    /// @inheritdoc ICLMSRPosition
    function getMarketTokenAt(uint256 marketId, uint256 index) external view override returns (uint256 tokenId) {
        return _marketTokenList[marketId][index];
    }



} 