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
    
    event RouterTradeExecuted(
        uint256 indexed marketId,
        address indexed trader,
        uint256 indexed positionId,
        uint32 lowerTick,
        uint32 upperTick,
        uint128 quantity,
        uint256 cost
    );

    event RouterPositionAdjusted(
        uint256 indexed positionId,
        address indexed trader,
        int128 quantityDelta,
        uint256 cost
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
    
    /// @notice Execute a trade with optional permit
    /// @dev Handles permit, token transfer, and Core delegation
    /// @param marketId Market identifier
    /// @param lowerTick Lower tick bound (inclusive)
    /// @param upperTick Upper tick bound (inclusive)
    /// @param quantity Position quantity (always positive)
    /// @param maxCost Maximum cost willing to pay
    /// @param permitParams Optional permit parameters (deadline=0 to skip)
    /// @return positionId Newly created position ID
    function tradeWithPermit(
        uint256 marketId,
        uint32 lowerTick,
        uint32 upperTick,
        uint128 quantity,
        uint256 maxCost,
        PermitParams calldata permitParams
    ) external returns (uint256 positionId);
    
    /// @notice Execute a trade (requires pre-approval)
    /// @param marketId Market identifier
    /// @param lowerTick Lower tick bound (inclusive)
    /// @param upperTick Upper tick bound (inclusive)
    /// @param quantity Position quantity (always positive)
    /// @param maxCost Maximum cost willing to pay
    /// @return positionId Newly created position ID
    function trade(
        uint256 marketId,
        uint32 lowerTick,
        uint32 upperTick,
        uint128 quantity,
        uint256 maxCost
    ) external returns (uint256 positionId);
    
    /// @notice Adjust existing position quantity
    /// @param positionId Position to adjust
    /// @param quantityDelta Change in quantity (positive = buy more, negative = sell some)
    /// @param maxCost Maximum additional cost for positive delta
    /// @return success True if adjustment was successful
    function adjustPosition(
        uint256 positionId,
        int128 quantityDelta,
        uint256 maxCost
    ) external returns (bool success);
    
    /// @notice Close entire position and receive proceeds
    /// @param positionId Position to close
    /// @return proceeds Amount received from closing position
    function closePosition(uint256 positionId) 
        external returns (uint256 proceeds);
    
    /// @notice Claim payout from settled market position
    /// @param positionId Position to claim
    /// @return payout Amount claimed
    function claimPosition(uint256 positionId) 
        external returns (uint256 payout);

    // ========================================
    // CALCULATION FUNCTIONS (Delegated to Core)
    // ========================================
    
    /// @notice Calculate cost of a new trade
    /// @dev Thin wrapper - delegates to Core contract for calculation
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
    /// @dev Thin wrapper - delegates to Core contract for calculation
    /// @param positionId Position to adjust
    /// @param quantityDelta Change in quantity
    /// @return cost Estimated cost (0 if selling)
    function calculateAdjustCost(
        uint256 positionId,
        int128 quantityDelta
    ) external view returns (uint256 cost);
    
    /// @notice Get current value of a position
    /// @dev Calculates current market value using Core data
    /// @param positionId Position identifier
    /// @return currentValue Current market value
    function getPositionValue(uint256 positionId) 
        external view returns (uint256 currentValue);

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