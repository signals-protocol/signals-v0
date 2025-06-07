// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ICLMSRMarketCore
/// @notice Core interface for CLMSR Daily-Market System
/// @dev Immutable contract handling core trading logic and market state
interface ICLMSRMarketCore {
    // ========================================
    // STRUCTS
    // ========================================
    
    /// @notice Market information
    struct Market {
        bool isActive;                  // Market is active
        bool settled;                   // Market is settled
        uint64 startTimestamp;          // Market start time
        uint64 endTimestamp;            // Market end time
        uint32 settlementTick;          // Winning tick (only if settled)
        uint32 tickCount;               // Number of ticks in market
        uint256 liquidityParameter;    // Alpha parameter (1e18 scale)
    }
    
    /// @notice Trade parameters structure
    struct TradeParams {
        uint256 marketId;               // Market identifier
        uint32 lowerTick;               // Lower tick bound (inclusive)
        uint32 upperTick;               // Upper tick bound (inclusive)
        uint128 quantity;               // Position quantity (always positive, Long-Only)
        uint256 maxCost;                // Maximum cost willing to pay
    }

    // ========================================
    // EVENTS
    // ========================================
    
    event MarketCreated(
        uint256 indexed marketId,
        uint64 startTimestamp,
        uint64 endTimestamp,
        uint32 tickCount,
        uint256 liquidityParameter
    );

    event MarketSettled(
        uint256 indexed marketId,
        uint32 settlementTick
    );

    event TradeExecuted(
        uint256 indexed marketId,
        address indexed trader,
        uint256 indexed positionId,
        uint32 lowerTick,
        uint32 upperTick,
        uint128 quantity,
        uint256 cost
    );

    event PositionAdjusted(
        uint256 indexed positionId,
        address indexed trader,
        int128 quantityDelta,
        uint128 newQuantity,
        uint256 cost
    );

    event PositionClosed(
        uint256 indexed positionId,
        address indexed trader,
        uint256 proceeds
    );

    event PositionClaimed(
        uint256 indexed positionId,
        address indexed trader,
        uint256 payout
    );



    event EmergencyPaused(
        address indexed by,
        string reason
    );

    event EmergencyUnpaused(
        address indexed by
    );

    event RouterSet(
        address indexed routerContract
    );

    // ========================================
    // ERRORS
    // ========================================
    
    error MarketNotFound(uint256 marketId);
    error MarketAlreadyExists(uint256 marketId);
    error MarketNotSettled(uint256 marketId);
    error MarketAlreadySettled(uint256 marketId);
    error InvalidTickRange(uint32 lowerTick, uint32 upperTick);
    error InvalidTick(uint32 tick, uint32 maxTick);
    error InvalidQuantity(uint128 quantity);
    error PositionNotFound(uint256 positionId);
    error UnauthorizedCaller(address caller);
    error CostExceedsMaximum(uint256 actualCost, uint256 maxCost);
    error InsufficientBalance(address account, uint256 required, uint256 available);
    error TransferFailed(address token, address from, address to, uint256 amount);
    error InvalidMarketParameters(string reason);

    error ContractPaused();
    error TickCountExceedsLimit(uint32 tickCount, uint32 maxAllowed); // Max ~1M for segment-tree safety

    // ========================================
    // MARKET MANAGEMENT FUNCTIONS
    // ========================================
    
    /// @notice Create a new market (only callable by Manager)
    /// @dev Stores market data and initializes all tick values to WAD (1e18)
    /// @param marketId Market identifier
    /// @param tickCount Number of ticks in market
    /// @param startTimestamp Market start time
    /// @param endTimestamp Market end time
    /// @param liquidityParameter Alpha parameter (1e18 scale)
    function createMarket(
        uint256 marketId,
        uint32 tickCount,
        uint64 startTimestamp,
        uint64 endTimestamp,
        uint256 liquidityParameter
    ) external;
    
    /// @notice Settle a market (only callable by Manager)
    /// @dev Sets winning tick and enables position claiming
    /// @param marketId Market identifier
    /// @param winningTick Winning tick determined by oracle
    function settleMarket(uint256 marketId, uint32 winningTick) external;

    // ========================================
    // EXECUTION FUNCTIONS
    // ========================================
    
    /// @notice Execute a trade to create a new position
    /// @param trader Address of the trader
    /// @param params Trade parameters
    /// @return positionId Newly created position ID
    function executeTradeRange(
        address trader,
        TradeParams calldata params
    ) external returns (uint256 positionId);
    
    /// @notice Adjust existing position quantity
    /// @param positionId Position to adjust
    /// @param quantityDelta Change in quantity (positive = buy more, negative = sell some)
    /// @param maxCost Maximum additional cost for positive delta
    /// @return success True if adjustment was successful
    function executePositionAdjust(
        uint256 positionId,
        int128 quantityDelta,
        uint256 maxCost
    ) external returns (bool success);
    
    /// @notice Close entire position and receive proceeds
    /// @param positionId Position to close
    /// @return proceeds Amount received from closing position
    function executePositionClose(
        uint256 positionId
    ) external returns (uint256 proceeds);
    
    /// @notice Claim payout from settled market position
    /// @param positionId Position to claim
    /// @return payout Amount claimed
    function executePositionClaim(
        uint256 positionId
    ) external returns (uint256 payout);

    // ========================================
    // CALCULATION FUNCTIONS
    // ========================================
    
    /// @notice Calculate cost of a new trade
    /// @param marketId Market identifier
    /// @param lowerTick Lower tick bound
    /// @param upperTick Upper tick bound
    /// @param quantity Position quantity
    /// @return cost Estimated cost
    function calculateTradeCost(
        uint256 marketId,
        uint32 lowerTick,
        uint32 upperTick,
        uint128 quantity
    ) external view returns (uint256 cost);
    
    /// @notice Calculate cost of adjusting position
    /// @param positionId Position to adjust
    /// @param quantityDelta Change in quantity
    /// @return cost Estimated cost (0 if selling)
    function calculateAdjustCost(
        uint256 positionId,
        int128 quantityDelta
    ) external view returns (uint256 cost);
    
    /// @notice Calculate proceeds from closing position
    /// @param positionId Position to close
    /// @return proceeds Estimated proceeds
    function calculateCloseProceeds(
        uint256 positionId
    ) external view returns (uint256 proceeds);
    
    /// @notice Calculate claimable amount from settled position
    /// @param positionId Position to claim
    /// @return amount Claimable amount (0 if market not settled)
    function calculateClaimAmount(
        uint256 positionId
    ) external view returns (uint256 amount);

    // ========================================
    // STATE QUERY FUNCTIONS
    // ========================================
    
    /// @notice Get market information
    /// @param marketId Market identifier
    /// @return market Market data
    function getMarket(uint256 marketId) 
        external view returns (Market memory market);
    
    /// @notice Get exponential value for a specific tick
    /// @param marketId Market identifier
    /// @param tick Tick index
    /// @return value Exponential value at tick
    function getTickValue(uint256 marketId, uint32 tick) 
        external view returns (uint256 value);
    
    /// @notice Get position contract address
    /// @return Address of the position NFT contract
    function getPositionContract() 
        external view returns (address);
    
    /// @notice Get payment token address
    /// @return Address of the ERC20 payment token
    function getPaymentToken() 
        external view returns (address);
    
    /// @notice Check if address is authorized to call core functions
    /// @dev Manager can call market management, Router/Position can call execution
    /// @param caller Address to check
    /// @return True if authorized
    function isAuthorizedCaller(address caller) 
        external view returns (bool);
    
    /// @notice Get manager contract address
    /// @return Address of the manager contract
    function getManagerContract() 
        external view returns (address);
    
    /// @notice Get router contract address
    /// @return Address of the router contract
    function getRouterContract() 
        external view returns (address);

    // ========================================
    // EMERGENCY FUNCTIONS
    // ========================================
    
    /// @notice Pause all trading operations (only callable by Manager)
    /// @dev For oracle/settlement error response
    /// @param reason Reason for pausing
    function pause(string calldata reason) external;
    
    /// @notice Unpause all trading operations (only callable by Manager)
    function unpause() external;
    
    /// @notice Check if contract is paused
    /// @return True if paused
    function isPaused() external view returns (bool);
} 