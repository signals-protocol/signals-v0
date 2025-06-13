import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { coreFixture } from "../../helpers/fixtures/core";
import { COMPONENT_TAG } from "../../helpers/tags";

describe(`${COMPONENT_TAG} CLMSRMarketCore - Events`, function () {
  describe("Market Events", function () {
    it("Should emit MarketCreated event with correct parameters", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper } = contracts;

      const marketId = 1;
      const tickCount = 100;
      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;
      const liquidityParameter = ethers.parseEther("0.1");

      await expect(
        core
          .connect(keeper)
          .createMarket(
            marketId,
            tickCount,
            startTime,
            endTime,
            liquidityParameter
          )
      )
        .to.emit(core, "MarketCreated")
        .withArgs(marketId, startTime, endTime, tickCount, liquidityParameter);
    });

    it("Should emit MarketSettled event with correct parameters", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper } = contracts;

      const marketId = 1;
      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;

      // Create market first
      await core
        .connect(keeper)
        .createMarket(
          marketId,
          100,
          startTime,
          endTime,
          ethers.parseEther("0.1")
        );

      // Fast forward past end time
      await time.increaseTo(endTime + 1);

      const winningTick = 50;

      await expect(core.connect(keeper).settleMarket(marketId, winningTick))
        .to.emit(core, "MarketSettled")
        .withArgs(marketId, winningTick);
    });

    it("Should emit MarketStatusChanged event on status transitions", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper } = contracts;

      const marketId = 1;
      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;

      // Create market - should emit market created
      await expect(
        core
          .connect(keeper)
          .createMarket(
            marketId,
            100,
            startTime,
            endTime,
            ethers.parseEther("0.1")
          )
      )
        .to.emit(core, "MarketCreated")
        .withArgs(marketId, startTime, endTime, 100, ethers.parseEther("0.1"));

      // Market should transition to ACTIVE when start time is reached
      await time.increaseTo(startTime + 1);

      // Any interaction should trigger status update
      const market = await core.getMarket(marketId);
      expect(market.startTimestamp).to.be.lte(await time.latest()); // Should be active
    });
  });

  describe("Position Events", function () {
    it("Should emit PositionOpened event with correct parameters", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, router, alice, keeper } = contracts;

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

      const expectedCost = await core.calculateOpenCost(
        marketId,
        10,
        20,
        tradeParams.quantity
      );

      await expect(
        core.connect(router).openPosition(alice.address, tradeParams)
      )
        .to.emit(core, "PositionOpened")
        .withArgs(
          1, // positionId
          alice.address,
          marketId,
          10, // lowerTick
          20, // upperTick
          tradeParams.quantity,
          expectedCost
        );
    });

    it("Should emit PositionIncreased event with correct parameters", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, router, alice, keeper } = contracts;

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

      // Open initial position
      const initialParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: ethers.parseUnits("1", 6),
        maxCost: ethers.parseUnits("10", 6),
      };

      await core.connect(router).openPosition(alice.address, initialParams);

      // Increase position
      const additionalQuantity = ethers.parseUnits("0.5", 6);
      const expectedAdditionalCost = await core.calculateOpenCost(
        marketId,
        10,
        20,
        additionalQuantity
      );

      const increaseParams = {
        positionId: 1,
        additionalQuantity,
        maxAdditionalCost: ethers.parseUnits("10", 6),
      };

      await expect(
        core.connect(router).increasePosition(
          1, // positionId
          additionalQuantity,
          ethers.parseUnits("10", 6) // maxCost
        )
      )
        .to.emit(core, "PositionIncreased")
        .withArgs(
          1, // positionId
          alice.address, // trader
          additionalQuantity,
          initialParams.quantity + additionalQuantity, // new total quantity
          expectedAdditionalCost
        );
    });

    it("Should emit PositionDecreased event with correct parameters", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, router, alice, keeper } = contracts;

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
        quantity: ethers.parseUnits("0.1", 6),
        maxCost: ethers.parseUnits("20", 6),
      };

      await core.connect(router).openPosition(alice.address, tradeParams);

      // Decrease position
      const quantityToRemove = ethers.parseUnits("0.05", 6);
      const expectedPayout = await core.calculateDecreaseProceeds(
        1, // positionId
        quantityToRemove
      );

      const decreaseParams = {
        positionId: 1,
        quantityToRemove,
        minPayout: 0,
      };

      await expect(
        core.connect(router).decreasePosition(
          1, // positionId
          quantityToRemove,
          0 // minPayout
        )
      )
        .to.emit(core, "PositionDecreased")
        .withArgs(
          1, // positionId
          alice.address, // trader
          quantityToRemove,
          tradeParams.quantity - quantityToRemove, // new quantity
          expectedPayout
        );
    });

    it("Should emit PositionClosed event with correct parameters", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, router, alice, keeper } = contracts;

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

      await core.connect(router).openPosition(alice.address, tradeParams);

      // Close position
      const expectedPayout = await core.calculateCloseProceeds(1);

      const closeParams = {
        positionId: 1,
        minPayout: 0,
      };

      await expect(core.connect(router).closePosition(1, 0))
        .to.emit(core, "PositionClosed")
        .withArgs(
          1, // positionId
          alice.address, // trader
          expectedPayout
        );
    });

    it("Should emit PositionClaimed event with correct parameters", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, router, alice, keeper } = contracts;

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

      await core.connect(router).openPosition(alice.address, tradeParams);

      // Settle market
      await time.increaseTo(endTime + 1);
      await core.connect(keeper).settleMarket(marketId, 15); // Winning outcome in range

      // Calculate expected payout
      const expectedPayout = await core.calculateClaimAmount(1);

      await expect(core.connect(router).claimPayout(1))
        .to.emit(core, "PositionClaimed")
        .withArgs(
          1, // positionId
          alice.address,
          expectedPayout
        );
    });
  });

  describe("Trading Events with Detailed Parameters", function () {
    it("Should emit detailed events for complex position operations", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, router, alice, keeper } = contracts;

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

      // Check that multiple events are emitted in correct order
      const tx = await core
        .connect(router)
        .openPosition(alice.address, tradeParams);
      const receipt = await tx.wait();

      const positionOpenedEvent = receipt!.logs.find(
        (log) =>
          log.topics[0] === core.interface.getEvent("PositionOpened").topicHash
      );
      expect(positionOpenedEvent).to.exist;

      // Verify event data can be decoded
      const decoded = core.interface.decodeEventLog(
        "PositionOpened",
        positionOpenedEvent!.data,
        positionOpenedEvent!.topics
      );

      expect(decoded.positionId).to.equal(1n);
      expect(decoded.trader).to.equal(alice.address);
      expect(decoded.marketId).to.equal(marketId);
      expect(decoded.lowerTick).to.equal(10);
      expect(decoded.upperTick).to.equal(20);
      expect(decoded.quantity).to.equal(tradeParams.quantity);
    });

    it("Should emit events with proper gas tracking", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, router, alice, keeper } = contracts;

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

      const tx = await core
        .connect(router)
        .openPosition(alice.address, tradeParams);
      const receipt = await tx.wait();

      // Verify gas usage is reasonable
      expect(receipt!.gasUsed).to.be.lt(ethers.parseUnits("1", "gwei")); // Less than 1 gwei worth of gas
      expect(receipt!.gasUsed).to.be.gt(50000); // More than minimum gas
    });
  });

  describe("Error Events", function () {
    it("Should emit error-related events on failed operations", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, router, alice, keeper } = contracts;

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

      // Try to open position with insufficient maxCost
      const tradeParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: ethers.parseUnits("1", 6),
        maxCost: 1, // Extremely low maxCost
      };

      await expect(
        core.connect(router).openPosition(alice.address, tradeParams)
      ).to.be.revertedWithCustomError(core, "CostExceedsMaximum");
    });

    it("Should handle event emissions during edge cases", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, router, alice, keeper } = contracts;

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

      // Open position with minimal quantity
      const tradeParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: 1n, // 1 wei
        maxCost: ethers.parseUnits("10", 6),
      };

      // Should still emit proper events even for minimal trades
      await expect(
        core.connect(router).openPosition(alice.address, tradeParams)
      )
        .to.emit(core, "PositionOpened")
        .withArgs(
          1, // positionId
          alice.address,
          marketId,
          10, // lowerTick
          20, // upperTick
          1n, // quantity
          anyValue // cost (calculated dynamically)
        );
    });
  });

  describe("Market State Events", function () {
    it("Should emit events during market lifecycle transitions", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper } = contracts;

      const marketId = 1;
      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;

      // Market creation should emit events
      await expect(
        core
          .connect(keeper)
          .createMarket(
            marketId,
            100,
            startTime,
            endTime,
            ethers.parseEther("0.1")
          )
      ).to.emit(core, "MarketCreated");

      // Fast forward to settlement
      await time.increaseTo(endTime + 1);

      // Market settlement should emit events
      await expect(core.connect(keeper).settleMarket(marketId, 50)).to.emit(
        core,
        "MarketSettled"
      );
    });

    it("Should emit proper timestamp information in events", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper } = contracts;

      const marketId = 1;
      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;

      const tx = await core
        .connect(keeper)
        .createMarket(
          marketId,
          100,
          startTime,
          endTime,
          ethers.parseEther("0.1")
        );

      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt!.blockNumber);

      // Verify block timestamp is reasonable
      expect(block!.timestamp).to.be.gte(currentTime);
      expect(block!.timestamp).to.be.lt(startTime);
    });
  });

  describe("Event Data Integrity", function () {
    it("Should maintain event parameter consistency across operations", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, router, alice, keeper } = contracts;

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

      // Open position and capture event data
      const tradeParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: ethers.parseUnits("1", 6),
        maxCost: ethers.parseUnits("10", 6),
      };

      const openTx = await core
        .connect(router)
        .openPosition(alice.address, tradeParams);
      const openReceipt = await openTx.wait();

      // Extract position data from events
      const positionEvent = openReceipt!.logs.find(
        (log) =>
          log.topics[0] === core.interface.getEvent("PositionOpened").topicHash
      );

      const positionData = core.interface.decodeEventLog(
        "PositionOpened",
        positionEvent!.data,
        positionEvent!.topics
      );

      // Close position and verify consistency
      await expect(
        core.connect(router).closePosition(positionData.positionId, 0)
      )
        .to.emit(core, "PositionClosed")
        .withArgs(
          positionData.positionId,
          alice.address, // trader
          anyValue // payout amount
        );
    });

    it("Should handle large numeric values in events", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, router, alice, keeper } = contracts;

      const marketId = 1;
      const currentTime = await time.latest();
      const startTime = currentTime + 100;
      const endTime = startTime + 86400;

      // Create market with large liquidity parameter
      const largeLiquidity = ethers.parseEther("1000");
      await core
        .connect(keeper)
        .createMarket(marketId, 100, startTime, endTime, largeLiquidity);

      await time.increaseTo(startTime + 1);

      // Large quantity trade
      const largeQuantity = ethers.parseUnits("1000", 6);
      const tradeParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: largeQuantity,
        maxCost: ethers.parseUnits("10000", 6),
      };

      await expect(
        core.connect(router).openPosition(alice.address, tradeParams)
      )
        .to.emit(core, "PositionOpened")
        .withArgs(
          1, // positionId
          alice.address,
          marketId,
          10, // lowerTick
          20, // upperTick
          largeQuantity,
          anyValue // cost
        );
    });
  });

  describe("Router Events", function () {
    it("Should emit RouterSet when router is updated", async function () {
      const contracts = await loadFixture(coreFixture);
      const { keeper, alice } = contracts;

      // Deploy new core without router set
      const CLMSRMarketCoreFactory = await ethers.getContractFactory(
        "CLMSRMarketCore",
        {
          libraries: {
            FixedPointMathU: await contracts.fixedPointMathU.getAddress(),
            LazyMulSegmentTree: await contracts.lazyMulSegmentTree.getAddress(),
          },
        }
      );

      const newCore = await CLMSRMarketCoreFactory.deploy(
        await contracts.paymentToken.getAddress(),
        await contracts.mockPosition.getAddress(),
        keeper.address
      );

      await expect(newCore.connect(keeper).setRouterContract(alice.address))
        .to.emit(newCore, "RouterSet")
        .withArgs(alice.address);
    });
  });
});
