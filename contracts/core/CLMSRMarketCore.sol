// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/ICLMSRMarketCore.sol";
import "../interfaces/ICLMSRPosition.sol";
import {LazyMulSegmentTree} from "../libraries/LazyMulSegmentTree.sol";
import {FixedPointMathU} from "../libraries/FixedPointMath.sol";

/// @title CLMSRMarketCore
/// @notice Core implementation for CLMSR Daily-Market System
/// @dev Immutable contract handling core trading logic and market state
contract CLMSRMarketCore is ICLMSRMarketCore, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using FixedPointMathU for uint256;

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
    
    /// @notice ln(1.25) in WAD format for safe chunk splitting
    uint256 private constant LN_1_25_WAD = 223_143_551_314_209_755_000; // 0.223143551314209755 * 1e18

    // ========================================
    // STATE VARIABLES
    // ========================================
    
    /// @notice Payment token (e.g., USDC, WETH)
    IERC20 public immutable paymentToken;
    
    // Note: Payment token decimals removed - 18 decimals assumed
    
    /// @notice Position NFT contract
    ICLMSRPosition public immutable positionContract;
    
    /// @notice Manager contract address
    address public immutable managerContract;
    
    /// @notice Router contract address
    address public routerContract;
    
    /// @notice Contract pause state
    bool public isPaused;
    
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
            revert UnauthorizedCaller(msg.sender);
        }
        _;
    }
    
    /// @notice Only authorized callers (Manager, Router, Position)
    modifier onlyAuthorized() {
        if (!_isAuthorizedCaller(msg.sender)) {
            revert UnauthorizedCaller(msg.sender);
        }
        _;
    }
    
    /// @notice Contract must not be paused
    modifier whenNotPaused() {
        if (isPaused) {
            revert ContractPaused();
        }
        _;
    }
    
    /// @notice Market must exist
    modifier marketExists(uint256 marketId) {
        if (!_marketExists(marketId)) {
            revert MarketNotFound(marketId);
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
            revert InvalidMarketParameters("Zero address provided");
        }
        
        paymentToken = IERC20(_paymentToken);
        positionContract = ICLMSRPosition(_positionContract);
        managerContract = _managerContract;
        
        // Note: 18 decimals assumed for payment token
    }

    // ========================================
    // MARKET MANAGEMENT FUNCTIONS
    // ========================================
    
    /// @inheritdoc ICLMSRMarketCore
    function createMarket(
        uint256 marketId,
        uint32 tickCount,
        uint64 startTimestamp,
        uint64 endTimestamp,
        uint256 liquidityParameter
    ) external override onlyManager whenNotPaused {
        // Validate parameters
        if (_marketExists(marketId)) {
            revert MarketAlreadyExists(marketId);
        }
        
        if (tickCount == 0 || tickCount > MAX_TICK_COUNT) {
            revert TickCountExceedsLimit(tickCount, MAX_TICK_COUNT);
        }
        
        if (startTimestamp >= endTimestamp) {
            revert InvalidMarketParameters("Invalid time range");
        }
        
        if (liquidityParameter < MIN_LIQUIDITY_PARAMETER || 
            liquidityParameter > MAX_LIQUIDITY_PARAMETER) {
            revert InvalidMarketParameters("Invalid liquidity parameter");
        }
        
        // Note: Active market limit check removed - managed by Manager contract
        
        // Create market
        markets[marketId] = Market({
            isActive: true,
            settled: false,
            startTimestamp: startTimestamp,
            endTimestamp: endTimestamp,
            settlementTick: 0,
            tickCount: tickCount,
            liquidityParameter: liquidityParameter
        });
        
        // Initialize segment tree
        LazyMulSegmentTree.init(marketTrees[marketId], tickCount);
        
        // Note: Active market tracking removed - managed by Manager contract
        
        emit MarketCreated(marketId, startTimestamp, endTimestamp, tickCount, liquidityParameter);
    }
    
    /// @inheritdoc ICLMSRMarketCore
    function settleMarket(uint256 marketId, uint32 winningTick) 
        external override onlyManager marketExists(marketId) {
        Market storage market = markets[marketId];
        
        if (market.settled) {
            revert MarketAlreadySettled(marketId);
        }
        
        if (winningTick >= market.tickCount) {
            revert InvalidTick(winningTick, market.tickCount - 1);
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
        return markets[marketId].tickCount > 0;
    }
    
    /// @notice Internal function to check if caller is authorized
    function _isAuthorizedCaller(address caller) internal view returns (bool) {
        return caller == managerContract || 
               caller == routerContract || 
               caller == address(positionContract);
    }
    

    


    // ========================================
    // STATE QUERY FUNCTIONS
    // ========================================
    
    /// @inheritdoc ICLMSRMarketCore
    function getMarket(uint256 marketId) 
        external view override returns (Market memory market) {
        if (!_marketExists(marketId)) {
            revert MarketNotFound(marketId);
        }
        return markets[marketId];
    }
    
    /// @inheritdoc ICLMSRMarketCore
    function getTickValue(uint256 marketId, uint32 tick) 
        external view override marketExists(marketId) returns (uint256 value) {
        Market memory market = markets[marketId];
        if (tick >= market.tickCount) {
            revert InvalidTick(tick, market.tickCount - 1);
        }
        return LazyMulSegmentTree.query(marketTrees[marketId], tick, tick);
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
        return routerContract;
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
        isPaused = true;
        emit EmergencyPaused(msg.sender, reason);
    }
    
    /// @notice Internal unpause implementation
    function _unpause() internal {
        isPaused = false;
        emit EmergencyUnpaused(msg.sender);
    }

    // ========================================
    // ROUTER SETUP (One-time only)
    // ========================================
    
    /// @notice Set router contract address (one-time setup)
    /// @param _routerContract Router contract address
    function setRouterContract(address _routerContract) external onlyManager {
        if (routerContract != address(0)) {
            revert InvalidMarketParameters("Router already set");
        }
        if (_routerContract == address(0)) {
            revert InvalidMarketParameters("Zero address");
        }
        routerContract = _routerContract;
        emit RouterSet(_routerContract);
    }

    // ========================================
    // EXECUTION FUNCTIONS
    // ========================================
    
    /// @inheritdoc ICLMSRMarketCore
    function executeTradeRange(
        address trader,
        TradeParams calldata params
    ) external override onlyAuthorized whenNotPaused nonReentrant returns (uint256 positionId) {
        // Validate parameters
        if (trader == address(0)) {
            revert InvalidMarketParameters("Zero trader address");
        }
        
        if (params.quantity == 0) {
            revert InvalidQuantity(params.quantity);
        }
        
        Market storage market = markets[params.marketId];
        if (!_marketExists(params.marketId)) {
            revert MarketNotFound(params.marketId);
        }
        
        if (!market.isActive) {
            revert InvalidMarketParameters("Market not active");
        }
        
        // Validate market timing
        if (block.timestamp < market.startTimestamp) {
            revert InvalidMarketParameters("Market not started");
        }
        
        if (block.timestamp > market.endTimestamp) {
            // Deactivate expired market
            market.isActive = false;
            revert InvalidMarketParameters("Market expired");
        }
        
        if (params.lowerTick >= params.upperTick || params.upperTick >= market.tickCount) {
            revert InvalidTickRange(params.lowerTick, params.upperTick);
        }
        
        // Calculate trade cost
        uint256 cost = _calculateTradeCostInternal(
            params.marketId,
            params.lowerTick,
            params.upperTick,
            params.quantity
        );
        
        if (cost > params.maxCost) {
            revert CostExceedsMaximum(cost, params.maxCost);
        }
        
        // Transfer payment from trader (check actual received amount for fee-on-transfer tokens)
        if (cost > 0) {
            uint256 balanceBefore = paymentToken.balanceOf(address(this));
            paymentToken.safeTransferFrom(trader, address(this), cost);
            uint256 balanceAfter = paymentToken.balanceOf(address(this));
            uint256 actualReceived = balanceAfter - balanceBefore;
            
            if (actualReceived < cost) {
                revert InsufficientBalance(trader, cost, actualReceived);
            }
        }
        
        // Update market state BEFORE external calls (reentrancy protection)
        _updateMarketForTrade(params.marketId, params.lowerTick, params.upperTick, params.quantity);
        
        // Mint position NFT (after state changes for reentrancy protection)
        positionId = positionContract.mintPosition(
            trader,
            params.marketId,
            params.lowerTick,
            params.upperTick,
            params.quantity
        );
        
        // Ensure position ID is valid (> 0)
        require(positionId > 0, "Invalid position ID");
        
        emit TradeExecuted(
            params.marketId,
            trader,
            positionId,
            params.lowerTick,
            params.upperTick,
            params.quantity,
            cost
        );
    }
    
    /// @inheritdoc ICLMSRMarketCore
    function executePositionAdjust(
        uint256 positionId,
        int128 quantityDelta,
        uint256 maxCost
    ) external override onlyAuthorized whenNotPaused nonReentrant returns (bool success) {
        // Get position data
        ICLMSRPosition.Position memory position = positionContract.getPosition(positionId);
        address trader = positionContract.ownerOf(positionId);
        
        Market storage market = markets[position.marketId];
        if (!market.isActive) {
            revert InvalidMarketParameters("Market not active");
        }
        
        // Validate market timing
        if (block.timestamp < market.startTimestamp) {
            revert InvalidMarketParameters("Market not started");
        }
        
        if (block.timestamp > market.endTimestamp) {
            // Deactivate expired market
            market.isActive = false;
            revert InvalidMarketParameters("Market expired");
        }
        
        // Calculate new quantity (Long-Only constraint)
        uint128 newQuantity;
        if (quantityDelta >= 0) {
            newQuantity = position.quantity + uint128(quantityDelta);
        } else {
            uint128 deltaAbs = uint128(-quantityDelta);
            if (deltaAbs > position.quantity) {
                revert InvalidQuantity(0); // Would go negative
            }
            newQuantity = position.quantity - deltaAbs;
        }
        
        // Calculate cost/proceeds
        uint256 cost = _calculateAdjustCostInternal(positionId, quantityDelta);
        
        if (quantityDelta > 0) {
            // Buying more - check max cost
            if (cost > maxCost) {
                revert CostExceedsMaximum(cost, maxCost);
            }
            
            // Transfer payment from trader (check actual received amount for fee-on-transfer tokens)
            if (cost > 0) {
                uint256 balanceBefore = paymentToken.balanceOf(address(this));
                paymentToken.safeTransferFrom(trader, address(this), cost);
                uint256 balanceAfter = paymentToken.balanceOf(address(this));
                uint256 actualReceived = balanceAfter - balanceBefore;
                
                if (actualReceived < cost) {
                    revert InsufficientBalance(trader, cost, actualReceived);
                }
            }
            
            // Update market state (positive quantity)
            _updateMarketForTrade(
                position.marketId,
                position.lowerTick,
                position.upperTick,
                uint128(quantityDelta)
            );
        } else {
            // Selling - transfer proceeds to trader
            if (cost > 0) {
                paymentToken.safeTransfer(trader, cost);
            }
            
            // Update market state (negative quantity)
            _updateMarketForSell(
                position.marketId,
                position.lowerTick,
                position.upperTick,
                uint128(-quantityDelta)
            );
        }
        
        // Update position quantity
        if (newQuantity == 0) {
            // Burn position if quantity becomes zero
            // Note: Market state update (sell) was already performed above
            positionContract.burnPosition(positionId);
        } else {
            positionContract.setPositionQuantity(positionId, newQuantity);
        }
        
        // Emit position adjustment event
        emit PositionAdjusted(positionId, trader, quantityDelta, newQuantity, cost);
        return true;
    }
    
    /// @inheritdoc ICLMSRMarketCore
    function executePositionClose(
        uint256 positionId
    ) external override onlyAuthorized whenNotPaused nonReentrant returns (uint256 proceeds) {
        // Get position data
        ICLMSRPosition.Position memory position = positionContract.getPosition(positionId);
        address trader = positionContract.ownerOf(positionId);
        
        Market storage market = markets[position.marketId];
        if (!market.isActive) {
            revert InvalidMarketParameters("Market not active");
        }
        
        // Validate market timing
        if (block.timestamp < market.startTimestamp) {
            revert InvalidMarketParameters("Market not started");
        }
        
        if (block.timestamp > market.endTimestamp) {
            // Deactivate expired market
            market.isActive = false;
            revert InvalidMarketParameters("Market expired");
        }
        
        // Calculate proceeds
        proceeds = _calculateCloseProceeds(positionId);
        
        // Update market state (selling entire position)
        _updateMarketForSell(
            position.marketId,
            position.lowerTick,
            position.upperTick,
            position.quantity
        );
        
        // Transfer proceeds to trader
        if (proceeds > 0) {
            paymentToken.safeTransfer(trader, proceeds);
        }
        
        // Burn position NFT
        positionContract.burnPosition(positionId);
        
        emit PositionClosed(positionId, trader, proceeds);
    }
    
    /// @inheritdoc ICLMSRMarketCore
    function executePositionClaim(
        uint256 positionId
    ) external override onlyAuthorized whenNotPaused nonReentrant returns (uint256 payout) {
        // Get position data
        ICLMSRPosition.Position memory position = positionContract.getPosition(positionId);
        address trader = positionContract.ownerOf(positionId);
        
        Market memory market = markets[position.marketId];
        if (!market.settled) {
            revert MarketNotSettled(position.marketId);
        }
        
        // Calculate payout
        payout = _calculateClaimAmount(positionId);
        
        // Transfer payout to trader
        if (payout > 0) {
            paymentToken.safeTransfer(trader, payout);
        }
        
        // Burn position NFT (position is claimed)
        positionContract.burnPosition(positionId);
        
        emit PositionClaimed(positionId, trader, payout);
    }

    // ========================================
    // CALCULATION FUNCTIONS
    // ========================================
    
    /// @inheritdoc ICLMSRMarketCore
    function calculateTradeCost(
        uint256 marketId,
        uint32 lowerTick,
        uint32 upperTick,
        uint128 quantity
    ) external view override marketExists(marketId) returns (uint256 cost) {
        return _calculateTradeCostInternal(marketId, lowerTick, upperTick, quantity);
    }
    
    /// @inheritdoc ICLMSRMarketCore
    function calculateAdjustCost(
        uint256 positionId,
        int128 quantityDelta
    ) external view override returns (uint256 cost) {
        return _calculateAdjustCostInternal(positionId, quantityDelta);
    }
    
    /// @inheritdoc ICLMSRMarketCore
    function calculateCloseProceeds(
        uint256 positionId
    ) external view override returns (uint256 proceeds) {
        return _calculateCloseProceeds(positionId);
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
    
    /// @notice Calculate cost of a trade using CLMSR formula with chunk-split logic
    /// @dev CLMSR formula: C = α * ln(Σ_after / Σ_before) where each tick has exp(q_i/α)
    function _calculateTradeCostInternal(
        uint256 marketId,
        uint32 lowerTick,
        uint32 upperTick,
        uint128 quantity
    ) internal view returns (uint256 cost) {
        Market memory market = markets[marketId];
        uint256 totalQuantity = uint256(quantity);
        uint256 alpha = market.liquidityParameter;
        uint256 maxSafeQuantityPerChunk = alpha.wMul(LN_1_25_WAD); // ln(1.25) exact value in WAD
        
        if (totalQuantity <= maxSafeQuantityPerChunk) {
            // Safe to calculate in single operation
            return _calculateSingleTradeCost(marketId, lowerTick, upperTick, totalQuantity, alpha);
        } else {
            // Split into chunks with proper cumulative calculation
            uint256 sumBefore = LazyMulSegmentTree.getTotalSum(marketTrees[marketId]);
            uint256 affectedSum = LazyMulSegmentTree.query(marketTrees[marketId], lowerTick, upperTick);
            
            // Handle first trade case
            if (sumBefore == 0) {
                // First trade: C = α * ln(Σ_after)
                uint256 quantityScaled = totalQuantity.wDiv(alpha);
                uint256 totalFactor = quantityScaled.wExp();
                uint256 sumAfter = affectedSum.wMul(totalFactor);
                require(sumAfter > 0, "Empty pool after trade");
                return alpha.wMul(sumAfter.wLn());
            }
            
            // Chunk-split with cumulative state tracking
            uint256 totalCost = 0;
            uint256 remainingQuantity = totalQuantity;
            uint256 currentSumBefore = sumBefore;
            uint256 currentAffectedSum = affectedSum;
            
            while (remainingQuantity > 0) {
                uint256 chunkQuantity = remainingQuantity > maxSafeQuantityPerChunk 
                    ? maxSafeQuantityPerChunk 
                    : remainingQuantity;
                
                // Calculate factor for this chunk
                uint256 quantityScaled = chunkQuantity.wDiv(alpha);
                uint256 factor = quantityScaled.wExp();
                
                // Calculate new sums after this chunk
                uint256 newAffectedSum = currentAffectedSum.wMul(factor);
                uint256 sumAfter = currentSumBefore - currentAffectedSum + newAffectedSum;
                
                // Calculate cost for this chunk: α * ln(sumAfter / sumBefore)
                require(sumAfter > currentSumBefore, "Invalid chunk calculation");
                uint256 ratio = sumAfter.wDiv(currentSumBefore);
                uint256 chunkCost = alpha.wMul(ratio.wLn());
                totalCost += chunkCost;
                
                // Update state for next chunk
                currentSumBefore = sumAfter;
                currentAffectedSum = newAffectedSum;
                remainingQuantity -= chunkQuantity;
            }
            
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
        uint256 affectedSum = LazyMulSegmentTree.query(marketTrees[marketId], lowerTick, upperTick);
        uint256 sumAfter = sumBefore - affectedSum + affectedSum.wMul(factor);
        
        // Handle first trade case when sumBefore = 0
        if (sumBefore == 0) {
            require(sumAfter > 0, "Empty pool after trade");
            // First trade: C = α * ln(Σ_after)
            uint256 lnSumAfter = sumAfter.wLn();
            cost = alpha.wMul(lnSumAfter);
        } else {
            // Regular trade: C = α * ln(Σ_after / Σ_before)
            if (sumAfter <= sumBefore) {
                return 0; // No cost if sum doesn't increase
            }
            
            uint256 ratio = sumAfter.wDiv(sumBefore);
            uint256 lnRatio = ratio.wLn();
            cost = alpha.wMul(lnRatio);
        }
    }
    
    /// @notice Calculate cost of adjusting position
    function _calculateAdjustCostInternal(
        uint256 positionId,
        int128 quantityDelta
    ) internal view returns (uint256 cost) {
        ICLMSRPosition.Position memory position = positionContract.getPosition(positionId);
        
        if (quantityDelta > 0) {
            // Buying more - calculate additional cost
            cost = _calculateTradeCostInternal(
                position.marketId,
                position.lowerTick,
                position.upperTick,
                uint128(quantityDelta)
            );
        } else {
            // Selling - calculate proceeds (negative cost)
            uint128 sellQuantity = uint128(-quantityDelta);
            cost = _calculateSellProceeds(
                position.marketId,
                position.lowerTick,
                position.upperTick,
                sellQuantity
            );
        }
    }
    
    /// @notice Calculate proceeds from selling quantity
    /// @dev CLMSR formula with exp(-quantity/α) factor applied to affected ticks
    /// @notice Calculate sell proceeds with safe chunk splitting for large quantities
    function _calculateSellProceeds(
        uint256 marketId,
        uint32 lowerTick,
        uint32 upperTick,
        uint128 quantity
    ) internal view returns (uint256 proceeds) {
        Market memory market = markets[marketId];
        uint256 totalQuantity = uint256(quantity);
        uint256 alpha = market.liquidityParameter;
        uint256 maxSafeQuantityPerChunk = alpha.wMul(LN_1_25_WAD); // ln(1.25) exact value in WAD
        
        if (totalQuantity <= maxSafeQuantityPerChunk) {
            // Safe to calculate in single operation
            return _calculateSingleSellProceeds(marketId, lowerTick, upperTick, totalQuantity, alpha);
        } else {
            // Split into chunks with proper cumulative calculation
            uint256 sumBefore = LazyMulSegmentTree.getTotalSum(marketTrees[marketId]);
            uint256 affectedSum = LazyMulSegmentTree.query(marketTrees[marketId], lowerTick, upperTick);
            
            // Handle edge case when sumBefore = 0 (shouldn't happen in normal flow)
            if (sumBefore == 0) {
                return 0; // No proceeds if starting from empty pool
            }
            
            // Chunk-split with cumulative state tracking
            uint256 totalProceeds = 0;
            uint256 remainingQuantity = totalQuantity;
            uint256 currentSumBefore = sumBefore;
            uint256 currentAffectedSum = affectedSum;
            
            while (remainingQuantity > 0) {
                uint256 chunkQuantity = remainingQuantity > maxSafeQuantityPerChunk 
                    ? maxSafeQuantityPerChunk 
                    : remainingQuantity;
                
                // Calculate inverse factor for this chunk: 1 / exp(quantity/α)
                uint256 quantityScaled = chunkQuantity.wDiv(alpha);
                uint256 factor = quantityScaled.wExp();
                uint256 inverseFactor = FixedPointMathU.WAD.wDiv(factor);
                
                // Calculate new sums after this chunk
                uint256 newAffectedSum = currentAffectedSum.wMul(inverseFactor);
                uint256 sumAfter = currentSumBefore - currentAffectedSum + newAffectedSum;
                
                // Safety check: ensure sumAfter > 0 to prevent division by zero
                require(sumAfter > 0, "Empty pool after sell chunk");
                
                // Calculate proceeds for this chunk: α * ln(sumBefore / sumAfter)
                if (currentSumBefore > sumAfter) {
                    uint256 ratio = currentSumBefore.wDiv(sumAfter);
                    uint256 chunkProceeds = alpha.wMul(ratio.wLn());
                    totalProceeds += chunkProceeds;
                }
                
                // Update state for next chunk
                currentSumBefore = sumAfter;
                currentAffectedSum = newAffectedSum;
                remainingQuantity -= chunkQuantity;
            }
            
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
        uint256 affectedSum = LazyMulSegmentTree.query(marketTrees[marketId], lowerTick, upperTick);
        uint256 sumAfter = sumBefore - affectedSum + affectedSum.wMul(inverseFactor);
        
        // Safety check: ensure sumAfter > 0 to prevent division by zero
        require(sumAfter > 0, "Empty pool after sell");
        
        // Handle edge case when sumBefore = 0 (shouldn't happen in normal flow)
        if (sumBefore == 0) {
            return 0; // No proceeds if starting from empty pool
        }
        
        // CLMSR proceeds formula: α * ln(sumBefore / sumAfter)
        if (sumBefore <= sumAfter) {
            return 0; // No proceeds if sum doesn't decrease
        }
        
        uint256 ratio = sumBefore.wDiv(sumAfter);
        uint256 lnRatio = ratio.wLn();
        proceeds = alpha.wMul(lnRatio);
    }
    
    /// @notice Calculate proceeds from closing entire position
    function _calculateCloseProceeds(uint256 positionId) internal view returns (uint256 proceeds) {
        ICLMSRPosition.Position memory position = positionContract.getPosition(positionId);
        
        proceeds = _calculateSellProceeds(
            position.marketId,
            position.lowerTick,
            position.upperTick,
            position.quantity
        );
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
    function _updateMarketForTrade(
        uint256 marketId,
        uint32 lowerTick,
        uint32 upperTick,
        uint128 quantity
    ) internal {
        Market memory market = markets[marketId];
        
        // Apply trade using chunk-split to handle large factors
        _applyFactorWithChunkSplit(marketId, lowerTick, upperTick, uint256(quantity), market.liquidityParameter, true);
    }
    
    /// @notice Update market state for a sell
    /// @dev Use mulRange to apply exp(-quantity/α) factor, with chunk-split for large factors
    function _updateMarketForSell(
        uint256 marketId,
        uint32 lowerTick,
        uint32 upperTick,
        uint128 quantity
    ) internal {
        Market memory market = markets[marketId];
        
        // Apply sell using chunk-split to handle large factors (inverse)
        _applyFactorWithChunkSplit(marketId, lowerTick, upperTick, uint256(quantity), market.liquidityParameter, false);
    }
    
    /// @notice Apply factor with chunk-split to handle large exponential values
    /// @dev Splits large quantity into safe chunks to avoid factor limits
    /// @param marketId Market identifier
    /// @param lowerTick Lower tick bound
    /// @param upperTick Upper tick bound
    /// @param quantity Total quantity to apply
    /// @param alpha Liquidity parameter
    /// @param isBuy True for buy (positive exp), false for sell (negative exp)
    function _applyFactorWithChunkSplit(
        uint256 marketId,
        uint32 lowerTick,
        uint32 upperTick,
        uint256 quantity,
        uint256 alpha,
        bool isBuy
    ) internal {
        // Maximum safe factor is 1.25 to stay within LazyMulSegmentTree limits
        // So max safe quantity per chunk is: alpha * ln(1.25) ≈ 0.2231 * alpha
        // Use accurate ln(1.25) value for safe chunk splitting
        uint256 maxSafeQuantityPerChunk = alpha.wMul(LN_1_25_WAD); // ln(1.25) exact value in WAD
        
        if (quantity <= maxSafeQuantityPerChunk) {
            // Safe to apply in single operation
            uint256 quantityScaled = quantity.wDiv(alpha);
            uint256 factor = quantityScaled.wExp();
            
            if (!isBuy) {
                // For sell, use inverse factor
                factor = FixedPointMathU.WAD.wDiv(factor);
            }
            
            // Verify factor is within safe bounds
            require(factor >= LazyMulSegmentTree.MIN_FACTOR && factor <= LazyMulSegmentTree.MAX_FACTOR, "Factor out of bounds");
            
            LazyMulSegmentTree.mulRange(marketTrees[marketId], lowerTick, upperTick, factor);
        } else {
            // Split into chunks
            uint256 remainingQuantity = quantity;
            
            while (remainingQuantity > 0) {
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
                require(factor >= LazyMulSegmentTree.MIN_FACTOR && factor <= LazyMulSegmentTree.MAX_FACTOR, "Factor out of bounds");
                
                LazyMulSegmentTree.mulRange(marketTrees[marketId], lowerTick, upperTick, factor);
                
                remainingQuantity -= chunkQuantity;
            }
        }
    }
} 