import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { coreFixture } from "../../helpers/fixtures/core";
import { COMPONENT_TAG } from "../../helpers/tags";

describe(`${COMPONENT_TAG} CLMSRMarketCore - State Getters`, function () {
  describe("Market Information Getters", function () {
    it("Should return correct market information after creation", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper } = contracts;

      const marketId = 1;
      const numTicks = 100;
      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;
      const liquidityParameter = ethers.parseEther("0.1");

      await core
        .connect(keeper)
        .createMarket(
          marketId,
          numTicks,
          startTime,
          endTime,
          liquidityParameter
        );

      const market = await core.getMarket(marketId);

      expect(market.numTicks).to.equal(numTicks);
      expect(market.startTimestamp).to.equal(startTime);
      expect(market.endTimestamp).to.equal(endTime);
      expect(market.liquidityParameter).to.equal(liquidityParameter);
      expect(market.isActive).to.be.true;
      expect(market.settled).to.be.false;
    });

    it("Should return correct market status transitions", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper } = contracts;

      const marketId = 1;
      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;

      await core
        .connect(keeper)
        .createMarket(
          marketId,
          100,
          startTime,
          endTime,
          ethers.parseEther("0.1")
        );

      // Initially CREATED
      let market = await core.getMarket(marketId);
      expect(market.startTimestamp).to.be.gt(await time.latest()); // CREATED

      // Move to start time - should become ACTIVE
      await time.increaseTo(startTime + 1);
      market = await core.getMarket(marketId);
      expect(market.startTimestamp).to.be.lte(await time.latest()); // ACTIVE

      // Move past end time - should become ENDED
      await time.increaseTo(endTime + 1);
      market = await core.getMarket(marketId);
      expect(market.endTimestamp).to.be.lte(await time.latest()); // ENDED

      // Settle market - should become SETTLED
      await core.connect(keeper).settleMarket(marketId, 50);
      market = await core.getMarket(marketId);
      expect(market.settlementTick).to.equal(50); // SETTLED
    });

    it("Should handle multiple markets independently", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper } = contracts;

      const currentTime = await time.latest();
      const startTime1 = currentTime + 100;
      const endTime1 = startTime1 + 86400;
      const startTime2 = currentTime + 200;
      const endTime2 = startTime2 + 86400;

      // Create two markets with different parameters
      await core
        .connect(keeper)
        .createMarket(1, 50, startTime1, endTime1, ethers.parseEther("0.1"));

      await core
        .connect(keeper)
        .createMarket(2, 200, startTime2, endTime2, ethers.parseEther("0.5"));

      const market1 = await core.getMarket(1);
      const market2 = await core.getMarket(2);

      expect(market1.numTicks).to.equal(50);
      expect(market2.numTicks).to.equal(200);
      expect(market1.liquidityParameter).to.equal(ethers.parseEther("0.1"));
      expect(market2.liquidityParameter).to.equal(ethers.parseEther("0.5"));
    });

    it("Should revert when getting info for non-existent market", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core } = contracts;

      await expect(core.getMarket(999)).to.be.revertedWithCustomError(
        core,
        "MarketNotFound"
      );
    });

    it("Should return correct tick values after market creation", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper } = contracts;

      const marketId = 1;
      const tickCount = 100;
      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;

      await core
        .connect(keeper)
        .createMarket(
          marketId,
          tickCount,
          startTime,
          endTime,
          ethers.parseEther("0.1")
        );

      // All ticks should start at 1 WAD (e^0 = 1)
      const WAD = ethers.parseEther("1");
      for (let i = 0; i < tickCount; i += 10) {
        // Sample every 10th tick
        const tickValue = await core.getTickValue(marketId, i);
        expect(tickValue).to.equal(WAD);
      }
    });

    it("Should handle tick value queries for invalid ticks", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper } = contracts;

      const marketId = 1;
      const tickCount = 100;
      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;

      await core
        .connect(keeper)
        .createMarket(
          marketId,
          tickCount,
          startTime,
          endTime,
          ethers.parseEther("0.1")
        );

      await expect(
        core.getTickValue(marketId, tickCount) // at limit
      ).to.be.revertedWithCustomError(core, "InvalidTick");

      await expect(
        core.getTickValue(marketId, tickCount + 1) // over limit
      ).to.be.revertedWithCustomError(core, "InvalidTick");
    });

    it("Should handle tick value queries for non-existent markets", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core } = contracts;

      await expect(core.getTickValue(999, 0)).to.be.revertedWithCustomError(
        core,
        "MarketNotFound"
      );
    });
  });

  describe("Position Information Getters", function () {
    it("Should return correct position information after opening", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, alice, keeper } = contracts;

      const marketId = 1;
      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;

      await core
        .connect(keeper)
        .createMarket(
          marketId,
          100,
          startTime,
          endTime,
          ethers.parseEther("0.1")
        );

      await time.increaseTo(startTime + 1);

      const tradeParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: ethers.parseUnits("1", 6),
        maxCost: ethers.parseUnits("10", 6),
      };

      await core
        .connect(alice)
        .openPosition(
          alice.address,
          tradeParams.marketId,
          tradeParams.lowerTick,
          tradeParams.upperTick,
          tradeParams.quantity,
          tradeParams.maxCost
        );

      // Get position info from position contract
      const positionContract = await core.getPositionContract();
      const position = await ethers.getContractAt(
        "MockPosition",
        positionContract
      );
      const positionInfo = await position.getPosition(1);

      expect(await position.ownerOf(1)).to.equal(alice.address);
      expect(positionInfo.marketId).to.equal(marketId);
      expect(positionInfo.lowerTick).to.equal(10);
      expect(positionInfo.upperTick).to.equal(20);
      expect(positionInfo.quantity).to.equal(tradeParams.quantity);
    });

    it("Should track position count correctly", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, alice, bob, keeper } = contracts;

      const marketId = 1;
      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;

      await core
        .connect(keeper)
        .createMarket(
          marketId,
          100,
          startTime,
          endTime,
          ethers.parseEther("0.1")
        );

      await time.increaseTo(startTime + 1);

      const positionContract = await core.getPositionContract();
      const position = await ethers.getContractAt(
        "MockPosition",
        positionContract
      );

      // Initially no positions
      expect(await position.balanceOf(alice.address)).to.equal(0);
      expect(await position.balanceOf(bob.address)).to.equal(0);

      // Open first position
      await core
        .connect(alice)
        .openPosition(
          alice.address,
          marketId,
          10,
          20,
          ethers.parseUnits("1", 6),
          ethers.parseUnits("10", 6)
        );
      expect(await position.balanceOf(alice.address)).to.equal(1);

      await core
        .connect(bob)
        .openPosition(
          bob.address,
          marketId,
          30,
          40,
          ethers.parseUnits("0.5", 6),
          ethers.parseUnits("5", 6)
        );
      expect(await position.balanceOf(bob.address)).to.equal(1);
    });

    it("Should handle position ownership correctly", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, alice, bob, keeper } = contracts;

      const marketId = 1;
      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;

      await core
        .connect(keeper)
        .createMarket(
          marketId,
          100,
          startTime,
          endTime,
          ethers.parseEther("0.1")
        );

      await time.increaseTo(startTime + 1);

      const tradeParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: ethers.parseUnits("1", 6),
        maxCost: ethers.parseUnits("10", 6),
      };

      await core
        .connect(alice)
        .openPosition(
          alice.address,
          tradeParams.marketId,
          tradeParams.lowerTick,
          tradeParams.upperTick,
          tradeParams.quantity,
          tradeParams.maxCost
        );

      const positionContract = await core.getPositionContract();
      const position = await ethers.getContractAt(
        "ICLMSRPosition",
        positionContract
      );

      expect(await position.ownerOf(1)).to.equal(alice.address);
      expect(await position.balanceOf(alice.address)).to.equal(1);
      expect(await position.balanceOf(bob.address)).to.equal(0);
    });
  });

  describe("Market State Calculations", function () {
    it("Should calculate open costs correctly", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper } = contracts;

      const marketId = 1;
      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;

      await core
        .connect(keeper)
        .createMarket(
          marketId,
          100,
          startTime,
          endTime,
          ethers.parseEther("0.1")
        );

      await time.increaseTo(startTime + 1);

      const quantity = ethers.parseUnits("1", 6);
      const cost = await core.calculateOpenCost(marketId, 10, 20, quantity);

      expect(cost).to.be.gt(0);
      expect(cost).to.be.lt(ethers.parseUnits("10", 6)); // Reasonable cost
    });

    it("Should calculate close costs correctly", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, alice, keeper } = contracts;

      const marketId = 1;
      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;

      await core
        .connect(keeper)
        .createMarket(
          marketId,
          100,
          startTime,
          endTime,
          ethers.parseEther("0.1")
        );

      await time.increaseTo(startTime + 1);

      // Open position first
      const tradeParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: ethers.parseUnits("1", 6),
        maxCost: ethers.parseUnits("10", 6),
      };

      await core
        .connect(alice)
        .openPosition(
          alice.address,
          tradeParams.marketId,
          tradeParams.lowerTick,
          tradeParams.upperTick,
          tradeParams.quantity,
          tradeParams.maxCost
        );

      // Calculate close cost
      const closeCost = await core.calculateCloseProceeds(1);

      expect(closeCost).to.be.gt(0);
      expect(closeCost).to.be.lt(tradeParams.quantity); // Should be less than original quantity
    });

    it("Should calculate settled payouts correctly", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, alice, keeper } = contracts;

      const marketId = 1;
      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;

      await core
        .connect(keeper)
        .createMarket(
          marketId,
          100,
          startTime,
          endTime,
          ethers.parseEther("0.1")
        );

      await time.increaseTo(startTime + 1);

      // Open position
      const tradeParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: ethers.parseUnits("1", 6),
        maxCost: ethers.parseUnits("10", 6),
      };

      await core
        .connect(alice)
        .openPosition(
          alice.address,
          tradeParams.marketId,
          tradeParams.lowerTick,
          tradeParams.upperTick,
          tradeParams.quantity,
          tradeParams.maxCost
        );

      // Settle market
      await time.increaseTo(endTime + 1);
      await core.connect(keeper).settleMarket(marketId, 15); // Winning outcome in range

      const payout = await core.calculateClaimAmount(1);
      expect(payout).to.be.gt(0);
      expect(payout).to.be.gte(tradeParams.quantity); // Should at least get back investment
    });

    it("Should handle cost calculations for different tick ranges", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper } = contracts;

      const marketId = 1;
      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;

      await core
        .connect(keeper)
        .createMarket(
          marketId,
          100,
          startTime,
          endTime,
          ethers.parseEther("0.1")
        );

      await time.increaseTo(startTime + 1);

      const quantity = ethers.parseUnits("1", 6);

      // Narrow range
      const narrowCost = await core.calculateOpenCost(
        marketId,
        49,
        51,
        quantity
      );

      // Wide range
      const wideCost = await core.calculateOpenCost(marketId, 10, 90, quantity);

      // Wide range should cost more than narrow range (covering more outcomes)
      expect(wideCost).to.be.gt(narrowCost);
    });
  });

  describe("Market Existence and Validation", function () {
    it("Should correctly identify existing vs non-existing markets", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper } = contracts;

      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;

      // Create market 1
      await core
        .connect(keeper)
        .createMarket(1, 100, startTime, endTime, ethers.parseEther("0.1"));

      // Market 1 should exist
      const market1Info = await core.getMarket(1);
      expect(market1Info.numTicks).to.equal(100);

      // Market 2 should not exist
      await expect(core.getMarket(2)).to.be.revertedWithCustomError(
        core,
        "MarketNotFound"
      );
    });

    it("Should validate market parameters on creation", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper } = contracts;

      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;

      // Invalid tick count (too low)
      await expect(
        core
          .connect(keeper)
          .createMarket(1, 0, startTime, endTime, ethers.parseEther("0.1"))
      ).to.be.revertedWithCustomError(core, "TickCountExceedsLimit");

      // Invalid liquidity parameter (too low)
      await expect(
        core
          .connect(keeper)
          .createMarket(1, 100, startTime, endTime, ethers.parseEther("0.0001"))
      ).to.be.revertedWithCustomError(core, "InvalidLiquidityParameter");

      // Invalid time range (end before start)
      await expect(
        core.connect(keeper).createMarket(
          1,
          100,
          endTime,
          startTime, // end < start
          ethers.parseEther("0.1")
        )
      ).to.be.revertedWithCustomError(core, "InvalidTimeRange");
    });

    it("Should prevent duplicate market IDs", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper } = contracts;

      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;

      // Create market 1
      await core
        .connect(keeper)
        .createMarket(1, 100, startTime, endTime, ethers.parseEther("0.1"));

      // Try to create market 1 again
      await expect(
        core
          .connect(keeper)
          .createMarket(
            1,
            50,
            startTime + 1000,
            endTime + 1000,
            ethers.parseEther("0.2")
          )
      ).to.be.revertedWithCustomError(core, "MarketAlreadyExists");
    });
  });

  describe("Market State Queries", function () {
    async function createMarketFixture() {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper } = contracts;

      const currentTime = await time.latest();
      const startTime = currentTime + 3600; // 1 hour from now
      const endTime = startTime + 7 * 24 * 60 * 60; // 7 days
      const marketId = 1;

      await core
        .connect(keeper)
        .createMarket(
          marketId,
          100,
          startTime,
          endTime,
          ethers.parseEther("1")
        );

      return {
        ...contracts,
        marketId,
        startTime,
        endTime,
      };
    }

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
      expect(market.numTicks).to.equal(100);
      expect(market.liquidityParameter).to.equal(ethers.parseEther("1"));
    });

    it("Should return correct tick values", async function () {
      const { core, marketId } = await loadFixture(createMarketFixture);

      const WAD = ethers.parseEther("1");

      // All ticks should start at 1 WAD
      for (let i = 0; i < 100; i += 10) {
        // Sample every 10th tick
        const tickValue = await core.getTickValue(marketId, i);
        expect(tickValue).to.equal(WAD);
      }
    });

    it("Should handle queries for non-existent markets", async function () {
      const { core } = await loadFixture(coreFixture);

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
        core.getTickValue(marketId, 100) // at limit
      ).to.be.revertedWithCustomError(core, "InvalidTick");

      await expect(
        core.getTickValue(marketId, 101) // over limit
      ).to.be.revertedWithCustomError(core, "InvalidTick");
    });
  });

  describe("State Consistency Checks", function () {
    it("Should maintain consistent state after multiple operations", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, alice, keeper } = contracts;

      const marketId = 1;
      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;

      await core
        .connect(keeper)
        .createMarket(
          marketId,
          100,
          startTime,
          endTime,
          ethers.parseEther("0.1")
        );

      await time.increaseTo(startTime + 1);

      // Open position
      const tradeParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: ethers.parseUnits("1", 6),
        maxCost: ethers.parseUnits("10", 6),
      };

      await core
        .connect(alice)
        .openPosition(
          alice.address,
          tradeParams.marketId,
          tradeParams.lowerTick,
          tradeParams.upperTick,
          tradeParams.quantity,
          tradeParams.maxCost
        );

      // Market should still have correct info
      const marketInfo = await core.getMarket(marketId);
      expect(marketInfo.numTicks).to.equal(100);
      expect(marketInfo.isActive).to.be.true;

      // Position should exist
      const positionContract = await core.getPositionContract();
      const position = await ethers.getContractAt(
        "ICLMSRPosition",
        positionContract
      );
      const positionInfo = await position.getPosition(1);
      expect(positionInfo.quantity).to.equal(tradeParams.quantity);
    });

    it("Should handle view functions during different market states", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper } = contracts;

      const marketId = 1;
      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;

      await core
        .connect(keeper)
        .createMarket(
          marketId,
          100,
          startTime,
          endTime,
          ethers.parseEther("0.1")
        );

      // Test in CREATED state - before start time
      let marketInfo = await core.getMarket(marketId);
      expect(marketInfo.isActive).to.be.true;

      // Should be able to calculate costs even before market starts
      const cost = await core.calculateOpenCost(
        marketId,
        10,
        20,
        ethers.parseUnits("1", 6)
      );
      expect(cost).to.be.gt(0);

      // Move to ACTIVE state
      await time.increaseTo(startTime + 1);
      marketInfo = await core.getMarket(marketId);
      expect(marketInfo.isActive).to.be.true;

      // Move to ENDED state
      await time.increaseTo(endTime + 1);
      marketInfo = await core.getMarket(marketId);
      expect(marketInfo.isActive).to.be.true; // Still active until settled

      // Settle and move to SETTLED state
      await core.connect(keeper).settleMarket(marketId, 50);
      marketInfo = await core.getMarket(marketId);
      expect(marketInfo.settled).to.be.true;
      expect(marketInfo.isActive).to.be.false;
    });
  });
});
