// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/ICLMSRMarketCore.sol";
import "../interfaces/ICLMSRPosition.sol";
import {LazyMulSegmentTree} from "../libraries/LazyMulSegmentTree.sol";
import {CLMSRErrors as CE} from "../errors/CLMSRErrors.sol";

/// @title CLMSRCoreOps
/// @notice 운영(관리) 로직을 Core 컨텍스트(delegatecall)에서 실행하기 위한 모듈
/// @dev 이 컨트랙트는 독립 스토리지를 가지지 않으며, 반드시 Core로부터 delegatecall 되어야 함.
///      아래의 상태 변수 선언은 Core의 스토리지 레이아웃과 동일한 순서로 정의되어야 함.
contract CLMSRCoreOps {
    // ========================================
    // CONSTANTS (복제: Core와 동일 값 유지)
    // ========================================

    uint32 public constant MAX_TICK_COUNT = 1_000_000;
    uint256 public constant MIN_LIQUIDITY_PARAMETER = 1e15; // 0.001
    uint256 public constant MAX_LIQUIDITY_PARAMETER = 1e23; // 100000

    // ========================================
    // EVENTS (Core와 동일 시그니처)
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

    event MarketSettled(uint256 indexed marketId, int256 settlementTick);
    event MarketSettlementValueSubmitted(uint256 indexed marketId, int256 settlementValue);

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

    event MarketTimingUpdated(
        uint256 indexed marketId,
        uint64 newStartTimestamp,
        uint64 newEndTimestamp
    );

    event RangeFactorApplied(
        uint256 indexed marketId,
        int256 indexed lo,
        int256 indexed hi,
        uint256 factor
    );

    // ========================================
    // CORE STORAGE LAYOUT (Core와 동일 선언 순서 유지)
    // ========================================

    IERC20 public paymentToken; // slot 0
    ICLMSRPosition public positionContract; // slot 1
    mapping(uint256 => ICLMSRMarketCore.Market) public markets; // slot 2
    mapping(uint256 => LazyMulSegmentTree.Tree) public marketTrees; // slot 3
    uint256 public _nextMarketId; // slot 4
    mapping(uint256 => bool) public positionSettledEmitted; // slot 5
    uint256[46] private __gap; // Core 저장소 정렬용 gap. 접근하지 않음

    // ========================================
    // ADMIN OPS (delegatecall 전용)
    // ========================================

    function opCreateMarket(
        int256 minTick,
        int256 maxTick,
        int256 tickSpacing,
        uint64 startTimestamp,
        uint64 endTimestamp,
        uint256 liquidityParameter
    ) external returns (uint256 marketId) {
        // Pause 의미 유지: Paused 상태에서는 신규 마켓 생성 불가
        if (ICLMSRMarketCore(address(this)).isPaused()) revert CE.ContractPaused();
        // Auto-generate market ID
        marketId = _nextMarketId;
        _nextMarketId++;

        _validateMarketParameters(minTick, maxTick, tickSpacing);

        if (startTimestamp >= endTimestamp) {
            revert CE.InvalidTimeRange();
        }

        if (liquidityParameter < MIN_LIQUIDITY_PARAMETER || liquidityParameter > MAX_LIQUIDITY_PARAMETER) {
            revert CE.InvalidLiquidityParameter();
        }

        uint32 numBins = _calculateNumBins(minTick, maxTick, tickSpacing);
        if (numBins == 0 || numBins > MAX_TICK_COUNT) {
            revert CE.BinCountExceedsLimit(numBins, MAX_TICK_COUNT);
        }

        markets[marketId] = ICLMSRMarketCore.Market({
            isActive: true,
            settled: false,
            startTimestamp: startTimestamp,
            endTimestamp: endTimestamp,
            settlementTick: 0,
            minTick: minTick,
            maxTick: maxTick,
            tickSpacing: tickSpacing,
            numBins: numBins,
            liquidityParameter: liquidityParameter,
            positionEventsCursor: 0,
            positionEventsEmitted: false,
            settlementValue: 0
        });

        LazyMulSegmentTree.init(marketTrees[marketId], numBins);

        emit MarketCreated(
            marketId,
            startTimestamp,
            endTimestamp,
            minTick,
            maxTick,
            tickSpacing,
            numBins,
            liquidityParameter
        );
    }

    function opSettleMarket(uint256 marketId, int256 settlementValue) external {
        ICLMSRMarketCore.Market storage market = markets[marketId];
        if (!_marketExists(marketId)) {
            revert CE.MarketNotFound(marketId);
        }
        if (market.settled) {
            revert CE.MarketAlreadySettled(marketId);
        }

        int256 settlementTick = settlementValue / 1_000_000; // 6 decimals -> tick
        if (settlementTick < market.minTick || settlementTick > market.maxTick) {
            revert CE.InvalidTick(settlementTick, market.minTick, market.maxTick);
        }

        market.settled = true;
        market.settlementValue = settlementValue;
        market.settlementTick = settlementTick;
        market.isActive = false;
        market.positionEventsCursor = 0;
        market.positionEventsEmitted = false;

        emit MarketSettled(marketId, settlementTick);
        emit MarketSettlementValueSubmitted(marketId, settlementValue);
    }

    function opEmitPositionSettledBatch(uint256 marketId, uint256 limit) external {
        ICLMSRMarketCore.Market storage m = markets[marketId];
        if (!_marketExists(marketId)) {
            revert CE.MarketNotFound(marketId);
        }
        if (!m.settled) revert CE.MarketNotSettled(marketId);
        if (m.positionEventsEmitted) return;
        require(limit > 0, "limit=0");

        uint256 len = positionContract.getMarketTokenLength(marketId);
        uint256 cursor = uint256(m.positionEventsCursor);
        if (cursor >= len) {
            m.positionEventsEmitted = true;
            emit PositionEventsProgress(marketId, cursor, cursor, true);
            return;
        }

        uint256 toExclusive = cursor + limit;
        if (toExclusive > len) toExclusive = len;

        for (uint256 i = cursor; i < toExclusive; ++i) {
            uint256 pid = positionContract.getMarketTokenAt(marketId, i);
            if (pid == 0) continue; // burned hole
            if (positionSettledEmitted[pid]) continue; // already emitted
            if (!positionContract.exists(pid)) continue; // safety

            ICLMSRPosition.Position memory p = positionContract.getPosition(pid);
            if (p.marketId != marketId) continue; // safety

            uint256 payout = _calculateClaimAmount(pid);
            bool isWin = payout > 0;
            address trader = positionContract.ownerOf(pid);
            emit PositionSettled(pid, trader, payout, isWin);
            positionSettledEmitted[pid] = true;
        }

        m.positionEventsCursor = uint32(toExclusive);
        bool done = (toExclusive == len);
        if (done) m.positionEventsEmitted = true;
        emit PositionEventsProgress(
            marketId,
            cursor,
            toExclusive == 0 ? 0 : (toExclusive - 1),
            done
        );
    }

    function opUpdateMarketTiming(
        uint256 marketId,
        uint64 newStartTimestamp,
        uint64 newEndTimestamp
    ) external {
        ICLMSRMarketCore.Market storage market = markets[marketId];
        if (!_marketExists(marketId)) {
            revert CE.MarketNotFound(marketId);
        }
        if (market.settled) {
            revert CE.MarketAlreadySettled(marketId);
        }
        if (newStartTimestamp >= newEndTimestamp) {
            revert CE.InvalidTimeRange();
        }
        market.startTimestamp = newStartTimestamp;
        market.endTimestamp = newEndTimestamp;
        emit MarketTimingUpdated(marketId, newStartTimestamp, newEndTimestamp);
    }

    function opPropagateLazy(
        uint256 marketId,
        int256 lo,
        int256 hi
    ) external returns (uint256 sum) {
        if (!_marketExists(marketId)) {
            revert CE.MarketNotFound(marketId);
        }
        ICLMSRMarketCore.Market memory market = markets[marketId];
        _validateTick(lo, market);
        _validateTick(hi, market);
        if (lo > hi) {
            revert CE.InvalidTickRange(lo, hi);
        }
        (uint32 loBin, uint32 hiBin) = _rangeToBins(lo, hi, market);
        return LazyMulSegmentTree.propagateLazy(marketTrees[marketId], loBin, hiBin);
    }

    function opApplyRangeFactor(
        uint256 marketId,
        int256 lo,
        int256 hi,
        uint256 factor
    ) external {
        if (!_marketExists(marketId)) {
            revert CE.MarketNotFound(marketId);
        }
        ICLMSRMarketCore.Market memory market = markets[marketId];
        _validateTick(lo, market);
        _validateTick(hi, market);
        if (lo > hi) {
            revert CE.InvalidTickRange(lo, hi);
        }
        (uint32 loBin, uint32 hiBin) = _rangeToBins(lo, hi, market);
        LazyMulSegmentTree.applyRangeFactor(marketTrees[marketId], loBin, hiBin, factor);
        emit RangeFactorApplied(marketId, lo, hi, factor);
    }

    // ========================================
    // INTERNALS
    // ========================================

    function _marketExists(uint256 marketId) internal view returns (bool) {
        return markets[marketId].numBins > 0;
    }

    function _validateMarketParameters(int256 minTick, int256 maxTick, int256 tickSpacing) internal pure {
        if (minTick >= maxTick) {
            revert CE.InvalidMarketParameters(minTick, maxTick, tickSpacing);
        }
        if (tickSpacing <= 0) {
            revert CE.InvalidMarketParameters(minTick, maxTick, tickSpacing);
        }
        if ((maxTick - minTick) % tickSpacing != 0) {
            revert CE.InvalidMarketParameters(minTick, maxTick, tickSpacing);
        }
    }

    function _calculateNumBins(int256 minTick, int256 maxTick, int256 tickSpacing) internal pure returns (uint32) {
        int256 range = maxTick - minTick;
        int256 ranges = range / tickSpacing;
        require(ranges > 0 && ranges <= int256(uint256(MAX_TICK_COUNT)), "Invalid range count");
        return uint32(uint256(ranges));
    }

    function _validateTick(int256 tick, ICLMSRMarketCore.Market memory market) internal pure {
        if (tick < market.minTick || tick > market.maxTick) {
            revert CE.InvalidTick(tick, market.minTick, market.maxTick);
        }
        if ((tick - market.minTick) % market.tickSpacing != 0) {
            revert CE.InvalidTickSpacing(tick, market.tickSpacing);
        }
    }

    function _rangeToBins(
        int256 lowerTick,
        int256 upperTick,
        ICLMSRMarketCore.Market memory market
    ) internal pure returns (uint32 lowerBin, uint32 upperBin) {
        lowerBin = uint32(uint256((lowerTick - market.minTick) / market.tickSpacing));
        upperBin = uint32(uint256((upperTick - market.minTick) / market.tickSpacing - 1));
        require(lowerBin < market.numBins && upperBin < market.numBins, "Range bins out of bounds");
        require(lowerBin <= upperBin, "Invalid range bins");
    }

    function _calculateClaimAmount(uint256 positionId) internal view returns (uint256 amount) {
        ICLMSRPosition.Position memory position = positionContract.getPosition(positionId);
        ICLMSRMarketCore.Market memory market = markets[position.marketId];
        if (!market.settled) {
            return 0;
        }
        bool hasWinning = (position.lowerTick <= market.settlementTick && position.upperTick > market.settlementTick);
        if (hasWinning) {
            amount = uint256(position.quantity);
        } else {
            amount = 0;
        }
    }
}


