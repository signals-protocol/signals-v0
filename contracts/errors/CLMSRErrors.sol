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
    error InvalidTick(uint32 tick, uint32 max);
    error InvalidTickRange(uint32 lowerTick, uint32 upperTick);
    error InvalidWinningRange(uint32 lowerTick, uint32 upperTick);
    error InvalidQuantity(uint128 qty);
    error CostExceedsMaximum(uint256 cost, uint256 maxAllowed);

    /* ───────────────────── Access control ───────────────────── */
    error UnauthorizedCaller(address caller);

    /* ───────────────────── Misc / config ────────────────────── */
    error ZeroAddress();
    error TickCountExceedsLimit(uint32 requested, uint32 maxAllowed);
    error ContractPaused();
    error InvalidLiquidityParameter();
    
    /* ───────────────────── Position errors ─────────────────────── */
    error PositionNotFound(uint256 positionId);
    error InsufficientBalance(address account, uint256 required, uint256 available);
    error TransferFailed(address token, address from, address to, uint256 amount);
    
    /* ───────────────────── Calculation errors ─────────────────────── */
    error TreeNotInitialized();
    error EmptyPoolAfterSell();
    error InvalidChunkCalculation();
    error IncompleteChunkProcessing();
    error FactorOutOfBounds();
    
    /* ───────────────────── Tree validation errors ─────────────────────── */
    error TreeSizeZero();
    error TreeSizeTooLarge();
    error TreeAlreadyInitialized();
    error LazyFactorOverflow();
    error ArrayLengthMismatch();
} 