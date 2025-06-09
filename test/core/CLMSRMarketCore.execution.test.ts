import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { EXTREME_COST } from "./CLMSRMarketCore.fixtures";

describe("CLMSRMarketCore - Trade Execution", function () {
  const WAD = ethers.parseEther("1");
  const INITIAL_SUPPLY = ethers.parseUnits("1000000000", 6); // 1B USDC
  const ALPHA = ethers.parseEther("1"); // Larger alpha to keep factors within bounds
  const TICK_COUNT = 100;
  const MARKET_DURATION = 7 * 24 * 60 * 60;

  // Test constants - using 6-decimal values for USDC compatibility
  const SMALL_QUANTITY = ethers.parseUnits("0.01", 6); // 0.01 USDC
  const MEDIUM_QUANTITY = ethers.parseUnits("0.05", 6); // 0.05 USDC
  const LARGE_QUANTITY = ethers.parseUnits("0.1", 6); // 0.1 USDC
  const SMALL_COST = ethers.parseUnits("1", 6); // 1 USDC
  const MEDIUM_COST = ethers.parseUnits("5", 6); // 5 USDC
  const LARGE_COST = ethers.parseUnits("10", 6); // 10 USDC

  async function deployFixture() {
    const [deployer, keeper, router, alice, bob] = await ethers.getSigners();

    const FixedPointMathUFactory = await ethers.getContractFactory(
      "FixedPointMathU"
    );
    const fixedPointMathU = await FixedPointMathUFactory.deploy();
    await fixedPointMathU.waitForDeployment();

    const LazyMulSegmentTreeFactory = await ethers.getContractFactory(
      "LazyMulSegmentTree",
      {
        libraries: { FixedPointMathU: await fixedPointMathU.getAddress() },
      }
    );
    const lazyMulSegmentTree = await LazyMulSegmentTreeFactory.deploy();
    await lazyMulSegmentTree.waitForDeployment();

    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    const paymentToken = await MockERC20Factory.deploy("Test USDC", "USDC", 6);
    await paymentToken.waitForDeployment();

    await paymentToken.mint(alice.address, INITIAL_SUPPLY);
    await paymentToken.mint(bob.address, INITIAL_SUPPLY);

    const MockPositionFactory = await ethers.getContractFactory("MockPosition");
    const mockPosition = await MockPositionFactory.deploy();
    await mockPosition.waitForDeployment();

    const CLMSRMarketCoreFactory = await ethers.getContractFactory(
      "CLMSRMarketCore",
      {
        libraries: {
          FixedPointMathU: await fixedPointMathU.getAddress(),
          LazyMulSegmentTree: await lazyMulSegmentTree.getAddress(),
        },
      }
    );

    const core = await CLMSRMarketCoreFactory.deploy(
      await paymentToken.getAddress(),
      await mockPosition.getAddress(),
      keeper.address
    );
    await core.waitForDeployment();

    // Mint tokens to core contract for position claims
    await paymentToken.mint(await core.getAddress(), INITIAL_SUPPLY);

    await mockPosition.setCore(await core.getAddress());
    await core.connect(keeper).setRouterContract(router.address);

    await paymentToken
      .connect(alice)
      .approve(await core.getAddress(), ethers.MaxUint256);
    await paymentToken
      .connect(bob)
      .approve(await core.getAddress(), ethers.MaxUint256);

    return {
      core,
      paymentToken,
      mockPosition,
      deployer,
      keeper,
      router,
      alice,
      bob,
    };
  }

  async function createActiveMarketFixture() {
    const contracts = await loadFixture(deployFixture);
    const { core, keeper } = contracts;

    const currentTime = await time.latest();
    const startTime = currentTime + 100;
    const endTime = startTime + MARKET_DURATION;
    const marketId = 1;

    await core
      .connect(keeper)
      .createMarket(marketId, TICK_COUNT, startTime, endTime, ALPHA);
    await time.increaseTo(startTime + 1);

    return { ...contracts, marketId, startTime, endTime };
  }

  describe("Trade Execution", function () {
    it("Should execute trade range successfully", async function () {
      const { core, router, alice, paymentToken, mockPosition, marketId } =
        await loadFixture(createActiveMarketFixture);

      const tradeParams = {
        marketId: marketId,
        lowerTick: 45,
        upperTick: 55,
        quantity: SMALL_QUANTITY,
        maxCost: MEDIUM_COST,
      };

      const balanceBefore = await paymentToken.balanceOf(alice.address);

      await expect(
        core.connect(router).executeTradeRange(alice.address, tradeParams)
      ).to.emit(core, "TradeExecuted");

      expect(await mockPosition.balanceOf(alice.address)).to.equal(1);

      const balanceAfter = await paymentToken.balanceOf(alice.address);
      expect(balanceAfter).to.be.lt(balanceBefore);
    });

    it("Should revert trade with insufficient max cost", async function () {
      const { core, router, alice, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      const tradeParams = {
        marketId: marketId,
        lowerTick: 45,
        upperTick: 55,
        quantity: LARGE_QUANTITY, // Large quantity
        maxCost: ethers.parseUnits("0.01", 6), // Very small max cost (6 decimals)
      };

      await expect(
        core.connect(router).executeTradeRange(alice.address, tradeParams)
      ).to.be.revertedWithCustomError(core, "CostExceedsMaximum");
    });

    it("Should handle invalid tick range", async function () {
      const { core, router, alice, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      const tradeParams = {
        marketId: marketId,
        lowerTick: 55, // Upper > Lower
        upperTick: 45,
        quantity: SMALL_QUANTITY,
        maxCost: MEDIUM_COST,
      };

      await expect(
        core.connect(router).executeTradeRange(alice.address, tradeParams)
      ).to.be.revertedWithCustomError(core, "InvalidTickRange");
    });

    it("Should handle zero quantity", async function () {
      const { core, router, alice, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      const tradeParams = {
        marketId: marketId,
        lowerTick: 45,
        upperTick: 55,
        quantity: 0,
        maxCost: MEDIUM_COST,
      };

      await expect(
        core.connect(router).executeTradeRange(alice.address, tradeParams)
      ).to.be.revertedWithCustomError(core, "InvalidQuantity");
    });

    it("Should handle tick out of bounds", async function () {
      const { core, router, alice, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      const tradeParams = {
        marketId: marketId,
        lowerTick: 45,
        upperTick: TICK_COUNT, // At limit
        quantity: SMALL_QUANTITY,
        maxCost: MEDIUM_COST,
      };

      await expect(
        core.connect(router).executeTradeRange(alice.address, tradeParams)
      ).to.be.revertedWithCustomError(core, "InvalidTickRange");
    });
  });

  describe("Position Adjustment", function () {
    it("Should adjust position quantity upward", async function () {
      const { core, router, alice, paymentToken, mockPosition, marketId } =
        await loadFixture(createActiveMarketFixture);

      // Create initial position
      const tradeParams = {
        marketId: marketId,
        lowerTick: 45,
        upperTick: 55,
        quantity: MEDIUM_QUANTITY,
        maxCost: MEDIUM_COST,
      };

      await core.connect(router).executeTradeRange(alice.address, tradeParams);
      const positionId = await mockPosition.tokenOfOwnerByIndex(
        alice.address,
        0
      );

      const balanceBefore = await paymentToken.balanceOf(alice.address);

      // Adjust position upward
      await expect(
        core.connect(router).executePositionAdjust(
          positionId,
          SMALL_QUANTITY, // Add more
          MEDIUM_COST
        )
      ).to.emit(core, "PositionAdjusted");

      const balanceAfter = await paymentToken.balanceOf(alice.address);
      expect(balanceAfter).to.be.lt(balanceBefore); // Paid more

      const position = await mockPosition.getPosition(positionId);
      expect(position.quantity).to.equal(MEDIUM_QUANTITY + SMALL_QUANTITY);
    });

    it("Should adjust position quantity downward", async function () {
      const { core, router, alice, paymentToken, mockPosition, marketId } =
        await loadFixture(createActiveMarketFixture);

      // Create initial position
      const tradeParams = {
        marketId: marketId,
        lowerTick: 45,
        upperTick: 55,
        quantity: LARGE_QUANTITY,
        maxCost: LARGE_COST,
      };

      await core.connect(router).executeTradeRange(alice.address, tradeParams);
      const positionId = await mockPosition.tokenOfOwnerByIndex(
        alice.address,
        0
      );

      const balanceBefore = await paymentToken.balanceOf(alice.address);

      // Adjust position downward
      await expect(
        core.connect(router).executePositionAdjust(
          positionId,
          -MEDIUM_QUANTITY, // Sell some
          0 // No max cost for selling
        )
      ).to.emit(core, "PositionAdjusted");

      const balanceAfter = await paymentToken.balanceOf(alice.address);
      expect(balanceAfter).to.be.gt(balanceBefore); // Received proceeds

      const position = await mockPosition.getPosition(positionId);
      expect(position.quantity).to.equal(LARGE_QUANTITY - MEDIUM_QUANTITY);
    });

    it("Should revert adjustment of non-existent position", async function () {
      const { core, router } = await loadFixture(createActiveMarketFixture);

      await expect(
        core.connect(router).executePositionAdjust(
          999, // Non-existent position
          SMALL_QUANTITY,
          MEDIUM_COST
        )
      ).to.be.revertedWithCustomError(core, "PositionNotFound");
    });
  });

  describe("Position Closing", function () {
    it("Should close position successfully", async function () {
      const { core, router, alice, paymentToken, mockPosition, marketId } =
        await loadFixture(createActiveMarketFixture);

      // Create position
      const tradeParams = {
        marketId: marketId,
        lowerTick: 45,
        upperTick: 55,
        quantity: MEDIUM_QUANTITY,
        maxCost: MEDIUM_COST,
      };

      await core.connect(router).executeTradeRange(alice.address, tradeParams);
      const positionId = await mockPosition.tokenOfOwnerByIndex(
        alice.address,
        0
      );

      const balanceBefore = await paymentToken.balanceOf(alice.address);

      await expect(
        core.connect(router).executePositionClose(positionId)
      ).to.emit(core, "PositionClosed");

      const balanceAfter = await paymentToken.balanceOf(alice.address);
      expect(balanceAfter).to.be.gt(balanceBefore); // Received proceeds

      // Position should be burned
      expect(await mockPosition.balanceOf(alice.address)).to.equal(0);
    });

    it("Should revert close of non-existent position", async function () {
      const { core, router } = await loadFixture(createActiveMarketFixture);

      await expect(
        core.connect(router).executePositionClose(999)
      ).to.be.revertedWithCustomError(core, "PositionNotFound");
    });
  });

  describe("Position Claiming", function () {
    it("Should claim winning position after settlement", async function () {
      const {
        core,
        keeper,
        router,
        alice,
        paymentToken,
        mockPosition,
        marketId,
      } = await loadFixture(createActiveMarketFixture);

      // Create position
      const tradeParams = {
        marketId: marketId,
        lowerTick: 45,
        upperTick: 55,
        quantity: MEDIUM_QUANTITY,
        maxCost: MEDIUM_COST,
      };

      await core.connect(router).executeTradeRange(alice.address, tradeParams);
      const positionId = await mockPosition.tokenOfOwnerByIndex(
        alice.address,
        0
      );

      // Settle market with winning tick in range
      await core.connect(keeper).settleMarket(marketId, 50);

      const balanceBefore = await paymentToken.balanceOf(alice.address);

      await expect(
        core.connect(router).executePositionClaim(positionId)
      ).to.emit(core, "PositionClaimed");

      const balanceAfter = await paymentToken.balanceOf(alice.address);
      expect(balanceAfter).to.be.gt(balanceBefore); // Received payout
    });

    it("Should handle losing position claim", async function () {
      const { core, keeper, router, alice, mockPosition, marketId } =
        await loadFixture(createActiveMarketFixture);

      // Create position
      const tradeParams = {
        marketId: marketId,
        lowerTick: 45,
        upperTick: 55,
        quantity: MEDIUM_QUANTITY,
        maxCost: MEDIUM_COST,
      };

      await core.connect(router).executeTradeRange(alice.address, tradeParams);
      const positionId = await mockPosition.tokenOfOwnerByIndex(
        alice.address,
        0
      );

      // Settle market with winning tick outside range
      await core.connect(keeper).settleMarket(marketId, 80);

      // Should still emit event but with 0 payout
      await expect(
        core.connect(router).executePositionClaim(positionId)
      ).to.emit(core, "PositionClaimed");
    });

    it("Should revert claim before settlement", async function () {
      const { core, router, alice, mockPosition, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Create position
      const tradeParams = {
        marketId: marketId,
        lowerTick: 45,
        upperTick: 55,
        quantity: MEDIUM_QUANTITY,
        maxCost: MEDIUM_COST,
      };

      await core.connect(router).executeTradeRange(alice.address, tradeParams);
      const positionId = await mockPosition.tokenOfOwnerByIndex(
        alice.address,
        0
      );

      // Try to claim before settlement
      await expect(
        core.connect(router).executePositionClaim(positionId)
      ).to.be.revertedWithCustomError(core, "MarketNotSettled");
    });
  });

  describe("Cost Calculations", function () {
    it("Should calculate trade cost correctly", async function () {
      const { core, marketId } = await loadFixture(createActiveMarketFixture);

      const cost = await core.calculateTradeCost(
        marketId,
        45,
        55,
        MEDIUM_QUANTITY
      );

      expect(cost).to.be.gt(0);
      expect(cost).to.be.lt(ethers.parseEther("100")); // Reasonable upper bound
    });

    it("Should calculate adjust cost correctly", async function () {
      const { core, router, alice, mockPosition, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Create position first
      const tradeParams = {
        marketId: marketId,
        lowerTick: 45,
        upperTick: 55,
        quantity: MEDIUM_QUANTITY,
        maxCost: MEDIUM_COST,
      };

      await core.connect(router).executeTradeRange(alice.address, tradeParams);
      const positionId = await mockPosition.tokenOfOwnerByIndex(
        alice.address,
        0
      );

      // Calculate cost for increasing position
      const increaseCost = await core.calculateAdjustCost(
        positionId,
        SMALL_QUANTITY
      );
      expect(increaseCost).to.be.gt(0);

      // Calculate cost for decreasing position (should return proceeds, not 0)
      const decreaseCost = await core.calculateAdjustCost(
        positionId,
        -SMALL_QUANTITY
      );
      expect(decreaseCost).to.be.gt(0); // Should return proceeds from selling
    });

    it("Should calculate close proceeds correctly", async function () {
      const { core, router, alice, mockPosition, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Create position first
      const tradeParams = {
        marketId: marketId,
        lowerTick: 45,
        upperTick: 55,
        quantity: MEDIUM_QUANTITY,
        maxCost: MEDIUM_COST,
      };

      await core.connect(router).executeTradeRange(alice.address, tradeParams);
      const positionId = await mockPosition.tokenOfOwnerByIndex(
        alice.address,
        0
      );

      const proceeds = await core.calculateCloseProceeds(positionId);
      expect(proceeds).to.be.gt(0);
    });

    it("Should calculate claim amount correctly", async function () {
      const { core, keeper, router, alice, mockPosition, marketId } =
        await loadFixture(createActiveMarketFixture);

      // Create position first
      const tradeParams = {
        marketId: marketId,
        lowerTick: 45,
        upperTick: 55,
        quantity: MEDIUM_QUANTITY,
        maxCost: MEDIUM_COST,
      };

      await core.connect(router).executeTradeRange(alice.address, tradeParams);
      const positionId = await mockPosition.tokenOfOwnerByIndex(
        alice.address,
        0
      );

      // Before settlement, claim amount should be 0
      let claimAmount = await core.calculateClaimAmount(positionId);
      expect(claimAmount).to.equal(0);

      // After settlement with winning tick
      await core.connect(keeper).settleMarket(marketId, 50);
      claimAmount = await core.calculateClaimAmount(positionId);
      expect(claimAmount).to.be.gt(0);
    });
  });

  describe("Authorization", function () {
    it("Should only allow router to execute trades", async function () {
      const { core, alice, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      const tradeParams = {
        marketId: marketId,
        lowerTick: 45,
        upperTick: 55,
        quantity: MEDIUM_QUANTITY,
        maxCost: MEDIUM_COST,
      };

      await expect(
        core.connect(alice).executeTradeRange(alice.address, tradeParams)
      ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");
    });
  });

  describe("Market State Restrictions", function () {
    it("Should prevent trading on non-existent market", async function () {
      const { core, router, alice } = await loadFixture(deployFixture);

      const tradeParams = {
        marketId: 999, // Non-existent
        lowerTick: 45,
        upperTick: 55,
        quantity: MEDIUM_QUANTITY,
        maxCost: MEDIUM_COST,
      };

      await expect(
        core.connect(router).executeTradeRange(alice.address, tradeParams)
      ).to.be.revertedWithCustomError(core, "MarketNotFound");
    });

    it("Should prevent trading when paused", async function () {
      const { core, keeper, router, alice, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      await core.connect(keeper).pause("Emergency pause");

      const tradeParams = {
        marketId: marketId,
        lowerTick: 45,
        upperTick: 55,
        quantity: MEDIUM_QUANTITY,
        maxCost: MEDIUM_COST,
      };

      await expect(
        core.connect(router).executeTradeRange(alice.address, tradeParams)
      ).to.be.revertedWithCustomError(core, "ContractPaused");
    });
  });

  // ========================================
  // ADDITIONAL EDGE CASES & STRESS TESTS
  // ========================================

  describe("Advanced Edge Cases", function () {
    it("Should handle maximum tick range trades", async function () {
      const { core, router, alice, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      const tradeParams = {
        marketId: marketId,
        lowerTick: 0,
        upperTick: TICK_COUNT - 1, // Full range
        quantity: SMALL_QUANTITY,
        maxCost: ethers.parseEther("100"), // High max cost for full range
      };

      await expect(
        core.connect(router).executeTradeRange(alice.address, tradeParams)
      ).to.emit(core, "TradeExecuted");
    });

    it("Should handle single tick trades", async function () {
      const { core, router, alice, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      const tradeParams = {
        marketId: marketId,
        lowerTick: 50,
        upperTick: 50, // Single tick
        quantity: SMALL_QUANTITY,
        maxCost: MEDIUM_COST,
      };

      // Single tick trades should now be allowed
      await expect(
        core.connect(router).executeTradeRange(alice.address, tradeParams)
      )
        .to.emit(core, "TradeExecuted")
        .withArgs(
          marketId,
          alice.address,
          1, // positionId
          50, // lowerTick
          50, // upperTick
          SMALL_QUANTITY,
          anyValue // cost
        );

      // Verify position was created correctly
      const position = await core.positionContract();
      const mockPosition = await ethers.getContractAt("MockPosition", position);
      const positionData = await mockPosition.getPosition(1);
      expect(positionData.lowerTick).to.equal(50);
      expect(positionData.upperTick).to.equal(50);
      expect(positionData.quantity).to.equal(SMALL_QUANTITY);
    });

    it("Should handle very large quantity trades with chunking", async function () {
      const { core, router, alice, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Use a quantity that will trigger chunking but stay within safe bounds
      // With alpha = 0.1e18, max safe chunk = alpha * 0.13 ≈ 0.013 * 1e18
      // So use quantity > 0.013 to trigger chunking
      const largeQuantity = ethers.parseUnits("0.02", 6); // Will trigger chunking (6 decimals)
      const tradeParams = {
        marketId: marketId,
        lowerTick: 45,
        upperTick: 55,
        quantity: largeQuantity,
        maxCost: ethers.parseUnits("10", 6), // High max cost (6 decimals)
      };

      await expect(
        core.connect(router).executeTradeRange(alice.address, tradeParams)
      ).to.emit(core, "TradeExecuted");
    });

    it("Should handle multiple consecutive trades on same range", async function () {
      const { core, router, alice, bob, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      const tradeParams = {
        marketId: marketId,
        lowerTick: 45,
        upperTick: 55,
        quantity: SMALL_QUANTITY,
        maxCost: MEDIUM_COST,
      };

      // Execute multiple trades
      await core.connect(router).executeTradeRange(alice.address, tradeParams);
      await core.connect(router).executeTradeRange(bob.address, tradeParams);
      await core.connect(router).executeTradeRange(alice.address, tradeParams);

      // All should succeed with increasing costs
      const finalCost = await core.calculateTradeCost(
        marketId,
        45,
        55,
        SMALL_QUANTITY
      );
      expect(finalCost).to.be.gt(0);
    });

    it("Should handle overlapping range trades", async function () {
      const { core, router, alice, bob, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // First trade: range [40, 60]
      await core.connect(router).executeTradeRange(alice.address, {
        marketId: marketId,
        lowerTick: 40,
        upperTick: 60,
        quantity: SMALL_QUANTITY,
        maxCost: MEDIUM_COST,
      });

      // Second trade: overlapping range [50, 70]
      await core.connect(router).executeTradeRange(bob.address, {
        marketId: marketId,
        lowerTick: 50,
        upperTick: 70,
        quantity: SMALL_QUANTITY,
        maxCost: MEDIUM_COST,
      });

      // Both should succeed
      expect(await core.getMarket(marketId)).to.not.be.reverted;
    });

    it("Should handle position adjustments with extreme values", async function () {
      const { core, router, alice, mockPosition, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Create initial position with larger quantity
      await core.connect(router).executeTradeRange(alice.address, {
        marketId: marketId,
        lowerTick: 45,
        upperTick: 55,
        quantity: ethers.parseUnits("0.05", 6), // Use 0.05 USDC (6 decimals)
        maxCost: ethers.parseUnits("10", 6), // 10 USDC max cost (6 decimals)
      });

      const positionId = await mockPosition.tokenOfOwnerByIndex(
        alice.address,
        0
      );

      // Test very small adjustment
      await core
        .connect(router)
        .executePositionAdjust(positionId, 1, MEDIUM_COST);

      // Test moderate negative adjustment (partial close) - safe amount
      const partialDecrease = -ethers.parseUnits("0.01", 6); // Small partial decrease (6 decimals)
      await core
        .connect(router)
        .executePositionAdjust(positionId, partialDecrease, MEDIUM_COST);

      // Test adjustment that would exceed position quantity should revert
      const position = await mockPosition.getPosition(positionId);
      const excessiveDecrease = -(position.quantity + 1n); // More than position quantity
      await expect(
        core
          .connect(router)
          .executePositionAdjust(positionId, excessiveDecrease, MEDIUM_COST)
      ).to.be.revertedWithCustomError(core, "InvalidQuantity");
    });
  });

  describe("Gas Optimization Tests", function () {
    it("Should demonstrate gas efficiency of batch operations", async function () {
      const { core, router, alice, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Measure gas for individual trades
      const individualGasUsed = [];
      for (let i = 0; i < 3; i++) {
        const tx = await core.connect(router).executeTradeRange(alice.address, {
          marketId: marketId,
          lowerTick: 40 + i,
          upperTick: 60 + i,
          quantity: SMALL_QUANTITY,
          maxCost: MEDIUM_COST,
        });
        const receipt = await tx.wait();
        individualGasUsed.push(receipt!.gasUsed);
      }

      // Verify gas usage is reasonable - adjusted for actual gas consumption
      for (const gasUsed of individualGasUsed) {
        expect(gasUsed).to.be.lt(1200000); // Adjusted to realistic gas limit
        expect(gasUsed).to.be.gt(0); // Ensure gas was actually used
      }
    });

    it("Should handle gas-intensive calculations efficiently", async function () {
      const { core, marketId } = await loadFixture(createActiveMarketFixture);

      // Test cost calculation for various scenarios
      const scenarios = [
        { lower: 0, upper: 10, quantity: SMALL_QUANTITY },
        { lower: 45, upper: 55, quantity: MEDIUM_QUANTITY },
        { lower: 90, upper: 99, quantity: LARGE_QUANTITY },
      ];

      for (const scenario of scenarios) {
        const cost = await core.calculateTradeCost(
          marketId,
          scenario.lower,
          scenario.upper,
          scenario.quantity
        );
        expect(cost).to.be.gt(0);
      }
    });
  });

  describe("Market Lifecycle Edge Cases", function () {
    it("Should handle rapid market state changes", async function () {
      const { core, keeper, router, alice, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Execute trade
      await core.connect(router).executeTradeRange(alice.address, {
        marketId: marketId,
        lowerTick: 45,
        upperTick: 55,
        quantity: SMALL_QUANTITY,
        maxCost: MEDIUM_COST,
      });

      // Immediately settle market
      await core.connect(keeper).settleMarket(marketId, 50);

      // Verify market state
      const marketInfo = await core.getMarket(marketId);
      expect(marketInfo.settled).to.be.true;
    });

    it("Should handle edge case settlement ticks", async function () {
      const { core, keeper, router, alice, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Create position
      await core.connect(router).executeTradeRange(alice.address, {
        marketId: marketId,
        lowerTick: 45,
        upperTick: 55,
        quantity: SMALL_QUANTITY,
        maxCost: MEDIUM_COST,
      });

      // Test settlement at exact boundaries
      await core.connect(keeper).settleMarket(marketId, 45); // Lower boundary

      const marketInfo = await core.getMarket(marketId);
      expect(marketInfo.settlementTick).to.equal(45);
    });

    it("Should handle position claims with zero payouts gracefully", async function () {
      const { core, keeper, router, alice, mockPosition, marketId } =
        await loadFixture(createActiveMarketFixture);

      // Create position
      await core.connect(router).executeTradeRange(alice.address, {
        marketId: marketId,
        lowerTick: 45,
        upperTick: 55,
        quantity: SMALL_QUANTITY,
        maxCost: MEDIUM_COST,
      });

      const positionId = await mockPosition.tokenOfOwnerByIndex(
        alice.address,
        0
      );

      // Settle outside position range
      await core.connect(keeper).settleMarket(marketId, 80);

      // Claim should succeed with zero payout
      await expect(
        core.connect(router).executePositionClaim(positionId)
      ).to.emit(core, "PositionClaimed");
    });
  });

  describe("Numerical Precision Tests", function () {
    it("Should maintain precision with very small quantities", async function () {
      const { core, router, alice, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      const verySmallQuantity = 1; // 1 wei
      const tradeParams = {
        marketId: marketId,
        lowerTick: 45,
        upperTick: 55,
        quantity: verySmallQuantity,
        maxCost: MEDIUM_COST,
      };

      await expect(
        core.connect(router).executeTradeRange(alice.address, tradeParams)
      ).to.emit(core, "TradeExecuted");
    });

    it("Should handle precision in cost calculations", async function () {
      const { core, marketId } = await loadFixture(createActiveMarketFixture);

      // Test with various quantity scales (6 decimals for USDC)
      const quantities = [
        1, // 1 wei
        ethers.parseUnits("0.000001", 6), // 1 micro USDC
        ethers.parseUnits("0.001", 6), // 1 milli USDC
        ethers.parseUnits("0.01", 6), // 1 centi USDC
      ];

      for (const quantity of quantities) {
        const cost = await core.calculateTradeCost(marketId, 45, 55, quantity);
        expect(cost).to.be.gte(0); // Should not underflow
      }
    });

    it("Should handle rounding in position adjustments", async function () {
      const { core, router, alice, mockPosition, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Create position with odd quantity (6 decimals)
      const oddQuantity = ethers.parseUnits("0.123456", 6); // 0.123456 USDC
      await core.connect(router).executeTradeRange(alice.address, {
        marketId: marketId,
        lowerTick: 45,
        upperTick: 55,
        quantity: oddQuantity,
        maxCost: MEDIUM_COST,
      });

      const positionId = await mockPosition.tokenOfOwnerByIndex(
        alice.address,
        0
      );

      // Adjust with another odd quantity
      const oddAdjustment = ethers.parseUnits("0.098765", 6); // 0.098765 USDC
      await core
        .connect(router)
        .executePositionAdjust(positionId, oddAdjustment, MEDIUM_COST);

      // Should handle precision correctly
      const position = await mockPosition.getPosition(positionId);
      expect(position.quantity).to.be.gt(oddQuantity);
    });
  });

  describe("Advanced Trading Logic", function () {
    it("Should prevent trading after market settlement", async function () {
      const { core, keeper, router, alice, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Settle market first
      await core.connect(keeper).settleMarket(marketId, 50);

      const tradeParams = {
        marketId,
        lowerTick: 45,
        upperTick: 55,
        quantity: SMALL_QUANTITY,
        maxCost: MEDIUM_COST,
      };

      await expect(
        core.connect(router).executeTradeRange(alice.address, tradeParams)
      ).to.be.revertedWithCustomError(core, "InvalidMarketParameters");
    });

    it("Should deactivate market when trading after expiry", async function () {
      const { core, router, alice, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Move time past market end
      const market = await core.getMarket(marketId);
      await time.increaseTo(market.endTimestamp + 1n);

      const tradeParams = {
        marketId,
        lowerTick: 45,
        upperTick: 55,
        quantity: SMALL_QUANTITY,
        maxCost: MEDIUM_COST,
      };

      await expect(
        core.connect(router).executeTradeRange(alice.address, tradeParams)
      ).to.be.revertedWithCustomError(core, "InvalidMarketParameters");
    });

    it("Should handle invalid tick ranges", async function () {
      const { core, router, alice, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Test lowerTick > upperTick
      await expect(
        core.connect(router).executeTradeRange(alice.address, {
          marketId,
          lowerTick: 55,
          upperTick: 45,
          quantity: SMALL_QUANTITY,
          maxCost: MEDIUM_COST,
        })
      ).to.be.revertedWithCustomError(core, "InvalidTickRange");

      // Test upperTick >= tickCount
      const market = await core.getMarket(marketId);
      await expect(
        core.connect(router).executeTradeRange(alice.address, {
          marketId,
          lowerTick: 45,
          upperTick: market.tickCount,
          quantity: SMALL_QUANTITY,
          maxCost: MEDIUM_COST,
        })
      ).to.be.revertedWithCustomError(core, "InvalidTickRange");
    });

    it("Should burn position NFT when quantity becomes zero", async function () {
      const { core, router, alice, mockPosition, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Create position
      await core.connect(router).executeTradeRange(alice.address, {
        marketId,
        lowerTick: 45,
        upperTick: 55,
        quantity: SMALL_QUANTITY,
        maxCost: MEDIUM_COST,
      });

      const positionId = await mockPosition.tokenOfOwnerByIndex(
        alice.address,
        0
      );
      const position = await mockPosition.getPosition(positionId);

      // Adjust position to zero
      const negativeAdjustment = -BigInt(position.quantity);
      await core
        .connect(router)
        .executePositionAdjust(positionId, negativeAdjustment, 0);

      // Position should be burned
      await expect(
        mockPosition.getPosition(positionId)
      ).to.be.revertedWithCustomError(mockPosition, "PositionNotFound");
    });

    it("Should handle quantityDelta of zero", async function () {
      const { core, router, alice, mockPosition, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Create position
      await core.connect(router).executeTradeRange(alice.address, {
        marketId,
        lowerTick: 45,
        upperTick: 55,
        quantity: SMALL_QUANTITY,
        maxCost: MEDIUM_COST,
      });

      const positionId = await mockPosition.tokenOfOwnerByIndex(
        alice.address,
        0
      );

      // Adjust with zero delta (should be no-op)
      await expect(core.connect(router).executePositionAdjust(positionId, 0, 0))
        .to.not.be.reverted;

      // Position should remain unchanged
      const position = await mockPosition.getPosition(positionId);
      expect(position.quantity).to.equal(SMALL_QUANTITY);
    });

    it("Should prevent selling more than position quantity", async function () {
      const { core, router, alice, mockPosition, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Create position
      await core.connect(router).executeTradeRange(alice.address, {
        marketId,
        lowerTick: 45,
        upperTick: 55,
        quantity: SMALL_QUANTITY,
        maxCost: MEDIUM_COST,
      });

      const positionId = await mockPosition.tokenOfOwnerByIndex(
        alice.address,
        0
      );

      // Try to sell more than position quantity
      const excessiveSell = -(BigInt(SMALL_QUANTITY) + 1n);
      await expect(
        core.connect(router).executePositionAdjust(positionId, excessiveSell, 0)
      ).to.be.revertedWithCustomError(core, "InvalidQuantity");
    });

    it("Should handle double claim attempts", async function () {
      const { core, keeper, router, alice, mockPosition, marketId } =
        await loadFixture(createActiveMarketFixture);

      // Create position
      await core.connect(router).executeTradeRange(alice.address, {
        marketId,
        lowerTick: 45,
        upperTick: 55,
        quantity: SMALL_QUANTITY,
        maxCost: MEDIUM_COST,
      });

      const positionId = await mockPosition.tokenOfOwnerByIndex(
        alice.address,
        0
      );

      // Settle market with winning tick
      await core.connect(keeper).settleMarket(marketId, 50);

      // First claim should succeed
      await expect(core.connect(router).executePositionClaim(positionId)).to.not
        .be.reverted;

      // Second claim should fail (position burned)
      await expect(
        core.connect(router).executePositionClaim(positionId)
      ).to.be.revertedWithCustomError(mockPosition, "PositionNotFound");
    });

    it("Should handle losing position claims", async function () {
      const { core, keeper, router, alice, mockPosition, marketId } =
        await loadFixture(createActiveMarketFixture);

      // Create position
      await core.connect(router).executeTradeRange(alice.address, {
        marketId,
        lowerTick: 45,
        upperTick: 55,
        quantity: SMALL_QUANTITY,
        maxCost: MEDIUM_COST,
      });

      const positionId = await mockPosition.tokenOfOwnerByIndex(
        alice.address,
        0
      );

      // Settle market with losing tick (outside position range)
      await core.connect(keeper).settleMarket(marketId, 80);

      // Claim should succeed with zero payout
      await expect(core.connect(router).executePositionClaim(positionId))
        .to.emit(core, "PositionClaimed")
        .withArgs(positionId, alice.address, 0);
    });
  });

  describe("Position NFT Double Usage", function () {
    it("Should handle adjust then close sequence", async function () {
      const { core, router, alice, mockPosition, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Calculate actual cost first
      const actualCost = await core.calculateTradeCost(
        marketId,
        45,
        55,
        MEDIUM_QUANTITY
      );

      // Create position
      await core.connect(router).executeTradeRange(alice.address, {
        marketId,
        lowerTick: 45,
        upperTick: 55,
        quantity: MEDIUM_QUANTITY,
        maxCost: actualCost + ethers.parseUnits("1000000", 6), // Add 1M USDC buffer
      });

      const positionId = await mockPosition.tokenOfOwnerByIndex(
        alice.address,
        0
      );

      // Calculate adjust cost first
      const adjustCost = await core.calculateAdjustCost(
        positionId,
        SMALL_QUANTITY
      );

      // Adjust position upward
      await core.connect(router).executePositionAdjust(
        positionId,
        SMALL_QUANTITY,
        adjustCost + ethers.parseUnits("1000000", 6) // Add buffer
      );

      // Then close position
      await expect(core.connect(router).executePositionClose(positionId)).to.not
        .be.reverted;

      // Position should be burned
      await expect(
        mockPosition.getPosition(positionId)
      ).to.be.revertedWithCustomError(mockPosition, "PositionNotFound");
    });

    it("Should prevent operations on closed positions", async function () {
      const { core, router, alice, mockPosition, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Calculate actual cost first
      const actualCost = await core.calculateTradeCost(
        marketId,
        45,
        55,
        MEDIUM_QUANTITY
      );

      // Create position
      await core.connect(router).executeTradeRange(alice.address, {
        marketId,
        lowerTick: 45,
        upperTick: 55,
        quantity: MEDIUM_QUANTITY,
        maxCost: actualCost + ethers.parseUnits("1000000", 6), // Add 1M USDC buffer
      });

      const positionId = await mockPosition.tokenOfOwnerByIndex(
        alice.address,
        0
      );

      // Close position
      await core.connect(router).executePositionClose(positionId);

      // Try to adjust closed position
      await expect(
        core
          .connect(router)
          .executePositionAdjust(
            positionId,
            SMALL_QUANTITY,
            ethers.parseUnits("1000000", 6)
          )
      ).to.be.revertedWithCustomError(mockPosition, "PositionNotFound");
    });
  });
});
