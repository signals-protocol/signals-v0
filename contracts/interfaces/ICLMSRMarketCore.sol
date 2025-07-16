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
        uint32 settlementLowerTick;     // Winning range lower bound (only if settled)
        uint32 settlementUpperTick;     // Winning range upper bound (only if settled)
        uint32 numTicks;                // Number of ticks in market
        uint256 liquidityParameter;    // Alpha parameter (1e18 scale)
    }
    


    // ========================================
    // EVENTS
    // ========================================
    
    event MarketCreated(
        uint256 indexed marketId,
        uint64 startTimestamp,
        uint64 endTimestamp,
        uint32 numTicks,
        uint256 liquidityParameter
    );

    event MarketSettled(
        uint256 indexed marketId,
        uint32 settlementLowerTick,
        uint32 settlementUpperTick
    );

    event PositionOpened(
        uint256 indexed positionId,
        address indexed trader,
        uint256 indexed marketId,
        uint32 lowerTick,
        uint32 upperTick,
        uint128 quantity,
        uint256 cost
    );

    event PositionIncreased(
        uint256 indexed positionId,
        address indexed trader,
        uint128 additionalQuantity,
        uint128 newQuantity,
        uint256 cost
    );

    event PositionDecreased(
        uint256 indexed positionId,
        address indexed trader,
        uint128 sellQuantity,
        uint128 newQuantity,
        uint256 proceeds
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


    error ContractPaused();
    error TickCountExceedsLimit(uint32 numTicks, uint32 maxAllowed); // Max ~1M for segment-tree safety

    // ========================================
    // MARKET MANAGEMENT FUNCTIONS
    // ========================================
    
    /// @notice Create a new market (only callable by Manager)
    /// @dev Stores market data and initializes all tick values to WAD (1e18)
    /// @param marketId Market identifier
    /// @param numTicks Number of ticks in market
    /// @param startTimestamp Market start time
    /// @param endTimestamp Market end time
    /// @param liquidityParameter Alpha parameter (1e18 scale)
    function createMarket(
        uint256 marketId,
        uint32 numTicks,
        uint64 startTimestamp,
        uint64 endTimestamp,
        uint256 liquidityParameter
    ) external;
    
    /// @notice Settle a market (only callable by Manager)
    /// @dev Sets winning range and enables position claiming
    /// @param marketId Market identifier
    /// @param lowerTick Winning range lower bound (inclusive)
    /// @param upperTick Winning range upper bound (inclusive)
    function settleMarket(uint256 marketId, uint32 lowerTick, uint32 upperTick) external;

    // ========================================
    // EXECUTION FUNCTIONS
    // ========================================
    
    /// @notice Open a new position by buying a range
    /// @param trader Address of the trader
    /// @param marketId Market identifier
    /// @param lowerTick Lower tick bound (inclusive)
    /// @param upperTick Upper tick bound (inclusive)
    /// @param quantity Position quantity (always positive, Long-Only)
    /// @param maxCost Maximum cost willing to pay
    /// @return positionId Newly created position ID
    function openPosition(
        address trader,
        uint256 marketId,
        uint32 lowerTick,
        uint32 upperTick,
        uint128 quantity,
        uint256 maxCost
    ) external returns (uint256 positionId);
    
    /// @notice Increase existing position quantity (buy more)
    /// @param positionId Position to increase
    /// @param additionalQuantity Additional quantity to buy
    /// @param maxCost Maximum additional cost willing to pay
    /// @return newQuantity New total quantity after increase
    function increasePosition(
        uint256 positionId,
        uint128 additionalQuantity,
        uint256 maxCost
    ) external returns (uint128 newQuantity);
    
    /// @notice Decrease existing position quantity (sell some)
    /// @param positionId Position to decrease
    /// @param sellQuantity Quantity to sell
    /// @param minProceeds Minimum proceeds expected
    /// @return newQuantity New quantity after decrease
    /// @return proceeds Actual proceeds received
    function decreasePosition(
        uint256 positionId,
        uint128 sellQuantity,
        uint256 minProceeds
    ) external returns (uint128 newQuantity, uint256 proceeds);
    
    /// @notice Close entire position and receive proceeds
    /// @param positionId Position to close
    /// @param minProceeds Minimum proceeds expected
    /// @return proceeds Amount received from closing position
    function closePosition(
        uint256 positionId,
        uint256 minProceeds
    ) external returns (uint256 proceeds);
    
    /// @notice Claim payout from settled market position
    /// @param positionId Position to claim
    /// @return payout Amount claimed
    function claimPayout(
        uint256 positionId
    ) external returns (uint256 payout);

    // ========================================
    // CALCULATION FUNCTIONS
    // ========================================
    
    /// @notice Calculate cost of opening a new position
    /// @param marketId Market identifier
    /// @param lowerTick Lower tick bound
    /// @param upperTick Upper tick bound
    /// @param quantity Position quantity
    /// @return cost Estimated cost
    function calculateOpenCost(
        uint256 marketId,
        uint32 lowerTick,
        uint32 upperTick,
        uint128 quantity
    ) external view returns (uint256 cost);
    
    /// @notice Calculate cost of increasing existing position
    /// @param positionId Position identifier  
    /// @param additionalQuantity Additional quantity to buy
    /// @return cost Estimated additional cost
    function calculateIncreaseCost(
        uint256 positionId,
        uint128 additionalQuantity
    ) external view returns (uint256 cost);
    
    /// @notice Calculate proceeds from decreasing position
    /// @param positionId Position identifier
    /// @param sellQuantity Quantity to sell
    /// @return proceeds Estimated proceeds
    function calculateDecreaseProceeds(
        uint256 positionId,
        uint128 sellQuantity
    ) external view returns (uint256 proceeds);
    
    /// @notice Calculate proceeds from closing entire position
    /// @param positionId Position identifier
    /// @return proceeds Estimated proceeds
    function calculateCloseProceeds(
        uint256 positionId
    ) external view returns (uint256 proceeds);
    
    /// @notice Calculate claimable amount from settled position
    /// @param positionId Position identifier
    /// @return amount Claimable amount
    function calculateClaimAmount(
        uint256 positionId
    ) external view returns (uint256 amount);

    // ========================================
    // STATE QUERY FUNCTIONS
    // ========================================
    
    /// @notice Get market information
    /// @param marketId Market identifier
    /// @return market Market data
    function getMarket(uint256 marketId) external view returns (Market memory market);
    
    /// @notice Get tick value
    /// @param marketId Market identifier
    /// @param tick Tick index
    /// @return value Tick value
    function getTickValue(uint256 marketId, uint32 tick) external view returns (uint256 value);
    
    /// @notice Get position contract address
    /// @return Position contract address
    function getPositionContract() external view returns (address);
    
    /// @notice Get payment token address
    /// @return Payment token address
    function getPaymentToken() external view returns (address);
    
    
    /// @notice Get manager contract address
    /// @return Manager contract address
    function getManagerContract() external view returns (address);
    
    // ========================================
    // SEGMENT TREE FUNCTIONS
    // ========================================
    
    /// @notice Get range sum with on-the-fly lazy calculation (view function)
    /// @dev For general users - returns latest values without state changes
    /// @param marketId Market identifier
    /// @param lo Left boundary (inclusive)
    /// @param hi Right boundary (inclusive)
    /// @return sum Sum of exponential values in range
    function getRangeSum(uint256 marketId, uint32 lo, uint32 hi) 
        external view returns (uint256 sum);
    
    /// @notice Propagate lazy values and return range sum (state-changing function)
    /// @dev For Keeper/Manager - actually pushes lazy values down the tree
    /// @param marketId Market identifier
    /// @param lo Left boundary (inclusive)
    /// @param hi Right boundary (inclusive)
    /// @return sum Sum of exponential values in range
    function propagateLazy(uint256 marketId, uint32 lo, uint32 hi) 
        external returns (uint256 sum);
    
    /// @notice Apply multiplication factor to range (state-changing function)
    /// @dev For Keeper/Manager - updates market state by applying factor
    /// @param marketId Market identifier
    /// @param lo Left boundary (inclusive)
    /// @param hi Right boundary (inclusive)
    /// @param factor Multiplication factor (WAD scale)
    function applyRangeFactor(uint256 marketId, uint32 lo, uint32 hi, uint256 factor) 
        external;

    // ========================================
    // EMERGENCY FUNCTIONS
    // ========================================
    
    /// @notice Pause the contract
    /// @param reason Reason for pausing
    function pause(string calldata reason) external;
    
    /// @notice Unpause the contract
    function unpause() external;
    
    /// @notice Check if contract is paused
    /// @return True if paused
    function isPaused() external view returns (bool);
} 