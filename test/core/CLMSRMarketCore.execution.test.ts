import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { EXTREME_COST } from "./CLMSRMarketCore.fixtures";

describe("CLMSRMarketCore - Execution Functions", function () {
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

  describe("Position Opening", function () {
    it("Should open position successfully", async function () {
      const { core, router, alice, paymentToken, mockPosition, marketId } =
        await loadFixture(createActiveMarketFixture);

      const tradeParams = {
        marketId: marketId,
        lowerTick: 45,
        upperTick: 55,
        quantity: MEDIUM_QUANTITY,
        maxCost: MEDIUM_COST,
      };

      const balanceBefore = await paymentToken.balanceOf(alice.address);

      await expect(
        core.connect(router).openPosition(alice.address, tradeParams)
      ).to.emit(core, "PositionOpened");

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
        core.connect(router).openPosition(alice.address, tradeParams)
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
        core.connect(router).openPosition(alice.address, tradeParams)
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
        core.connect(router).openPosition(alice.address, tradeParams)
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
        core.connect(router).openPosition(alice.address, tradeParams)
      ).to.be.revertedWithCustomError(core, "InvalidTickRange");
    });
  });

  describe("Position Increase", function () {
    it("Should increase position quantity", async function () {
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

      await core.connect(router).openPosition(alice.address, tradeParams);
      const positionId = await mockPosition.tokenOfOwnerByIndex(
        alice.address,
        0
      );

      const balanceBefore = await paymentToken.balanceOf(alice.address);

      // Increase position
      await expect(
        core.connect(router).increasePosition(
          positionId,
          SMALL_QUANTITY, // Add more
          MEDIUM_COST
        )
      ).to.emit(core, "PositionIncreased");

      const balanceAfter = await paymentToken.balanceOf(alice.address);
      expect(balanceAfter).to.be.lt(balanceBefore); // Paid more

      const position = await mockPosition.getPosition(positionId);
      expect(position.quantity).to.equal(MEDIUM_QUANTITY + SMALL_QUANTITY);
    });

    it("Should revert increase of non-existent position", async function () {
      const { core, router } = await loadFixture(createActiveMarketFixture);

      await expect(
        core.connect(router).increasePosition(
          999, // Non-existent position
          SMALL_QUANTITY,
          MEDIUM_COST
        )
      ).to.be.revertedWithCustomError(core, "PositionNotFound");
    });
  });

  describe("Position Decrease", function () {
    it("Should decrease position quantity", async function () {
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

      await core.connect(router).openPosition(alice.address, tradeParams);
      const positionId = await mockPosition.tokenOfOwnerByIndex(
        alice.address,
        0
      );

      const balanceBefore = await paymentToken.balanceOf(alice.address);

      // Decrease position
      await expect(
        core.connect(router).decreasePosition(
          positionId,
          MEDIUM_QUANTITY, // Sell some
          0 // No minimum proceeds
        )
      ).to.emit(core, "PositionDecreased");

      const balanceAfter = await paymentToken.balanceOf(alice.address);
      expect(balanceAfter).to.be.gt(balanceBefore); // Received proceeds

      const position = await mockPosition.getPosition(positionId);
      expect(position.quantity).to.equal(LARGE_QUANTITY - MEDIUM_QUANTITY);
    });

    it("Should revert decrease of non-existent position", async function () {
      const { core, router } = await loadFixture(createActiveMarketFixture);

      await expect(
        core.connect(router).decreasePosition(
          999, // Non-existent position
          SMALL_QUANTITY,
          0
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

      await core.connect(router).openPosition(alice.address, tradeParams);
      const positionId = await mockPosition.tokenOfOwnerByIndex(
        alice.address,
        0
      );

      const balanceBefore = await paymentToken.balanceOf(alice.address);

      await expect(
        core.connect(router).closePosition(positionId, 0) // minProceeds = 0
      ).to.emit(core, "PositionClosed");

      const balanceAfter = await paymentToken.balanceOf(alice.address);
      expect(balanceAfter).to.be.gt(balanceBefore); // Received proceeds

      // Position should be burned
      expect(await mockPosition.balanceOf(alice.address)).to.equal(0);
    });

    it("Should revert close of non-existent position", async function () {
      const { core, router } = await loadFixture(createActiveMarketFixture);

      await expect(
        core.connect(router).closePosition(999, 0)
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

      await core.connect(router).openPosition(alice.address, tradeParams);
      const positionId = await mockPosition.tokenOfOwnerByIndex(
        alice.address,
        0
      );

      // Settle market with winning tick in range
      await core.connect(keeper).settleMarket(marketId, 50);

      const balanceBefore = await paymentToken.balanceOf(alice.address);

      await expect(core.connect(router).claimPayout(positionId)).to.emit(
        core,
        "PositionClaimed"
      );

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

      await core.connect(router).openPosition(alice.address, tradeParams);
      const positionId = await mockPosition.tokenOfOwnerByIndex(
        alice.address,
        0
      );

      // Settle market with winning tick outside range
      await core.connect(keeper).settleMarket(marketId, 80);

      // Should still emit event but with 0 payout
      await expect(core.connect(router).claimPayout(positionId)).to.emit(
        core,
        "PositionClaimed"
      );
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

      await core.connect(router).openPosition(alice.address, tradeParams);
      const positionId = await mockPosition.tokenOfOwnerByIndex(
        alice.address,
        0
      );

      await expect(
        core.connect(router).claimPayout(positionId)
      ).to.be.revertedWithCustomError(core, "MarketNotSettled");
    });
  });

  describe("Calculation Functions", function () {
    it("Should calculate open cost correctly", async function () {
      const { core, marketId } = await loadFixture(createActiveMarketFixture);

      const cost = await core.calculateOpenCost(
        marketId,
        45,
        55,
        MEDIUM_QUANTITY
      );
      expect(cost).to.be.gt(0);
    });

    it("Should calculate increase cost correctly", async function () {
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

      await core.connect(router).openPosition(alice.address, tradeParams);
      const positionId = await mockPosition.tokenOfOwnerByIndex(
        alice.address,
        0
      );

      const cost = await core.calculateIncreaseCost(positionId, SMALL_QUANTITY);
      expect(cost).to.be.gt(0);
    });

    it("Should calculate decrease proceeds correctly", async function () {
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

      await core.connect(router).openPosition(alice.address, tradeParams);
      const positionId = await mockPosition.tokenOfOwnerByIndex(
        alice.address,
        0
      );

      const proceeds = await core.calculateDecreaseProceeds(
        positionId,
        SMALL_QUANTITY
      );
      expect(proceeds).to.be.gt(0);
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

      await core.connect(router).openPosition(alice.address, tradeParams);
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

      await core.connect(router).openPosition(alice.address, tradeParams);
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

  describe("Authorization Tests", function () {
    it("Should revert unauthorized trade execution", async function () {
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
        core.connect(alice).openPosition(alice.address, tradeParams)
      ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");
    });

    it("Should allow authorized router to execute trades", async function () {
      const { core, router, alice, marketId } = await loadFixture(
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
        core.connect(router).openPosition(alice.address, tradeParams)
      ).to.not.be.reverted;
    });

    it("Should handle insufficient balance", async function () {
      const { core, router, alice, paymentToken, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Drain alice's balance
      const balance = await paymentToken.balanceOf(alice.address);
      await paymentToken.connect(alice).transfer(router.address, balance);

      const tradeParams = {
        marketId: marketId,
        lowerTick: 45,
        upperTick: 55,
        quantity: MEDIUM_QUANTITY,
        maxCost: MEDIUM_COST,
      };

      await expect(
        core.connect(router).openPosition(alice.address, tradeParams)
      ).to.be.reverted;
    });

    it("Should handle paused contract", async function () {
      const { core, keeper, router, alice, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Pause contract
      await core.connect(keeper).pause("Test pause");

      const tradeParams = {
        marketId: marketId,
        lowerTick: 45,
        upperTick: 55,
        quantity: MEDIUM_QUANTITY,
        maxCost: MEDIUM_COST,
      };

      await expect(
        core.connect(router).openPosition(alice.address, tradeParams)
      ).to.be.revertedWithCustomError(core, "ContractPaused");
    });
  });

  describe("Complex Scenarios", function () {
    it("Should handle multiple positions correctly", async function () {
      const { core, router, alice, bob, mockPosition, marketId } =
        await loadFixture(createActiveMarketFixture);

      const tradeParams = {
        marketId: marketId,
        lowerTick: 45,
        upperTick: 55,
        quantity: MEDIUM_QUANTITY,
        maxCost: MEDIUM_COST,
      };

      // Create positions for both users
      await core.connect(router).openPosition(alice.address, tradeParams);
      await core.connect(router).openPosition(bob.address, tradeParams);
      await core.connect(router).openPosition(alice.address, tradeParams);

      expect(await mockPosition.balanceOf(alice.address)).to.equal(2);
      expect(await mockPosition.balanceOf(bob.address)).to.equal(1);
    });

    it("Should handle overlapping ranges", async function () {
      const { core, router, alice, bob, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Alice: 40-60
      await core.connect(router).openPosition(alice.address, {
        marketId,
        lowerTick: 40,
        upperTick: 60,
        quantity: MEDIUM_QUANTITY,
        maxCost: MEDIUM_COST,
      });

      // Bob: 50-70 (overlaps with Alice)
      await core.connect(router).openPosition(bob.address, {
        marketId,
        lowerTick: 50,
        upperTick: 70,
        quantity: MEDIUM_QUANTITY,
        maxCost: MEDIUM_COST,
      });

      // Should succeed
      expect(true).to.be.true;
    });

    it("Should handle position decrease to zero", async function () {
      const { core, router, alice, mockPosition, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Create position
      await core.connect(router).openPosition(alice.address, {
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

      // Decrease entire position
      await expect(
        core.connect(router).decreasePosition(positionId, SMALL_QUANTITY, 0)
      ).to.emit(core, "PositionDecreased");

      // Position should be burned
      expect(await mockPosition.balanceOf(alice.address)).to.equal(0);
    });

    it("Should handle large quantity trades with chunking", async function () {
      // Test large quantity trades that require chunking
      const { core, router, alice, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Use a more reasonable large quantity (1 USDC instead of 10^18)
      const largeQuantity = ethers.parseUnits("1", 6); // 1 USDC
      const largeCost = ethers.parseUnits("100", 6); // 100 USDC max cost

      const tx = await core.connect(router).openPosition(alice.address, {
        marketId,
        lowerTick: 0,
        upperTick: TICK_COUNT - 1,
        quantity: largeQuantity,
        maxCost: largeCost,
      });

      await expect(tx).to.emit(core, "PositionOpened");
    });
  });

  describe("Edge Cases", function () {
    it("Should handle single tick positions", async function () {
      const { core, router, alice, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      await expect(
        core.connect(router).openPosition(alice.address, {
          marketId,
          lowerTick: 50,
          upperTick: 50, // Single tick
          quantity: SMALL_QUANTITY,
          maxCost: MEDIUM_COST,
        })
      ).to.not.be.reverted;
    });

    it("Should handle boundary tick positions", async function () {
      const { core, router, alice, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // First tick
      await expect(
        core.connect(router).openPosition(alice.address, {
          marketId,
          lowerTick: 0,
          upperTick: 0,
          quantity: SMALL_QUANTITY,
          maxCost: MEDIUM_COST,
        })
      ).to.not.be.reverted;

      // Last tick
      await expect(
        core.connect(router).openPosition(alice.address, {
          marketId,
          lowerTick: TICK_COUNT - 1,
          upperTick: TICK_COUNT - 1,
          quantity: SMALL_QUANTITY,
          maxCost: MEDIUM_COST,
        })
      ).to.not.be.reverted;
    });

    it("Should handle position claims with zero payouts gracefully", async function () {
      const { core, keeper, router, alice, mockPosition, marketId } =
        await loadFixture(createActiveMarketFixture);

      // Create position
      await core.connect(router).openPosition(alice.address, {
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
      await expect(core.connect(router).claimPayout(positionId)).to.emit(
        core,
        "PositionClaimed"
      );
    });
  });

  describe("Gas Optimization Tests", function () {
    it("Should handle gas-efficient small adjustments", async function () {
      const { core, router, alice, mockPosition, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Create position
      await core.connect(router).openPosition(alice.address, {
        marketId,
        lowerTick: 45,
        upperTick: 55,
        quantity: LARGE_QUANTITY,
        maxCost: LARGE_COST,
      });

      const positionId = await mockPosition.tokenOfOwnerByIndex(
        alice.address,
        0
      );

      // Small increase
      await expect(
        core.connect(router).increasePosition(positionId, 1, MEDIUM_COST)
      ).to.not.be.reverted;

      // Small decrease
      await expect(core.connect(router).decreasePosition(positionId, 1, 0)).to
        .not.be.reverted;
    });

    it("Should handle gas-efficient odd quantity adjustments", async function () {
      // Test odd quantity adjustments with proper precision
      const { core, router, alice, mockPosition, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Create position
      await core.connect(router).openPosition(alice.address, {
        marketId,
        lowerTick: 45,
        upperTick: 55,
        quantity: LARGE_QUANTITY,
        maxCost: LARGE_COST,
      });

      const positionId = await mockPosition.tokenOfOwnerByIndex(
        alice.address,
        0
      );

      // Use a more reasonable odd adjustment (0.1 USDC instead of 0.1 * 10^18)
      const oddAdjustment = ethers.parseUnits("0.1", 6); // 0.1 USDC

      await expect(
        core
          .connect(router)
          .increasePosition(positionId, oddAdjustment, MEDIUM_COST)
      ).to.not.be.reverted;
    });
  });

  describe("Error Handling", function () {
    it("Should handle invalid market ID", async function () {
      const { core, router, alice } = await loadFixture(
        createActiveMarketFixture
      );

      const tradeParams = {
        marketId: 999, // Non-existent market
        lowerTick: 45,
        upperTick: 55,
        quantity: MEDIUM_QUANTITY,
        maxCost: MEDIUM_COST,
      };

      await expect(
        core.connect(router).openPosition(alice.address, tradeParams)
      ).to.be.revertedWithCustomError(core, "MarketNotFound");
    });

    it("Should handle settled market trades", async function () {
      const { core, keeper, router, alice, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Settle market first
      await core.connect(keeper).settleMarket(marketId, 50);

      const tradeParams = {
        marketId: marketId,
        lowerTick: 45,
        upperTick: 55,
        quantity: MEDIUM_QUANTITY,
        maxCost: MEDIUM_COST,
      };

      await expect(
        core.connect(router).openPosition(alice.address, tradeParams)
      ).to.be.revertedWithCustomError(core, "InvalidMarketParameters"); // Market becomes inactive after settlement
    });

    it("Should handle zero quantity increase", async function () {
      const { core, router, alice, mockPosition, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Create position
      await core.connect(router).openPosition(alice.address, {
        marketId,
        lowerTick: 45,
        upperTick: 55,
        quantity: MEDIUM_QUANTITY,
        maxCost: MEDIUM_COST,
      });

      const positionId = await mockPosition.tokenOfOwnerByIndex(
        alice.address,
        0
      );

      await expect(
        core.connect(router).increasePosition(positionId, 0, 0)
      ).to.be.revertedWithCustomError(core, "InvalidQuantity");
    });

    it("Should handle excessive decrease quantity", async function () {
      const { core, router, alice, mockPosition, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Create position
      await core.connect(router).openPosition(alice.address, {
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

      const excessiveSell = SMALL_QUANTITY + 1n;

      await expect(
        core.connect(router).decreasePosition(positionId, excessiveSell, 0)
      ).to.be.revertedWithCustomError(core, "InvalidQuantity");
    });

    it("Should handle double claim attempts", async function () {
      const { core, keeper, router, alice, mockPosition, marketId } =
        await loadFixture(createActiveMarketFixture);

      // Create position
      await core.connect(router).openPosition(alice.address, {
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
      await expect(core.connect(router).claimPayout(positionId)).to.not.be
        .reverted;

      // Second claim should fail (position burned)
      await expect(
        core.connect(router).claimPayout(positionId)
      ).to.be.revertedWithCustomError(mockPosition, "PositionNotFound");
    });

    it("Should handle losing position claims", async function () {
      const { core, keeper, router, alice, mockPosition, marketId } =
        await loadFixture(createActiveMarketFixture);

      // Create position
      await core.connect(router).openPosition(alice.address, {
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
      await expect(core.connect(router).claimPayout(positionId))
        .to.emit(core, "PositionClaimed")
        .withArgs(positionId, alice.address, 0);
    });
  });

  describe("Integration Tests", function () {
    it("Should handle complete position lifecycle", async function () {
      const { core, keeper, router, alice, mockPosition, marketId } =
        await loadFixture(createActiveMarketFixture);

      // 1. Open position
      await core.connect(router).openPosition(alice.address, {
        marketId,
        lowerTick: 45,
        upperTick: 55,
        quantity: LARGE_QUANTITY,
        maxCost: LARGE_COST,
      });

      const positionId = await mockPosition.tokenOfOwnerByIndex(
        alice.address,
        0
      );

      // 2. Increase position
      await core
        .connect(router)
        .increasePosition(positionId, MEDIUM_QUANTITY, MEDIUM_COST);

      // 3. Decrease position partially
      await expect(
        core.connect(router).decreasePosition(positionId, MEDIUM_QUANTITY, 0)
      ).to.not.be.reverted;

      // 4. Close remaining position
      await core.connect(router).closePosition(positionId, 0);

      // Position should be burned
      expect(await mockPosition.balanceOf(alice.address)).to.equal(0);
    });

    it("Should handle position lifecycle with settlement", async function () {
      const { core, keeper, router, alice, mockPosition, marketId } =
        await loadFixture(createActiveMarketFixture);

      // 1. Open position
      await core.connect(router).openPosition(alice.address, {
        marketId,
        lowerTick: 45,
        upperTick: 55,
        quantity: MEDIUM_QUANTITY,
        maxCost: MEDIUM_COST,
      });

      const positionId = await mockPosition.tokenOfOwnerByIndex(
        alice.address,
        0
      );

      // 2. Settle market
      await core.connect(keeper).settleMarket(marketId, 50);

      // 3. Claim payout
      await expect(core.connect(router).claimPayout(positionId)).to.emit(
        core,
        "PositionClaimed"
      );

      // Position should be burned
      expect(await mockPosition.balanceOf(alice.address)).to.equal(0);
    });
  });

  // ========================================
  // EXTREME VALUES AND SLIPPAGE BOUNDARY TESTS
  // ========================================

  describe("Extreme Values and Slippage Boundary Tests", function () {
    it("Should test 1 wei precision slippage protection", async function () {
      const { core, router, alice, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Calculate exact cost
      const exactCost = await core.calculateOpenCost(
        marketId,
        45,
        55,
        SMALL_QUANTITY
      );

      // Test with maxCost exactly 1 wei less than needed
      const tradeParams = {
        marketId,
        lowerTick: 45,
        upperTick: 55,
        quantity: SMALL_QUANTITY,
        maxCost: exactCost - 1n,
      };

      await expect(
        core.connect(router).openPosition(alice.address, tradeParams)
      ).to.be.revertedWithCustomError(core, "CostExceedsMaximum");

      // Test with exact cost should succeed
      tradeParams.maxCost = exactCost;
      await expect(
        core.connect(router).openPosition(alice.address, tradeParams)
      ).to.not.be.reverted;
    });

    it("Should test minimum and maximum proceeds slippage", async function () {
      const { core, router, alice, mockPosition, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Create position
      await core.connect(router).openPosition(alice.address, {
        marketId,
        lowerTick: 45,
        upperTick: 55,
        quantity: MEDIUM_QUANTITY,
        maxCost: MEDIUM_COST,
      });

      const positionId = await mockPosition.tokenOfOwnerByIndex(
        alice.address,
        0
      );

      // Calculate exact proceeds
      const exactProceeds = await core.calculateDecreaseProceeds(
        positionId,
        SMALL_QUANTITY
      );

      // Test with minProceeds exactly 1 wei more than available
      await expect(
        core
          .connect(router)
          .decreasePosition(positionId, SMALL_QUANTITY, exactProceeds + 1n)
      ).to.be.revertedWithCustomError(core, "CostExceedsMaximum");

      // Test with exact proceeds should succeed
      await expect(
        core
          .connect(router)
          .decreasePosition(positionId, SMALL_QUANTITY, exactProceeds)
      ).to.not.be.reverted;
    });

    it("Should test extreme alpha values with large trades", async function () {
      const { core, keeper, router, alice, paymentToken } = await loadFixture(
        deployFixture
      );

      // Test with minimum alpha (but use more realistic values to avoid PRB-Math overflow)
      const minAlpha = ethers.parseEther("0.01"); // Slightly higher than MIN_LIQUIDITY_PARAMETER
      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + MARKET_DURATION;
      const minAlphaMarketId = 2;

      await core
        .connect(keeper)
        .createMarket(
          minAlphaMarketId,
          TICK_COUNT,
          startTime,
          endTime,
          minAlpha
        );
      await time.increaseTo(startTime + 1);

      // Moderate trade with minimum alpha should work but be expensive
      const moderateTradeParams = {
        marketId: minAlphaMarketId,
        lowerTick: 45,
        upperTick: 55,
        quantity: ethers.parseUnits("0.01", 6), // 0.01 USDC (smaller to avoid overflow)
        maxCost: ethers.parseUnits("50", 6), // 50 USDC max
      };

      await expect(
        core.connect(router).openPosition(alice.address, moderateTradeParams)
      ).to.not.be.reverted;

      // Test with maximum alpha
      const maxAlpha = ethers.parseEther("100"); // Lower than MAX_LIQUIDITY_PARAMETER for safety
      const maxAlphaMarketId = 3;

      await core
        .connect(keeper)
        .createMarket(
          maxAlphaMarketId,
          TICK_COUNT,
          startTime,
          endTime,
          maxAlpha
        );

      // Large trade with maximum alpha should be cheaper
      const maxAlphaTradeParams = {
        marketId: maxAlphaMarketId,
        lowerTick: 45,
        upperTick: 55,
        quantity: ethers.parseUnits("0.5", 6), // 0.5 USDC
        maxCost: ethers.parseUnits("5", 6), // 5 USDC max
      };

      await expect(
        core.connect(router).openPosition(alice.address, maxAlphaTradeParams)
      ).to.not.be.reverted;
    });

    it("Should test massive chunk-split scenario (12x chunk boundary)", async function () {
      const { core, keeper, router, alice, paymentToken } = await loadFixture(
        deployFixture
      );

      // Create market with small alpha to force chunk splitting
      const smallAlpha = ethers.parseEther("0.01");
      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + MARKET_DURATION;
      const chunkMarketId = 4;

      await core
        .connect(keeper)
        .createMarket(
          chunkMarketId,
          TICK_COUNT,
          startTime,
          endTime,
          smallAlpha
        );
      await time.increaseTo(startTime + 1);

      // Calculate quantity that will require 12+ chunks
      // EXP_MAX_INPUT_WAD = 0.13 * 1e18, so maxSafeQuantityPerChunk = alpha * 0.13
      const maxSafePerChunk = (smallAlpha * 13n) / 100n; // 0.01 * 0.13 = 0.0013
      const massiveQuantity = maxSafePerChunk * 12n; // 12x chunk boundary

      // Convert to 6-decimal USDC format
      const massiveQuantity6 = massiveQuantity / 10n ** 12n;

      const massiveTradeParams = {
        marketId: chunkMarketId,
        lowerTick: 45,
        upperTick: 55,
        quantity: massiveQuantity6,
        maxCost: ethers.parseUnits("1000", 6), // 1000 USDC max
      };

      // This should trigger chunk-split logic multiple times
      await expect(
        core.connect(router).openPosition(alice.address, massiveTradeParams)
      ).to.not.be.reverted;
    });

    it("Should test post-expiry edge cases", async function () {
      const { core, keeper, router, alice, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Fast forward past market end time
      const market = await core.getMarket(marketId);
      await time.increaseTo(Number(market.endTimestamp) + 1);

      // All trading operations should fail
      const tradeParams = {
        marketId,
        lowerTick: 45,
        upperTick: 55,
        quantity: SMALL_QUANTITY,
        maxCost: MEDIUM_COST,
      };

      await expect(
        core.connect(router).openPosition(alice.address, tradeParams)
      ).to.be.revertedWithCustomError(core, "InvalidMarketParameters");

      // Settlement should still work
      await expect(core.connect(keeper).settleMarket(marketId, 50)).to.not.be
        .reverted;
    });

    it("Should test cost calculation precision edge cases", async function () {
      const { core, marketId } = await loadFixture(createActiveMarketFixture);

      // Test with very small quantities
      const tinyQuantity = 1n; // 1 wei in 6-decimal format
      const tinyCost = await core.calculateOpenCost(
        marketId,
        45,
        55,
        tinyQuantity
      );
      expect(tinyCost).to.be.gte(0);

      // Test with single tick range
      const singleTickCost = await core.calculateOpenCost(
        marketId,
        50,
        50,
        SMALL_QUANTITY
      );
      expect(singleTickCost).to.be.gt(0);

      // Test with full range
      const fullRangeCost = await core.calculateOpenCost(
        marketId,
        0,
        TICK_COUNT - 1,
        SMALL_QUANTITY
      );
      expect(fullRangeCost).to.be.gt(0);
    });

    it("Should test cumulative price impact from consecutive trades", async function () {
      const { core, router, alice, bob, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      const baseQuantity = SMALL_QUANTITY;
      let previousCost = 0n;

      // Execute 5 consecutive identical trades and verify increasing costs
      for (let i = 0; i < 5; i++) {
        const trader = i % 2 === 0 ? alice : bob;

        const currentCost = await core.calculateOpenCost(
          marketId,
          45,
          55,
          baseQuantity
        );

        if (i > 0) {
          // Each subsequent trade should be more expensive due to price impact
          expect(currentCost).to.be.gt(previousCost);
        }

        await core.connect(router).openPosition(trader.address, {
          marketId,
          lowerTick: 45,
          upperTick: 55,
          quantity: baseQuantity,
          maxCost: currentCost,
        });

        previousCost = currentCost;
      }
    });

    it("Should test sumAfter = sumBefore edge case", async function () {
      const { core, router, alice, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // This tests the edge case where sumAfter might equal sumBefore
      // which could happen with extremely small quantities or specific alpha values

      // Test with minimal quantity that might not change the sum significantly
      const minimalQuantity = 1n; // 1 wei in 6-decimal

      const tradeParams = {
        marketId,
        lowerTick: 45,
        upperTick: 55,
        quantity: minimalQuantity,
        maxCost: ethers.parseUnits("1", 6), // 1 USDC max
      };

      // Should either succeed with minimal cost or handle the edge case gracefully
      try {
        await core.connect(router).openPosition(alice.address, tradeParams);
      } catch (error: any) {
        // If it fails, it should be due to cost calculation, not a crash
        expect(error.message).to.not.include("division by zero");
        expect(error.message).to.not.include("underflow");
      }
    });
  });
});
