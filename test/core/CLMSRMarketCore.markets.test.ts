import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import {
  CLMSRMarketCore,
  MockERC20,
  MockPosition,
  FixedPointMathU,
  LazyMulSegmentTree,
} from "../../typechain-types";

describe("CLMSRMarketCore - Market Management", function () {
  const WAD = ethers.parseEther("1");
  const INITIAL_SUPPLY = ethers.parseEther("1000000000"); // 1B tokens
  const ALPHA = ethers.parseEther("1"); // Larger alpha to keep factors within bounds
  const TICK_COUNT = 100;
  const MARKET_DURATION = 7 * 24 * 60 * 60; // 7 days

  async function deployFixture() {
    const [deployer, keeper, router, alice, bob, attacker] =
      await ethers.getSigners();

    // Deploy libraries first
    const FixedPointMathUFactory = await ethers.getContractFactory(
      "FixedPointMathU"
    );
    const fixedPointMathU = await FixedPointMathUFactory.deploy();
    await fixedPointMathU.waitForDeployment();

    const LazyMulSegmentTreeFactory = await ethers.getContractFactory(
      "LazyMulSegmentTree",
      {
        libraries: {
          FixedPointMathU: await fixedPointMathU.getAddress(),
        },
      }
    );
    const lazyMulSegmentTree = await LazyMulSegmentTreeFactory.deploy();
    await lazyMulSegmentTree.waitForDeployment();

    // Deploy MockERC20 (18 decimals)
    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    const paymentToken = await MockERC20Factory.deploy(
      "Test Token",
      "TEST",
      18
    );
    await paymentToken.waitForDeployment();

    // Mint tokens to users
    await paymentToken.mint(alice.address, INITIAL_SUPPLY);
    await paymentToken.mint(bob.address, INITIAL_SUPPLY);
    await paymentToken.mint(attacker.address, INITIAL_SUPPLY);

    // Deploy MockPosition
    const MockPositionFactory = await ethers.getContractFactory("MockPosition");
    const mockPosition = await MockPositionFactory.deploy();
    await mockPosition.waitForDeployment();

    // Deploy CLMSRMarketCore with linked libraries
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
      keeper.address // keeper acts as manager
    );
    await core.waitForDeployment();

    // Set core contract in MockPosition
    await mockPosition.setCore(await core.getAddress());

    // Set router contract
    await core.connect(keeper).setRouterContract(router.address);

    // Approve tokens for core contract
    await paymentToken
      .connect(alice)
      .approve(await core.getAddress(), ethers.MaxUint256);
    await paymentToken
      .connect(bob)
      .approve(await core.getAddress(), ethers.MaxUint256);
    await paymentToken
      .connect(attacker)
      .approve(await core.getAddress(), ethers.MaxUint256);

    return {
      core,
      paymentToken,
      mockPosition,
      fixedPointMathU,
      lazyMulSegmentTree,
      deployer,
      keeper,
      router,
      alice,
      bob,
      attacker,
    };
  }

  async function createMarketFixture() {
    const contracts = await loadFixture(deployFixture);
    const { core, keeper } = contracts;

    const currentTime = await time.latest();
    const startTime = currentTime + 3600; // 1 hour from now
    const endTime = startTime + MARKET_DURATION;
    const marketId = 1;

    await core
      .connect(keeper)
      .createMarket(marketId, TICK_COUNT, startTime, endTime, ALPHA);

    return {
      ...contracts,
      marketId,
      startTime,
      endTime,
    };
  }

  describe("Market Creation", function () {
    it("Should create market successfully", async function () {
      const { core, keeper } = await loadFixture(deployFixture);

      const currentTime = await time.latest();
      const startTime = currentTime + 3600;
      const endTime = startTime + MARKET_DURATION;
      const marketId = 1;

      await expect(
        core
          .connect(keeper)
          .createMarket(marketId, TICK_COUNT, startTime, endTime, ALPHA)
      )
        .to.emit(core, "MarketCreated")
        .withArgs(marketId, startTime, endTime, TICK_COUNT, ALPHA);

      const market = await core.getMarket(marketId);
      expect(market.tickCount).to.equal(TICK_COUNT);
      expect(market.liquidityParameter).to.equal(ALPHA);
      expect(market.startTimestamp).to.equal(startTime);
      expect(market.endTimestamp).to.equal(endTime);
      expect(market.isActive).to.be.true;
      expect(market.settled).to.be.false;
      expect(market.settlementTick).to.equal(0);
    });

    it("Should initialize segment tree correctly", async function () {
      const { core, keeper } = await loadFixture(deployFixture);

      const currentTime = await time.latest();
      const startTime = currentTime + 3600;
      const endTime = startTime + MARKET_DURATION;
      const marketId = 1;

      await core
        .connect(keeper)
        .createMarket(marketId, TICK_COUNT, startTime, endTime, ALPHA);

      // Check that all ticks start with value 1 WAD (e^0 = 1)
      for (let i = 0; i < 10; i++) {
        // Check first 10 ticks
        const tickValue = await core.getTickValue(marketId, i);
        expect(tickValue).to.equal(WAD);
      }
    });

    it("Should prevent duplicate market creation", async function () {
      const { core, keeper } = await loadFixture(deployFixture);

      const currentTime = await time.latest();
      const startTime = currentTime + 3600;
      const endTime = startTime + MARKET_DURATION;
      const marketId = 1;

      // Create first market
      await core
        .connect(keeper)
        .createMarket(marketId, TICK_COUNT, startTime, endTime, ALPHA);

      // Try to create duplicate market
      await expect(
        core.connect(keeper).createMarket(
          marketId, // same ID
          TICK_COUNT,
          startTime + 1000,
          endTime + 1000,
          ALPHA
        )
      ).to.be.revertedWithCustomError(core, "MarketAlreadyExists");
    });

    it("Should create multiple markets with different IDs", async function () {
      const { core, keeper } = await loadFixture(deployFixture);

      const currentTime = await time.latest();
      const startTime = currentTime + 3600;
      const endTime = startTime + MARKET_DURATION;

      // Create multiple markets
      for (let i = 1; i <= 5; i++) {
        await expect(
          core
            .connect(keeper)
            .createMarket(
              i,
              TICK_COUNT,
              startTime + i * 1000,
              endTime + i * 1000,
              ALPHA
            )
        ).to.emit(core, "MarketCreated");

        const market = await core.getMarket(i);
        expect(market.isActive).to.be.true;
        expect(market.tickCount).to.equal(TICK_COUNT);
      }
    });

    it("Should handle various tick counts", async function () {
      const { core, keeper } = await loadFixture(deployFixture);

      const currentTime = await time.latest();
      const startTime = currentTime + 3600;
      const endTime = startTime + MARKET_DURATION;

      const testCases = [1, 10, 100, 1000, 10000];

      for (let i = 0; i < testCases.length; i++) {
        const tickCount = testCases[i];
        const marketId = i + 1;

        await core
          .connect(keeper)
          .createMarket(marketId, tickCount, startTime, endTime, ALPHA);

        const market = await core.getMarket(marketId);
        expect(market.tickCount).to.equal(tickCount);
      }
    });

    it("Should handle various liquidity parameters", async function () {
      const { core, keeper } = await loadFixture(deployFixture);

      const currentTime = await time.latest();
      const startTime = currentTime + 3600;
      const endTime = startTime + MARKET_DURATION;

      const testAlphas = [
        ethers.parseEther("0.001"), // MIN
        ethers.parseEther("0.01"),
        ethers.parseEther("0.1"),
        ethers.parseEther("1"),
        ethers.parseEther("10"),
        ethers.parseEther("100"),
        ethers.parseEther("1000"), // MAX
      ];

      for (let i = 0; i < testAlphas.length; i++) {
        const alpha = testAlphas[i];
        const marketId = i + 1;

        await core
          .connect(keeper)
          .createMarket(marketId, TICK_COUNT, startTime, endTime, alpha);

        const market = await core.getMarket(marketId);
        expect(market.liquidityParameter).to.equal(alpha);
      }
    });
  });

  describe("Market Settlement", function () {
    it("Should settle market successfully", async function () {
      const { core, keeper, marketId } = await loadFixture(createMarketFixture);

      const winningTick = 50;

      await expect(core.connect(keeper).settleMarket(marketId, winningTick))
        .to.emit(core, "MarketSettled")
        .withArgs(marketId, winningTick);

      const market = await core.getMarket(marketId);
      expect(market.settled).to.be.true;
      expect(market.settlementTick).to.equal(winningTick);
      expect(market.isActive).to.be.false;
    });

    it("Should prevent double settlement", async function () {
      const { core, keeper, marketId } = await loadFixture(createMarketFixture);

      const winningTick = 50;

      // First settlement
      await core.connect(keeper).settleMarket(marketId, winningTick);

      // Try to settle again
      await expect(
        core.connect(keeper).settleMarket(marketId, 60)
      ).to.be.revertedWithCustomError(core, "MarketAlreadySettled");
    });

    it("Should validate winning tick range", async function () {
      const { core, keeper, marketId } = await loadFixture(createMarketFixture);

      // Test winning tick >= tickCount
      await expect(
        core.connect(keeper).settleMarket(marketId, TICK_COUNT) // exactly at limit
      ).to.be.revertedWithCustomError(core, "InvalidTick");

      await expect(
        core.connect(keeper).settleMarket(marketId, TICK_COUNT + 1) // over limit
      ).to.be.revertedWithCustomError(core, "InvalidTick");
    });

    it("Should settle with edge case winning ticks", async function () {
      const { core, keeper } = await loadFixture(deployFixture);

      const currentTime = await time.latest();
      const startTime = currentTime + 3600;
      const endTime = startTime + MARKET_DURATION;

      // Test first tick (0)
      const marketId1 = 1;
      await core
        .connect(keeper)
        .createMarket(marketId1, TICK_COUNT, startTime, endTime, ALPHA);
      await core.connect(keeper).settleMarket(marketId1, 0);

      let market = await core.getMarket(marketId1);
      expect(market.settlementTick).to.equal(0);

      // Test last tick (TICK_COUNT - 1)
      const marketId2 = 2;
      await core
        .connect(keeper)
        .createMarket(marketId2, TICK_COUNT, startTime, endTime, ALPHA);
      await core.connect(keeper).settleMarket(marketId2, TICK_COUNT - 1);

      market = await core.getMarket(marketId2);
      expect(market.settlementTick).to.equal(TICK_COUNT - 1);
    });

    it("Should prevent settlement of non-existent market", async function () {
      const { core, keeper } = await loadFixture(deployFixture);

      await expect(
        core.connect(keeper).settleMarket(999, 50) // non-existent market
      ).to.be.revertedWithCustomError(core, "MarketNotFound");
    });
  });

  describe("Market State Queries", function () {
    it("Should return correct market information", async function () {
      const { core, marketId, startTime, endTime } = await loadFixture(
        createMarketFixture
      );

      const market = await core.getMarket(marketId);

      expect(market.isActive).to.be.true;
      expect(market.settled).to.be.false;
      expect(market.startTimestamp).to.equal(startTime);
      expect(market.endTimestamp).to.equal(endTime);
      expect(market.settlementTick).to.equal(0);
      expect(market.tickCount).to.equal(TICK_COUNT);
      expect(market.liquidityParameter).to.equal(ALPHA);
    });

    it("Should return correct tick values", async function () {
      const { core, marketId } = await loadFixture(createMarketFixture);

      // All ticks should start at 1 WAD
      for (let i = 0; i < TICK_COUNT; i += 10) {
        // Sample every 10th tick
        const tickValue = await core.getTickValue(marketId, i);
        expect(tickValue).to.equal(WAD);
      }
    });

    it("Should handle queries for non-existent markets", async function () {
      const { core } = await loadFixture(deployFixture);

      await expect(core.getMarket(999)).to.be.revertedWithCustomError(
        core,
        "MarketNotFound"
      );

      await expect(core.getTickValue(999, 0)).to.be.revertedWithCustomError(
        core,
        "MarketNotFound"
      );
    });

    it("Should handle invalid tick queries", async function () {
      const { core, marketId } = await loadFixture(createMarketFixture);

      await expect(
        core.getTickValue(marketId, TICK_COUNT) // at limit
      ).to.be.revertedWithCustomError(core, "InvalidTick");

      await expect(
        core.getTickValue(marketId, TICK_COUNT + 1) // over limit
      ).to.be.revertedWithCustomError(core, "InvalidTick");
    });
  });

  describe("Market Lifecycle", function () {
    it("Should handle complete market lifecycle", async function () {
      const { core, keeper, marketId, startTime, endTime } = await loadFixture(
        createMarketFixture
      );

      // 1. Market created (already done in fixture)
      let market = await core.getMarket(marketId);
      expect(market.isActive).to.be.true;
      expect(market.settled).to.be.false;

      // 2. Market can be active during trading period
      await time.increaseTo(startTime + 1000);
      market = await core.getMarket(marketId);
      expect(market.isActive).to.be.true;

      // 3. Market can be settled after end time
      await time.increaseTo(endTime + 1);
      const winningTick = 42;
      await core.connect(keeper).settleMarket(marketId, winningTick);

      // 4. Market is settled and inactive
      market = await core.getMarket(marketId);
      expect(market.isActive).to.be.false;
      expect(market.settled).to.be.true;
      expect(market.settlementTick).to.equal(winningTick);
    });

    it("Should handle multiple markets in different states", async function () {
      const { core, keeper } = await loadFixture(deployFixture);

      const currentTime = await time.latest();
      const baseStartTime = currentTime + 3600;

      // Create markets with different timelines
      const markets = [
        { id: 1, start: baseStartTime, end: baseStartTime + 1000 },
        { id: 2, start: baseStartTime + 2000, end: baseStartTime + 3000 },
        { id: 3, start: baseStartTime + 4000, end: baseStartTime + 5000 },
      ];

      // Create all markets
      for (const m of markets) {
        await core
          .connect(keeper)
          .createMarket(m.id, TICK_COUNT, m.start, m.end, ALPHA);
      }

      // Settle first market
      await core.connect(keeper).settleMarket(1, 10);

      // Check states
      let market1 = await core.getMarket(1);
      let market2 = await core.getMarket(2);
      let market3 = await core.getMarket(3);

      expect(market1.settled).to.be.true;
      expect(market1.isActive).to.be.false;
      expect(market2.settled).to.be.false;
      expect(market2.isActive).to.be.true;
      expect(market3.settled).to.be.false;
      expect(market3.isActive).to.be.true;

      // Settle second market
      await core.connect(keeper).settleMarket(2, 20);

      market2 = await core.getMarket(2);
      expect(market2.settled).to.be.true;
      expect(market2.isActive).to.be.false;

      // Third market should still be active
      market3 = await core.getMarket(3);
      expect(market3.settled).to.be.false;
      expect(market3.isActive).to.be.true;
    });
  });

  describe("Authorization for Market Operations", function () {
    it("Should only allow manager to create markets", async function () {
      const { core, alice, bob } = await loadFixture(deployFixture);

      const currentTime = await time.latest();
      const startTime = currentTime + 3600;
      const endTime = startTime + MARKET_DURATION;

      await expect(
        core
          .connect(alice)
          .createMarket(1, TICK_COUNT, startTime, endTime, ALPHA)
      ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");

      await expect(
        core.connect(bob).createMarket(1, TICK_COUNT, startTime, endTime, ALPHA)
      ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");
    });

    it("Should only allow manager to settle markets", async function () {
      const { core, alice, bob, marketId } = await loadFixture(
        createMarketFixture
      );

      await expect(
        core.connect(alice).settleMarket(marketId, 50)
      ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");

      await expect(
        core.connect(bob).settleMarket(marketId, 50)
      ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");
    });
  });

  describe("Edge Cases and Stress Tests", function () {
    it("Should handle maximum tick count", async function () {
      const { core, keeper } = await loadFixture(deployFixture);

      const currentTime = await time.latest();
      const startTime = currentTime + 3600;
      const endTime = startTime + MARKET_DURATION;
      const maxTicks = await core.MAX_TICK_COUNT();

      // This might be slow, so we test with a smaller but significant number
      const largeTicks = 50000;

      await core
        .connect(keeper)
        .createMarket(1, largeTicks, startTime, endTime, ALPHA);

      const market = await core.getMarket(1);
      expect(market.tickCount).to.equal(largeTicks);

      // Test settlement with large tick count
      await core.connect(keeper).settleMarket(1, largeTicks - 1);

      const settledMarket = await core.getMarket(1);
      expect(settledMarket.settlementTick).to.equal(largeTicks - 1);
    });

    it("Should handle rapid market creation and settlement", async function () {
      const { core, keeper } = await loadFixture(deployFixture);

      const currentTime = await time.latest();
      const baseStartTime = currentTime + 3600;

      // Create and settle multiple markets rapidly
      for (let i = 1; i <= 10; i++) {
        await core
          .connect(keeper)
          .createMarket(
            i,
            TICK_COUNT,
            baseStartTime + i * 100,
            baseStartTime + i * 100 + MARKET_DURATION,
            ALPHA
          );

        await core.connect(keeper).settleMarket(i, i % TICK_COUNT);

        const market = await core.getMarket(i);
        expect(market.settled).to.be.true;
        expect(market.settlementTick).to.equal(i % TICK_COUNT);
      }
    });

    it("Should handle maximum tick count of 1,000,000", async function () {
      const { core, keeper } = await loadFixture(deployFixture);

      const currentTime = await time.latest();
      const startTime = currentTime + 3600;
      const endTime = startTime + MARKET_DURATION;
      const maxTicks = await core.MAX_TICK_COUNT(); // 1,000,000

      // Test with actual maximum tick count
      await core
        .connect(keeper)
        .createMarket(1, maxTicks, startTime, endTime, ALPHA);

      const market = await core.getMarket(1);
      expect(market.tickCount).to.equal(maxTicks);

      // Sample a few tick values to ensure tree initialization
      expect(await core.getTickValue(1, 0)).to.equal(WAD);
      expect(await core.getTickValue(1, 100000)).to.equal(WAD);
      expect(await core.getTickValue(1, Number(maxTicks) - 1)).to.equal(WAD);
    });

    it("Should validate time range correctly", async function () {
      const { core, keeper } = await loadFixture(deployFixture);

      const currentTime = await time.latest();

      // Test start == end (should fail)
      await expect(
        core
          .connect(keeper)
          .createMarket(1, TICK_COUNT, currentTime, currentTime, ALPHA)
      ).to.be.revertedWithCustomError(core, "InvalidMarketParameters");

      // Test start > end (should fail)
      await expect(
        core
          .connect(keeper)
          .createMarket(1, TICK_COUNT, currentTime + 1000, currentTime, ALPHA)
      ).to.be.revertedWithCustomError(core, "InvalidMarketParameters");
    });

    it("Should prevent duplicate market creation", async function () {
      const { core, keeper } = await loadFixture(deployFixture);

      const currentTime = await time.latest();
      const startTime = currentTime + 3600;
      const endTime = startTime + MARKET_DURATION;

      // Create first market
      await core
        .connect(keeper)
        .createMarket(1, TICK_COUNT, startTime, endTime, ALPHA);

      // Try to create market with same ID
      await expect(
        core
          .connect(keeper)
          .createMarket(1, TICK_COUNT, startTime + 1000, endTime + 1000, ALPHA)
      ).to.be.revertedWithCustomError(core, "MarketAlreadyExists");
    });

    it("Should validate liquidity parameter boundaries", async function () {
      const { core, keeper } = await loadFixture(deployFixture);

      const currentTime = await time.latest();
      const startTime = currentTime + 3600;
      const endTime = startTime + MARKET_DURATION;

      const minAlpha = await core.MIN_LIQUIDITY_PARAMETER();
      const maxAlpha = await core.MAX_LIQUIDITY_PARAMETER();

      // Test minimum boundary (should succeed)
      await core
        .connect(keeper)
        .createMarket(1, TICK_COUNT, startTime, endTime, minAlpha);

      // Test maximum boundary (should succeed)
      await core
        .connect(keeper)
        .createMarket(2, TICK_COUNT, startTime, endTime, maxAlpha);

      // Test below minimum (should fail)
      await expect(
        core
          .connect(keeper)
          .createMarket(3, TICK_COUNT, startTime, endTime, minAlpha - 1n)
      ).to.be.revertedWithCustomError(core, "InvalidMarketParameters");

      // Test above maximum (should fail)
      await expect(
        core
          .connect(keeper)
          .createMarket(4, TICK_COUNT, startTime, endTime, maxAlpha + 1n)
      ).to.be.revertedWithCustomError(core, "InvalidMarketParameters");
    });
  });
});
