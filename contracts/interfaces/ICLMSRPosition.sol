// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/// @title ICLMSRPosition
/// @notice Interface for CLMSR position management
/// @dev ERC721-based position tokens representing range positions (immutable contract)
interface ICLMSRPosition is IERC721 {
    // ========================================
    // STRUCTS
    // ========================================
    
    /// @notice Position data structure
    struct Position {
        uint256 marketId;               // Market identifier
        int256 lowerTick;               // Lower tick bound (inclusive)
        int256 upperTick;               // Upper tick bound (inclusive)
        uint128 quantity;               // Position quantity (always positive, Long-Only)
        uint64 createdAt;               // Creation timestamp
    }

    // ========================================
    // EVENTS
    // ========================================
    
    event PositionMinted(
        uint256 indexed positionId,
        address indexed owner,
        uint256 indexed marketId,
        int256 lowerTick,
        int256 upperTick,
        uint128 quantity
    );

    event PositionUpdated(
        uint256 indexed positionId,
        uint128 oldQuantity,
        uint128 newQuantity
    );

    event PositionBurned(
        uint256 indexed positionId,
        address indexed owner
    );

    // ========================================
    // ERRORS
    // ========================================
    
    error PositionNotFound(uint256 positionId);
    error UnauthorizedCaller(address caller);
    error InvalidQuantity(uint128 quantity);
    error ZeroAddress();

    // ========================================
    // POSITION MANAGEMENT (Core contract only)
    // ========================================
    
    /// @notice Mint a new position token
    /// @dev Only callable by authorized core contract
    /// @param to Position owner
    /// @param marketId Market identifier
    /// @param lowerTick Lower tick bound
    /// @param upperTick Upper tick bound
    /// @param quantity Position quantity
    /// @return positionId Newly minted position ID
    function mintPosition(
        address to,
        uint256 marketId,
        int256 lowerTick,
        int256 upperTick,
        uint128 quantity
    ) external returns (uint256 positionId);

    /// @notice Update position quantity to absolute value
    /// @dev Only callable by authorized core contract
    /// @param positionId Position to update
    /// @param newQuantity New absolute quantity value
    function setPositionQuantity(
        uint256 positionId,
        uint128 newQuantity
    ) external;

    /// @notice Burn a position token
    /// @dev Only callable by authorized core contract
    /// @param positionId Position to burn
    function burnPosition(uint256 positionId) external;

    // ========================================
    // POSITION QUERIES
    // ========================================
    
    /// @notice Get position data
    /// @param positionId Position identifier
    /// @return data Position data structure
    function getPosition(uint256 positionId) 
        external view returns (Position memory data);

    /// @notice Get all positions owned by an address
    /// @param owner Address to query
    /// @return positionIds Array of position IDs owned by the address
    function getPositionsByOwner(address owner) 
        external view returns (uint256[] memory positionIds);

    /// @notice Get positions for a specific market and owner
    /// @param owner Address to query
    /// @param marketId Market identifier
    /// @return positionIds Array of position IDs for the market
    function getUserPositionsInMarket(address owner, uint256 marketId) 
        external view returns (uint256[] memory positionIds);

    /// @notice Get all positions for a specific market (all owners)
    /// @param marketId Market identifier
    /// @return positionIds Array of all position IDs for the market
    function getMarketPositions(uint256 marketId) 
        external view returns (uint256[] memory positionIds);

    /// @notice Get total number of positions
    /// @return Total supply of position tokens
    function totalSupply() external view returns (uint256);

    /// @notice Check if a position exists
    /// @param positionId Position identifier
    /// @return True if position exists
    function exists(uint256 positionId) external view returns (bool);

    // ========================================
    // METADATA & URI FUNCTIONS
    // ========================================
    
    /// @notice Get the token URI for a position
    /// @param positionId Position identifier
    /// @return URI string for the token metadata
    function tokenURI(uint256 positionId) external view returns (string memory);

    /// @notice Get the contract URI for marketplace metadata
    /// @return URI string for contract metadata
    function contractURI() external view returns (string memory);
} 