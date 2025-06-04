// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ICLMSRMarketRouter
/// @notice Router interface for CLMSR Daily-Market System
/// @dev UX-focused wrapper contract for user interactions
interface ICLMSRMarketRouter {
    // ========================================
    // EVENTS
    // ========================================
    
    event RouterTradeRange(
        uint256 indexed marketId,
        address indexed trader,
        uint32 lo,
        uint32 hi,
        int128 dq,
        uint256 cost
    );

    event RouterClaim(
        uint256 indexed marketId,
        address indexed trader,
        uint32[] ticks,
        uint256 payout
    );

    // ========================================
    // ERRORS
    // ========================================
    
    error CoreNotSet();
    error InvalidSignature();
    error ExpiredDeadline(uint256 deadline, uint256 blockTimestamp);

    // ========================================
    // TRADE FUNCTIONS
    // ========================================
    
    /// @notice Execute a trade across a range of ticks
    /// @param marketId Market identifier
    /// @param lo Lower tick bound (inclusive)
    /// @param hi Upper tick bound (inclusive)
    /// @param dq Delta quantity (positive = buy, negative = sell)
    /// @param maxCost Maximum cost trader is willing to pay
    function tradeRange(
        uint256 marketId,
        uint32 lo,
        uint32 hi,
        int128 dq,
        uint256 maxCost
    ) external;

    /// @notice Execute trade with permit (gasless approval)
    /// @param marketId Market identifier
    /// @param lo Lower tick bound
    /// @param hi Upper tick bound
    /// @param dq Delta quantity
    /// @param maxCost Maximum cost
    /// @param deadline Permit deadline
    /// @param v Signature parameter
    /// @param r Signature parameter
    /// @param s Signature parameter
    function tradeRangeWithPermit(
        uint256 marketId,
        uint32 lo,
        uint32 hi,
        int128 dq,
        uint256 maxCost,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    /// @notice Trade a single tick (convenience function)
    /// @param marketId Market identifier
    /// @param tick Single tick to trade
    /// @param dq Delta quantity
    /// @param maxCost Maximum cost
    function tradeTick(
        uint256 marketId,
        uint32 tick,
        int128 dq,
        uint256 maxCost
    ) external;

    /// @notice Trade with permit on single tick
    /// @param marketId Market identifier
    /// @param tick Single tick to trade
    /// @param dq Delta quantity
    /// @param maxCost Maximum cost
    /// @param deadline Permit deadline
    /// @param v Signature parameter
    /// @param r Signature parameter
    /// @param s Signature parameter
    function tradeTickWithPermit(
        uint256 marketId,
        uint32 tick,
        int128 dq,
        uint256 maxCost,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    // ========================================
    // CLAIM FUNCTIONS
    // ========================================
    
    /// @notice Claim winnings from settled market
    /// @param marketId Market identifier
    /// @param ticks Array of ticks to claim from
    function claim(uint256 marketId, uint32[] calldata ticks) external;

    /// @notice Claim all positions for a trader in a market
    /// @param marketId Market identifier
    function claimAll(uint256 marketId) external;

    // ========================================
    // VIEW FUNCTIONS
    // ========================================
    
    /// @notice Get core contract address
    /// @return Address of CLMSRMarketCore
    function core() external view returns (address);

    /// @notice Get payment token address
    /// @return Address of ERC20 payment token
    function paymentToken() external view returns (address);

    /// @notice Calculate cost of a trade without executing
    /// @param marketId Market identifier
    /// @param lo Lower tick bound
    /// @param hi Upper tick bound
    /// @param dq Delta quantity
    /// @return Estimated cost of the trade
    function estimateCost(
        uint256 marketId,
        uint32 lo,
        uint32 hi,
        int128 dq
    ) external view returns (uint256);

    /// @notice Get all positions for a trader in a market
    /// @param marketId Market identifier
    /// @param trader Address of trader
    /// @return ticks Array of tick indices with positions
    /// @return positions Array of position quantities
    function getAllPositions(
        uint256 marketId,
        address trader
    ) external view returns (uint32[] memory ticks, int128[] memory positions);
} 