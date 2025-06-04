// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ICLMSRMarketManager
/// @notice Manager interface for CLMSR Daily-Market System
/// @dev UUPS upgradeable contract for changeable governance/keeper logic
interface ICLMSRMarketManager {
    // ========================================
    // EVENTS
    // ========================================
    
    event MarketManagerOpened(uint256 indexed marketId, address keeper);
    event MarketManagerClosed(uint256 indexed marketId, address keeper);
    event KeeperChanged(address indexed oldKeeper, address indexed newKeeper);
    event Paused(address account);
    event Unpaused(address account);
    event ActiveMarketLimitReached(uint256 oldestMarketId, uint256 newMarketId);

    // ========================================
    // ERRORS
    // ========================================
    
    error OnlyKeeper(address caller, address keeper);
    error ContractPaused();
    error ContractNotPaused();
    error ZeroAddress();
    error ActiveMarketsFull();
    error MarketNotActive(uint256 marketId);
    error InvalidDayOrder(uint256 marketId);

    // ========================================
    // KEEPER FUNCTIONS
    // ========================================
    
    /// @notice Opens a new market (keeper only, not paused)
    /// @param marketId Market identifier
    /// @param nLeaves Number of price ticks
    /// @param startTs Market start timestamp
    /// @param endTs Market end timestamp
    /// @param alpha Liquidity parameter
    /// @param initExp Initial exponential value
    function openMarket(
        uint256 marketId,
        uint32 nLeaves,
        uint64 startTs,
        uint64 endTs,
        uint256 alpha,
        uint256 initExp
    ) external;

    /// @notice Closes a market (keeper only)
    /// @param marketId Market identifier
    /// @param settleTick Winning tick from oracle
    function closeMarket(uint256 marketId, uint32 settleTick) external;

    // ========================================
    // ADMIN FUNCTIONS
    // ========================================
    
    /// @notice Pause the contract (keeper only)
    function pause() external;

    /// @notice Unpause the contract (keeper only)
    function unpause() external;

    /// @notice Set new keeper address (keeper only)
    /// @param newKeeper Address of new keeper
    function setKeeper(address newKeeper) external;

    // ========================================
    // VIEW FUNCTIONS
    // ========================================
    
    /// @notice Get array of active market identifiers
    /// @return Array of active market identifiers (max 14)
    function activeEpochs() external view returns (uint256[] memory);

    /// @notice Get current keeper address
    /// @return Address of current keeper
    function keeper() external view returns (address);

    /// @notice Check if contract is paused
    /// @return True if paused
    function paused() external view returns (bool);

    /// @notice Get maximum number of active markets
    /// @return Maximum active markets (14)
    function maxActiveMarkets() external pure returns (uint256);

    /// @notice Check if a marketId is in active markets
    /// @param marketId Market identifier
    /// @return True if market is active
    function isActiveMarket(uint256 marketId) external view returns (bool);

    /// @notice Get core contract address
    /// @return Address of CLMSRMarketCore
    function core() external view returns (address);
} 