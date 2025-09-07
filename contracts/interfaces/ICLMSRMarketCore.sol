// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ICLMSRMarketCore
/// @notice Upgradeable core interface for CLMSR Daily-Market System
/// @dev UUPS upgradeable contract handling core trading logic and market state
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
        int256 settlementTick;          // Winning tick value (only if settled) - floored from settlementValue
        int256 minTick;                 // Minimum allowed tick value
        int256 maxTick;                 // Maximum allowed tick value
        int256 tickSpacing;             // Spacing between valid ticks
        uint32 numBins;                 // Number of bins in market (calculated)
        uint256 liquidityParameter;    // Alpha parameter (1e18 scale)
        
        // Position events emission state
        uint32 positionEventsCursor;    // Next emission start index
        bool positionEventsEmitted;     // All events emitted flag
        
        // ⚠️ UPGRADE SAFE: New fields must be added at the end
        int256 settlementValue;         // Original settlement value with 6 decimals (only if settled)
    }
    

    // ========================================
    // EVENTS
    // ========================================
    
    event MarketCreated(
        uint256 indexed marketId,
        uint64 startTimestamp,
        uint64 endTimestamp,
        int256 minTick,
        int256 maxTick,
        int256 tickSpacing,
        uint32 numBins,
        uint256 liquidityParameter
    );

    event MarketSettled(
        uint256 indexed marketId,
        int256 settlementTick
    );

    event MarketSettlementValueSubmitted(
        uint256 indexed marketId,
        int256 settlementValue
    );

    event PositionSettled(
        uint256 indexed positionId,
        address indexed trader,
        uint256 payout,
        bool isWin
    );

    event PositionEventsProgress(
        uint256 indexed marketId,
        uint256 from,
        uint256 to,
        bool done
    );

    event PositionOpened(
        uint256 indexed positionId,
        address indexed trader,
        uint256 indexed marketId,
        int256 lowerTick,
        int256 upperTick,
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

    event MarketTimingUpdated(
        uint256 indexed marketId,
        uint64 newStartTimestamp,
        uint64 newEndTimestamp
    );

    event MarketReopened(
        uint256 indexed marketId
    );

    /// @notice Emitted when range multiplication factor is applied
    /// @param marketId Market identifier
    /// @param lo Left boundary (inclusive)
    /// @param hi Right boundary (inclusive)
    /// @param factor Multiplication factor in WAD format
    event RangeFactorApplied(
        uint256 indexed marketId,
        int256 indexed lo,
        int256 indexed hi,
        uint256 factor
    );

    // ========================================
    // MARKET MANAGEMENT FUNCTIONS
    // ========================================
    
    /// @notice Create a new market (only callable by Owner)
    /// @dev Stores market data and initializes all tick values to WAD (1e18)
    /// @param marketId Market identifier
    /// @param minTick Minimum allowed tick value
    /// @param maxTick Maximum allowed tick value
    /// @param tickSpacing Spacing between valid ticks
    /// @param startTimestamp Market start time
    /// @param endTimestamp Market end time
    /// @param liquidityParameter Alpha parameter (1e18 scale)
    /// @return marketId Auto-generated market identifier
    function createMarket(
        int256 minTick,
        int256 maxTick,
        int256 tickSpacing,
        uint64 startTimestamp,
        uint64 endTimestamp,
        uint256 liquidityParameter
    ) external returns (uint256 marketId);
    
    /// @notice Settle a market (only callable by Owner)
    /// @dev Sets exact winning settlement value (6 decimals) and calculates corresponding tick value
    /// @param marketId Market identifier
    /// @param settlementValue Exact winning settlement value with 6 decimals
    function settleMarket(uint256 marketId, int256 settlementValue) external;

    /// @notice Emit position settled events in batches (only callable by Owner)
    /// @dev Emits PositionSettled events for positions using cursor-based pagination
    /// @param marketId Market identifier
    /// @param limit Maximum number of positions to process in this batch
    function emitPositionSettledBatch(uint256 marketId, uint256 limit) external;

    /// @notice Update market timing (only callable by Owner)
    /// @dev Changes market start and end timestamps for a specific market
    /// @param marketId Market identifier
    /// @param newStartTimestamp New market start time
    /// @param newEndTimestamp New market end time
    function updateMarketTiming(
        uint256 marketId,
        uint64 newStartTimestamp,
        uint64 newEndTimestamp
    ) external;

    /// @notice Reopen a settled market (only callable by Owner)
    /// @dev Reactivates a settled market using existing timing parameters
    /// @param marketId Market identifier
    function reopenMarket(uint256 marketId) external;

    // ========================================
    // EXECUTION FUNCTIONS
    // ========================================
    
    /// @notice Open a new position by buying a range
    /// @param marketId Market identifier
    /// @param lowerTick Lower tick bound (inclusive)
    /// @param upperTick Upper tick bound (exclusive)
    /// @param quantity Position quantity (always positive, Long-Only)
    /// @param maxCost Maximum cost willing to pay
    /// @return positionId Newly created position ID
    function openPosition(
        uint256 marketId,
        int256 lowerTick,
        int256 upperTick,
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
    /// @param sellQuantity Quantity to sell (must be <= current quantity)
    /// @param minProceeds Minimum proceeds willing to accept
    /// @return newQuantity New total quantity after decrease
    /// @return proceeds Actual proceeds received
    function decreasePosition(
        uint256 positionId,
        uint128 sellQuantity,
        uint256 minProceeds
    ) external returns (uint128 newQuantity, uint256 proceeds);
    
    /// @notice Close entire position (sell all)
    /// @param positionId Position to close
    /// @param minProceeds Minimum proceeds willing to accept
    /// @return proceeds Total proceeds from closing position
    function closePosition(
        uint256 positionId,
        uint256 minProceeds
    ) external returns (uint256 proceeds);
    
    /// @notice Claim position payout after market settlement
    /// @param positionId Position to claim
    /// @return payout Amount paid out to position holder
    function claimPayout(
        uint256 positionId
    ) external returns (uint256 payout);

    // ========================================
    // CALCULATION FUNCTIONS
    // ========================================
    
    /// @notice Calculate cost of opening a new position
    /// @param marketId Market identifier
    /// @param lowerTick Lower tick bound (inclusive)
    /// @param upperTick Upper tick bound (exclusive)
    /// @param quantity Position quantity
    /// @return cost Estimated cost
    function calculateOpenCost(
        uint256 marketId,
        int256 lowerTick,
        int256 upperTick,
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
    
    /// @notice Calculate quantity that can be bought with given cost (inverse function)
    /// @param marketId Market identifier
    /// @param lowerTick Lower tick bound
    /// @param upperTick Upper tick bound
    /// @param cost Target cost to spend (6 decimals)
    /// @return quantity Purchasable quantity
    function calculateQuantityFromCost(
        uint256 marketId,
        int256 lowerTick,
        int256 upperTick,
        uint256 cost
    ) external view returns (uint128 quantity);

    // ========================================
    // STATE QUERY FUNCTIONS
    // ========================================
    
    /// @notice Get market information
    /// @param marketId Market identifier
    /// @return market Market data
    function getMarket(uint256 marketId) external view returns (Market memory market);
    
    /// @notice Get tick value by actual tick value
    /// @param marketId Market identifier
    /// @param tick Actual tick value
    /// @return value Tick value
    function getTickValue(uint256 marketId, int256 tick) external view returns (uint256 value);
    
    /// @notice Get position contract address
    /// @return Position contract address
    function getPositionContract() external view returns (address);
    
    /// @notice Get payment token address
    /// @return Payment token address
    function getPaymentToken() external view returns (address);
    
    // ========================================
    // SEGMENT TREE FUNCTIONS
    // ========================================
    
    /// @notice Get range sum with on-the-fly lazy calculation (view function)
    /// @dev For general users - returns latest values without state changes
    /// @param marketId Market identifier
    /// @param lo Left boundary (inclusive, actual tick value)
    /// @param hi Right boundary (inclusive, actual tick value)
    /// @return sum Sum of exponential values in range
    function getRangeSum(uint256 marketId, int256 lo, int256 hi) 
        external view returns (uint256 sum);
    
    /// @notice Propagate lazy values and return range sum (state-changing function)
    /// @dev For Keeper/Owner - actually pushes lazy values down the tree
    /// @param marketId Market identifier
    /// @param lo Left boundary (inclusive, actual tick value)
    /// @param hi Right boundary (inclusive, actual tick value)
    /// @return sum Sum of exponential values in range
    function propagateLazy(uint256 marketId, int256 lo, int256 hi) 
        external returns (uint256 sum);
    
    /// @notice Apply multiplication factor to range (state-changing function)
    /// @dev For Keeper/Owner - updates market state by applying factor
    /// @param marketId Market identifier
    /// @param lo Left boundary (inclusive, actual tick value)
    /// @param hi Right boundary (inclusive, actual tick value)
    /// @param factor Multiplication factor (WAD scale)
    function applyRangeFactor(uint256 marketId, int256 lo, int256 hi, uint256 factor) 
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