// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ICLMSRPosition
/// @notice Interface for CLMSR position management
/// @dev ERC721-based position tokens representing range positions (immutable contract)
interface ICLMSRPosition {
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
    // ERC721 STANDARD FUNCTIONS
    // ========================================
    
    /// @notice A descriptive name for a collection of NFTs
    /// @return The name of the token collection
    function name() external view returns (string memory);

    /// @notice An abbreviated name for NFTs in this contract
    /// @return The symbol of the token collection
    function symbol() external view returns (string memory);

    /// @notice A distinct Uniform Resource Identifier (URI) for a given asset
    /// @param tokenId The identifier for an NFT
    /// @return The URI for the token
    function tokenURI(uint256 tokenId) external view returns (string memory);
    
    /// @notice Count all tokens assigned to an owner
    /// @param owner An address for whom to query the balance
    /// @return The number of tokens owned by owner
    function balanceOf(address owner) external view returns (uint256);

    /// @notice Find the owner of a token
    /// @param tokenId The identifier for a token
    /// @return The address of the owner of the token
    function ownerOf(uint256 tokenId) external view returns (address);

    /// @notice Transfer ownership of a token
    /// @param from The current owner of the token
    /// @param to The new owner
    /// @param tokenId The token to transfer
    function transferFrom(address from, address to, uint256 tokenId) external;

    /// @notice Safely transfer ownership of a token
    /// @param from The current owner of the token
    /// @param to The new owner
    /// @param tokenId The token to transfer
    function safeTransferFrom(address from, address to, uint256 tokenId) external;

    /// @notice Safely transfer ownership of a token with data
    /// @param from The current owner of the token
    /// @param to The new owner
    /// @param tokenId The token to transfer
    /// @param data Additional data with no specified format
    function safeTransferFrom(address from, address to, uint256 tokenId, bytes calldata data) external;

    /// @notice Change or reaffirm the approved address for a token
    /// @param to The new approved token controller
    /// @param tokenId The token to approve
    function approve(address to, uint256 tokenId) external;

    /// @notice Enable or disable approval for a third party to manage all tokens
    /// @param operator Address to add to the set of authorized operators
    /// @param approved True if the operator is approved, false to revoke approval
    function setApprovalForAll(address operator, bool approved) external;

    /// @notice Get the approved address for a token ID, or zero if no address set
    /// @param tokenId The token identifier
    /// @return The approved address for this token, or zero if there is none
    function getApproved(uint256 tokenId) external view returns (address);

    /// @notice Query if an address is an authorized operator for another address
    /// @param owner The address that owns the tokens
    /// @param operator The address that acts on behalf of the owner
    /// @return True if operator is an approved operator for owner, false otherwise
    function isApprovedForAll(address owner, address operator) external view returns (bool);

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
    function getPositionsByMarket(address owner, uint256 marketId) 
        external view returns (uint256[] memory positionIds);

    /// @notice Check if caller is authorized to manage positions
    /// @param caller Address to check
    /// @return True if caller is authorized
    function isAuthorizedCaller(address caller) external view returns (bool);

    // ========================================
    // ERC165 SUPPORT
    // ========================================
    
    /// @notice Query if a contract implements an interface
    /// @param interfaceId The interface identifier, as specified in ERC-165
    /// @return True if the contract implements interfaceId
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
} 