// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/ICLMSRMarketCore.sol";
import "../interfaces/ICLMSRPosition.sol";
import {LazyMulSegmentTree} from "../libraries/LazyMulSegmentTree.sol";
import {FixedPointMathU} from "../libraries/FixedPointMath.sol";
import {CLMSRErrors as CE} from "../errors/CLMSRErrors.sol";

/// @title CLMSRMarketCore
/// @notice Core implementation for CLMSR Daily-Market System
/// @dev Immutable contract handling core trading logic and market state
contract CLMSRMarketCore is ICLMSRMarketCore, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using {
        FixedPointMathU.toWad,
        FixedPointMathU.fromWad,
        FixedPointMathU.fromWadRoundUp,
        FixedPointMathU.wMul,
        FixedPointMathU.wDiv,
        FixedPointMathU.wExp,
        FixedPointMathU.wLn
    } for uint256;



    // ========================================
    // CONSTANTS
    // ========================================
    
    /// @notice Maximum number of ticks per market (segment tree safety)
    uint32 public constant MAX_TICK_COUNT = 1_000_000;
    
    // Note: MAX_ACTIVE_MARKETS removed - managed by Manager contract
    
    /// @notice Minimum liquidity parameter (alpha)
    uint256 public constant MIN_LIQUIDITY_PARAMETER = 1e15; // 0.001 ETH
    
    /// @notice Maximum liquidity parameter (alpha)
    uint256 public constant MAX_LIQUIDITY_PARAMETER = 1e21; // 1000 ETH
    
    
    /// @notice Maximum safe input for PRB-Math exp() function
    uint256 private constant MAX_EXP_INPUT_WAD = 130_000_000_000_000_000; // 0.13 * 1e18
    
    /// @notice Maximum number of chunks allowed per transaction to prevent gas DoS
    /// Increased to handle larger institutional trades while maintaining safety
    /// This allows for trades up to 500 * maxSafeQuantityPerChunk in size
    uint256 private constant MAX_CHUNKS_PER_TX = 1000;

    // ========================================
    // STATE VARIABLES
    // ========================================
    
    /// @notice Payment token (USDC - 6 decimals)
    IERC20 public immutable paymentToken;
    
    /// @notice Position NFT contract
    ICLMSRPosition public immutable positionContract;
    
    /// @notice Manager contract address
    address public immutable managerContract;
    
    /// @notice Router contract address
    address public router;
    
    /// @notice Contract pause state
    bool public paused;
    
    /// @notice Market data storage
    mapping(uint256 => Market) public markets;
    
    /// @notice Segment trees for each market (marketId => tree)
    mapping(uint256 => LazyMulSegmentTree.Tree) public marketTrees;
    

    


    // ========================================
    // MODIFIERS
    // ========================================
    
    /// @notice Only manager can call
    modifier onlyManager() {
        if (msg.sender != managerContract) {
            revert CE.UnauthorizedCaller(msg.sender);
        }
        _;
    }
    
    /// @notice Only authorized callers (Manager, Router, Position)
    modifier onlyAuthorized() {
        if (!_isAuthorizedCaller(msg.sender)) {
            revert CE.UnauthorizedCaller(msg.sender);
        }
        _;
    }
    
    /// @notice Contract must not be paused
    modifier whenNotPaused() {
        if (paused) {
            revert CE.ContractPaused();
        }
        _;
    }
    
    /// @notice Market must exist
    modifier marketExists(uint256 marketId) {
        if (!_marketExists(marketId)) {
            revert CE.MarketNotFound(marketId);
        }
        _;
    }

    // ========================================
    // CONSTRUCTOR
    // ========================================
    
    /// @notice Initialize the core contract
    /// @param _paymentToken ERC20 token for payments
    /// @param _positionContract Position NFT contract
    /// @param _managerContract Manager contract
    constructor(
        address _paymentToken,
        address _positionContract,
        address _managerContract
    ) {
        if (_paymentToken == address(0) || 
            _positionContract == address(0) || 
            _managerContract == address(0)) {
            revert CE.ZeroAddress();
        }
        
        paymentToken = IERC20(_paymentToken);
        positionContract = ICLMSRPosition(_positionContract);
        managerContract = _managerContract;
        
        // Note: 6 decimals assumed for payment token (USDC)
    }

    // ========================================
    // MARKET MANAGEMENT FUNCTIONS
    // ========================================
    
    /// @inheritdoc ICLMSRMarketCore
    function createMarket(
        uint256 marketId,
        uint32 numTicks,
        uint64 startTimestamp,
        uint64 endTimestamp,
        uint256 liquidityParameter
    ) external override onlyManager whenNotPaused {
        // Validate parameters
        if (_marketExists(marketId)) {
            revert CE.MarketAlreadyExists(marketId);
        }
        
        if (numTicks == 0 || numTicks > MAX_TICK_COUNT) {
            revert CE.TickCountExceedsLimit(numTicks, MAX_TICK_COUNT);
        }
        
        if (startTimestamp >= endTimestamp) {
            revert CE.InvalidTimeRange();
        }
        
        if (liquidityParameter < MIN_LIQUIDITY_PARAMETER || 
            liquidityParameter > MAX_LIQUIDITY_PARAMETER) {
            revert CE.InvalidLiquidityParameter();
        }
        
        // Note: Active market limit check removed - managed by Manager contract
        
        // Create market
        markets[marketId] = Market({
            isActive: true,
            settled: false,
            startTimestamp: startTimestamp,
            endTimestamp: endTimestamp,
            settlementTick: 0,
            numTicks: numTicks,
            liquidityParameter: liquidityParameter
        });
        
        // Initialize segment tree
        LazyMulSegmentTree.init(marketTrees[marketId], numTicks);
        
        // Note: Active market tracking removed - managed by Manager contract
        
        emit MarketCreated(marketId, startTimestamp, endTimestamp, numTicks, liquidityParameter);
    }
    
    /// @inheritdoc ICLMSRMarketCore
    function settleMarket(uint256 marketId, uint32 winningTick) 
        external override onlyManager marketExists(marketId) {
        Market storage market = markets[marketId];
        
        if (market.settled) {
            revert CE.MarketAlreadySettled(marketId);
        }
        
        if (winningTick >= market.numTicks) {
            revert CE.InvalidTick(winningTick, market.numTicks - 1);
        }
        
        // Settle market
        market.settled = true;
        market.settlementTick = winningTick;
        market.isActive = false;
        
        // Note: Active market removal handled by Manager contract
        
        emit MarketSettled(marketId, winningTick);
    }

    // ========================================
    // INTERNAL HELPER FUNCTIONS
    // ========================================
    
    /// @notice Check if market exists
    function _marketExists(uint256 marketId) internal view returns (bool) {
        return markets[marketId].numTicks > 0;
    }
    
    /// @notice Internal function to check if caller is authorized
    function _isAuthorizedCaller(address caller) internal view returns (bool) {
        return caller == managerContract || 
               caller == router || 
               caller == address(positionContract);
    }
    
    /// @notice Pull USDC from user (6-decimal amount)
    function _pullUSDC(address from, uint256 amt6) internal {
        if (amt6 > 0) {
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
        uint32 lowerTick,
        uint32 upperTick,
        uint128 qty6
    ) internal view returns (uint256 costWad) {
        uint256 qtyWad = uint256(qty6).toWad();
        return _calculateTradeCostInternal(marketId, lowerTick, upperTick, qtyWad);
    }
    

    

    


    // ========================================
    // STATE QUERY FUNCTIONS
    // ========================================
    
    /// @inheritdoc ICLMSRMarketCore
    function getMarket(uint256 marketId) 
        external view override returns (Market memory market) {
        if (!_marketExists(marketId)) {
            revert CE.MarketNotFound(marketId);
        }
        return markets[marketId];
    }
    
    /// @inheritdoc ICLMSRMarketCore
    function getTickValue(uint256 marketId, uint32 tick) 
        external view override marketExists(marketId) returns (uint256 value) {
        Market memory market = markets[marketId];
        if (tick >= market.numTicks) {
            revert CE.InvalidTick(tick, market.numTicks - 1);
        }
        return LazyMulSegmentTree.getRangeSum(marketTrees[marketId], tick, tick);
    }
    
    /// @notice Get range sum for market ticks (public view function)
    /// @param marketId Market identifier
    /// @param lo Lower tick (inclusive)
    /// @param hi Upper tick (inclusive)
    /// @return sum Sum of values in range
    function getRangeSum(uint256 marketId, uint32 lo, uint32 hi)
        public
        view
        marketExists(marketId)
        returns (uint256 sum)
    {
        Market memory market = markets[marketId];
        if (hi >= market.numTicks) {
            revert CE.InvalidTick(hi, market.numTicks - 1);
        }
        return LazyMulSegmentTree.getRangeSum(marketTrees[marketId], lo, hi);
    }

    /// @notice Propagate lazy values for market ticks (Keeper only)
    /// @param marketId Market identifier
    /// @param lo Lower tick (inclusive)
    /// @param hi Upper tick (inclusive)
    /// @return sum Sum of values in range after propagation
    function propagateLazy(uint256 marketId, uint32 lo, uint32 hi)
        external
        onlyManager
        marketExists(marketId)
        returns (uint256 sum)
    {
        Market memory market = markets[marketId];
        if (hi >= market.numTicks) {
            revert CE.InvalidTick(hi, market.numTicks - 1);
        }
        return LazyMulSegmentTree.propagateLazy(marketTrees[marketId], lo, hi);
    }

    /// @notice Apply range factor to market ticks (Keeper only)
    /// @param marketId Market identifier
    /// @param lo Lower tick (inclusive)
    /// @param hi Upper tick (inclusive)
    /// @param factor Multiplication factor in WAD format
    function applyRangeFactor(uint256 marketId, uint32 lo, uint32 hi, uint256 factor)
        external
        onlyManager
        marketExists(marketId)
    {
        Market memory market = markets[marketId];
        if (hi >= market.numTicks) {
            revert CE.InvalidTick(hi, market.numTicks - 1);
        }
        LazyMulSegmentTree.applyRangeFactor(marketTrees[marketId], lo, hi, factor);
    }
    
    /// @inheritdoc ICLMSRMarketCore
    function getPositionContract() external view override returns (address) {
        return address(positionContract);
    }
    
    /// @inheritdoc ICLMSRMarketCore
    function getPaymentToken() external view override returns (address) {
        return address(paymentToken);
    }
    
    /// @inheritdoc ICLMSRMarketCore
    function isAuthorizedCaller(address caller) external view override returns (bool) {
        return _isAuthorizedCaller(caller);
    }
    
    /// @inheritdoc ICLMSRMarketCore
    function getManagerContract() external view override returns (address) {
        return managerContract;
    }
    
    /// @inheritdoc ICLMSRMarketCore
    function getRouterContract() external view override returns (address) {
        return router;
    }

    // ========================================
    // EMERGENCY FUNCTIONS
    // ========================================
    
    /// @inheritdoc ICLMSRMarketCore
    function pause(string calldata reason) external override onlyManager {
        _pause(reason);
    }
    
    /// @inheritdoc ICLMSRMarketCore
    function unpause() external override onlyManager {
        _unpause();
    }
    
    /// @notice Internal pause implementation
    function _pause(string memory reason) internal {
        paused = true;
        emit EmergencyPaused(msg.sender, reason);
    }
    
    /// @notice Internal unpause implementation
    function _unpause() internal {
        paused = false;
        emit EmergencyUnpaused(msg.sender);
    }
    
    /// @inheritdoc ICLMSRMarketCore
    function isPaused() external view override returns (bool) {
        return paused;
    }

    // ========================================
    // ROUTER SETUP (One-time only)
    // ========================================
    
    /// @notice Set router contract address (one-time setup)
    /// @param _routerContract Router contract address
    function setRouterContract(address _routerContract) external onlyManager {
        if (router != address(0)) {
            revert CE.RouterAlreadySet();
        }
        if (_routerContract == address(0)) {
            revert CE.ZeroAddress();
        }
        router = _routerContract;
        emit RouterSet(_routerContract);
    }

    // ========================================
    // EXECUTION FUNCTIONS
    // ========================================
    
    /// @inheritdoc ICLMSRMarketCore
    function openPosition(
        address trader,
        uint256 marketId,
        uint32 lowerTick,
        uint32 upperTick,
        uint128 quantity,
        uint256 maxCost
    ) external override onlyAuthorized whenNotPaused nonReentrant returns (uint256 positionId) {
        // Validate parameters
        if (trader == address(0)) {
            revert CE.ZeroAddress();
        }
        
        if (quantity == 0) {
            revert CE.InvalidQuantity(quantity);
        }
        
        Market storage market = markets[marketId];
        if (!_marketExists(marketId)) {
            revert CE.MarketNotFound(marketId);
        }
        
        if (!market.isActive) {
            revert CE.MarketNotActive();
        }
        
        // Validate market timing
        if (block.timestamp < market.startTimestamp) {
            revert CE.MarketNotStarted();
        }
        
        if (block.timestamp > market.endTimestamp) {
            // Deactivate expired market
            market.isActive = false;
            revert CE.MarketExpired();
        }
        
        if (lowerTick > upperTick || upperTick >= market.numTicks) {
            revert CE.InvalidTickRange(lowerTick, upperTick);
        }
        
        // Calculate trade cost and convert to 6-decimal with round-up to prevent zero-cost attacks
        uint256 costWad = _calcCostInWad(marketId, lowerTick, upperTick, quantity);
        uint256 cost6 = costWad.fromWadRoundUp();
        
        if (cost6 > maxCost) {
            revert CE.CostExceedsMaximum(cost6, maxCost);
        }
        
        // Transfer payment from trader
        _pullUSDC(trader, cost6);
        
        // Update market state using WAD quantity
        uint256 qtyWad = uint256(quantity).toWad();
        _applyBuyFactorToRange(marketId, lowerTick, upperTick, qtyWad);
        
        // Mint position NFT with original 6-decimal quantity (storage unchanged)
        positionId = positionContract.mintPosition(
            trader,
            marketId,
            lowerTick,
            upperTick,
            quantity
        );
        
        emit PositionOpened(
            positionId,
            trader,
            marketId,
            lowerTick,
            upperTick,
            quantity,
            cost6
        );
    }
    
    /// @inheritdoc ICLMSRMarketCore
    function increasePosition(
        uint256 positionId,
        uint128 additionalQuantity,
        uint256 maxCost
    ) external override onlyAuthorized whenNotPaused nonReentrant returns (uint128 newQuantity) {
        if (additionalQuantity == 0) {
            revert CE.InvalidQuantity(additionalQuantity);
        }
        
        // Get position data and validate market
        ICLMSRPosition.Position memory position = positionContract.getPosition(positionId);
        address trader = positionContract.ownerOf(positionId);
        _validateActiveMarket(position.marketId);
        
        // Calculate cost with round-up to prevent zero-cost attacks
        uint256 costWad = _calculateTradeCostInternal(
            position.marketId,
            position.lowerTick,
            position.upperTick,
            uint256(additionalQuantity).toWad()
        );
        uint256 cost6 = costWad.fromWadRoundUp();
        
        if (cost6 > maxCost) {
            revert CE.CostExceedsMaximum(cost6, maxCost);
        }
        
        // Transfer payment from trader
        _pullUSDC(trader, cost6);
        
        // Update market state
        uint256 deltaWad = uint256(additionalQuantity).toWad();
        _applyBuyFactorToRange(position.marketId, position.lowerTick, position.upperTick, deltaWad);
        
        // Update position quantity
        newQuantity = position.quantity + additionalQuantity;
        positionContract.setPositionQuantity(positionId, newQuantity);
        
        emit PositionIncreased(positionId, trader, additionalQuantity, newQuantity, cost6);
    }
    
    /// @inheritdoc ICLMSRMarketCore
    function decreasePosition(
        uint256 positionId,
        uint128 sellQuantity,
        uint256 minProceeds
    ) external override onlyAuthorized whenNotPaused nonReentrant returns (uint128 newQuantity, uint256 proceeds) {
        if (sellQuantity == 0) {
            revert CE.InvalidQuantity(sellQuantity);
        }
        
        // Get position data and validate market
        ICLMSRPosition.Position memory position = positionContract.getPosition(positionId);
        address trader = positionContract.ownerOf(positionId);
        _validateActiveMarket(position.marketId);
        
        if (sellQuantity > position.quantity) {
            revert CE.InvalidQuantity(sellQuantity);
        }
        
        // Calculate proceeds with round-up for fair treatment
        uint256 proceedsWad = _calculateSellProceeds(
            position.marketId,
            position.lowerTick,
            position.upperTick,
            uint256(sellQuantity).toWad()
        );
        proceeds = proceedsWad.fromWadRoundUp();
        
        if (proceeds < minProceeds) {
            revert CE.CostExceedsMaximum(minProceeds, proceeds); // Reusing error for slippage
        }
        
        // Update market state
        uint256 sellDeltaWad = uint256(sellQuantity).toWad();
        _applySellFactorToRange(position.marketId, position.lowerTick, position.upperTick, sellDeltaWad);
        
        // Transfer proceeds to trader
        _pushUSDC(trader, proceeds);
        
        // Update position quantity
        newQuantity = position.quantity - sellQuantity;
        if (newQuantity == 0) {
            // Burn position if quantity becomes zero
            positionContract.burnPosition(positionId);
        } else {
            positionContract.setPositionQuantity(positionId, newQuantity);
        }
        
        emit PositionDecreased(positionId, trader, sellQuantity, newQuantity, proceeds);
    }


    
    /// @inheritdoc ICLMSRMarketCore
    function claimPayout(
        uint256 positionId
    ) external override onlyAuthorized whenNotPaused nonReentrant returns (uint256 payout) {
        // Get position data
        ICLMSRPosition.Position memory position = positionContract.getPosition(positionId);
        address trader = positionContract.ownerOf(positionId);
        
        Market memory market = markets[position.marketId];
        if (!market.settled) {
            revert CE.MarketNotSettled(position.marketId);
        }
        
        // Calculate payout
        payout = _calculateClaimAmount(positionId);
        
        // Transfer payout to trader
        _pushUSDC(trader, payout);
        
        // Burn position NFT (position is claimed)
        positionContract.burnPosition(positionId);
        
        emit PositionClaimed(positionId, trader, payout);
    }

    // ========================================
    // CALCULATION FUNCTIONS
    // ========================================
    
    /// @inheritdoc ICLMSRMarketCore
    function calculateOpenCost(
        uint256 marketId,
        uint32 lowerTick,
        uint32 upperTick,
        uint128 quantity
    ) external view override marketExists(marketId) returns (uint256 cost) {
        // Convert quantity to WAD for internal calculation
        uint256 quantityWad = uint256(quantity).toWad();
        uint256 costWad = _calculateTradeCostInternal(marketId, lowerTick, upperTick, quantityWad);
        // Convert cost back to 6-decimal for external interface with round-up
        return costWad.fromWadRoundUp();
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
        return costWad.fromWadRoundUp();
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
        return proceedsWad.fromWadRoundUp();
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
        return proceedsWad.fromWadRoundUp();
    }
    
    /// @inheritdoc ICLMSRMarketCore
    function calculateClaimAmount(
        uint256 positionId
    ) external view override returns (uint256 amount) {
        return _calculateClaimAmount(positionId);
    }

    // ========================================
    // INTERNAL CALCULATION FUNCTIONS
    // ========================================

    /// @dev Calculate exp(q/α) safely by chunking to avoid overflow
    /// @param q Quantity in WAD format
    /// @param alpha Liquidity parameter in WAD format
    /// @return res Result of exp(q/α) in WAD format
    function _safeExp(uint256 q, uint256 alpha) internal pure returns (uint256 res) {
        uint256 maxPerChunk = alpha.wMul(MAX_EXP_INPUT_WAD); // α * 0.13
        res = FixedPointMathU.WAD; // 1.0
        
        while (q > 0) {
            uint256 chunk = q > maxPerChunk ? maxPerChunk : q;
            uint256 factor = (chunk.wDiv(alpha)).wExp(); // Safe: chunk/α ≤ 0.13
            res = res.wMul(factor);
            q -= chunk;
        }
    }
    
    /// @notice Calculate cost of a trade using CLMSR formula with chunk-split logic
    /// @dev CLMSR formula: C = α * ln(Σ_after / Σ_before) where each tick has exp(q_i/α)
    function _calculateTradeCostInternal(
        uint256 marketId,
        uint32 lowerTick,
        uint32 upperTick,
        uint256 quantity
    ) internal view returns (uint256 cost) {
        Market memory market = markets[marketId];
        uint256 totalQuantity = quantity;
        uint256 alpha = market.liquidityParameter;
        uint256 maxSafeQuantityPerChunk = alpha.wMul(MAX_EXP_INPUT_WAD) - 1; // -1 wei to prevent rounding errors
        
        if (totalQuantity <= maxSafeQuantityPerChunk) {
            // Safe to calculate in single operation
            return _calculateSingleTradeCost(marketId, lowerTick, upperTick, totalQuantity, alpha);
        } else {
            // Split into chunks with proper cumulative calculation
            uint256 sumBefore = LazyMulSegmentTree.getTotalSum(marketTrees[marketId]);
            uint256 affectedSum = LazyMulSegmentTree.getRangeSum(marketTrees[marketId], lowerTick, upperTick);
            
            // Ensure tree is properly initialized
            if (sumBefore == 0) revert CE.TreeNotInitialized();
            
            // Calculate required number of chunks and prevent gas DoS
            uint256 requiredChunks = (totalQuantity + maxSafeQuantityPerChunk - 1) / maxSafeQuantityPerChunk;
            
            if (requiredChunks > MAX_CHUNKS_PER_TX) {
                revert CE.InvalidQuantity(uint128(totalQuantity)); // Quantity too large for single transaction
            }
            
            // Chunk-split with cumulative state tracking
            uint256 totalCost = 0;
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
                if (currentAffectedSum > 0 && factor > type(uint256).max / currentAffectedSum) {
                    // This should not happen due to our adaptive chunking, but add extra safety
                    revert CE.IncompleteChunkProcessing(); // Cannot proceed safely
                }
                
                newAffectedSum = currentAffectedSum.wMul(factor);
                uint256 sumAfter = currentSumBefore - currentAffectedSum + newAffectedSum;
                
                // Calculate cost for this chunk: α * ln(sumAfter / sumBefore)
                if (sumAfter <= currentSumBefore) revert CE.InvalidChunkCalculation();
                uint256 ratio = sumAfter.wDiv(currentSumBefore);
                uint256 chunkCost = alpha.wMul(ratio.wLn());
                totalCost += chunkCost;
                
                // Ensure we make progress to prevent infinite loops
                if (chunkQuantity == 0) {
                    revert CE.IncompleteChunkProcessing(); // Cannot make progress
                }
                
                // Update state for next chunk
                currentSumBefore = sumAfter;
                currentAffectedSum = newAffectedSum;
                remainingQuantity -= chunkQuantity;
                chunkCount++;
            }
            
            // Additional safety check
            if (remainingQuantity != 0) revert CE.IncompleteChunkProcessing();
            
            return totalCost;
        }
    }
    
    /// @notice Calculate cost for a single chunk (small quantity)
    function _calculateSingleTradeCost(
        uint256 marketId,
        uint32 lowerTick,
        uint32 upperTick,
        uint256 quantity,
        uint256 alpha
    ) internal view returns (uint256 cost) {
        // Get current sum before trade using cached total sum
        uint256 sumBefore = LazyMulSegmentTree.getTotalSum(marketTrees[marketId]);
        
        // Calculate multiplicative factor: exp(quantity / α)
        uint256 quantityScaled = quantity.wDiv(alpha);
        uint256 factor = quantityScaled.wExp();
        
        // Calculate sum after trade
        uint256 affectedSum = LazyMulSegmentTree.getRangeSum(marketTrees[marketId], lowerTick, upperTick);
        
        // Ensure tree is properly initialized
        if (sumBefore == 0) revert CE.TreeNotInitialized();
        
        // ✨ Check for overflow before multiplication - fallback to chunked mode if needed
        if (affectedSum > type(uint256).max / factor) {
            // Fallback to chunked calculation to handle large affected sums
            return _calculateTradeCostInternal(marketId, lowerTick, upperTick, quantity);
        }
        
        uint256 sumAfter = sumBefore - affectedSum + affectedSum.wMul(factor);
        // Regular trade: C = α * ln(Σ_after / Σ_before)
        if (sumAfter <= sumBefore) {
            return 0; // No cost if sum doesn't increase
        }
        
        uint256 ratio = sumAfter.wDiv(sumBefore);
        uint256 lnRatio = ratio.wLn();
        cost = alpha.wMul(lnRatio);
    }
    
    /// @notice Calculate proceeds from selling quantity
    /// @dev CLMSR formula with exp(-quantity/α) factor applied to affected ticks
    /// @notice Calculate sell proceeds with safe chunk splitting for large quantities
    function _calculateSellProceeds(
        uint256 marketId,
        uint32 lowerTick,
        uint32 upperTick,
        uint256 quantity
    ) internal view returns (uint256 proceeds) {
        Market memory market = markets[marketId];
        uint256 totalQuantity = quantity;
        uint256 alpha = market.liquidityParameter;
        uint256 maxSafeQuantityPerChunk = alpha.wMul(MAX_EXP_INPUT_WAD) - 1; // -1 wei to prevent rounding errors
        
        if (totalQuantity <= maxSafeQuantityPerChunk) {
            // Safe to calculate in single operation
            return _calculateSingleSellProceeds(marketId, lowerTick, upperTick, totalQuantity, alpha);
        } else {
            // Split into chunks with proper cumulative calculation
            uint256 sumBefore = LazyMulSegmentTree.getTotalSum(marketTrees[marketId]);
            uint256 affectedSum = LazyMulSegmentTree.getRangeSum(marketTrees[marketId], lowerTick, upperTick);
            
            // Ensure tree is properly initialized
            if (sumBefore == 0) revert CE.TreeNotInitialized();
            
            // Calculate required number of chunks and prevent gas DoS
            uint256 requiredChunks = (totalQuantity + maxSafeQuantityPerChunk - 1) / maxSafeQuantityPerChunk;
            
            if (requiredChunks > MAX_CHUNKS_PER_TX) {
                revert CE.InvalidQuantity(uint128(totalQuantity)); // Quantity too large for single transaction
            }
            
            // Chunk-split with cumulative state tracking
            uint256 totalProceeds = 0;
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
                uint256 inverseFactor = FixedPointMathU.WAD.wDiv(factor);
                
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
                    inverseFactor = FixedPointMathU.WAD.wDiv(factor);
                }
                
                // Calculate new sums after this chunk with overflow protection
                uint256 newAffectedSum;
                
                // Additional safety check: verify multiplication won't overflow in wMul
                if (currentAffectedSum > 0 && inverseFactor > type(uint256).max / currentAffectedSum) {
                    // This should not happen due to our adaptive chunking, but add extra safety
                    revert CE.IncompleteChunkProcessing(); // Cannot proceed safely
                }
                
                newAffectedSum = currentAffectedSum.wMul(inverseFactor);
                uint256 sumAfter = currentSumBefore - currentAffectedSum + newAffectedSum;
                
                // Safety check: ensure sumAfter > 0 to prevent division by zero
                if (sumAfter == 0) revert CE.EmptyPoolAfterSell();
                
                // Calculate proceeds for this chunk: α * ln(sumBefore / sumAfter)
                if (currentSumBefore > sumAfter) {
                    uint256 ratio = currentSumBefore.wDiv(sumAfter);
                    uint256 chunkProceeds = alpha.wMul(ratio.wLn());
                    totalProceeds += chunkProceeds;
                }
                
                // Ensure we make progress to prevent infinite loops
                if (chunkQuantity == 0) {
                    revert CE.IncompleteChunkProcessing(); // Cannot make progress
                }
                
                // Update state for next chunk
                currentSumBefore = sumAfter;
                currentAffectedSum = newAffectedSum;
                remainingQuantity -= chunkQuantity;
                chunkCount++;
            }
            
            // Additional safety check
            if (remainingQuantity != 0) revert CE.IncompleteChunkProcessing();
            
            return totalProceeds;
        }
    }
    
    /// @notice Calculate proceeds for a single chunk (small quantity)
    function _calculateSingleSellProceeds(
        uint256 marketId,
        uint32 lowerTick,
        uint32 upperTick,
        uint256 quantity,
        uint256 alpha
    ) internal view returns (uint256 proceeds) {
        // Get current sum before sell using cached total sum
        uint256 sumBefore = LazyMulSegmentTree.getTotalSum(marketTrees[marketId]);
        
        // Calculate multiplicative factor: exp(-quantity / α) = 1 / exp(quantity / α)
        uint256 quantityScaled = quantity.wDiv(alpha);
        uint256 factor = quantityScaled.wExp();
        uint256 inverseFactor = FixedPointMathU.WAD.wDiv(factor);
        
        // Calculate sum after sell
        uint256 affectedSum = LazyMulSegmentTree.getRangeSum(marketTrees[marketId], lowerTick, upperTick);
        
        // ✨ Check for overflow before multiplication - fallback to chunked mode if needed
        if (affectedSum > type(uint256).max / inverseFactor) {
            // Fallback to chunked calculation to handle large affected sums
            return _calculateSellProceeds(marketId, lowerTick, upperTick, quantity);
        }
        
        uint256 sumAfter = sumBefore - affectedSum + affectedSum.wMul(inverseFactor);
        
        // Safety check: ensure sumAfter > 0 to prevent division by zero
        if (sumAfter == 0) revert CE.EmptyPoolAfterSell();
        
        // Ensure tree is properly initialized
        if (sumBefore == 0) revert CE.TreeNotInitialized();
        
        // CLMSR proceeds formula: α * ln(sumBefore / sumAfter)
        if (sumBefore <= sumAfter) {
            return 0; // No proceeds if sum doesn't decrease
        }
        
        uint256 ratio = sumBefore.wDiv(sumAfter);
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
        
        // Check if position covers winning tick
        if (market.settlementTick >= position.lowerTick && 
            market.settlementTick <= position.upperTick) {
            // Position wins - return quantity as payout
            amount = uint256(position.quantity);
        } else {
            // Position loses - no payout
            amount = 0;
        }
    }
    
    /// @notice Update market state for a trade (buy)
    /// @dev Use mulRange to apply exp(quantity/α) factor, with chunk-split for large factors
    function _applyBuyFactorToRange(
        uint256 marketId,
        uint32 lowerTick,
        uint32 upperTick,
        uint256 quantity
    ) internal {
        Market memory market = markets[marketId];
        
        // Apply trade using chunk-split to handle large factors
        _applyFactorChunked(marketId, lowerTick, upperTick, quantity, market.liquidityParameter, true);
    }
    
    /// @notice Update market state for a sell
    /// @dev Use mulRange to apply exp(-quantity/α) factor, with chunk-split for large factors
    function _applySellFactorToRange(
        uint256 marketId,
        uint32 lowerTick,
        uint32 upperTick,
        uint256 quantity
    ) internal {
        Market memory market = markets[marketId];
        
        // Apply sell using chunk-split to handle large factors (inverse)
        _applyFactorChunked(marketId, lowerTick, upperTick, quantity, market.liquidityParameter, false);
    }
    
    /// @notice Apply factor with chunk-split to handle large exponential values
    /// @dev Splits large quantity into safe chunks to avoid factor limits and gas DoS
    /// @param marketId Market identifier
    /// @param lowerTick Lower tick bound
    /// @param upperTick Upper tick bound
    /// @param quantity Total quantity to apply
    /// @param alpha Liquidity parameter
    /// @param isBuy True for buy (positive exp), false for sell (negative exp)
    function _applyFactorChunked(
        uint256 marketId,
        uint32 lowerTick,
        uint32 upperTick,
        uint256 quantity,
        uint256 alpha,
        bool isBuy
    ) internal {
        // Use fixed safe chunk size to avoid overflow in chunk calculations
        // This ensures that quantity/alpha ratios stay within safe bounds
        // for exponential calculations in PRB-Math
        uint256 maxSafeQuantityPerChunk = alpha.wMul(MAX_EXP_INPUT_WAD) - 1; // -1 wei to prevent rounding errors
        
        if (quantity <= maxSafeQuantityPerChunk) {
            // Safe to apply in single operation
            uint256 quantityScaled = quantity.wDiv(alpha);
            uint256 factor = quantityScaled.wExp();
            
            if (!isBuy) {
                // For sell, use inverse factor
                factor = FixedPointMathU.WAD.wDiv(factor);
            }
            
            // Verify factor is within safe bounds
            if (factor < LazyMulSegmentTree.MIN_FACTOR || factor > LazyMulSegmentTree.MAX_FACTOR) revert CE.FactorOutOfBounds();
            
            LazyMulSegmentTree.applyRangeFactor(marketTrees[marketId], lowerTick, upperTick, factor);
        } else {
            // Calculate required number of chunks and prevent gas DoS
            uint256 requiredChunks = (quantity + maxSafeQuantityPerChunk - 1) / maxSafeQuantityPerChunk;
            
            if (requiredChunks > MAX_CHUNKS_PER_TX) {
                revert CE.InvalidQuantity(uint128(quantity)); // Quantity too large for single transaction
            }
            
            // Split into chunks with gas-efficient batch processing
            uint256 remainingQuantity = quantity;
            uint256 chunkCount = 0;
            
            while (remainingQuantity > 0 && chunkCount < MAX_CHUNKS_PER_TX) {
                uint256 chunkQuantity = remainingQuantity > maxSafeQuantityPerChunk 
                    ? maxSafeQuantityPerChunk 
                    : remainingQuantity;
                
                uint256 quantityScaled = chunkQuantity.wDiv(alpha);
                uint256 factor = quantityScaled.wExp();
                
                if (!isBuy) {
                    // For sell, use inverse factor
                    factor = FixedPointMathU.WAD.wDiv(factor);
                }
                
                // Verify factor is within safe bounds for each chunk
                if (factor < LazyMulSegmentTree.MIN_FACTOR || factor > LazyMulSegmentTree.MAX_FACTOR) revert CE.FactorOutOfBounds();
                
                LazyMulSegmentTree.applyRangeFactor(marketTrees[marketId], lowerTick, upperTick, factor);
                
                remainingQuantity -= chunkQuantity;
                chunkCount++;
            }
            
            // Additional safety check
            if (remainingQuantity != 0) revert CE.IncompleteChunkProcessing();
        }
    }

    /// @notice Internal function to validate market is active and timing is correct
    function _validateActiveMarket(uint256 marketId) internal {
        Market storage market = markets[marketId];
        if (!market.isActive) {
            revert CE.MarketNotActive();
        }
        
        // Validate market timing
        if (block.timestamp < market.startTimestamp) {
            revert CE.MarketNotStarted();
        }
        
        if (block.timestamp > market.endTimestamp) {
            // Deactivate expired market
            market.isActive = false;
            revert CE.MarketExpired();
        }
    }
    
    /// @inheritdoc ICLMSRMarketCore
    function closePosition(
        uint256 positionId,
        uint256 minProceeds
    ) external override onlyAuthorized whenNotPaused nonReentrant returns (uint256 proceeds) {
        // Get position data and validate market
        ICLMSRPosition.Position memory position = positionContract.getPosition(positionId);
        address trader = positionContract.ownerOf(positionId);
        _validateActiveMarket(position.marketId);
        
        // Calculate proceeds from closing entire position with round-up for fair treatment
        uint256 positionQuantityWad = FixedPointMathU.toWad(uint256(position.quantity));
        uint256 proceedsWad = _calculateSellProceeds(
            position.marketId,
            position.lowerTick,
            position.upperTick,
            positionQuantityWad
        );
        proceeds = FixedPointMathU.fromWadRoundUp(proceedsWad);
        
        if (proceeds < minProceeds) {
            revert CE.CostExceedsMaximum(minProceeds, proceeds); // Reusing error for slippage
        }
        
        // Update market state (selling entire position)
        _applySellFactorToRange(position.marketId, position.lowerTick, position.upperTick, positionQuantityWad);
        
        // Transfer proceeds to trader
        _pushUSDC(trader, proceeds);
        
        // Burn position NFT
        positionContract.burnPosition(positionId);
        
        emit PositionClosed(positionId, trader, proceeds);
    }
} 