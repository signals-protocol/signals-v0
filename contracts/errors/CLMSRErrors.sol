// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface CLMSRErrors {
    /* ─────────────────── Market life-cycle ─────────────────── */
    error MarketNotStarted();
    error MarketExpired();
    error MarketNotActive();
    error InvalidTimeRange();
    error MarketAlreadySettled(uint256 marketId);
    error MarketNotSettled(uint256 marketId);
    error MarketAlreadyExists(uint256 marketId);
    error MarketNotFound(uint256 marketId);

    /* ───────────────────── Trade params ─────────────────────── */
    error InvalidTick(int256 tick, int256 minTick, int256 maxTick);
    error InvalidTickRange(int256 lowerTick, int256 upperTick);
    error InvalidTickSpacing(int256 tick, int256 tickSpacing);
    error InvalidWinningRange(int256 lowerTick, int256 upperTick);
    error InvalidQuantity(uint128 qty);
    error CostExceedsMaximum(uint256 cost, uint256 maxAllowed);
    error InvalidMarketParameters(int256 minTick, int256 maxTick, int256 tickSpacing);

    /* ───────────────────── Access control ───────────────────── */
    error UnauthorizedCaller(address caller);

    /* ───────────────────── Misc / config ────────────────────── */
    error ZeroAddress();
    error BinCountExceedsLimit(uint32 requested, uint32 maxAllowed);
    error ContractPaused();
    error InvalidLiquidityParameter();
    
    /* ───────────────────── Position errors ─────────────────────── */
    error PositionNotFound(uint256 positionId);
    error InsufficientBalance(address account, uint256 required, uint256 available);
    error TransferFailed(address token, address from, address to, uint256 amount);
    
    /* ───────────────────── Segment Tree errors ─────────────────────── */
    error TreeNotInitialized();
    error TreeSizeZero();
    error TreeSizeTooLarge();
    error TreeAlreadyInitialized();
    error LazyFactorOverflow();
    error ArrayLengthMismatch();
    error FactorOutOfBounds();
    error IncompleteChunkProcessing();
} 