// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ICLMSRMarketCore
/// @notice Core interface for CLMSR Daily-Market System
/// @dev Immutable contract handling irreversible money/math operations
interface ICLMSRMarketCore {
    // ========================================
    // STRUCTS
    // ========================================
    
    /// @dev UD60x18 fixed-point; 1e18 = 1.0
    struct Node {
        uint256 sum;     // subtree Σexp(q/α)
        uint256 lazy;    // pending multiplicative factor
    }

    struct Market {
        // period
        uint64 startTs;       // epoch start (UTC)
        uint64 endTs;         // epoch end (UTC)
        bool settled;
        uint32 settleTick;    // winning tick after oracle

        // immutable per market
        uint32 nLeaves;       // 32 768 recommended
        uint256 alpha;         // liquidity parameter (1e18 scale)

        // dynamic state
        uint256 rootSumExp;    // Σ exp(q/α)
        uint256 volume;        // Σ |ΔC|  (optional analytics)
        // Note: mappings cannot be in struct interface, handled in implementation
    }

    struct MarketMetadata {
        bool settled;
        uint64 startTs;
        uint64 endTs;
        uint32 settleTick;
        uint32 nLeaves;
        uint256 alpha;
        uint256 rootSumExp;
        uint256 volume;
    }

    // ========================================
    // EVENTS
    // ========================================
    
    event MarketOpened(
        uint256 indexed marketId,
        uint64 startTs,
        uint64 endTs,
        uint32 nLeaves,
        uint256 alpha,
        uint256 initExp
    );

    event MarketClosed(
        uint256 indexed marketId,
        uint32 settleTick
    );

    event TradeRange(
        uint256 indexed marketId,
        address indexed trader,
        uint32 lo,
        uint32 hi,
        int128 dq,
        uint256 cost
    );

    event PositionClaimed(
        uint256 indexed marketId,
        address indexed trader,
        uint32[] ticks,
        uint256 payout
    );

    // ========================================
    // ERRORS
    // ========================================
    
    error MarketAlreadyExists(uint256 marketId);
    error MarketNotFound(uint256 marketId);
    error MarketNotSettled(uint256 marketId);
    error MarketAlreadySettled(uint256 marketId);
    error InvalidTickRange(uint32 lo, uint32 hi);
    error InvalidTick(uint32 tick, uint32 maxTick);
    error ShortSellingNotAllowed(address trader, uint32 tick, int128 currentPos, int128 dq);
    error CostExceedsMaximum(uint256 actualCost, uint256 maxCost);
    error InvalidAlpha(uint256 alpha);
    error InvalidNLeaves(uint32 nLeaves);
    error InvalidTimeRange(uint64 startTs, uint64 endTs);
    error TransferFailed(address from, address to, uint256 amount);
    error ZeroAmount();
    error ArrayLengthMismatch();

    // ========================================
    // CORE FUNCTIONS
    // ========================================
    
    /// @notice Opens a new market for a specific marketId
    /// @param marketId Unique market identifier (typically timestamp)
    /// @param nLeaves Number of price ticks (recommended 32768)
    /// @param startTs Market start timestamp
    /// @param endTs Market end timestamp 
    /// @param alpha Liquidity parameter (1e18 scale)
    /// @param initExp Initial exponential value for all ticks
    function coreOpenMarket(
        uint256 marketId,
        uint32 nLeaves,
        uint64 startTs,
        uint64 endTs,
        uint256 alpha,
        uint256 initExp
    ) external;

    /// @notice Closes and settles a market
    /// @param marketId Market identifier
    /// @param settleTick Winning tick determined by oracle
    function coreCloseMarket(uint256 marketId, uint32 settleTick) external;

    /// @notice Execute a trade across a range of ticks
    /// @param marketId Market identifier
    /// @param trader Address of the trader
    /// @param lo Lower tick bound (inclusive)
    /// @param hi Upper tick bound (inclusive)
    /// @param dq Delta quantity (positive = buy, negative = sell)
    /// @param maxCost Maximum cost trader is willing to pay
    function coreTradeRange(
        uint256 marketId,
        address trader,
        uint32 lo,
        uint32 hi,
        int128 dq,
        uint256 maxCost
    ) external;

    /// @notice Claim winnings from settled market
    /// @param marketId Market identifier
    /// @param trader Address of the trader
    /// @param ticks Array of ticks to claim from
    function coreClaim(
        uint256 marketId,
        address trader,
        uint32[] calldata ticks
    ) external;

    // ========================================
    // VIEW FUNCTIONS
    // ========================================
    
    /// @notice Get market metadata
    /// @param marketId Market identifier
    /// @return Market metadata including settlement status and parameters
    function metaOf(uint256 marketId) external view returns (MarketMetadata memory);

    /// @notice Get raw leaf value for a tick
    /// @param marketId Market identifier
    /// @param tick Tick index
    /// @return Exponential value (missing nodes return 1e18)
    function rawLeaf(uint256 marketId, uint32 tick) external view returns (uint256);

    /// @notice Get user position for a specific tick
    /// @param marketId Market identifier
    /// @param trader Address of the trader
    /// @param tick Tick index
    /// @return Position quantity
    function getPosition(uint256 marketId, address trader, uint32 tick) external view returns (int128);

    /// @notice Check if market exists
    /// @param marketId Market identifier
    /// @return True if market exists
    function marketExists(uint256 marketId) external view returns (bool);

    /// @notice Get the payment token address
    /// @return Address of the ERC20 token used for payments
    function paymentToken() external view returns (address);
} 