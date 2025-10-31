import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import {
  coreFixture,
  createActiveMarketFixture,
  setupActiveMarket,
  setupCustomMarket,
  setMarketActivation,
  settleMarketAtTick,
  toSettlementValue,
  getTickValue,
  createMarketWithConfig,
} from "../../helpers/fixtures/core";
import { COMPONENT_TAG } from "../../helpers/tags";

const describeMaybe = process.env.COVERAGE ? describe.skip : describe;

describeMaybe(`${COMPONENT_TAG} CLMSRMarketCore - State Getters`, function () {
  const ALPHA = ethers.parseEther("1");
  const MIN_TICK = 100000;
  const MAX_TICK = 100990;
  const TICK_SPACING = 10;
  const MARKET_DURATION = 86400; // 1 day
  const USDC_DECIMALS = 6;
  const POSITION_QUANTITY = ethers.parseUnits("10", USDC_DECIMALS);
  const POSITION_MAX_COST = ethers.parseUnits("1000", USDC_DECIMALS);

  describe("Market Information Getters", function () {
    it("Should return correct market information after creation", async function () {
      const { core, keeper, marketId, startTime, endTime } = await loadFixture(
        createActiveMarketFixture
      );

      const market = await core.getMarket(marketId);

      expect(market.startTimestamp).to.equal(startTime);
      expect(market.endTimestamp).to.equal(endTime);
      expect(market.liquidityParameter).to.equal(ALPHA);
      expect(market.settled).to.be.false;
    });

    it("Should return correct market status transitions", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper } = contracts;

      // 시간 상태 변화를 테스트하기 위해 미래 시간으로 마켓 생성
      const currentTime = await time.latest();
      const startTime = currentTime + 1000; // 미래 시간
      const endTime = startTime + MARKET_DURATION;
      const marketId = await createMarketWithConfig(core, keeper, {
        minTick: MIN_TICK,
        maxTick: MAX_TICK,
        tickSpacing: TICK_SPACING,
        startTime,
        endTime,
        liquidityParameter: ALPHA,
      });

      // Market should be PENDING before start time
      let market = await core.getMarket(marketId);
      expect(market.startTimestamp).to.be.gt(await time.latest());

      // Fast forward to market start
      await time.increaseTo(startTime + 1);
      market = await core.getMarket(marketId);
      expect(market.startTimestamp).to.be.lte(await time.latest());

      // Fast forward past market end
      await time.increaseTo(endTime + 1);
      market = await core.getMarket(marketId);
      expect(market.endTimestamp).to.be.lte(await time.latest());
      expect(market.settled).to.be.false;

      // Settle market using helper
      await settleMarketAtTick(core, keeper, marketId, 100450);
      market = await core.getMarket(marketId);
      expect(market.settled).to.be.true;
      expect(market.settlementTick).to.equal(BigInt(100450));
      expect(market.settlementValue).to.equal(toSettlementValue(100450));
    });

    it("Should handle multiple markets independently", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core } = contracts;

      // 두 개의 독립적인 마켓 생성
      const marketConfig1 = await setupCustomMarket(contracts, {
        numTicks: 50, // 100000-100490
      });
      const marketConfig2 = await setupCustomMarket(contracts, {
        numTicks: 100, // 100000-100990
      });

      const marketId1 = marketConfig1.marketId;
      const marketId2 = marketConfig2.marketId;

      // Get both markets
      const marketInfo1 = await core.getMarket(marketId1);
      const marketInfo2 = await core.getMarket(marketId2);

      expect(marketInfo1.startTimestamp).to.equal(marketConfig1.startTime);
      expect(marketInfo2.startTimestamp).to.equal(marketConfig2.startTime);
      expect(marketInfo1.endTimestamp).to.equal(marketConfig1.endTime);
      expect(marketInfo2.endTimestamp).to.equal(marketConfig2.endTime);
    });

    it("Should revert when getting info for non-existent market", async function () {
      const { core } = await loadFixture(createActiveMarketFixture);

      await expect(core.getMarket(999)).to.be.revertedWithCustomError(
        core,
        "MarketNotFound"
      );
    });

    it("Should return correct tick values after market creation", async function () {
      const { core, keeper, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      // Check initial tick values (should all be WAD initially)
      const WAD = ethers.parseEther("1");

      const tickValue1 = await getTickValue(core, marketId, 100000);
      const tickValue2 = await getTickValue(core, marketId, 100500);
      const tickValue3 = await getTickValue(core, marketId, 100990);

      expect(tickValue1).to.equal(WAD);
      expect(tickValue2).to.equal(WAD);
      expect(tickValue3).to.equal(WAD);
    });

    it("Should handle tick value queries for invalid ticks", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, keeper } = contracts;
      const { marketId, startTime, endTime } = await setupActiveMarket(
        contracts
      );

      // Should revert for ticks outside the valid range
      await expect(
        core.getRangeSum(marketId, 99999, 99999 + TICK_SPACING)
      ).to.be.revertedWithCustomError(core, "InvalidTick");

      await expect(
        core.getRangeSum(marketId, 101000, 101000 + TICK_SPACING)
      ).to.be.revertedWithCustomError(core, "InvalidTick");
    });

    it("Should handle tick value queries for non-existent markets", async function () {
      const { core } = await loadFixture(createActiveMarketFixture);

      await expect(
        core.getRangeSum(999, 100500, 100500 + TICK_SPACING)
      ).to.be.revertedWithCustomError(core, "MarketNotFound");
    });
  });

  describe("Position Information Getters", function () {
    it("Should return correct position information after opening", async function () {
      const { core, alice, marketId, mockPosition } = await loadFixture(
        createActiveMarketFixture
      );

      const lowerTick = 100100;
      const upperTick = 100200;
      const quantity = POSITION_QUANTITY;
      const maxCost = POSITION_MAX_COST;

      // Open position
      await core
        .connect(alice)
        .openPosition(marketId,
          lowerTick,
          upperTick,
          quantity,
          maxCost
        );

      // Get position information
      const positionData = await mockPosition.getPosition(1);

      expect(positionData.marketId).to.equal(marketId);
      expect(positionData.lowerTick).to.equal(lowerTick);
      expect(positionData.upperTick).to.equal(upperTick);
      expect(positionData.quantity).to.equal(quantity);

      // Check ownership
      const owner = await mockPosition.ownerOf(1);
      expect(owner).to.equal(alice.address);

      // Check user's positions
      const userPositions = await mockPosition.getPositionsByOwner(
        alice.address
      );
      expect(userPositions).to.have.length(1);
      expect(userPositions[0]).to.equal(1);
    });

    it("Should track position count correctly", async function () {
      const { core, alice, bob, marketId, mockPosition } = await loadFixture(
        createActiveMarketFixture
      );

      const lowerTick = 100100;
      const upperTick = 100200;
      const quantity = POSITION_QUANTITY;
      const maxCost = POSITION_MAX_COST;

      // Initially no positions
      expect(await mockPosition.totalSupply()).to.equal(0);

      // Open first position
      await core
        .connect(alice)
        .openPosition(marketId,
          lowerTick,
          upperTick,
          quantity,
          maxCost
        );

      expect(await mockPosition.totalSupply()).to.equal(1);

      // Open second position (different user)
      await core
        .connect(bob)
        .openPosition(marketId, 100300, 100400, quantity, maxCost);

      expect(await mockPosition.totalSupply()).to.equal(2);

      // Open third position (same user as first)
      await core
        .connect(alice)
        .openPosition(marketId,
          100500,
          100600,
          quantity,
          maxCost
        );

      expect(await mockPosition.totalSupply()).to.equal(3);

      // Check individual user counts
      const alicePositions = await mockPosition.getPositionsByOwner(
        alice.address
      );
      const bobPositions = await mockPosition.getPositionsByOwner(bob.address);

      expect(alicePositions).to.have.length(2);
      expect(bobPositions).to.have.length(1);
    });

    it("Should handle position ownership correctly", async function () {
      const { core, alice, bob, charlie, marketId, mockPosition } =
        await loadFixture(createActiveMarketFixture);

      const lowerTick = 100100;
      const upperTick = 100200;
      const quantity = POSITION_QUANTITY;
      const maxCost = POSITION_MAX_COST;

      // Open position
      await core
        .connect(alice)
        .openPosition(marketId,
          lowerTick,
          upperTick,
          quantity,
          maxCost
        );

      const positionId = 1;

      // Check initial ownership
      expect(await mockPosition.ownerOf(positionId)).to.equal(alice.address);

      // Transfer position to bob
      await mockPosition
        .connect(alice)
        .transferFrom(alice.address, bob.address, positionId);

      // Check ownership after transfer
      expect(await mockPosition.ownerOf(positionId)).to.equal(bob.address);

      // Check user position lists are updated
      const alicePositions = await mockPosition.getPositionsByOwner(
        alice.address
      );
      const bobPositions = await mockPosition.getPositionsByOwner(bob.address);

      expect(alicePositions).to.have.length(0);
      expect(bobPositions).to.have.length(1);
      expect(bobPositions[0]).to.equal(positionId);

      // Transfer to charlie
      await mockPosition
        .connect(bob)
        .transferFrom(bob.address, charlie.address, positionId);

      expect(await mockPosition.ownerOf(positionId)).to.equal(charlie.address);
    });
  });

  describe("Market State Calculations", function () {
    it("Should calculate open costs correctly", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, keeper } = contracts;
      const { marketId, startTime, endTime } = await setupActiveMarket(
        contracts
      );

      const lowerTick = 100100;
      const upperTick = 100200;
      const quantity = POSITION_QUANTITY;

      const cost = await core.calculateOpenCost(
        marketId,
        lowerTick,
        upperTick,
        quantity
      );

      expect(cost).to.be.gt(0);
      expect(cost).to.be.lt(POSITION_MAX_COST);
    });

    it("Should calculate close costs correctly", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, alice, keeper, mockPosition } = contracts;
      const { marketId, startTime, endTime } = await setupActiveMarket(
        contracts
      );

      const lowerTick = 100100;
      const upperTick = 100200;
      const quantity = POSITION_QUANTITY;
      const maxCost = POSITION_MAX_COST;

      // Open position first
      await core
        .connect(alice)
        .openPosition(marketId,
          lowerTick,
          upperTick,
          quantity,
          maxCost
        );

      const positions = await mockPosition.getPositionsByOwner(alice.address);
      expect(positions.length).to.be.gte(
        1,
        "Expected at least one position after opening"
      );
      const positionId = positions[positions.length - 1];

      // Calculate close proceeds
      const proceeds = await core.calculateCloseProceeds(positionId);

      expect(proceeds).to.be.gte(0);
      expect(proceeds).to.be.lt(maxCost); // Should get less back than paid
    });

    it("Should calculate settled payouts correctly", async function () {
      const { core, alice, keeper, mockPosition, marketId, endTime } =
        await loadFixture(createActiveMarketFixture);

      const lowerTick = 100100;
      const upperTick = 100200;
      const quantity = POSITION_QUANTITY;
      const maxCost = POSITION_MAX_COST;

      // Open position
      await core
        .connect(alice)
        .openPosition(marketId,
          lowerTick,
          upperTick,
          quantity,
          maxCost
        );

      const positions = await mockPosition.getPositionsByOwner(alice.address);
      const positionId = Number(positions[0]);

      // Fast forward past market end
      await time.increaseTo(endTime + 1);

      // Settle market with winning outcome in range
      await settleMarketAtTick(core, keeper, marketId, 100150);

      // Calculate claim amount
      const claimAmount = await core.calculateClaimAmount(positionId);

      expect(claimAmount).to.be.gt(0);
    });

    it("Should handle cost calculations for different tick ranges", async function () {
      const { core, keeper, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      const quantity = POSITION_QUANTITY;

      // Calculate costs for different ranges
      const narrowCost = await core.calculateOpenCost(
        marketId,
        100100,
        100110,
        quantity
      );
      const wideCost = await core.calculateOpenCost(
        marketId,
        100100,
        100200,
        quantity
      );
      const veryWideCost = await core.calculateOpenCost(
        marketId,
        100100,
        100500,
        quantity
      );

      // Wider ranges should generally cost more
      expect(wideCost).to.be.gte(narrowCost);
      expect(veryWideCost).to.be.gte(wideCost);
    });
  });

  describe("Market Existence and Validation", function () {
    it("Should correctly identify existing vs non-existing markets", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper } = contracts;

      const nonexistentId = 999999;
      await expect(core.getMarket(nonexistentId)).to.be.revertedWithCustomError(
        core,
        "MarketNotFound"
      );

      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + MARKET_DURATION;
      const settlementTime = endTime + 3600;

      const createdMarketId = await createMarketWithConfig(core, keeper, {
        minTick: MIN_TICK,
        maxTick: MAX_TICK,
        tickSpacing: TICK_SPACING,
        startTime,
        endTime,
        settlementTime,
        liquidityParameter: ALPHA,
      });

      const market = await core.getMarket(createdMarketId);
      expect(market.startTimestamp).to.equal(startTime);
      expect(market.endTimestamp).to.equal(endTime);

      const missingId = createdMarketId + 1000;
      await expect(core.getMarket(missingId)).to.be.revertedWithCustomError(
        core,
        "MarketNotFound"
      );
    });

    it("Should validate market parameters on creation", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper } = contracts;

      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + MARKET_DURATION;
      const settlementTime = endTime + 3600;

      await expect(
        core
          .connect(keeper)
          .createMarket(
            MIN_TICK,
            MIN_TICK - 10,
            TICK_SPACING,
            startTime,
            endTime,
            settlementTime,
            ALPHA
          )
      ).to.be.revertedWithCustomError(core, "InvalidMarketParameters");

      await expect(
        core
          .connect(keeper)
          .createMarket(
            MIN_TICK,
            MAX_TICK,
            TICK_SPACING,
            endTime,
            startTime,
            settlementTime,
            ALPHA
          )
      ).to.be.revertedWithCustomError(core, "InvalidTimeRange");

      await expect(
        core
          .connect(keeper)
          .createMarket(
            MIN_TICK,
            MAX_TICK,
            TICK_SPACING,
            startTime,
            endTime,
            settlementTime,
            ALPHA
          )
      ).not.to.be.reverted;
    });

    it("Should generate unique market identifiers", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper } = contracts;

      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + MARKET_DURATION;

      const firstMarketId = await createMarketWithConfig(core, keeper, {
        minTick: MIN_TICK,
        maxTick: MAX_TICK,
        tickSpacing: TICK_SPACING,
        startTime,
        endTime,
        liquidityParameter: ALPHA,
      });

      const secondMarketId = await createMarketWithConfig(core, keeper, {
        minTick: MIN_TICK + TICK_SPACING,
        maxTick: MAX_TICK + TICK_SPACING,
        tickSpacing: TICK_SPACING,
        startTime: startTime + 500,
        endTime: endTime + 500,
        liquidityParameter: ALPHA,
      });

      expect(secondMarketId).to.be.gt(firstMarketId);
    });
  });

  describe("Market State Queries", function () {
    it("Should return correct market information", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core } = contracts;
      const { marketId, startTime, endTime } = await setupCustomMarket(
        contracts,
        {
          alpha: ethers.parseEther("10"),
        }
      );

      const market = await core.getMarket(marketId);

      expect(market.startTimestamp).to.equal(startTime);
      expect(market.endTimestamp).to.equal(endTime);
      expect(market.liquidityParameter).to.equal(ethers.parseEther("10"));
      expect(market.settled).to.be.false;
    });

    it("Should return correct tick values", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core } = contracts;
      const { marketId } = await setupCustomMarket(contracts, {
        alpha: ethers.parseEther("10"),
      });

      const WAD = ethers.parseEther("1");

      // All ticks should initially have value WAD
      expect(await getTickValue(core, marketId, 100000)).to.equal(WAD);
      expect(await getTickValue(core, marketId, 100500)).to.equal(WAD);
      expect(await getTickValue(core, marketId, 100990)).to.equal(WAD);
    });

    it("Should handle queries for non-existent markets", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core } = contracts;
      await setupCustomMarket(contracts, {
        alpha: ethers.parseEther("10"),
      });

      await expect(core.getMarket(999)).to.be.revertedWithCustomError(
        core,
        "MarketNotFound"
      );

      await expect(
        core.getRangeSum(999, 100500, 100500 + TICK_SPACING)
      ).to.be.revertedWithCustomError(core, "MarketNotFound");
    });

    it("Should handle invalid tick queries", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core } = contracts;
      const { marketId } = await setupCustomMarket(contracts, {
        alpha: ethers.parseEther("10"),
      });

      // Ticks outside the valid range
      await expect(
        core.getRangeSum(marketId, 99999, 99999 + TICK_SPACING)
      ).to.be.revertedWithCustomError(core, "InvalidTick");

      await expect(
        core.getRangeSum(marketId, 101000, 101000 + TICK_SPACING)
      ).to.be.revertedWithCustomError(core, "InvalidTick");

      // Invalid tick spacing
      await expect(
        core.getRangeSum(marketId, 100001, 100001 + TICK_SPACING)
      ).to.be.revertedWithCustomError(core, "InvalidTickSpacing");
    });
  });

  describe("State Consistency Checks", function () {
    it("Should maintain consistent state after multiple operations", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, alice, bob, keeper } = contracts;
      const { marketId, startTime, endTime } = await setupActiveMarket(
        contracts
      );

      const lowerTick = 100100;
      const upperTick = 100200;
      const quantity = POSITION_QUANTITY;
      const maxCost = POSITION_MAX_COST;

      // Perform multiple operations
      await core
        .connect(alice)
        .openPosition(marketId,
          lowerTick,
          upperTick,
          quantity,
          maxCost
        );

      await core
        .connect(bob)
        .openPosition(marketId, 100300, 100400, quantity, maxCost);

      // State should remain consistent
      const market = await core.getMarket(marketId);
      expect(market.startTimestamp).to.equal(startTime);
      expect(market.endTimestamp).to.equal(endTime);

      // Tick values should be updated but still reasonable
      const tickValue = await getTickValue(core, marketId, 100150);
      expect(tickValue).to.be.gt(ethers.parseEther("1")); // Should be greater than initial WAD
    });

    it("Should handle view functions during different market states", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, alice, keeper, mockPosition } = contracts;

      const currentTime = Number(await time.latest());
      const startTime = currentTime + 100;
      const endTime = startTime + MARKET_DURATION;
      const settlementTime = endTime + 3600;

      const marketIdBig = await core
        .connect(keeper)
        .createMarket.staticCall(
          MIN_TICK,
          MAX_TICK,
          TICK_SPACING,
          startTime,
          endTime,
          settlementTime,
          ALPHA
        );

      await core
        .connect(keeper)
        .createMarket(
          MIN_TICK,
          MAX_TICK,
          TICK_SPACING,
          startTime,
          endTime,
          settlementTime,
          ALPHA
        );

      const marketId = Number(marketIdBig);
      await setMarketActivation(core, keeper, marketId, true);

      // PENDING state - before market starts
      let market = await core.getMarket(marketId);
      expect(market.startTimestamp).to.be.gt(await time.latest());

      const lowerTick = 100100;
      const upperTick = 100200;
      const quantity = POSITION_QUANTITY;

      // Should be able to calculate costs even before market starts
      const preCost = await core.calculateOpenCost(
        marketId,
        lowerTick,
        upperTick,
        quantity
      );
      expect(preCost).to.be.gt(0);

      // ACTIVE state - during market
      await time.increaseTo(startTime + 1);
      const activeCost = await core.calculateOpenCost(
        marketId,
        lowerTick,
        upperTick,
        quantity
      );
      expect(activeCost).to.equal(preCost); // Should be same as market state hasn't changed

      // Open a position
      const maxCost = POSITION_MAX_COST;
      await core
        .connect(alice)
        .openPosition(
          marketId,
          lowerTick,
          upperTick,
          quantity,
          maxCost
        );
      const positions = await mockPosition.getPositionsByOwner(alice.address);
      const positionId = Number(positions[0]);

      // ENDED state - after market ends
      await time.increaseTo(endTime + 1);
      market = await core.getMarket(marketId);
      expect(market.endTimestamp).to.be.lte(await time.latest());

      // SETTLED state
      await settleMarketAtTick(core, keeper, marketId, 100150);
      market = await core.getMarket(marketId);
      expect(market.settled).to.be.true;

      // Should still be able to query state
      const claimAmount = await core.calculateClaimAmount(positionId);
      expect(claimAmount).to.be.gte(0);
    });
  });
});
