// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "../interfaces/ICLMSRPosition.sol";
import {CLMSRErrors as CE} from "../errors/CLMSRErrors.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/// @title CLMSRPosition
/// @notice ERC721 implementation for CLMSR position management
/// @dev Gas-optimized position tokens with core authorization
contract CLMSRPosition is 
    Initializable,
    ICLMSRPosition, 
    ERC721Upgradeable,
    OwnableUpgradeable,
    UUPSUpgradeable
{
    using Strings for uint256;

    // ========================================
    // STORAGE LAYOUT (Gas Optimized)
    // ========================================
    
    /// @notice Core contract address for authorization
    address public core;
    
    /// @notice Next position ID to mint (starts at 1)
    uint256 private _nextId;
    
    /// @notice DEPRECATED: Total supply tracking (no longer maintained)
    uint256 private _totalSupply;
    
    /// @notice Position data mapping
    mapping(uint256 => ICLMSRPosition.Position) private _positions;
    
    /// @notice DEPRECATED: Owner tokens slot (no longer maintained)
    mapping(address => uint256) private _ownedTokensSlot;
    
    /// @dev Gap for future storage variables
    // MARKET-LOCAL TOKEN INDEXING
    mapping(uint256 => uint256[]) private _marketTokenList;
    mapping(uint256 => uint256) private _positionMarket; // DEPRECATED: no longer maintained
    mapping(uint256 => uint256) private _positionMarketIndex;
    uint256[47] private __gap;

    // ========================================
    // MODIFIERS
    // ========================================
    
    /// @notice Restricts access to core contract only
    modifier onlyCore() {
        require(msg.sender == core, CE.UnauthorizedCaller(msg.sender));
        _;
    }

    // ========================================
    // INITIALIZER
    // ========================================
    
    /// @notice Initialize the upgradeable position contract
    /// @param _core Core contract address
    function initialize(address _core) external initializer {
        // Allow CE.ZeroAddress temporarily for deployment, will be updated later
        
        __ERC721_init("CLMSR Position", "CLMSR-POS");
        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
        
        core = _core;
        _nextId = 1;
    }
    
    
    /// @notice Update core contract address (only owner)
    /// @param _newCore New core contract address
    function updateCore(address _newCore) external onlyOwner {
        require(_newCore != address(0), CE.ZeroAddress());
        core = _newCore;
    }

    // ========================================
    // ERC721 OVERRIDES
    // ========================================
    
    /// @notice Override tokenURI to provide dynamic metadata
    /// @param tokenId Position token ID
    /// @return URI string with base64-encoded JSON metadata
    function tokenURI(uint256 tokenId) public view override(ERC721Upgradeable) returns (string memory) {
        require(_exists(tokenId), CE.PositionNotFound(tokenId));
        
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
        require(to != address(0), CE.ZeroAddress());
        require(quantity != 0, CE.InvalidQuantity(quantity));
        
        positionId = _nextId++;
        
        // Store position data with gas-optimized packing
        _positions[positionId] = ICLMSRPosition.Position({
            marketId: marketId,
            lowerTick: lowerTick,
            upperTick: upperTick,
            quantity: quantity,
            createdAt: uint64(block.timestamp)
        });
        
        // Mint NFT
        _safeMint(to, positionId);
        
        // Market-local indexing
        _marketTokenList[marketId].push(positionId);
        _positionMarketIndex[positionId] = _marketTokenList[marketId].length; // 1-based index
        
        emit PositionMinted(positionId, to, marketId, lowerTick, upperTick, quantity);
    }

    /// @inheritdoc ICLMSRPosition
    function updateQuantity(uint256 positionId, uint128 newQuantity) external onlyCore {
        require(_exists(positionId), CE.PositionNotFound(positionId));
        require(newQuantity != 0, CE.InvalidQuantity(newQuantity));
        
        uint128 oldQuantity = _positions[positionId].quantity;
        _positions[positionId].quantity = newQuantity;
        
        emit PositionUpdated(positionId, oldQuantity, newQuantity);
    }

    /// @inheritdoc ICLMSRPosition
    function burn(uint256 positionId) external onlyCore {
        require(_exists(positionId), CE.PositionNotFound(positionId));
        
        address owner = ownerOf(positionId);
        uint256 marketId = _positions[positionId].marketId;
        uint256 idx1 = _positionMarketIndex[positionId];
        
        // Burn NFT 
        _burn(positionId);
        
        // Mark hole in market-local list and clear indexes
        if (idx1 != 0) {
            uint256 arrIndex = idx1 - 1; // convert to 0-based
            if (arrIndex < _marketTokenList[marketId].length) {
                _marketTokenList[marketId][arrIndex] = 0; // hole mark
            }
            delete _positionMarketIndex[positionId];
        }
        // No longer maintaining _positionMarket mapping

        // Clean up position data
        delete _positions[positionId];
        
        emit PositionBurned(positionId, owner);
    }



    // ========================================
    // POSITION QUERIES
    // ========================================
    
    /// @inheritdoc ICLMSRPosition
    function getPosition(uint256 positionId) external view returns (ICLMSRPosition.Position memory data) {
        require(_exists(positionId), CE.PositionNotFound(positionId));
        return _positions[positionId];
    }



    /// @inheritdoc ICLMSRPosition
    function exists(uint256 positionId) external view returns (bool) {
        return _exists(positionId);
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
        return super.supportsInterface(interfaceId);
    }





    // ========================================
    // INTERNAL HELPERS
    // ========================================
    


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




    // ========================================
    // INTERNAL FUNCTIONS
    // ========================================

    /// @notice Authorize upgrade (only owner)
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}


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
}
