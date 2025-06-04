// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./ICLMSRMarketCore.sol";

/// @title ICLMSRMarketView
/// @notice View interface for CLMSR Daily-Market System
/// @dev Lightweight read-only contract for data queries
interface ICLMSRMarketView {
    // ========================================
    // STRUCTS
    // ========================================
    
    struct MarketSnapshot {
        uint256 id;
        bool settled;
        uint64 startTs;
        uint64 endTs;
        uint32 settleTick;
        uint32 nLeaves;
        uint256 alpha;
        uint256 rootSumExp;
        uint256 volume;
        bool isActive;
    }

    struct TickInfo {
        uint32 tick;
        uint256 expValue;
        uint256 price;
    }

    struct UserPortfolio {
        uint256 id;
        address trader;
        uint32[] ticks;
        int128[] positions;
        uint256 totalValue;
        bool canClaim;
        uint256 claimableAmount;
    }

    // ========================================
    // ERRORS
    // ========================================
    
    error CoreNotSet();
    error ManagerNotSet();
    error InvalidTickRange(uint32 lo, uint32 hi);

    // ========================================
    // MARKET DATA FUNCTIONS
    // ========================================
    
    /// @notice Get active markets from manager
    /// @return Array of active market identifiers
    function activeMarkets() external view returns (uint256[] memory);

    /// @notice Get snapshot of a single market
    /// @param id Market identifier
    /// @return Market snapshot with all relevant data
    function snapshot(uint256 id) external view returns (MarketSnapshot memory);

    /// @notice Get snapshots of multiple markets
    /// @param marketIds Array of market identifiers
    /// @return Array of market snapshots
    function snapshotMany(uint256[] calldata marketIds) external view returns (MarketSnapshot[] memory);

    /// @notice Get all active market snapshots
    /// @return Array of snapshots for all active markets
    function activeSnapshots() external view returns (MarketSnapshot[] memory);

    // ========================================
    // TICK DATA FUNCTIONS
    // ========================================
    
    /// @notice Get tick information for a range
    /// @param marketId Market identifier
    /// @param lo Lower tick bound
    /// @param hi Upper tick bound
    /// @return Array of tick information
    function getTickRange(
        uint256 marketId,
        uint32 lo,
        uint32 hi
    ) external view returns (TickInfo[] memory);

    /// @notice Get all tick data for a market (expensive!)
    /// @param marketId Market identifier
    /// @return Array of all tick exponential values
    function getAllLeaves(uint256 marketId) external view returns (uint256[] memory);

    /// @notice Get current prices for a tick range
    /// @param marketId Market identifier
    /// @param lo Lower tick bound
    /// @param hi Upper tick bound
    /// @return Array of current prices (normalized)
    function getPriceRange(
        uint256 marketId,
        uint32 lo,
        uint32 hi
    ) external view returns (uint256[] memory);

    /// @notice Get probability distribution for entire market
    /// @param marketId Market identifier
    /// @return Array of probabilities (sum = 1e18)
    function getProbabilityDistribution(uint256 marketId) external view returns (uint256[] memory);

    // ========================================
    // USER DATA FUNCTIONS
    // ========================================
    
    /// @notice Get user's portfolio for a specific market
    /// @param marketId Market identifier
    /// @param trader Address of trader
    /// @return User portfolio information
    function getUserPortfolio(
        uint256 marketId,
        address trader
    ) external view returns (UserPortfolio memory);

    /// @notice Get user's portfolios across multiple markets
    /// @param marketIds Array of market identifiers
    /// @param trader Address of trader
    /// @return Array of user portfolios
    function getUserPortfolios(
        uint256[] calldata marketIds,
        address trader
    ) external view returns (UserPortfolio[] memory);

    /// @notice Get user's total claimable amount across all settled markets
    /// @param trader Address of trader
    /// @return Total claimable amount
    function getTotalClaimable(address trader) external view returns (uint256);

    // ========================================
    // ANALYTICS FUNCTIONS
    // ========================================
    
    /// @notice Get market statistics
    /// @param marketId Market identifier
    /// @return totalVolume Total trade volume
    /// @return uniqueTraders Number of unique traders
    /// @return totalTrades Number of trades executed
    function getMarketStats(uint256 marketId) external view returns (
        uint256 totalVolume,
        uint256 uniqueTraders,
        uint256 totalTrades
    );

    /// @notice Get liquidity metrics for a market
    /// @param marketId Market identifier
    /// @return alpha Liquidity parameter
    /// @return depth Market depth estimation
    /// @return spread Current bid-ask spread
    function getLiquidityMetrics(uint256 marketId) external view returns (
        uint256 alpha,
        uint256 depth,
        uint256 spread
    );

    // ========================================
    // CONFIGURATION FUNCTIONS
    // ========================================
    
    /// @notice Get core contract address
    /// @return Address of CLMSRMarketCore
    function core() external view returns (address);

    /// @notice Get manager contract address
    /// @return Address of CLMSRMarketManager
    function manager() external view returns (address);

    /// @notice Get payment token address
    /// @return Address of ERC20 payment token
    function paymentToken() external view returns (address);
} 