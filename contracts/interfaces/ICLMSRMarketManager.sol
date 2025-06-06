// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ICLMSRMarketManager
/// @notice Manager interface for CLMSR Daily-Market System
/// @dev Lightweight governance contract for market lifecycle management (upgradeable)
interface ICLMSRMarketManager {
    // ========================================
    // STRUCTS
    // ========================================
    
    /// @notice Market creation parameters
    struct CreateMarketParams {
        uint256 marketId;               // Market identifier
        uint32 tickCount;               // Number of ticks in market
        uint64 startTimestamp;          // Market start time
        uint64 endTimestamp;            // Market end time
        uint256 liquidityParameter;    // Alpha parameter (1e18 scale)
        uint256 initialTickValue;      // Initial value for all ticks
    }

    // ========================================
    // EVENTS
    // ========================================
    
    event MarketCreated(
        uint256 indexed marketId,
        address indexed keeper,
        uint64 startTimestamp,
        uint64 endTimestamp
    );

    event MarketSettled(
        uint256 indexed marketId,
        address indexed keeper,
        uint32 winningTick
    );

    event KeeperChanged(
        address indexed oldKeeper,
        address indexed newKeeper
    );

    event ParameterUpdated(
        bytes32 indexed key,
        uint256 oldValue,
        uint256 newValue
    );

    // ========================================
    // ERRORS (Manager-specific only)
    // ========================================
    
    error ManagerOnlyKeeper(address caller, address keeper);
    error ManagerZeroAddress();
    error InvalidTimestamps(uint64 start, uint64 end);
    error CoreContractNotSet();
    error MaxActiveMarketsExceeded(uint256 current, uint256 max);
    error TickCountExceedsLimit(uint32 tickCount, uint32 maxAllowed); // Max ~1M for segment-tree safety

    // ========================================
    // MARKET LIFECYCLE FUNCTIONS
    // ========================================
    
    /// @notice Create a new market (immediate execution)
    /// @dev Only callable by keeper, delegates to Core for immediate creation
    /// @param params Market creation parameters
    function createMarket(CreateMarketParams calldata params) external;
    
    /// @notice Settle a market (immediate execution)
    /// @dev Only callable by keeper, delegates to Core for immediate settlement
    /// @param marketId Market identifier
    /// @param winningTick Winning tick determined by oracle
    function settleMarket(uint256 marketId, uint32 winningTick) external;

    // ========================================
    // GOVERNANCE FUNCTIONS
    // ========================================
    
    /// @notice Set new keeper address
    /// @dev Only callable by current keeper
    /// @param newKeeper Address of new keeper
    function setKeeper(address newKeeper) external;
    
    /// @notice Set core contract address
    /// @dev Only callable by keeper, for upgrades
    /// @param newCore Address of new core contract
    function setCoreContract(address newCore) external;

    // ========================================
    // PARAMETER MANAGEMENT
    // ========================================
    
    /// @notice Set a system parameter
    /// @dev Only callable by keeper, for future extensibility
    /// @param key Parameter key
    /// @param value Parameter value
    function setParameter(bytes32 key, uint256 value) external;
    
    /// @notice Get a system parameter
    /// @param key Parameter key
    /// @return value Parameter value
    function getParameter(bytes32 key) external view returns (uint256 value);

    // ========================================
    // QUERY FUNCTIONS
    // ========================================
    
    /// @notice Get array of active market identifiers
    /// @dev Returns markets that are created but not yet settled
    /// @return marketIds Array of active market identifiers
    function getActiveMarkets() external view returns (uint256[] memory marketIds);
    
    /// @notice Get current keeper address
    /// @return Address of current keeper
    function getKeeper() external view returns (address);
    
    /// @notice Check if address is the keeper
    /// @param account Address to check
    /// @return True if account is the keeper
    function isKeeper(address account) external view returns (bool);
    
    /// @notice Get core contract address
    /// @return Address of the core contract
    function getCoreContract() external view returns (address);
    
    /// @notice Check if a market is active (created but not settled)
    /// @param marketId Market identifier
    /// @return True if market is active
    function isActiveMarket(uint256 marketId) external view returns (bool);
    
    /// @notice Get maximum number of active markets allowed
    /// @return Maximum number of active markets
    function getMaxActiveMarkets() external view returns (uint256);

    // ========================================
    // FUTURE EXTENSION SLOTS
    // ========================================
    
    /// @notice Execute emergency action
    /// @dev For future emergency procedures
    /// @param action Encoded action data
    /// @return result Action result
    function executeEmergencyAction(bytes calldata action) 
        external returns (bytes memory result);

    // ========================================
    // EMERGENCY FUNCTIONS
    // ========================================
    
    /// @notice Pause all trading operations
    /// @dev Only callable by keeper, delegates to Core pause()
    /// @param reason Reason for pausing
    function pause(string calldata reason) external;
    
    /// @notice Unpause all trading operations
    /// @dev Only callable by keeper, delegates to Core unpause()
    function unpause() external;
} 