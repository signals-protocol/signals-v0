// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {CLMSRErrors as CE} from "../errors/CLMSRErrors.sol";

/// @title ICLMSRPosition
/// @notice Upgradeable interface for CLMSR position NFT management
/// @dev ERC721 NFT contract for position tokens
interface ICLMSRPosition is IERC721 {
    
    // ========================================
    // STRUCTS
    // ========================================
    
    /// @notice Position data structure (same as legacy for compatibility)
    struct Position {
        uint256 marketId;               // Market identifier
        int256 lowerTick;               // Lower tick bound (inclusive)
        int256 upperTick;               // Upper tick bound (exclusive)
        uint128 quantity;               // Position quantity (always positive, Long-Only)
        uint64 createdAt;               // Creation timestamp
    }

    // ========================================
    // EVENTS
    // ========================================
    
    event PositionMinted(
        uint256 indexed positionId,
        address indexed trader,
        uint256 indexed marketId,
        int256 lowerTick,
        int256 upperTick,
        uint128 quantity
    );
    
    event PositionBurned(
        uint256 indexed positionId,
        address indexed trader
    );
    
    event PositionUpdated(
        uint256 indexed positionId,
        uint128 oldQuantity,
        uint128 newQuantity
    );
    
    event PositionClaimed(
        uint256 indexed positionId,
        address indexed trader
    );
    
    // ========================================
    // CORE FUNCTIONS
    // ========================================
    
    /// @notice Mint a new position NFT (only callable by Core contract)
    /// @param trader Position owner
    /// @param marketId Market identifier
    /// @param lowerTick Lower tick bound
    /// @param upperTick Upper tick bound
    /// @param quantity Position quantity
    /// @return positionId Newly minted position ID
    function mintPosition(
        address trader,
        uint256 marketId,
        int256 lowerTick,
        int256 upperTick,
        uint128 quantity
    ) external returns (uint256 positionId);
    
    /// @notice Burn a position NFT (only callable by Core contract)
    /// @param positionId Position to burn
    function burn(uint256 positionId) external;
    
    /// @notice Set position quantity (only callable by Core contract)
    /// @param positionId Position to update
    /// @param newQuantity New quantity value
    function updateQuantity(uint256 positionId, uint128 newQuantity) external;
    
    
    // ========================================
    // VIEW FUNCTIONS
    // ========================================
    
    /// @notice Get position data
    /// @param positionId Position identifier
    /// @return position Position data
    function getPosition(uint256 positionId) external view returns (Position memory position);
    
    
    /// @notice Check if a position exists
    /// @param positionId Position identifier
    /// @return exists True if position exists
    function exists(uint256 positionId) external view returns (bool exists);
    

    // ========================================
    // MARKET-LOCAL TOKEN INDEXING (NEW)
    // ========================================

    /// @notice Get number of tokens indexed for a market (includes burned holes)
    /// @param marketId Market identifier
    /// @return length Length of market-local token list
    function getMarketTokenLength(uint256 marketId) external view returns (uint256 length);

    /// @notice Get tokenId at market-local index (O(1))
    /// @dev Returns 0 for burned positions (hole markers)
    /// @param marketId Market identifier
    /// @param index 0-based index
    /// @return tokenId Position token id or 0 if burned
    function getMarketTokenAt(uint256 marketId, uint256 index) external view returns (uint256 tokenId);
}