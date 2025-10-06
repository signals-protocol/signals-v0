// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "../core/storage/CLMSRMarketCoreStorage.sol";
import "../interfaces/ICLMSRMarketCore.sol";
import "../interfaces/ICLMSRPosition.sol";
import {LazyMulSegmentTree} from "../libraries/LazyMulSegmentTree.sol";
import "../errors/CLMSRErrors.sol";
import {CLMSRErrors as CE} from "../errors/CLMSRErrors.sol";

/// @notice 라이프사이클 전용 매니저 - Core로부터 delegatecall로 호출되어 동일 스토리지를 조작한다.
contract CLMSRMarketManager is
    Initializable,
    CLMSRErrors,
    OwnableUpgradeable,
    UUPSUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable,
    CLMSRMarketCoreStorage
{
    uint32 private constant MAX_TICK_COUNT = 1_000_000;
    uint256 private constant MIN_LIQUIDITY_PARAMETER = 1e15;
    uint256 private constant MAX_LIQUIDITY_PARAMETER = 1e23;

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

    event MarketReopened(uint256 indexed marketId);

    event MarketTimingUpdated(
        uint256 indexed marketId,
        uint64 newStartTimestamp,
        uint64 newEndTimestamp
    );

    event SettlementTimestampUpdated(uint256 indexed marketId, uint64 settlementTimestamp);

    event PositionEventsProgress(
        uint256 indexed marketId,
        uint256 from,
        uint256 to,
        bool done
    );

    event PositionSettled(
        uint256 indexed positionId,
        address indexed trader,
        uint256 payout,
        bool isWin
    );

    address private immutable self;

    constructor() {
        self = address(this);
        _disableInitializers();
    }

    modifier onlyDelegated() {
        require(address(this) != self, "ManagerDirectCall");
        _;
    }

    /// @inheritdoc UUPSUpgradeable
    function _authorizeUpgrade(address) internal pure override {
        revert("ManagerNotUpgradeable");
    }

    function createMarket(
        int256 minTick,
        int256 maxTick,
        int256 tickSpacing,
        uint64 startTimestamp,
        uint64 endTimestamp,
        uint64 settlementTimestamp,
        uint256 liquidityParameter
    ) external onlyOwner whenNotPaused onlyDelegated returns (uint256 marketId) {
        marketId = _nextMarketId;
        _nextMarketId++;

        require(!_marketExists(marketId), CE.MarketAlreadyExists(marketId));

        _validateMarketParameters(minTick, maxTick, tickSpacing);

        require(startTimestamp < endTimestamp, CE.InvalidTimeRange());
        require(endTimestamp < settlementTimestamp, CE.InvalidTimeRange());

        require(
            liquidityParameter >= MIN_LIQUIDITY_PARAMETER &&
                liquidityParameter <= MAX_LIQUIDITY_PARAMETER,
            CE.InvalidLiquidityParameter()
        );

        uint32 numBins = _calculateNumBins(minTick, maxTick, tickSpacing);

        require(
            numBins != 0 && numBins <= MAX_TICK_COUNT,
            CE.BinCountExceedsLimit(numBins, MAX_TICK_COUNT)
        );

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
            settlementValue: 0,
            settlementTimestamp: settlementTimestamp
        });

        LazyMulSegmentTree.init(marketTrees[marketId], numBins);

        emit MarketCreated(marketId, startTimestamp, endTimestamp, minTick, maxTick, tickSpacing, numBins, liquidityParameter);
        emit SettlementTimestampUpdated(marketId, settlementTimestamp);
    }

    function settleMarket(uint256 marketId, int256 settlementValue)
        external
        onlyOwner
        onlyDelegated
    {
        require(_marketExists(marketId), CE.MarketNotFound(marketId));
        ICLMSRMarketCore.Market storage market = markets[marketId];

        require(!market.settled, CE.MarketAlreadySettled(marketId));

        uint64 gate = market.settlementTimestamp == 0 ? market.endTimestamp : market.settlementTimestamp;
        require(block.timestamp >= gate, CE.SettlementTooEarly(gate, uint64(block.timestamp)));

        int256 settlementTick = settlementValue / 1_000_000;

        require(
            settlementTick >= market.minTick &&
                settlementTick <= market.maxTick,
            CE.InvalidTick(settlementTick, market.minTick, market.maxTick)
        );

        market.settled = true;
        market.settlementValue = settlementValue;
        market.settlementTick = settlementTick;
        market.isActive = false;

        market.positionEventsCursor = 0;
        market.positionEventsEmitted = false;

        emit MarketSettled(marketId, settlementTick);
        emit MarketSettlementValueSubmitted(marketId, settlementValue);
    }

    function reopenMarket(uint256 marketId)
        external
        onlyOwner
        onlyDelegated
    {
        require(_marketExists(marketId), CE.MarketNotFound(marketId));
        ICLMSRMarketCore.Market storage market = markets[marketId];

        require(market.settled, CE.MarketNotSettled(marketId));

        market.settled = false;
        market.settlementValue = 0;
        market.settlementTick = 0;
        market.isActive = true;

        market.positionEventsCursor = 0;
        market.positionEventsEmitted = false;

        emit MarketReopened(marketId);
    }

    function updateMarketTiming(
        uint256 marketId,
        uint64 newStartTimestamp,
        uint64 newEndTimestamp,
        uint64 newSettlementTimestamp
    ) external onlyOwner onlyDelegated {
        require(_marketExists(marketId), CE.MarketNotFound(marketId));
        ICLMSRMarketCore.Market storage market = markets[marketId];

        require(!market.settled, CE.MarketAlreadySettled(marketId));

        require(newStartTimestamp < newEndTimestamp, CE.InvalidTimeRange());
        require(newEndTimestamp < newSettlementTimestamp, CE.InvalidTimeRange());

        market.startTimestamp = newStartTimestamp;
        market.endTimestamp = newEndTimestamp;
        market.settlementTimestamp = newSettlementTimestamp;

        emit MarketTimingUpdated(marketId, newStartTimestamp, newEndTimestamp);
        emit SettlementTimestampUpdated(marketId, newSettlementTimestamp);
    }

    function emitPositionSettledBatch(uint256 marketId, uint256 limit)
        external
        onlyOwner
        onlyDelegated
    {
        require(_marketExists(marketId), CE.MarketNotFound(marketId));
        ICLMSRMarketCore.Market storage m = markets[marketId];
        require(m.settled, CE.MarketNotSettled(marketId));
        if (m.positionEventsEmitted) return;
        require(limit > 0, CE.ZeroLimit());

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
            if (pid == 0) continue;
            if (positionSettledEmitted[pid]) continue;
            if (!positionContract.exists(pid)) continue;

            ICLMSRPosition.Position memory p = positionContract.getPosition(pid);
            if (p.marketId != marketId) continue;

            uint256 payout = ICLMSRMarketCore(address(this)).calculateClaimAmount(pid);
            bool isWin = payout > 0;
            address trader = positionContract.ownerOf(pid);
            emit PositionSettled(pid, trader, payout, isWin);
            positionSettledEmitted[pid] = true;
        }

        m.positionEventsCursor = uint32(toExclusive);
        bool done = toExclusive == len;
        if (done) m.positionEventsEmitted = true;
        emit PositionEventsProgress(marketId, cursor, toExclusive == 0 ? 0 : (toExclusive - 1), done);
    }

    function _marketExists(uint256 marketId) internal view returns (bool) {
        return markets[marketId].numBins != 0;
    }

    function _validateMarketParameters(int256 minTick, int256 maxTick, int256 tickSpacing) internal pure {
        require(minTick < maxTick, CE.InvalidMarketParameters(minTick, maxTick, tickSpacing));
        require(tickSpacing > 0, CE.InvalidMarketParameters(minTick, maxTick, tickSpacing));
        require((maxTick - minTick) % tickSpacing == 0, CE.InvalidMarketParameters(minTick, maxTick, tickSpacing));
    }

    function _calculateNumBins(int256 minTick, int256 maxTick, int256 tickSpacing) internal pure returns (uint32) {
        int256 range = maxTick - minTick;
        int256 ranges = range / tickSpacing;
        require(ranges > 0 && ranges <= int256(uint256(MAX_TICK_COUNT)), CE.InvalidRangeCount(ranges, MAX_TICK_COUNT));
        return uint32(uint256(ranges));
    }
}
