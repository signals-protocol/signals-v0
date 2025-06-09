// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./ICLMSRMarketCore.sol";
import "./ICLMSRPosition.sol";

/// @title ICLMSRRouter
/// @notice Router interface for CLMSR Daily-Market System
/// @dev Thin call proxy for UX enhancement - no delegatecall, minimal state
interface ICLMSRRouter {
    // ========================================
    // STRUCTS
    // ========================================
    
    /// @notice User portfolio information
    struct UserPortfolio {
        uint256 marketId;               // Market identifier
        address trader;                 // Trader address
        uint256[] positionIds;          // Array of position IDs
        uint256 totalValue;             // Total current value
        bool canClaim;                  // Can claim from settled market
        uint256 claimableAmount;        // Total claimable amount
    }
    
    /// @notice Permit parameters for EIP-2612 support
    struct PermitParams {
        uint256 deadline;               // Permit deadline
        uint8 v;                        // Signature v
        bytes32 r;                      // Signature r
        bytes32 s;                      // Signature s
    }

    // ========================================
    // EVENTS
    // ========================================
    
    event RouterPositionOpened(
        uint256 indexed marketId,
        address indexed trader,
        uint256 indexed positionId,
        uint32 lowerTick,
        uint32 upperTick,
        uint128 quantity,
        uint256 cost
    );

    event RouterPositionIncreased(
        uint256 indexed positionId,
        address indexed trader,
        uint128 additionalQuantity,
        uint128 newQuantity,
        uint256 cost
    );

    event RouterPositionDecreased(
        uint256 indexed positionId,
        address indexed trader,
        uint128 sellQuantity,
        uint128 newQuantity,
        uint256 proceeds
    );

    event RouterPositionClosed(
        uint256 indexed positionId,
        address indexed trader,
        uint256 proceeds
    );

    event RouterPositionClaimed(
        uint256 indexed positionId,
        address indexed trader,
        uint256 payout
    );

    event BatchOperationExecuted(
        address indexed trader,
        uint256 operationCount,
        uint256 totalGasUsed
    );

    // ========================================
    // ERRORS
    // ========================================
    
    error CoreContractNotSet();
    error PositionContractNotSet();
    error InvalidParameters(string reason);
    error InsufficientAllowance(uint256 required, uint256 available);
    error PermitFailed(string reason);

    // ========================================
    // USER-FRIENDLY TRADING FUNCTIONS
    // ========================================
    
    /// @notice Open a position with optional permit
    /// @dev Handles permit, token transfer, and Core delegation
    /// @param marketId Market identifier
    /// @param lowerTick Lower tick bound (inclusive)
    /// @param upperTick Upper tick bound (inclusive)
    /// @param quantity Position quantity (always positive)
    /// @param maxCost Maximum cost willing to pay
    /// @param permitParams Optional permit parameters (deadline=0 to skip)
    /// @return positionId Newly created position ID
    function openPositionWithPermit(
        uint256 marketId,
        uint32 lowerTick,
        uint32 upperTick,
        uint128 quantity,
        uint256 maxCost,
        PermitParams calldata permitParams
    ) external returns (uint256 positionId);
    
    /// @notice Open a position (requires pre-approval)
    /// @param marketId Market identifier
    /// @param lowerTick Lower tick bound (inclusive)
    /// @param upperTick Upper tick bound (inclusive)
    /// @param quantity Position quantity (always positive)
    /// @param maxCost Maximum cost willing to pay
    /// @return positionId Newly created position ID
    function openPosition(
        uint256 marketId,
        uint32 lowerTick,
        uint32 upperTick,
        uint128 quantity,
        uint256 maxCost
    ) external returns (uint256 positionId);
    
    /// @notice Increase existing position quantity
    /// @param positionId Position to increase
    /// @param additionalQuantity Additional quantity to buy
    /// @param maxCost Maximum additional cost willing to pay
    /// @return newQuantity New total quantity after increase
    function increasePosition(
        uint256 positionId,
        uint128 additionalQuantity,
        uint256 maxCost
    ) external returns (uint128 newQuantity);
    
    /// @notice Decrease existing position quantity
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
    function claimPayout(uint256 positionId) 
        external returns (uint256 payout);

    // ========================================
    // CALCULATION FUNCTIONS (Delegated to Core)
    // ========================================
    
    /// @notice Calculate cost of opening a new position
    /// @dev Thin wrapper - delegates to Core contract for calculation
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
    
    /// @notice Calculate cost of increasing position
    /// @dev Thin wrapper - delegates to Core contract for calculation
    /// @param positionId Position to increase
    /// @param additionalQuantity Additional quantity to buy
    /// @return cost Estimated additional cost
    function calculateIncreaseCost(
        uint256 positionId,
        uint128 additionalQuantity
    ) external view returns (uint256 cost);
    
    /// @notice Calculate proceeds from decreasing position
    /// @dev Thin wrapper - delegates to Core contract for calculation
    /// @param positionId Position to decrease
    /// @param sellQuantity Quantity to sell
    /// @return proceeds Estimated proceeds
    function calculateDecreaseProceeds(
        uint256 positionId,
        uint128 sellQuantity
    ) external view returns (uint256 proceeds);
    
    /// @notice Calculate proceeds from closing entire position
    /// @dev Thin wrapper - delegates to Core contract for calculation
    /// @param positionId Position to close
    /// @return proceeds Estimated proceeds
    function calculateCloseProceeds(
        uint256 positionId
    ) external view returns (uint256 proceeds);
    
    /// @notice Calculate claimable amount from settled position
    /// @dev Thin wrapper - delegates to Core contract for calculation
    /// @param positionId Position to claim
    /// @return amount Claimable amount (0 if market not settled)
    function calculateClaimAmount(
        uint256 positionId
    ) external view returns (uint256 amount);

    // ========================================
    // USER DATA FUNCTIONS
    // ========================================
    
    /// @notice Get user's positions for a specific market
    /// @param user User address
    /// @param marketId Market identifier
    /// @return positionIds Array of position IDs owned by user
    function getUserPositions(address user, uint256 marketId) 
        external view returns (uint256[] memory positionIds);
    
    /// @notice Get user's total value in a market
    /// @param user User address
    /// @param marketId Market identifier
    /// @return totalValue Total current value of all positions
    function getUserTotalValue(address user, uint256 marketId) 
        external view returns (uint256 totalValue);
    
    /// @notice Get user's complete portfolio for a market
    /// @param user User address
    /// @param marketId Market identifier
    /// @return portfolio Complete portfolio information
    function getUserPortfolio(address user, uint256 marketId) 
        external view returns (UserPortfolio memory portfolio);

    // ========================================
    // MARKET DATA FUNCTIONS (Delegated to Core)
    // ========================================
    
    /// @notice Get market information
    /// @param marketId Market identifier
    /// @return market Market data
    function getMarket(uint256 marketId) 
        external view returns (ICLMSRMarketCore.Market memory market);
    
    /// @notice Get information for multiple markets
    /// @param marketIds Array of market identifiers
    /// @return markets Array of market data
    function getMarkets(uint256[] calldata marketIds) 
        external view returns (ICLMSRMarketCore.Market[] memory markets);
    
    /// @notice Get tick value for display
    /// @param marketId Market identifier
    /// @param tick Tick index
    /// @return value Exponential value at tick
    function getTickValue(uint256 marketId, uint32 tick) 
        external view returns (uint256 value);

    // ========================================
    // CONFIGURATION FUNCTIONS (Immutable References)
    // ========================================
    
    /// @notice Get core contract address
    /// @return Address of the core contract
    function getCoreContract() external view returns (address);
    
    /// @notice Get position contract address
    /// @return Address of the position contract
    function getPositionContract() external view returns (address);
    
    /// @notice Get payment token address
    /// @return Address of the payment token
    function getPaymentToken() external view returns (address);

    // ========================================
    // SAFETY & UTILITY FUNCTIONS
    // ========================================
    
    /// @notice Emergency token recovery (if any tokens get stuck)
    /// @dev Only for tokens accidentally sent to Router
    /// @param token Token address to recover
    /// @param to Recipient address
    /// @param amount Amount to recover
    function emergencyTokenRecovery(
        address token,
        address to,
        uint256 amount
    ) external;
    
    /// @notice Check current allowance for payment token
    /// @param owner Token owner
    /// @return allowance Current allowance amount
    function getCurrentAllowance(address owner) 
        external view returns (uint256 allowance);

    // ========================================
    // BATCH OPERATIONS
    // ========================================
    
    /// @notice Execute multiple operations in a single transaction
    /// @dev For gas optimization and atomic operations
    /// @param calls Array of encoded function calls
    /// @return results Array of return data from each call
    function multicall(bytes[] calldata calls) 
        external returns (bytes[] memory results);
    
    /// @notice Batch close multiple positions
    /// @param positionIds Array of position IDs to close
    /// @return totalProceeds Total proceeds from all closures
    function batchClosePositions(uint256[] calldata positionIds)
        external returns (uint256 totalProceeds);
    
    /// @notice Batch claim multiple settled positions
    /// @param positionIds Array of position IDs to claim
    /// @return totalPayout Total payout from all claims
    function batchClaimPositions(uint256[] calldata positionIds)
        external returns (uint256 totalPayout);
} 