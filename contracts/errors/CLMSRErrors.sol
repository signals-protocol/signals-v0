// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface CLMSRErrors {
    /* ─────────────────── Market life-cycle ─────────────────── */
    error MarketNotStarted();
    error MarketExpired();
    error MarketNotActive();
    error InvalidTimeRange();
    error MarketAlreadySettled(uint256 marketId);
    error MarketNotSettled(uint256 marketId);
    error MarketNotFound(uint256 marketId);
    error MarketAlreadyExists(uint256 marketId);
    error SettlementTooEarly(uint64 requiredTimestamp, uint64 currentTimestamp);

    /* ───────────────────── Trade params ─────────────────────── */
    error InvalidTick(int256 tick, int256 minTick, int256 maxTick);
    error InvalidTickRange(int256 lowerTick, int256 upperTick);
    error InvalidTickSpacing(int256 tick, int256 tickSpacing);
    error InvalidQuantity(uint128 qty);
    error CostExceedsMaximum(uint256 cost, uint256 maxAllowed);
    error InvalidMarketParameters(int256 minTick, int256 maxTick, int256 tickSpacing);

    /* ───────────────────── Access control ───────────────────── */
    error UnauthorizedCaller(address caller);

    /* ───────────────────── Misc / config ────────────────────── */
    error ZeroAddress();
    error BinCountExceedsLimit(uint32 requested, uint32 maxAllowed);
    error InvalidLiquidityParameter();
    error ZeroLimit();
    error InvalidRangeCount(int256 ranges, uint256 maxAllowed);
    error RangeBinOutOfBounds(int256 bin, uint32 numBins);
    error BinOutOfBounds(uint32 bin, uint32 numBins);
    error RangeBinsOutOfBounds(uint32 lowerBin, uint32 upperBin, uint32 numBins);
    error InvalidRangeBins(uint32 lowerBin, uint32 upperBin);
    
    /* ───────────────────── Position errors ─────────────────────── */
    error PositionNotFound(uint256 positionId);
    error InsufficientBalance(address account, uint256 required, uint256 available);
    
    /* ───────────────────── Segment Tree errors ─────────────────────── */
    error TreeNotInitialized();
    error TreeSizeZero();
    error TreeSizeTooLarge();
    error TreeAlreadyInitialized();
    error LazyFactorOverflow();
    error ArrayLengthMismatch();
    error FactorOutOfBounds();
    error IncompleteChunkProcessing();
    error IndexOutOfBounds(uint32 index, uint32 size);
    error InvalidRange(uint32 lo, uint32 hi);
    error InvalidFactor(uint256 factor);

    // ───────────────────── Core math / flow / slippage ─────────────────────
    error MathMulOverflow();
    error NonIncreasingSum(uint256 beforeSum, uint256 afterSum);
    error SumAfterZero();
    error NoChunkProgress();
    error ResidualQuantity(uint256 remaining);
    error AffectedSumZero();
    error ChunkLimitExceeded(uint256 required, uint256 maxAllowed);
    error QuantityOverflow();
    error InsufficientPositionQuantity(uint128 want, uint128 have);
    error ProceedsBelowMinimum(uint256 proceeds, uint256 minProceeds);
}
