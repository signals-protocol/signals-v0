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
import "@redstone-finance/evm-connector/contracts/data-services/PrimaryProdDataServiceConsumerBase.sol";

/// @notice 라이프사이클 전용 매니저 - Core로부터 delegatecall로 호출되어 동일 스토리지를 조작한다.
contract CLMSRMarketManager is
    Initializable,
    CLMSRErrors,
    OwnableUpgradeable,
    UUPSUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable,
    PrimaryProdDataServiceConsumerBase,
    CLMSRMarketCoreStorage
{
    uint32 private constant MAX_TICK_COUNT = 1_000_000;
    uint256 private constant MIN_LIQUIDITY_PARAMETER = 1e15;
    uint256 private constant MAX_LIQUIDITY_PARAMETER = 1e23;
    bytes32 private constant REDSTONE_DATA_FEED_ID = bytes32("BTC");
    uint8 private constant REDSTONE_FEED_DECIMALS = 8;

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

    event MarketSettlementCandidateSubmitted(
        uint256 indexed marketId,
        int256 settlementValue,
        int256 settlementTick,
        uint64 priceTimestamp,
        address indexed submitter,
        bytes oracleData
    );

    event MarketSettlementFinalized(
        uint256 indexed marketId,
        bool isFailed,
        int256 settlementValue,
        int256 settlementTick,
        uint64 priceTimestamp,
        uint64 finalizedAt
    );

    event MarketReopened(uint256 indexed marketId);

    event MarketActivationUpdated(uint256 indexed marketId, bool isActive);

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

    event MarketFeePolicySet(
        uint256 indexed marketId,
        address indexed oldPolicy,
        address indexed newPolicy
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
        uint256 liquidityParameter,
        address feePolicy
    ) external onlyOwner whenNotPaused onlyDelegated returns (uint256 marketId) {
        ICLMSRMarketCore.MarketCreationParams memory params = ICLMSRMarketCore.MarketCreationParams({
            minTick: minTick,
            maxTick: maxTick,
            tickSpacing: tickSpacing,
            startTimestamp: startTimestamp,
            endTimestamp: endTimestamp,
            settlementTimestamp: settlementTimestamp,
            liquidityParameter: liquidityParameter,
            feePolicy: feePolicy
        });

        (marketId, ) = _createMarketInternal(params, false);
        emit MarketActivationUpdated(marketId, false);
        return marketId;
    }

    function settleMarket(uint256 marketId, int256 settlementValue)
        external
        onlyOwner
        onlyDelegated
    {
        if (!(_marketExists(marketId))) { revert CE.MarketNotFound(marketId); }
        ICLMSRMarketCore.Market storage market = markets[marketId];

        if (!(!market.settled)) { revert CE.MarketAlreadySettled(marketId); }

        uint64 gate = market.settlementTimestamp == 0 ? market.endTimestamp : market.settlementTimestamp;
        if (!(block.timestamp >= gate)) { revert CE.SettlementTooEarly(gate, uint64(block.timestamp)); }

        int256 settlementTick = settlementValue / 1_000_000;

        if (!(settlementTick >= market.minTick &&
                settlementTick <= market.maxTick)) { revert CE.InvalidTick(settlementTick, market.minTick, market.maxTick); }

        market.settled = true;
        market.settlementValue = settlementValue;
        market.settlementTick = settlementTick;
        market.isActive = false;

        market.positionEventsCursor = 0;
        market.positionEventsEmitted = false;

        emit MarketSettled(marketId, settlementTick);
        emit MarketSettlementValueSubmitted(marketId, settlementValue);
    }

    function submitSettlement(
        uint256 marketId
    ) external onlyDelegated whenNotPaused {
        if (!(_marketExists(marketId))) { revert CE.MarketNotFound(marketId); }
        ICLMSRMarketCore.Market storage market = markets[marketId];
        SettlementOracleState storage state = settlementOracleState[marketId];

        if (!(!market.settled)) { revert CE.MarketAlreadySettled(marketId); }

        uint64 gate = market.settlementTimestamp == 0 ? market.endTimestamp : market.settlementTimestamp;
        uint64 nowTs = uint64(block.timestamp);

        if (!(nowTs >= gate)) { revert CE.SettlementTooEarly(gate, nowTs); }
        if (!(nowTs < gate + SETTLEMENT_SUBMIT_WINDOW)) { revert CE.SettlementFinalizeWindowClosed(gate + SETTLEMENT_SUBMIT_WINDOW, nowTs); }

        // Validate signatures and extract single price/timestamp from payload
        uint256 price = getOracleNumericValueFromTxMsg(REDSTONE_DATA_FEED_ID);
        uint256 timestampMs = extractTimestampsAndAssertAllAreEqual();
        uint64 priceTimestamp = uint64(timestampMs / 1000);
        int256 settlementValue = _convertPriceToSettlementValue(price);
        int256 settlementTick = settlementValue / 1_000_000;
        if (!(settlementTick >= market.minTick &&
            settlementTick <= market.maxTick)) { revert CE.InvalidTick(settlementTick, market.minTick, market.maxTick); }

        uint64 target = gate;
        uint64 existingTs = state.candidatePriceTimestamp;
        if (existingTs == 0) {
            state.candidateValue = settlementValue;
            state.candidatePriceTimestamp = priceTimestamp;
        } else {
            uint64 oldDiff = existingTs > target ? existingTs - target : target - existingTs;
            uint64 newDiff = priceTimestamp > target ? priceTimestamp - target : target - priceTimestamp;
            if (newDiff < oldDiff || (newDiff == oldDiff && priceTimestamp < existingTs)) {
                state.candidateValue = settlementValue;
                state.candidatePriceTimestamp = priceTimestamp;
            }
        }

        emit MarketSettlementCandidateSubmitted(
            marketId,
            settlementValue,
            settlementTick,
            priceTimestamp,
            msg.sender,
            ""
        );
    }

    function finalizeSettlement(uint256 marketId, bool markFailed)
        external
        onlyDelegated
        whenNotPaused
    {
        if (!(_marketExists(marketId))) { revert CE.MarketNotFound(marketId); }
        ICLMSRMarketCore.Market storage market = markets[marketId];
        SettlementOracleState storage state = settlementOracleState[marketId];

        if (!(!market.settled)) { revert CE.MarketAlreadySettled(marketId); }

        uint64 gate = market.settlementTimestamp == 0 ? market.endTimestamp : market.settlementTimestamp;
        uint64 nowTs = uint64(block.timestamp);

        if (!(nowTs >= gate + SETTLEMENT_SUBMIT_WINDOW)) { revert CE.SettlementTooEarly(gate + SETTLEMENT_SUBMIT_WINDOW, nowTs); }
        if (!(nowTs < gate + SETTLEMENT_FINALIZE_DEADLINE)) { revert CE.SettlementFinalizeWindowClosed(gate + SETTLEMENT_FINALIZE_DEADLINE, nowTs); }

        if (markFailed) {
            if (!(msg.sender == owner())) { revert CE.UnauthorizedCaller(msg.sender); }
            state.candidateValue = 0;
            state.candidatePriceTimestamp = 0;

            emit MarketSettlementFinalized(
                marketId,
                true,
                0,
                0,
                0,
                nowTs
            );
            return;
        }

        if (!(state.candidatePriceTimestamp != 0)) { revert CE.SettlementOracleCandidateMissing(); }

        int256 settlementValue = state.candidateValue;
        int256 settlementTick = settlementValue / 1_000_000;

        if (!(settlementTick >= market.minTick &&
                settlementTick <= market.maxTick)) { revert CE.InvalidTick(settlementTick, market.minTick, market.maxTick); }

        market.settled = true;
        market.settlementValue = settlementValue;
        market.settlementTick = settlementTick;
        market.isActive = false;

        market.positionEventsCursor = 0;
        market.positionEventsEmitted = false;

        emit MarketSettled(marketId, settlementTick);
        emit MarketSettlementValueSubmitted(marketId, settlementValue);
        emit MarketSettlementFinalized(
            marketId,
            false,
            settlementValue,
            settlementTick,
            state.candidatePriceTimestamp,
            nowTs
        );

        state.candidateValue = 0;
        state.candidatePriceTimestamp = 0;
    }

    function reopenMarket(uint256 marketId)
        external
        onlyOwner
        onlyDelegated
    {
        if (!(_marketExists(marketId))) { revert CE.MarketNotFound(marketId); }
        ICLMSRMarketCore.Market storage market = markets[marketId];

        if (!(market.settled)) { revert CE.MarketNotSettled(marketId); }

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
        if (!(_marketExists(marketId))) { revert CE.MarketNotFound(marketId); }
        ICLMSRMarketCore.Market storage market = markets[marketId];

        if (!(!market.settled)) { revert CE.MarketAlreadySettled(marketId); }

        if (!(newStartTimestamp < newEndTimestamp)) { revert CE.InvalidTimeRange(); }
        if (!(newEndTimestamp < newSettlementTimestamp)) { revert CE.InvalidTimeRange(); }

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
        if (!(_marketExists(marketId))) { revert CE.MarketNotFound(marketId); }
        ICLMSRMarketCore.Market storage m = markets[marketId];
        if (!(m.settled)) { revert CE.MarketNotSettled(marketId); }
        if (m.positionEventsEmitted) return;
        if (!(limit > 0)) { revert CE.ZeroLimit(); }

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

    function setMarketActive(uint256 marketId, bool active)
        external
        onlyOwner
        whenNotPaused
        onlyDelegated
    {
        if (!(_marketExists(marketId))) { revert CE.MarketNotFound(marketId); }
        ICLMSRMarketCore.Market storage market = markets[marketId];

        if (!(!market.settled)) { revert CE.MarketAlreadySettled(marketId); }

        if (market.isActive == active) {
            return;
        }

        market.isActive = active;
        emit MarketActivationUpdated(marketId, active);
    }

    function setMarketFeePolicy(uint256 marketId, address newPolicy)
        external
        onlyOwner
        whenNotPaused
        onlyDelegated
    {
        if (!(_marketExists(marketId))) { revert CE.MarketNotFound(marketId); }
        if (newPolicy != address(0) && newPolicy.code.length == 0) {
            revert CE.InvalidFeePolicy(newPolicy);
        }

        ICLMSRMarketCore.Market storage market = markets[marketId];
        address oldPolicy = market.feePolicy;
        if (oldPolicy == newPolicy) {
            return;
        }

        market.feePolicy = newPolicy;
        emit MarketFeePolicySet(marketId, oldPolicy, newPolicy);
    }

    function _convertPriceToSettlementValue(uint256 price) internal pure returns (int256) {
        uint256 scaleDivisor = 10 ** uint256(REDSTONE_FEED_DECIMALS - 6);
        uint256 scaled = price / scaleDivisor;
        require(scaled <= uint256(type(int256).max), "PriceOverflow");
        return int256(scaled);
    }

    function _createMarketInternal(
        ICLMSRMarketCore.MarketCreationParams memory params,
        bool activate
    ) internal returns (uint256 marketId, uint32 numBins) {
        marketId = _nextMarketId;
        _nextMarketId++;

        if (!(!_marketExists(marketId))) { revert CE.MarketAlreadyExists(marketId); }

        _validateMarketParameters(params.minTick, params.maxTick, params.tickSpacing);

        if (!(params.startTimestamp < params.endTimestamp)) { revert CE.InvalidTimeRange(); }
        if (!(params.endTimestamp < params.settlementTimestamp)) { revert CE.InvalidTimeRange(); }

        if (!(params.liquidityParameter >= MIN_LIQUIDITY_PARAMETER &&
                params.liquidityParameter <= MAX_LIQUIDITY_PARAMETER)) { revert CE.InvalidLiquidityParameter(); }

        if (params.feePolicy != address(0)) {
            if (!(params.feePolicy.code.length > 0)) { revert CE.InvalidFeePolicy(params.feePolicy); }
        }

        numBins = _calculateNumBins(params.minTick, params.maxTick, params.tickSpacing);

        if (!(numBins != 0 && numBins <= MAX_TICK_COUNT)) { revert CE.BinCountExceedsLimit(numBins, MAX_TICK_COUNT); }

        markets[marketId] = ICLMSRMarketCore.Market({
            isActive: activate,
            settled: false,
            startTimestamp: params.startTimestamp,
            endTimestamp: params.endTimestamp,
            settlementTick: 0,
            minTick: params.minTick,
            maxTick: params.maxTick,
            tickSpacing: params.tickSpacing,
            numBins: numBins,
            liquidityParameter: params.liquidityParameter,
            positionEventsCursor: 0,
            positionEventsEmitted: false,
            settlementValue: 0,
            settlementTimestamp: params.settlementTimestamp,
            feePolicy: params.feePolicy
        });

        LazyMulSegmentTree.init(marketTrees[marketId], numBins);

        emit MarketCreated(
            marketId,
            params.startTimestamp,
            params.endTimestamp,
            params.minTick,
            params.maxTick,
            params.tickSpacing,
            numBins,
            params.liquidityParameter
        );

        if (params.feePolicy != address(0)) {
            emit MarketFeePolicySet(marketId, address(0), params.feePolicy);
        }

        emit SettlementTimestampUpdated(marketId, params.settlementTimestamp);

        return (marketId, numBins);
    }

    function _marketExists(uint256 marketId) internal view returns (bool) {
        return markets[marketId].numBins != 0;
    }

    function _validateMarketParameters(int256 minTick, int256 maxTick, int256 tickSpacing) internal pure {
        if (!(minTick < maxTick)) { revert CE.InvalidMarketParameters(minTick, maxTick, tickSpacing); }
        if (!(tickSpacing > 0)) { revert CE.InvalidMarketParameters(minTick, maxTick, tickSpacing); }
        if (!((maxTick - minTick) % tickSpacing == 0)) { revert CE.InvalidMarketParameters(minTick, maxTick, tickSpacing); }
    }

    function _calculateNumBins(int256 minTick, int256 maxTick, int256 tickSpacing) internal pure returns (uint32) {
        int256 range = maxTick - minTick;
        int256 ranges = range / tickSpacing;
        if (!(ranges > 0 && ranges <= int256(uint256(MAX_TICK_COUNT)))) { revert CE.InvalidRangeCount(ranges, MAX_TICK_COUNT); }
        return uint32(uint256(ranges));
    }
}
