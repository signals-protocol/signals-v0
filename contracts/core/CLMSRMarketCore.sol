// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "../interfaces/ICLMSRMarketCore.sol";
import "../interfaces/ICLMSRPosition.sol";
import "../fees/interfaces/ICLMSRFeePolicy.sol";
import {LazyMulSegmentTree} from "../libraries/LazyMulSegmentTree.sol";
import {FixedPointMathU} from "../libraries/FixedPointMath.sol";
import "../errors/CLMSRErrors.sol";
import {CLMSRErrors as CE} from "../errors/CLMSRErrors.sol";
import "./storage/CLMSRMarketCoreStorage.sol";

/// @title CLMSRMarketCore  
/// @notice Core implementation for CLMSR Daily-Market System
/// @dev UUPS upgradeable contract handling core trading logic and market state
contract CLMSRMarketCore is 
    Initializable,
    ICLMSRMarketCore, 
    CLMSRErrors,
    OwnableUpgradeable,
    UUPSUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable,
    CLMSRMarketCoreStorage
{
    using SafeERC20 for IERC20;
    using {
        FixedPointMathU.toWad,
        FixedPointMathU.wMul,
        FixedPointMathU.wMulNearest,
        FixedPointMathU.wDiv,
        FixedPointMathU.wDivUp,
        FixedPointMathU.wExp,
        FixedPointMathU.wLn
    } for uint256;

    // ========================================
    // CONSTANTS
    // ========================================
    
    /// @notice Maximum number of ticks per market (segment tree safety)
    uint32 public constant MAX_TICK_COUNT = 1_000_000;
    
    /// @notice Minimum liquidity parameter (alpha)
    uint256 public constant MIN_LIQUIDITY_PARAMETER = 1e15; // 0.001 
    
    /// @notice Maximum liquidity parameter (alpha)
    uint256 public constant MAX_LIQUIDITY_PARAMETER = 1e23; // 100000 
    
    
    /// @notice Maximum safe input for PRB-Math exp() function
    uint256 private constant MAX_EXP_INPUT_WAD = 1_000_000_000_000_000_000; // 1.0 * 1e18
    
    /// @notice Maximum number of chunks allowed per transaction to prevent gas DoS
    /// Increased to handle larger institutional trades while maintaining safety
    /// This allows for trades up to 500 * maxSafeQuantityPerChunk in size
    uint256 private constant MAX_CHUNKS_PER_TX = 1000;

    /// @notice Scaling factor between 18-decimal WAD and 6-decimal token amounts
    uint256 private constant SIX_DECIMAL_SCALE = 1_000_000_000_000;

    /// @dev Helper to derive a chunk size representable in 6-decimal units without exceeding raw bound
    function _maxSafeChunkQuantity(uint256 alpha) private pure returns (uint256) {
        uint256 raw = alpha.wMul(MAX_EXP_INPUT_WAD) - 1;
        if (raw == 0) {
            return 0;
        }

        uint256 quantized = raw - (raw % SIX_DECIMAL_SCALE);
        return quantized != 0 ? quantized : raw;
    }

    /// @dev Centralized debit rounding helper (ceil converts WAD to 6-decimal units)
    function _roundDebit(uint256 wadAmount) internal pure returns (uint256) {
        return FixedPointMathU.fromWadRoundUp(wadAmount);
    }

    /// @dev Centralized credit rounding helper (floor converts WAD to 6-decimal units)
    function _roundCredit(uint256 wadAmount) internal pure returns (uint256) {
        return FixedPointMathU.fromWad(wadAmount);
    }

    function _resolveFeeRecipient() internal view returns (address) {
        address recipient = feeRecipient;
        return recipient != address(0) ? recipient : owner();
    }

    function _quoteFee(
        bool isBuy,
        address trader,
        uint256 marketId,
        int256 lowerTick,
        int256 upperTick,
        uint128 quantity,
        uint256 baseAmount
    ) internal view returns (uint256) {
        ICLMSRMarketCore.Market storage market = markets[marketId];
        address policyAddress = market.feePolicy;
        if (policyAddress == address(0)) {
            return 0;
        }

        ICLMSRFeePolicy.QuoteParams memory params = ICLMSRFeePolicy.QuoteParams({
            trader: trader,
            marketId: marketId,
            lowerTick: lowerTick,
            upperTick: upperTick,
            quantity: quantity,
            baseAmount: baseAmount,
            isBuy: isBuy,
            context: bytes32(0)
        });

        return ICLMSRFeePolicy(policyAddress).quoteFee(params);
    }


    // ========================================
    // STATE VARIABLES
    // ========================================

    /// @dev 공유 스토리지는 CLMSRMarketCoreStorage에 정의되어 Manager와 슬롯을 일치시킨다.
    


    // ========================================
    // MODIFIERS
    // ========================================
    
    /// @notice Market must exist
    modifier marketExists(uint256 marketId) {
        require(_marketExists(marketId), CE.MarketNotFound(marketId));
        _;
    }

    // ========================================
    // INITIALIZER
    // ========================================
    
    /// @notice Initialize the upgradeable contract
    /// @param _paymentToken ERC20 token for payments
    /// @param _positionContract Position NFT contract
    function initialize(
        address _paymentToken,
        address _positionContract
    ) external initializer {
        require(
            _paymentToken != address(0) &&
                _positionContract != address(0),
            CE.ZeroAddress()
        );
        
        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
        __Pausable_init();
        __ReentrancyGuard_init();
        
        uint8 tokenDecimals = IERC20Metadata(_paymentToken).decimals();
        require(tokenDecimals == 6, CE.InvalidTokenDecimals(tokenDecimals, 6));

        paymentToken = IERC20(_paymentToken);
        positionContract = ICLMSRPosition(_positionContract);    
        
        // Initialize market ID counter
        _nextMarketId = 1;
        
        // Note: 6 decimals assumed for payment token (USDC)
    }

    // ========================================
    // MANAGER CONFIGURATION
    // ========================================

    /// @notice 라이프사이클 위임 대상 매니저를 설정한다.
    function setManager(address newManager) external onlyOwner {
        require(newManager != address(0), CE.ZeroAddress());
        require(newManager.code.length > 0, "ManagerNoCode");

        emit ManagerUpdated(manager, newManager);
        manager = newManager;
    }

    /// @notice Updates the fee policy for a specific market
    function setMarketFeePolicy(uint256 marketId, address newPolicy)
        external
        override
        onlyOwner
        whenNotPaused
        marketExists(marketId)
    {
        (marketId, newPolicy);
        _delegateToManager();
    }

    /// @notice Updates the fee recipient address (defaults to owner when unset)
    function setFeeRecipient(address newRecipient) external override onlyOwner {
        emit FeeRecipientUpdated(feeRecipient, newRecipient);
        feeRecipient = newRecipient;
    }

    /// @notice Returns the configured fee policy address for a specific market
    function getMarketFeePolicy(uint256 marketId)
        external
        view
        override
        marketExists(marketId)
        returns (address)
    {
        return markets[marketId].feePolicy;
    }

    /// @notice Returns the configured fee recipient (zero implies owner)
    function getFeeRecipient() external view override returns (address) {
        return feeRecipient;
    }

    /// @dev 설정된 매니저로 delegatecall 수행, 실패 시 revert 데이터를 버블링한다.
    function _delegateToManager() private returns (bytes memory) {
        address implementation = manager;
        if (implementation == address(0)) {
            revert CE.ManagerNotSet();
        }

        (bool ok, bytes memory ret) = implementation.delegatecall(msg.data);
        if (!ok) {
            if (ret.length == 0) revert("ManagerDelegateFailed");
            assembly ("memory-safe") {
                revert(add(ret, 0x20), mload(ret))
            }
        }

        return ret;
    }
    

    // ========================================
    // MARKET MANAGEMENT FUNCTIONS
    // ========================================
    
    /// @inheritdoc ICLMSRMarketCore
    function createMarket(
        int256 minTick,
        int256 maxTick,
        int256 tickSpacing,
        uint64 startTimestamp,
        uint64 endTimestamp,
        uint64 settlementTimestamp,
        uint256 liquidityParameter,
        address feePolicy
    ) external override onlyOwner whenNotPaused returns (uint256 marketId) {
        (minTick, maxTick, tickSpacing, startTimestamp, endTimestamp, settlementTimestamp, liquidityParameter, feePolicy);
        bytes memory ret = _delegateToManager();
        return abi.decode(ret, (uint256));
    }

    /// @inheritdoc ICLMSRMarketCore
    function settleMarket(uint256 marketId, int256 settlementValue) 
        external override onlyOwner marketExists(marketId) {
        (marketId, settlementValue);
        _delegateToManager();
    }

    /// @inheritdoc ICLMSRMarketCore
    function reopenMarket(uint256 marketId) 
        external override onlyOwner marketExists(marketId) {
        marketId;
        _delegateToManager();
    }

    /// @inheritdoc ICLMSRMarketCore
    function setMarketActive(uint256 marketId, bool active)
        external
        override
        onlyOwner
        whenNotPaused
        marketExists(marketId)
    {
        (marketId, active);
        _delegateToManager();
    }


    /// @inheritdoc ICLMSRMarketCore
    function emitPositionSettledBatch(
        uint256 marketId,
        uint256 limit
    ) external override onlyOwner marketExists(marketId) {
        (marketId, limit);
        _delegateToManager();
    }

    /// @inheritdoc ICLMSRMarketCore
    function updateMarketTiming(
        uint256 marketId,
        uint64 newStartTimestamp,
        uint64 newEndTimestamp,
        uint64 newSettlementTimestamp
    ) external override onlyOwner marketExists(marketId) {
        (marketId, newStartTimestamp, newEndTimestamp, newSettlementTimestamp);
        _delegateToManager();
    }

    

    

    


    // ========================================
    // STATE QUERY FUNCTIONS
    // ========================================
    
        /// @inheritdoc ICLMSRMarketCore
    function getMarket(uint256 marketId) 
        external view override returns (Market memory market) {
        require(_marketExists(marketId), CE.MarketNotFound(marketId));
        return markets[marketId];
    }

    /// @notice Preview overlay fee for opening or increasing positions
    function previewOpenFee(
        uint256 marketId,
        int256 lowerTick,
        int256 upperTick,
        uint128 quantity,
        uint256 cost
    ) external view override returns (uint256) {
        require(_marketExists(marketId), CE.MarketNotFound(marketId));
        return _quoteFee(true, msg.sender, marketId, lowerTick, upperTick, quantity, cost);
    }

    /// @notice Preview overlay fee for decreasing or closing positions
    function previewSellFee(
        uint256 positionId,
        uint128 sellQuantity,
        uint256 proceeds
    ) external view override returns (uint256) {
        ICLMSRPosition.Position memory position = positionContract.getPosition(positionId);
        return _quoteFee(
            false,
            msg.sender,
            position.marketId,
            position.lowerTick,
            position.upperTick,
            sellQuantity,
            proceeds
        );
    }
    
    /// @notice Get range sum for market ticks (public view function)
    /// @param marketId Market identifier
    /// @param lo Lower tick (inclusive)
    /// @param hi Upper tick (exclusive)
    /// @return sum Sum of values in range
    // Tick boundary in absolute ticks; internally maps to inclusive bin indices [loBin, hiBin]
    // For a single-bin query, call with hi = lo + market.tickSpacing
    function getRangeSum(uint256 marketId, int256 lo, int256 hi)
        public
        view
        override
        marketExists(marketId)
        returns (uint256 sum)
    {
        Market memory market = markets[marketId];
        _validateTick(lo, market);
        _validateTick(hi, market);
        
        require(lo <= hi, CE.InvalidTickRange(lo, hi));
        
        (uint32 loBin, uint32 hiBin) = _rangeToBins(lo, hi, market);

        return LazyMulSegmentTree.getRangeSum(marketTrees[marketId], loBin, hiBin);
    }

    /// @notice Propagate lazy values for market ticks (Keeper only)
    /// @param marketId Market identifier
    /// @param lo Lower tick (inclusive)
    /// @param hi Upper tick (exclusive)
    /// @return sum Sum of values in range after propagation
    // Tick boundary in absolute ticks; internally maps to inclusive bin indices [loBin, hiBin]
    function propagateLazy(uint256 marketId, int256 lo, int256 hi)
        external
        override
        onlyOwner
        marketExists(marketId)
        returns (uint256 sum)
    {
        Market memory market = markets[marketId];
        _validateTick(lo, market);
        _validateTick(hi, market);
        
        require(lo <= hi, CE.InvalidTickRange(lo, hi));

        (uint32 loBin, uint32 hiBin) = _rangeToBins(lo, hi, market);

        return LazyMulSegmentTree.propagateLazy(marketTrees[marketId], loBin, hiBin);
    }

    /// @notice Apply range factor to market ticks (Keeper only)
    /// @param marketId Market identifier
    /// @param lo Lower tick (inclusive)
    /// @param hi Upper tick (exclusive)
    /// @param factor Multiplication factor in WAD format
    // Tick boundary in absolute ticks; internally maps to inclusive bin indices [loBin, hiBin]
    function applyRangeFactor(uint256 marketId, int256 lo, int256 hi, uint256 factor)
        external
        override
        onlyOwner
        marketExists(marketId)
    {
        Market memory market = markets[marketId];
        _validateTick(lo, market);
        _validateTick(hi, market);
        
        require(lo <= hi, CE.InvalidTickRange(lo, hi));

        (uint32 loBin, uint32 hiBin) = _rangeToBins(lo, hi, market);

        LazyMulSegmentTree.applyRangeFactor(marketTrees[marketId], loBin, hiBin, factor);
        emit RangeFactorApplied(marketId, lo, hi, factor);
    }

    /// @inheritdoc ICLMSRMarketCore
    function applyRangeFactorBatch(
        uint256 marketId,
        int256[] calldata lowers,
        int256[] calldata uppers,
        uint256[] calldata factors,
        bytes32 context
    ) external override onlyOwner whenNotPaused marketExists(marketId) {
        uint256 length = lowers.length;
        require(length == uppers.length && length == factors.length, CE.ArrayLengthMismatch());
        require(length != 0, CE.ArrayLengthMismatch());

        Market memory market = markets[marketId];

        for (uint256 i = 0; i < length; ++i) {
            int256 lo = lowers[i];
            int256 hi = uppers[i];
            uint256 factor = factors[i];

            _validateTick(lo, market);
            _validateTick(hi, market);
            require(lo <= hi, CE.InvalidTickRange(lo, hi));

            (uint32 loBin, uint32 hiBin) = _rangeToBins(lo, hi, market);
            LazyMulSegmentTree.applyRangeFactor(marketTrees[marketId], loBin, hiBin, factor);
            emit RangeFactorApplied(marketId, lo, hi, factor);
        }

        emit RangeFactorBatchApplied(marketId, length, context);
    }
    
    /// @inheritdoc ICLMSRMarketCore
    function getPositionContract() external view override returns (address) {
        return address(positionContract);
    }
    
    /// @inheritdoc ICLMSRMarketCore
    function getPaymentToken() external view override returns (address) {
        return address(paymentToken);
    }
    
    // ========================================
    // EMERGENCY FUNCTIONS
    // ========================================
    
    /// @inheritdoc ICLMSRMarketCore
    function pause(string calldata reason) external override onlyOwner {
        _pauseWithReason(reason);
    }
    
    /// @inheritdoc ICLMSRMarketCore
    function unpause() external override onlyOwner {
        super._unpause();
        emit EmergencyUnpaused(msg.sender);
    }
    
    
    /// @inheritdoc ICLMSRMarketCore
    function isPaused() external view override returns (bool) {
        return paused();
    }

    // ========================================
    // EXECUTION FUNCTIONS
    // ========================================
    
    /// @inheritdoc ICLMSRMarketCore
    function openPosition(
        uint256 marketId,
        int256 lowerTick,
        int256 upperTick,
        uint128 quantity,
        uint256 maxCost
    ) external override whenNotPaused nonReentrant returns (uint256 positionId) {
        // Validate parameters
        require(quantity != 0, CE.InvalidQuantity(quantity));
        
        Market storage market = markets[marketId];
        require(_marketExists(marketId), CE.MarketNotFound(marketId));
        
        require(market.isActive, CE.MarketNotActive());
        
        // Validate market timing
        require(block.timestamp >= market.startTimestamp, CE.MarketNotStarted());
        
        require(block.timestamp <= market.endTimestamp, CE.MarketExpired());
        
        // Validate ticks are within market bounds and follow spacing
        _validateTick(lowerTick, market);
        _validateTick(upperTick, market);
        
        require(lowerTick <= upperTick, CE.InvalidTickRange(lowerTick, upperTick));
        
        // 🚨 NO POINT BETTING: Reject same tick betting
        require(lowerTick != upperTick, CE.InvalidTickRange(lowerTick, upperTick));
        
        // ✅ RANGE BETTING: Allow any valid range (single or multiple intervals)
        // Must be aligned to tick spacing
        require(
            (upperTick - lowerTick) % market.tickSpacing == 0,
            CE.InvalidTickRange(lowerTick, upperTick)
        );
        
        // Calculate trade cost and convert to 6-decimal with round-up to prevent zero-cost attacks
        uint256 costWad = _calcCostInWad(marketId, lowerTick, upperTick, quantity);
        uint256 cost6 = _roundDebit(costWad);

        uint256 fee6 = _quoteFee(true, msg.sender, marketId, lowerTick, upperTick, quantity, cost6);
        uint256 totalCost = cost6 + fee6;
        require(totalCost <= maxCost, CE.CostExceedsMaximum(totalCost, maxCost));

        // Transfer payment from caller (msg.sender)
        _pullUSDC(msg.sender, cost6);
        if (fee6 > 0) {
            _pullUSDC(msg.sender, fee6);
            _pushUSDC(_resolveFeeRecipient(), fee6);
        }
        
        // Update market state using WAD quantity
        uint256 qtyWad = uint256(quantity).toWad();
        _applyFactorChunked(marketId, lowerTick, upperTick, qtyWad, market.liquidityParameter, true);
        
        // Mint position NFT to caller (msg.sender) with original 6-decimal quantity (storage unchanged)
        positionId = positionContract.mintPosition(
            msg.sender,
            marketId,
            lowerTick,
            upperTick,
            quantity
        );
        
        emit PositionOpened(
            positionId,
            msg.sender,
            marketId,
            lowerTick,
            upperTick,
            quantity,
            cost6
        );

        if (fee6 > 0) {
            emit TradeFeeCharged(
                msg.sender,
                marketId,
                positionId,
                true,
                cost6,
                fee6,
                market.feePolicy
            );
        }
    }
    
    /// @inheritdoc ICLMSRMarketCore
    function increasePosition(
        uint256 positionId,
        uint128 additionalQuantity,
        uint256 maxCost
    ) external override whenNotPaused nonReentrant returns (uint128 newQuantity) {
        require(additionalQuantity != 0, CE.InvalidQuantity(additionalQuantity));
        
        // Get position data and validate market
        ICLMSRPosition.Position memory position = positionContract.getPosition(positionId);
        address trader = positionContract.ownerOf(positionId);
        
        // Verify caller owns the position
        require(trader == msg.sender, CE.UnauthorizedCaller(msg.sender));
        
        _validateActiveMarket(position.marketId);
        Market storage market = markets[position.marketId];
        
        // Calculate cost with round-up to prevent zero-cost attacks
        uint256 costWad = _calculateTradeCostInternal(
            position.marketId,
            position.lowerTick,
            position.upperTick,
            uint256(additionalQuantity).toWad()
        );
        uint256 cost6 = _roundDebit(costWad);

        uint256 fee6 = _quoteFee(
            true,
            msg.sender,
            position.marketId,
            position.lowerTick,
            position.upperTick,
            additionalQuantity,
            cost6
        );
        uint256 totalCost = cost6 + fee6;
        require(totalCost <= maxCost, CE.CostExceedsMaximum(totalCost, maxCost));
        
        // Transfer payment from caller
        _pullUSDC(msg.sender, cost6);
        if (fee6 > 0) {
            _pullUSDC(msg.sender, fee6);
            _pushUSDC(_resolveFeeRecipient(), fee6);
        }
        
        // Update market state
        uint256 deltaWad = uint256(additionalQuantity).toWad();
        _applyFactorChunked(position.marketId, position.lowerTick, position.upperTick, deltaWad, market.liquidityParameter, true);
        
        // Update position quantity
        newQuantity = position.quantity + additionalQuantity;
        positionContract.updateQuantity(positionId, newQuantity);
        
        emit PositionIncreased(positionId, msg.sender, additionalQuantity, newQuantity, cost6);

        if (fee6 > 0) {
            emit TradeFeeCharged(
                msg.sender,
                position.marketId,
                positionId,
                true,
                cost6,
                fee6,
                market.feePolicy
            );
        }
    }
    
    /// @inheritdoc ICLMSRMarketCore
    function decreasePosition(
        uint256 positionId,
        uint128 sellQuantity,
        uint256 minProceeds
    ) external override whenNotPaused nonReentrant returns (uint128 newQuantity, uint256 proceeds) {
        require(sellQuantity != 0, CE.InvalidQuantity(sellQuantity));
        
        // Get position data and validate market
        ICLMSRPosition.Position memory position = positionContract.getPosition(positionId);
        address trader = positionContract.ownerOf(positionId);
        
        // Verify caller owns the position
        require(trader == msg.sender, CE.UnauthorizedCaller(msg.sender));
        
        _validateActiveMarket(position.marketId);
        Market storage market = markets[position.marketId];
        
        require(sellQuantity <= position.quantity, CE.InsufficientPositionQuantity(sellQuantity, position.quantity));
        
        // Calculate proceeds with round-up for fair treatment
        uint256 proceedsWad = _calculateSellProceeds(
            position.marketId,
            position.lowerTick,
            position.upperTick,
            uint256(sellQuantity).toWad()
        );
        uint256 baseProceeds = _roundCredit(proceedsWad);
        
        uint256 fee6 = _quoteFee(
            false,
            msg.sender,
            position.marketId,
            position.lowerTick,
            position.upperTick,
            sellQuantity,
            baseProceeds
        );

        if (fee6 > baseProceeds) {
            revert CE.FeeExceedsBase(fee6, baseProceeds);
        }
        uint256 netProceeds = baseProceeds - fee6;
        
        require(netProceeds >= minProceeds, CE.ProceedsBelowMinimum(netProceeds, minProceeds));
        
        // Update market state
        uint256 sellDeltaWad = uint256(sellQuantity).toWad();
        _applyFactorChunked(position.marketId, position.lowerTick, position.upperTick, sellDeltaWad, market.liquidityParameter, false);
        
        // Transfer proceeds to caller
        _pushUSDC(msg.sender, netProceeds);
        if (fee6 > 0) {
            _pushUSDC(_resolveFeeRecipient(), fee6);
        }
        
        // Update position quantity
        newQuantity = position.quantity - sellQuantity;
        if (newQuantity == 0) {
            // Burn position if quantity becomes zero
            positionContract.burn(positionId);
        } else {
            positionContract.updateQuantity(positionId, newQuantity);
        }
        
        emit PositionDecreased(positionId, msg.sender, sellQuantity, newQuantity, baseProceeds);

        if (fee6 > 0) {
            emit TradeFeeCharged(
                msg.sender,
                position.marketId,
                positionId,
                false,
                baseProceeds,
                fee6,
                market.feePolicy
            );
        }

        proceeds = netProceeds;
    }
    
    /// @inheritdoc ICLMSRMarketCore
    function claimPayout(
        uint256 positionId
    ) external override whenNotPaused nonReentrant returns (uint256 payout) {
        // Get position data
        ICLMSRPosition.Position memory position = positionContract.getPosition(positionId);
        address trader = positionContract.ownerOf(positionId);
        
        // Verify caller owns the position
        require(trader == msg.sender, CE.UnauthorizedCaller(msg.sender));
        
        Market memory market = markets[position.marketId];
        require(market.settled, CE.MarketNotSettled(position.marketId));
        
        // Calculate payout and emit PositionSettled once if not already
        payout = _calculateClaimAmount(positionId);
        bool isWin = payout > 0;
        if (!positionSettledEmitted[positionId]) {
            emit PositionSettled(positionId, trader, payout, isWin);
            positionSettledEmitted[positionId] = true;
        }

        // Transfer payout to caller
        _pushUSDC(msg.sender, payout);

        // Burn position NFT (position is claimed)
        positionContract.burn(positionId);

    emit PositionClaimed(positionId, msg.sender, payout);
}

    /// @inheritdoc ICLMSRMarketCore
    function closePosition(
        uint256 positionId,
        uint256 minProceeds
    ) external override whenNotPaused nonReentrant returns (uint256 proceeds) {
        // Get position data and validate market
        ICLMSRPosition.Position memory position = positionContract.getPosition(positionId);
        address trader = positionContract.ownerOf(positionId);

        // Verify caller owns the position
        require(trader == msg.sender, CE.UnauthorizedCaller(msg.sender));

        _validateActiveMarket(position.marketId);
        Market storage market = markets[position.marketId];

        // Calculate proceeds from closing entire position with round-up for fair treatment
        uint256 positionQuantityWad = FixedPointMathU.toWad(uint256(position.quantity));
        uint256 proceedsWad = _calculateSellProceeds(
            position.marketId,
            position.lowerTick,
            position.upperTick,
            positionQuantityWad
        );
        uint256 baseProceeds = _roundCredit(proceedsWad);

        uint256 fee6 = _quoteFee(
            false,
            msg.sender,
            position.marketId,
            position.lowerTick,
            position.upperTick,
            position.quantity,
            baseProceeds
        );

        if (fee6 > baseProceeds) {
            revert CE.FeeExceedsBase(fee6, baseProceeds);
        }
        uint256 netProceeds = baseProceeds - fee6;

        require(netProceeds >= minProceeds, CE.ProceedsBelowMinimum(netProceeds, minProceeds));

        // Update market state (selling entire position)
        _applyFactorChunked(
            position.marketId,
            position.lowerTick,
            position.upperTick,
            positionQuantityWad,
            market.liquidityParameter,
            false
        );

        // Transfer proceeds to caller
        _pushUSDC(msg.sender, netProceeds);
        if (fee6 > 0) {
            _pushUSDC(_resolveFeeRecipient(), fee6);
        }

        // Burn position NFT
        positionContract.burn(positionId);

        emit PositionClosed(positionId, msg.sender, baseProceeds);

        if (fee6 > 0) {
            emit TradeFeeCharged(
                msg.sender,
                position.marketId,
                positionId,
                false,
                baseProceeds,
                fee6,
                market.feePolicy
            );
        }

        proceeds = netProceeds;
    }

    // ========================================
    // CALCULATION FUNCTIONS
    // ========================================
    
    /// @inheritdoc ICLMSRMarketCore
    function calculateOpenCost(
        uint256 marketId,
        int256 lowerTick,
        int256 upperTick,
        uint128 quantity
    ) external view override marketExists(marketId) returns (uint256 cost) {
        require(quantity != 0, CE.InvalidQuantity(quantity));
        
        Market memory market = markets[marketId];
        _validateTick(lowerTick, market);
        _validateTick(upperTick, market);
        
        require(lowerTick <= upperTick, CE.InvalidTickRange(lowerTick, upperTick));
        
        // 🚨 NO POINT BETTING: Reject same tick betting
        require(lowerTick != upperTick, CE.InvalidTickRange(lowerTick, upperTick));
        
        // ✅ RANGE BETTING: Allow any valid range (single or multiple intervals)
        // Must be aligned to tick spacing
        require(
            (upperTick - lowerTick) % market.tickSpacing == 0,
            CE.InvalidTickRange(lowerTick, upperTick)
        );
        
        // Convert quantity to WAD for internal calculation
        uint256 quantityWad = uint256(quantity).toWad();
        uint256 costWad = _calculateTradeCostInternal(marketId, lowerTick, upperTick, quantityWad);
        // Convert cost back to 6-decimal for external interface with round-up
        return _roundDebit(costWad);
    }
    
    /// @inheritdoc ICLMSRMarketCore
    function calculateIncreaseCost(
        uint256 positionId,
        uint128 additionalQuantity
    ) external view override returns (uint256 cost) {
        ICLMSRPosition.Position memory position = positionContract.getPosition(positionId);
        uint256 quantityWad = uint256(additionalQuantity).toWad();
        uint256 costWad = _calculateTradeCostInternal(
            position.marketId,
            position.lowerTick,
            position.upperTick,
            quantityWad
        );
        return _roundDebit(costWad);
    }
    
    /// @inheritdoc ICLMSRMarketCore
    function calculateDecreaseProceeds(
        uint256 positionId,
        uint128 sellQuantity
    ) external view override returns (uint256 proceeds) {
        ICLMSRPosition.Position memory position = positionContract.getPosition(positionId);
        uint256 quantityWad = uint256(sellQuantity).toWad();
        uint256 proceedsWad = _calculateSellProceeds(
            position.marketId,
            position.lowerTick,
            position.upperTick,
            quantityWad
        );
        return _roundCredit(proceedsWad);
    }
    
    /// @inheritdoc ICLMSRMarketCore
    function calculateCloseProceeds(
        uint256 positionId
    ) external view override returns (uint256 proceeds) {
        ICLMSRPosition.Position memory position = positionContract.getPosition(positionId);
        uint256 quantityWad = uint256(position.quantity).toWad();
        uint256 proceedsWad = _calculateSellProceeds(
            position.marketId,
            position.lowerTick,
            position.upperTick,
            quantityWad
        );
        return _roundCredit(proceedsWad);
    }

    
    /// @inheritdoc ICLMSRMarketCore
    function calculateClaimAmount(
        uint256 positionId
    ) external view override returns (uint256 amount) {
        return _calculateClaimAmount(positionId);
    }
    
    /// @inheritdoc ICLMSRMarketCore
    function calculateQuantityFromCost(
        uint256 marketId,
        int256 lowerTick,
        int256 upperTick,
        uint256 cost
    ) external view override marketExists(marketId) returns (uint128 quantity) {
        if (cost == 0) {
            return 0;
        }
        
        Market memory market = markets[marketId];
        _validateTick(lowerTick, market);
        _validateTick(upperTick, market);
        
        require(lowerTick <= upperTick, CE.InvalidTickRange(lowerTick, upperTick));
        
        // 🚨 NO POINT BETTING: Reject same tick betting
        require(lowerTick != upperTick, CE.InvalidTickRange(lowerTick, upperTick));
        
        // ✅ RANGE BETTING: Allow any valid range (single or multiple intervals)
        // Must be aligned to tick spacing
        require(
            (upperTick - lowerTick) % market.tickSpacing == 0,
            CE.InvalidTickRange(lowerTick, upperTick)
        );
        
        // Convert cost to WAD for internal calculation
        uint256 costWad = uint256(cost).toWad();
        uint256 quantityWad = _calculateQuantityFromCostInternal(marketId, lowerTick, upperTick, costWad);
        
        // Convert quantity back to 6-decimal for external interface
        uint256 quantityValue = _roundCredit(quantityWad);
        
        // Ensure result fits in uint128
        require(quantityValue <= type(uint128).max, CE.QuantityOverflow());
        
        return uint128(quantityValue);
    }

    // ========================================
    // INTERNAL FUNCTIONS
    // ========================================

    /// @notice Internal pause implementation
    function _pauseWithReason(string memory reason) internal {
        super._pause();
        emit EmergencyPaused(msg.sender, reason);
    }

    /// @notice Authorize upgrade (only owner)
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // ----------------------------------------
    // Tick validation and conversion
    // ----------------------------------------

    /// @notice Validate market parameters
    /// @param minTick Minimum tick value
    /// @param maxTick Maximum tick value
    /// @param tickSpacing Tick spacing
    function _validateMarketParameters(int256 minTick, int256 maxTick, int256 tickSpacing) internal pure {
        require(minTick < maxTick, CE.InvalidMarketParameters(minTick, maxTick, tickSpacing));

        require(tickSpacing > 0, CE.InvalidMarketParameters(minTick, maxTick, tickSpacing));

        // Check that the range is divisible by tickSpacing
        require(
            (maxTick - minTick) % tickSpacing == 0,
            CE.InvalidMarketParameters(minTick, maxTick, tickSpacing)
        );
    }

    /// @notice Calculate number of tick ranges for a market
    /// @param minTick Minimum tick value
    /// @param maxTick Maximum tick value
    /// @param tickSpacing Tick spacing
    /// @return numBins Number of bins (tick ranges, not tick points)
    function _calculateNumBins(int256 minTick, int256 maxTick, int256 tickSpacing) internal pure returns (uint32) {
        int256 range = maxTick - minTick;
        int256 ranges = range / tickSpacing; // No +1 for ranges
        require(ranges > 0 && ranges <= int256(uint256(MAX_TICK_COUNT)), CE.InvalidRangeCount(ranges, MAX_TICK_COUNT));
        return uint32(uint256(ranges));
    }

    /// @notice Validate that a tick is within market bounds and follows spacing
    /// @param tick Tick to validate
    /// @param market Market data
    function _validateTick(int256 tick, Market memory market) internal pure {
        require(
            tick >= market.minTick && tick <= market.maxTick,
            CE.InvalidTick(tick, market.minTick, market.maxTick)
        );

        require(
            (tick - market.minTick) % market.tickSpacing == 0,
            CE.InvalidTickSpacing(tick, market.tickSpacing)
        );
    }

    /// @notice Convert tick range to segment tree bin
    /// @param lowerTick Lower bound of range (inclusive)
    /// @param upperTick Upper bound of range (exclusive)
    /// @param market Market data
    /// @return bin Segment tree bin (0-based)
    function _rangeToBin(int256 lowerTick, int256 upperTick, Market memory market) internal pure returns (uint32) {
        // Validate range format
        require(
            upperTick == lowerTick + market.tickSpacing,
            CE.InvalidTickRange(lowerTick, upperTick)
        );

        int256 binInt = (lowerTick - market.minTick) / market.tickSpacing;
        require(binInt >= 0 && binInt < int256(uint256(market.numBins)), CE.RangeBinOutOfBounds(binInt, market.numBins));
        return uint32(uint256(binInt));
    }

    /// @notice Convert segment tree bin to tick range
    /// @param bin Segment tree bin (0-based)
    /// @param market Market data
    /// @return lowerTick Lower bound of range (inclusive)
    /// @return upperTick Upper bound of range (exclusive)
    function _binToRange(uint32 bin, Market memory market) internal pure returns (int256 lowerTick, int256 upperTick) {
        require(bin < market.numBins, CE.BinOutOfBounds(bin, market.numBins));
        lowerTick = market.minTick + int256(uint256(bin)) * market.tickSpacing;
        upperTick = lowerTick + market.tickSpacing;
    }

    /// @notice Validate that a range is properly formatted
    /// @param lowerTick Lower bound (inclusive)
    /// @param upperTick Upper bound (exclusive)
    /// @param market Market data
    function _validateRange(int256 lowerTick, int256 upperTick, Market memory market) internal pure {
        // Range must be exactly one tick spacing
        require(
            upperTick == lowerTick + market.tickSpacing,
            CE.InvalidTickRange(lowerTick, upperTick)
        );

        // Lower tick must be valid and aligned
        _validateTick(lowerTick, market);

        // Upper tick must be within bounds (but can equal maxTick for last range)
        require(
            upperTick <= market.maxTick,
            CE.InvalidTick(upperTick, market.minTick, market.maxTick)
        );
    }

    /// @notice Convert betting range to segment tree bins
    /// @param lowerTick Range lower boundary (inclusive)
    /// @param upperTick Range upper boundary (exclusive)
    /// @param market Market data
    /// @return loBin Starting bin
    /// @return hiBin Ending bin (inclusive in segment tree range)
    function _rangeToBins(int256 lowerTick, int256 upperTick, Market memory market)
        internal
        pure
        returns (uint32 loBin, uint32 hiBin)
    {
        loBin = uint32(uint256((lowerTick - market.minTick) / market.tickSpacing));
        hiBin = uint32(uint256((upperTick - market.minTick) / market.tickSpacing - 1));

        require(loBin < market.numBins && hiBin < market.numBins, CE.RangeBinsOutOfBounds(loBin, hiBin, market.numBins));
        require(loBin <= hiBin, CE.InvalidRangeBins(loBin, hiBin));
    }

    // ----------------------------------------
    // Internal helpers
    // ----------------------------------------

    /// @notice Check if market exists
    function _marketExists(uint256 marketId) internal view returns (bool) {
        return markets[marketId].numBins > 0;
    }

    /// @notice Pull USDC from user (6-decimal amount)
    function _pullUSDC(address from, uint256 amt6) internal {
        if (amt6 > 0) {
            uint256 balance = paymentToken.balanceOf(from);
            require(balance >= amt6, CE.InsufficientBalance(from, amt6, balance));
            paymentToken.safeTransferFrom(from, address(this), amt6);
        }
    }

    /// @notice Push USDC to user (6-decimal amount)
    function _pushUSDC(address to, uint256 amt6) internal {
        if (amt6 > 0) {
            paymentToken.safeTransfer(to, amt6);
        }
    }

    /// @notice Calculate trade cost with 6-decimal input, returns WAD
    function _calcCostInWad(
        uint256 marketId,
        int256 lowerTick,
        int256 upperTick,
        uint128 qty6
    ) internal view returns (uint256 costWad) {
        uint256 qtyWad = uint256(qty6).toWad();
        return _calculateTradeCostInternal(marketId, lowerTick, upperTick, qtyWad);
    }
    // INTERNAL CALCULATION FUNCTIONS
    // ========================================

    /// @dev Calculate exp(q/α) safely by chunking to avoid overflow
    /// @param q Quantity in WAD format
    /// @param alpha Liquidity parameter in WAD format
    /// @return res Result of exp(q/α) in WAD format
    function _safeExp(uint256 q, uint256 alpha) internal pure returns (uint256 res) {
        uint256 maxPerChunk = alpha.wMul(MAX_EXP_INPUT_WAD); // α * 1.0
        res = FixedPointMathU.WAD; // 1.0
        
        while (q > 0) {
            uint256 chunk = q > maxPerChunk ? maxPerChunk : q;
            uint256 factor = (chunk.wDiv(alpha)).wExp(); // Safe: chunk/α ≤ 1.0
            res = res.wMul(factor);
            q -= chunk;
        }
    }
    
    /// @notice Calculate quantity that can be bought with given cost (inverse function)
    /// @dev Implements inverse of CLMSR formula: from C = α * ln(Σ_after / Σ_before), solve for q
    /// @param marketId Market identifier
    /// @param lowerTick Lower tick bound (inclusive)
    /// @param upperTick Upper tick bound (exclusive)
    /// @param costWad Target cost in WAD format
    /// @return quantityWad Purchasable quantity in WAD format
    // Tick boundary in absolute ticks; internally maps to inclusive bin indices [loBin, hiBin]
    function _calculateQuantityFromCostInternal(
        uint256 marketId,
        int256 lowerTick,
        int256 upperTick,
        uint256 costWad
    ) internal view returns (uint256 quantityWad) {
        Market memory market = markets[marketId];
        uint256 alpha = market.liquidityParameter;
        
        // Convert range to bins
        (uint32 loBin, uint32 hiBin) = _rangeToBins(lowerTick, upperTick, market);
        
        // Get current state with proper lazy propagation
        // Use getRangeSum for entire tree to get accurate total with lazy values
        uint256 sumBefore = marketTrees[marketId].cachedRootSum;
        uint256 affectedSum = LazyMulSegmentTree.getRangeSum(marketTrees[marketId], loBin, hiBin);
        
        // Ensure tree is properly initialized
        require(sumBefore != 0, CE.TreeNotInitialized());

        require(affectedSum != 0, CE.AffectedSumZero());
        
        // Direct mathematical inverse:
        // From: C = α * ln(sumAfter / sumBefore)
        // Calculate: q = α * ln(factor)
        
        // Calculate target sum after: sumAfter = sumBefore * exp(C/α) - use safe chunking
        uint256 expValue = _safeExp(costWad, alpha);
        uint256 targetSumAfter = sumBefore.wMul(expValue);
        
        // Calculate required affected sum after trade
        uint256 requiredAffectedSum = targetSumAfter - (sumBefore - affectedSum);
        
        // Calculate factor: newAffectedSum / affectedSum
        uint256 factor = requiredAffectedSum.wDiv(affectedSum);
        
        // Calculate quantity: q = α * ln(factor)
        quantityWad = alpha.wMul(factor.wLn());
    }
    
    /// @notice Calculate cost of a trade using CLMSR formula with chunk-split logic
    /// @dev CLMSR formula: C = α * ln(Σ_after / Σ_before) where each tick has exp(q_i/α)
    function _calculateTradeCostInternal(
        uint256 marketId,
        int256 lowerTick,
        int256 upperTick,
        uint256 quantity
    ) internal view returns (uint256 cost) {
        Market memory market = markets[marketId];
        
        // Convert range to bins
        (uint32 loBin, uint32 hiBin) = _rangeToBins(lowerTick, upperTick, market);
        
        uint256 totalQuantity = quantity;
        uint256 alpha = market.liquidityParameter;
        uint256 maxSafeQuantityPerChunk = _maxSafeChunkQuantity(alpha);
        
        if (totalQuantity <= maxSafeQuantityPerChunk) {
            // Safe to calculate in single operation
            return _calculateSingleTradeCost(marketId, lowerTick, upperTick, totalQuantity, alpha);
        } else {
            // Split into chunks with proper cumulative calculation
            uint256 sumBefore = marketTrees[marketId].cachedRootSum;
            uint256 affectedSum = LazyMulSegmentTree.getRangeSum(marketTrees[marketId], loBin, hiBin);
            
            // Ensure tree is properly initialized
            require(sumBefore != 0, CE.TreeNotInitialized());
            
            // Calculate required number of chunks and prevent gas DoS
            uint256 requiredChunks = (totalQuantity + maxSafeQuantityPerChunk - 1) / maxSafeQuantityPerChunk;
            
            require(requiredChunks <= MAX_CHUNKS_PER_TX, CE.ChunkLimitExceeded(requiredChunks, MAX_CHUNKS_PER_TX));
            
            // Chunk-split with cumulative state tracking
            uint256 cumulativeCostWad = 0;
            uint256 remainingQuantity = totalQuantity;
            uint256 currentSumBefore = sumBefore;
            uint256 currentAffectedSum = affectedSum;
            uint256 chunkCount = 0;
            
            while (remainingQuantity > 0 && chunkCount < MAX_CHUNKS_PER_TX) {
                uint256 chunkQuantity = remainingQuantity > maxSafeQuantityPerChunk 
                    ? maxSafeQuantityPerChunk 
                    : remainingQuantity;
                
                // Calculate factor for this chunk
                uint256 quantityScaled = chunkQuantity.wDiv(alpha);
                uint256 factor = quantityScaled.wExp();
                
                // ✨ Adaptive overflow guard: check if multiplication would overflow
                if (currentAffectedSum > type(uint256).max / factor) {
                    // Reduce chunk size to prevent overflow
                    chunkQuantity = _computeSafeChunk(
                        currentAffectedSum, 
                        alpha, 
                        remainingQuantity, 
                        MAX_CHUNKS_PER_TX - chunkCount
                    );
                    
                    // Ensure chunk makes meaningful progress
                    if (chunkQuantity > remainingQuantity) {
                        chunkQuantity = remainingQuantity;
                    }
                    
                    quantityScaled = chunkQuantity.wDiv(alpha);
                    factor = quantityScaled.wExp();
                }
                
                // Calculate new sums after this chunk with overflow protection
                uint256 newAffectedSum;
                
                // Additional safety check: verify multiplication won't overflow in wMul
                require(
                    currentAffectedSum == 0 ||
                        factor <= type(uint256).max / currentAffectedSum,
                    CE.MathMulOverflow()
                );
                
                newAffectedSum = currentAffectedSum.wMulNearest(factor);
                uint256 sumAfter = currentSumBefore - currentAffectedSum + newAffectedSum;
                
                // Calculate cost for this chunk: α * ln(sumAfter / sumBefore)
                require(sumAfter > currentSumBefore, CE.NonIncreasingSum(currentSumBefore, sumAfter));
                uint256 ratio = sumAfter.wDivUp(currentSumBefore);
                uint256 chunkCost = alpha.wMul(ratio.wLn());
                cumulativeCostWad += chunkCost;

                // Ensure we make progress to prevent infinite loops
                require(chunkQuantity != 0, CE.NoChunkProgress());

                // Update state for next chunk
                currentSumBefore = sumAfter;
                currentAffectedSum = newAffectedSum;
                remainingQuantity -= chunkQuantity;
                chunkCount++;
            }
            
            // Additional safety check
            require(remainingQuantity == 0, CE.ResidualQuantity(remainingQuantity));

            return cumulativeCostWad;
        }
    }
    
    /// @notice Calculate cost for a single chunk (small quantity)
    function _calculateSingleTradeCost(
        uint256 marketId,
        int256 lowerTick,
        int256 upperTick,
        uint256 quantity,
        uint256 alpha
    ) internal view returns (uint256 cost) {
        // Get current sum before trade with proper lazy propagation
        Market memory market = markets[marketId];
        uint256 sumBefore = marketTrees[marketId].cachedRootSum;
        
        // Calculate multiplicative factor: exp(quantity / α)
        uint256 quantityScaled = quantity.wDiv(alpha);
        uint256 factor = quantityScaled.wExp();
        
        // Calculate sum after trade - convert range to bins
        (uint32 loBin, uint32 hiBin) = _rangeToBins(lowerTick, upperTick, market);
        uint256 affectedSum = LazyMulSegmentTree.getRangeSum(marketTrees[marketId], loBin, hiBin);
        
        // Ensure tree is properly initialized
        require(sumBefore != 0, CE.TreeNotInitialized());
        
        // ✨ Check for overflow before multiplication - fallback to chunked mode if needed
        if (affectedSum > type(uint256).max / factor) {
            // Fallback to chunked calculation to handle large affected sums
            return _calculateTradeCostInternal(marketId, lowerTick, upperTick, quantity);
        }
        
        uint256 sumAfter = sumBefore - affectedSum + affectedSum.wMulNearest(factor);
        // Regular trade: C = α * ln(Σ_after / Σ_before)
        if (sumAfter <= sumBefore) {
            return 0; // No cost if sum doesn't increase
        }
        
        uint256 ratio = sumAfter.wDivUp(sumBefore);
        uint256 lnRatio = ratio.wLn();
        cost = alpha.wMul(lnRatio);
    }
    
    /// @notice Calculate proceeds from selling quantity
    /// @dev CLMSR formula with exp(-quantity/α) factor applied to affected ticks
    /// @notice Calculate sell proceeds with safe chunk splitting for large quantities
    function _calculateSellProceeds(
        uint256 marketId,
        int256 lowerTick,
        int256 upperTick,
        uint256 quantity
    ) internal view returns (uint256 proceeds) {
        Market memory market = markets[marketId];
        
        // Convert range to bins
        (uint32 loBin, uint32 hiBin) = _rangeToBins(lowerTick, upperTick, market);
        
        uint256 totalQuantity = quantity;
        uint256 alpha = market.liquidityParameter;
        uint256 maxSafeQuantityPerChunk = _maxSafeChunkQuantity(alpha);
        
        if (totalQuantity <= maxSafeQuantityPerChunk) {
            // Safe to calculate in single operation
            return _calculateSingleSellProceeds(marketId, lowerTick, upperTick, totalQuantity, alpha);
        } else {
            // Split into chunks with proper cumulative calculation
            uint256 sumBefore = marketTrees[marketId].cachedRootSum;
            uint256 affectedSum = LazyMulSegmentTree.getRangeSum(marketTrees[marketId], loBin, hiBin);
            
            // Ensure tree is properly initialized
            require(sumBefore != 0, CE.TreeNotInitialized());

            // Calculate required number of chunks and prevent gas DoS
            uint256 requiredChunks = (totalQuantity + maxSafeQuantityPerChunk - 1) / maxSafeQuantityPerChunk;

            require(requiredChunks <= MAX_CHUNKS_PER_TX, CE.ChunkLimitExceeded(requiredChunks, MAX_CHUNKS_PER_TX));
            
            // Chunk-split with cumulative state tracking
            uint256 cumulativeProceedsWad = 0;
            uint256 remainingQuantity = totalQuantity;
            uint256 currentSumBefore = sumBefore;
            uint256 currentAffectedSum = affectedSum;
            uint256 chunkCount = 0;
            
            while (remainingQuantity > 0 && chunkCount < MAX_CHUNKS_PER_TX) {
                uint256 chunkQuantity = remainingQuantity > maxSafeQuantityPerChunk 
                    ? maxSafeQuantityPerChunk 
                    : remainingQuantity;
                
                // Calculate inverse factor for this chunk: 1 / exp(quantity/α)
                uint256 quantityScaled = chunkQuantity.wDiv(alpha);
                uint256 factor = quantityScaled.wExp();
                // Use ceil division so sell-side rounding mirrors sequential per-chunk execution
                uint256 inverseFactor = FixedPointMathU.WAD.wDivUp(factor);
                
                // ✨ Adaptive overflow guard: check if multiplication would overflow
                if (currentAffectedSum > type(uint256).max / inverseFactor) {
                    // Reduce chunk size to prevent overflow
                    chunkQuantity = _computeSafeChunk(
                        currentAffectedSum, 
                        alpha, 
                        remainingQuantity, 
                        MAX_CHUNKS_PER_TX - chunkCount
                    );
                    
                    // Ensure chunk makes meaningful progress
                    if (chunkQuantity > remainingQuantity) {
                        chunkQuantity = remainingQuantity;
                    }
                    
                    quantityScaled = chunkQuantity.wDiv(alpha);
                    factor = quantityScaled.wExp();
                    // Maintain ceil rounding symmetry after chunk size adjustment
                    inverseFactor = FixedPointMathU.WAD.wDivUp(factor);
                }
                
                // Calculate new sums after this chunk with overflow protection
                uint256 newAffectedSum;
                
                // Additional safety check: verify multiplication won't overflow in wMul
                require(
                    currentAffectedSum == 0 ||
                        inverseFactor <= type(uint256).max / currentAffectedSum,
                    CE.MathMulOverflow()
                );
                
                newAffectedSum = currentAffectedSum.wMulNearest(inverseFactor);
                uint256 sumAfter = currentSumBefore - currentAffectedSum + newAffectedSum;
                
                // Safety check: ensure sumAfter > 0 to prevent division by zero
                require(sumAfter != 0, CE.SumAfterZero());
                
                // Calculate proceeds for this chunk: α * ln(sumBefore / sumAfter)
                if (currentSumBefore > sumAfter) {
                    uint256 ratio = currentSumBefore.wDivUp(sumAfter);
                    uint256 chunkProceeds = alpha.wMul(ratio.wLn());
                    cumulativeProceedsWad += chunkProceeds;
                }

                // Ensure we make progress to prevent infinite loops
                require(chunkQuantity != 0, CE.NoChunkProgress());

                // Update state for next chunk
                currentSumBefore = sumAfter;
                currentAffectedSum = newAffectedSum;
                remainingQuantity -= chunkQuantity;
                chunkCount++;
            }
            
            // Additional safety check
            require(remainingQuantity == 0, CE.ResidualQuantity(remainingQuantity));

            return cumulativeProceedsWad;
        }
    }
    
    /// @notice Calculate proceeds for a single chunk (small quantity)
    function _calculateSingleSellProceeds(
        uint256 marketId,
        int256 lowerTick,
        int256 upperTick,
        uint256 quantity,
        uint256 alpha
    ) internal view returns (uint256 proceeds) {
        // Get current sum before sell with proper lazy propagation
        Market memory market = markets[marketId];
        uint256 sumBefore = marketTrees[marketId].cachedRootSum;
        
        // Calculate multiplicative factor: exp(-quantity / α) = 1 / exp(quantity / α)
        uint256 quantityScaled = quantity.wDiv(alpha);
        uint256 factor = quantityScaled.wExp();
        uint256 inverseFactor = FixedPointMathU.WAD.wDivUp(factor);
        
        // Calculate sum after sell - convert range to indices
        (uint32 loBin, uint32 hiBin) = _rangeToBins(lowerTick, upperTick, market);
        uint256 affectedSum = LazyMulSegmentTree.getRangeSum(marketTrees[marketId], loBin, hiBin);
        
        // ✨ Check for overflow before multiplication - fallback to chunked mode if needed
        if (affectedSum > type(uint256).max / inverseFactor) {
            // Fallback to chunked calculation to handle large affected sums
            return _calculateSellProceeds(marketId, lowerTick, upperTick, quantity);
        }
        
        uint256 sumAfter = sumBefore - affectedSum + affectedSum.wMulNearest(inverseFactor);
        
        // Safety check: ensure sumAfter > 0 to prevent division by zero
        require(sumAfter != 0, CE.SumAfterZero());
        
        // CLMSR proceeds formula: α * ln(sumBefore / sumAfter)
        if (sumBefore <= sumAfter) {
            return 0; // No proceeds if sum doesn't decrease
        }
        
        uint256 ratio = sumBefore.wDivUp(sumAfter);
        uint256 lnRatio = ratio.wLn();
        proceeds = alpha.wMul(lnRatio);
    }
    
    /// @notice Compute safe chunk size to prevent overflow in multiplication
    /// @param currentSum Current affected sum that will be multiplied
    /// @param alpha Liquidity parameter
    /// @param remainingQty Remaining quantity to process
    /// @param chunksLeft Number of chunks remaining (MAX_CHUNKS_PER_TX - chunkCount)
    /// @return safeChunk Safe chunk quantity that won't cause overflow
    function _computeSafeChunk(
        uint256 currentSum, 
        uint256 alpha, 
        uint256 remainingQty, 
        uint256 chunksLeft
    ) internal pure returns (uint256 safeChunk) {
        // If no chunks left, return remaining quantity
        if (chunksLeft == 0) return remainingQty;
        
        // Calculate minimum progress needed to complete within remaining chunks
        uint256 minProgress = (remainingQty + chunksLeft - 1) / chunksLeft; // Ceiling division
        if (minProgress == 0) minProgress = 1; // Ensure at least 1 wei progress
        
        // Calculate maximum safe quantity based on exponential limits
        uint256 maxSafeQuantity = alpha.wMul(MAX_EXP_INPUT_WAD);
        
        // If currentSum is large, be more conservative to prevent overflow
        if (currentSum > alpha.wMul(50e18)) { // 50x alpha threshold (50e18 = 50 * WAD)
            maxSafeQuantity = alpha / 10; // Very conservative
        }
        
        // Choose the minimum to ensure both progress and safety
        safeChunk = minProgress < maxSafeQuantity ? minProgress : maxSafeQuantity;
        
        // Final safety check - ensure we don't exceed remaining quantity
        if (safeChunk > remainingQty) {
            safeChunk = remainingQty;
        }
    }

    /// @notice Calculate claimable amount from settled position
    function _calculateClaimAmount(uint256 positionId) internal view returns (uint256 amount) {
        ICLMSRPosition.Position memory position = positionContract.getPosition(positionId);
        Market memory market = markets[position.marketId];
        
        if (!market.settled) {
            return 0;
        }
        
        // Check if settlement tick is within position range [lowerTick, upperTick)
        bool hasWinning = (position.lowerTick <= market.settlementTick && 
                          position.upperTick > market.settlementTick);
        
        if (hasWinning) {
            // Position wins - return quantity as payout
            amount = uint256(position.quantity);
        } else {
            // Position loses - no payout
            amount = 0;
        }
    }
    
    /// @notice Update market state for a trade (buy)
    /// @dev Use mulRange to apply exp(quantity/α) factor, with chunk-split for large factors

    
    /// @notice Apply factor with chunk-split to handle large exponential values
    /// @dev Splits large quantity into safe chunks to avoid factor limits and gas DoS
    /// @param marketId Market identifier
    /// @param lowerTick Lower tick bound (inclusive)
    /// @param upperTick Upper tick bound (exclusive)
    /// @param quantity Total quantity to apply
    /// @param alpha Liquidity parameter
    /// @param isBuy True for buy (positive exp), false for sell (negative exp)
    // Tick boundary in absolute ticks; internally maps to inclusive bin indices [loBin, hiBin]
    function _applyFactorChunked(
        uint256 marketId,
        int256 lowerTick,
        int256 upperTick,
        uint256 quantity,
        uint256 alpha,
        bool isBuy
    ) internal {
        // Get market data and convert range to bins
        Market memory market = markets[marketId];
        (uint32 loBin, uint32 hiBin) = _rangeToBins(lowerTick, upperTick, market);
        
        // Use fixed safe chunk size to avoid overflow in chunk calculations
        // This ensures that quantity/alpha ratios stay within safe bounds
        // for exponential calculations in PRB-Math
        uint256 maxSafeQuantityPerChunk = _maxSafeChunkQuantity(alpha);
        
        if (quantity <= maxSafeQuantityPerChunk) {
            // Safe to apply in single operation
            uint256 factor = (quantity.wDiv(alpha)).wExp();

            if (!isBuy) {
                // For sell, use inverse factor
                factor = FixedPointMathU.WAD.wDivUp(factor);
            }
            
            // Verify factor is within safe bounds
            require(
                factor >= LazyMulSegmentTree.MIN_FACTOR &&
                    factor <= LazyMulSegmentTree.MAX_FACTOR,
                CE.FactorOutOfBounds()
            );
            
            LazyMulSegmentTree.applyRangeFactor(marketTrees[marketId], loBin, hiBin, factor);
            // Use original tick values for event
            emit RangeFactorApplied(marketId, lowerTick, upperTick, factor);
        } else {
            // Calculate required number of chunks and prevent gas DoS
            uint256 requiredChunks = (quantity + maxSafeQuantityPerChunk - 1) / maxSafeQuantityPerChunk;
            
            require(
                requiredChunks <= MAX_CHUNKS_PER_TX,
                CE.ChunkLimitExceeded(requiredChunks, MAX_CHUNKS_PER_TX)
            );
            
            // Split into chunks with gas-efficient batch processing
            uint256 remainingQuantity = quantity;
            uint256 chunkCount = 0;
            
            while (remainingQuantity > 0 && chunkCount < MAX_CHUNKS_PER_TX) {
                uint256 chunkQuantity = remainingQuantity > maxSafeQuantityPerChunk 
                    ? maxSafeQuantityPerChunk 
                    : remainingQuantity;
                
                uint256 factor = (chunkQuantity.wDiv(alpha)).wExp();

                if (!isBuy) {
                    // For sell, use inverse factor
                    factor = FixedPointMathU.WAD.wDivUp(factor);
                }

                // Verify factor is within safe bounds for each chunk
                require(
                    factor >= LazyMulSegmentTree.MIN_FACTOR &&
                        factor <= LazyMulSegmentTree.MAX_FACTOR,
                    CE.FactorOutOfBounds()
                );

                LazyMulSegmentTree.applyRangeFactor(marketTrees[marketId], loBin, hiBin, factor);
                // Use original tick values for event
                emit RangeFactorApplied(marketId, lowerTick, upperTick, factor);
                
                remainingQuantity -= chunkQuantity;
                chunkCount++;
            }
            
            // Additional safety check
            require(remainingQuantity == 0, CE.IncompleteChunkProcessing());
        }
    }

    /// @notice Internal function to validate market is active and timing is correct
    function _validateActiveMarket(uint256 marketId) internal view {
        Market storage market = markets[marketId];
        require(market.isActive, CE.MarketNotActive());
        
        // Validate market timing
        require(block.timestamp >= market.startTimestamp, CE.MarketNotStarted());
        
        require(block.timestamp <= market.endTimestamp, CE.MarketExpired());
    }
    
} 
