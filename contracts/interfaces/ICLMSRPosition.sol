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
        uint32 lowerTick;               // Lower tick bound (inclusive)
        uint32 upperTick;               // Upper tick bound (inclusive)
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
        uint32 lowerTick,
        uint32 upperTick,
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
        uint32 lowerTick,
        uint32 upperTick,
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
    function getAllPositionsInMarket(uint256 marketId) 
        external view returns (uint256[] memory positionIds);

    /// @notice Check if caller is authorized to manage positions
    /// @param caller Address to check
    /// @return True if caller is authorized
    function isAuthorizedCaller(address caller) external view returns (bool);

    /// @notice Get total supply of position tokens
    /// @return Total number of minted positions
    function totalSupply() external view returns (uint256);



} 