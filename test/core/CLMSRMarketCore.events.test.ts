import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import {
  deployStandardFixture,
  createActiveMarket,
  SMALL_QUANTITY,
  MEDIUM_QUANTITY,
  LARGE_QUANTITY,
  EXTREME_COST,
  ALPHA,
  USDC_DECIMALS,
  TICK_COUNT,
} from "./CLMSRMarketCore.fixtures";

describe("CLMSRMarketCore - Events", function () {
  // ========================================
  // FIXTURES
  // ========================================

  async function deployStandardFixture() {
    const [deployer, keeper, router, alice, bob] = await ethers.getSigners();

    // Deploy libraries
    const FixedPointMathU = await ethers.getContractFactory("FixedPointMathU");
    const fixedPointMathU = await FixedPointMathU.deploy();

    const LazyMulSegmentTree = await ethers.getContractFactory(
      "LazyMulSegmentTree",
      {
        libraries: {
          FixedPointMathU: await fixedPointMathU.getAddress(),
        },
      }
    );
    const lazyMulSegmentTree = await LazyMulSegmentTree.deploy();

    // Deploy mock payment token (USDC - 6 decimals)
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const paymentToken = await MockERC20.deploy("USD Coin", "USDC", 6);

    // Deploy mock position contract
    const MockPosition = await ethers.getContractFactory("MockPosition");
    const mockPosition = await MockPosition.deploy();

    // Deploy core contract with libraries
    const CLMSRMarketCore = await ethers.getContractFactory("CLMSRMarketCore", {
      libraries: {
        FixedPointMathU: await fixedPointMathU.getAddress(),
        LazyMulSegmentTree: await lazyMulSegmentTree.getAddress(),
      },
    });

    const core = await CLMSRMarketCore.deploy(
      await paymentToken.getAddress(),
      await mockPosition.getAddress(),
      keeper.address // Manager
    );

    // Set core in position contract
    await mockPosition.setCore(await core.getAddress());

    // Set router in core
    await core.connect(keeper).setRouterContract(router.address);

    // Mint tokens to users and contract
    await paymentToken.mint(alice.address, ethers.parseUnits("10000", 6));
    await paymentToken.mint(bob.address, ethers.parseUnits("10000", 6));
    await paymentToken.mint(
      await core.getAddress(),
      ethers.parseUnits("10000", 6)
    );

    // Approve core to spend tokens
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
      fixedPointMathU,
      lazyMulSegmentTree,
      deployer,
      keeper,
      router,
      alice,
      bob,
    };
  }

  async function createActiveMarket(contracts: {
    core: any;
    keeper: any;
    paymentToken: any;
  }) {
    const { core, keeper } = contracts;

    const marketId = 1;
    const startTime = Math.floor(Date.now() / 1000);
    const endTime = startTime + 86400; // 1 day

    await core
      .connect(keeper)
      .createMarket(marketId, TICK_COUNT, startTime, endTime, ALPHA);

    return { marketId };
  }

  // ========================================
  // EVENT EMISSION TESTS
  // ========================================

  describe("Market Management Events", function () {
    it("Should emit MarketCreated with correct parameters", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { core, keeper } = contracts;

      const marketId = 1;
      const startTime = Math.floor(Date.now() / 1000);
      const endTime = startTime + 86400;

      await expect(
        core
          .connect(keeper)
          .createMarket(marketId, TICK_COUNT, startTime, endTime, ALPHA)
      )
        .to.emit(core, "MarketCreated")
        .withArgs(marketId, startTime, endTime, TICK_COUNT, ALPHA);
    });

    it("Should emit MarketSettled with correct parameters", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core, keeper } = contracts;

      const winningTick = 50;

      await expect(core.connect(keeper).settleMarket(marketId, winningTick))
        .to.emit(core, "MarketSettled")
        .withArgs(marketId, winningTick);
    });

    it("Should emit EmergencyPaused with correct parameters", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { core, keeper } = contracts;

      await expect(core.connect(keeper).pause("Emergency test"))
        .to.emit(core, "EmergencyPaused")
        .withArgs(keeper.address, "Emergency test");
    });

    it("Should emit EmergencyUnpaused with correct parameters", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { core, keeper } = contracts;

      // First pause
      await core.connect(keeper).pause("Emergency test");

      // Then unpause
      await expect(core.connect(keeper).unpause())
        .to.emit(core, "EmergencyUnpaused")
        .withArgs(keeper.address);
    });
  });

  describe("Authorization and Access Control", function () {
    it("Should only allow keeper to create markets", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { core, alice } = contracts;

      const startTime = Math.floor(Date.now() / 1000) + 100;
      const endTime = startTime + 86400;

      await expect(
        core.connect(alice).createMarket(99, 100, startTime, endTime, ALPHA)
      ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");
    });

    it("Should only allow keeper to pause/unpause", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { core, alice } = contracts;

      await expect(
        core.connect(alice).pause("Unauthorized")
      ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");

      await expect(core.connect(alice).unpause()).to.be.revertedWithCustomError(
        core,
        "UnauthorizedCaller"
      );
    });

    it("Should only allow router to execute trades", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core, alice } = contracts;

      const tradeParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: SMALL_QUANTITY,
        maxCost: EXTREME_COST,
      };

      await expect(
        core.connect(alice).openPosition(alice.address, tradeParams)
      ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");
    });

    it("Should only allow position owner or router to adjust positions", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core, router, alice, bob } = contracts;

      // Create position as alice
      const tradeParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: MEDIUM_QUANTITY,
        maxCost: EXTREME_COST,
      };

      await core.connect(router).openPosition(alice.address, tradeParams);

      // Bob should not be able to adjust alice's position
      await expect(
        core.connect(bob).increasePosition(1, SMALL_QUANTITY, EXTREME_COST)
      ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");
    });

    it("Should only allow position owner or router to close positions", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core, router, alice, bob } = contracts;

      // Create position as alice
      const tradeParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: MEDIUM_QUANTITY,
        maxCost: EXTREME_COST,
      };

      await core.connect(router).openPosition(alice.address, tradeParams);

      // Bob should not be able to close alice's position
      await expect(
        core.connect(bob).closePosition(1, 0)
      ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");
    });

    it("Should allow keeper to update router contract", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { core, keeper, alice } = contracts;

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

    it("Should not allow non-keeper to update router contract", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { core, alice } = contracts;

      await expect(
        core.connect(alice).setRouterContract(alice.address)
      ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");
    });

    it("Should prevent non-manager from calling settleMarket", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core, alice, bob } = contracts;

      await expect(
        core.connect(alice).settleMarket(marketId, 50)
      ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");

      await expect(
        core.connect(bob).settleMarket(marketId, 50)
      ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");
    });

    it("Should prevent router setting after initial setup", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { core, keeper, alice } = contracts;

      // Router is already set in fixture, trying to set again should fail
      await expect(
        core.connect(keeper).setRouterContract(alice.address)
      ).to.be.revertedWithCustomError(core, "InvalidMarketParameters");
    });
  });

  describe("Pause State Testing", function () {
    it("Should prevent all trading when paused", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core, keeper, router, alice } = contracts;

      // Pause the contract
      await core.connect(keeper).pause("Testing pause");

      const tradeParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: SMALL_QUANTITY,
        maxCost: EXTREME_COST,
      };

      await expect(
        core.connect(router).openPosition(alice.address, tradeParams)
      ).to.be.revertedWithCustomError(core, "ContractPaused");
    });

    it("Should prevent position adjustments when paused", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core, keeper, router, alice } = contracts;

      // Create position first
      const tradeParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: MEDIUM_QUANTITY,
        maxCost: EXTREME_COST,
      };

      await core.connect(router).openPosition(alice.address, tradeParams);

      // Pause the contract
      await core.connect(keeper).pause("Testing pause");

      await expect(
        core.connect(router).increasePosition(1, SMALL_QUANTITY, EXTREME_COST)
      ).to.be.revertedWithCustomError(core, "ContractPaused");
    });

    it("Should prevent position closing when paused", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core, keeper, router, alice } = contracts;

      // Create position first
      const tradeParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: MEDIUM_QUANTITY,
        maxCost: EXTREME_COST,
      };

      await core.connect(router).openPosition(alice.address, tradeParams);

      // Pause the contract
      await core.connect(keeper).pause("Testing pause");

      await expect(
        core.connect(router).closePosition(1, 0)
      ).to.be.revertedWithCustomError(core, "ContractPaused");
    });

    it("Should prevent position claiming when paused", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core, keeper, router, alice } = contracts;

      // Create position first
      const tradeParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: MEDIUM_QUANTITY,
        maxCost: EXTREME_COST,
      };

      await core.connect(router).openPosition(alice.address, tradeParams);

      // Settle market
      await core.connect(keeper).settleMarket(marketId, 15);

      // Pause the contract
      await core.connect(keeper).pause("Testing pause");

      await expect(
        core.connect(router).claimPayout(1)
      ).to.be.revertedWithCustomError(core, "ContractPaused");
    });
  });

  describe("Position Events", function () {
    it("Should emit PositionOpened with correct parameters", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core, router, alice } = contracts;

      const tradeParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: MEDIUM_QUANTITY,
        maxCost: EXTREME_COST,
      };

      await expect(
        core.connect(router).openPosition(alice.address, tradeParams)
      )
        .to.emit(core, "PositionOpened")
        .withArgs(
          marketId,
          alice.address,
          1, // positionId
          10, // lowerTick
          20, // upperTick
          MEDIUM_QUANTITY,
          anyValue // cost
        );
    });

    it("Should emit PositionIncreased with correct parameters", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core, router, alice } = contracts;

      // Create position first
      const tradeParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: MEDIUM_QUANTITY,
        maxCost: EXTREME_COST,
      };

      await core.connect(router).openPosition(alice.address, tradeParams);

      // Increase position
      await expect(
        core.connect(router).increasePosition(1, SMALL_QUANTITY, EXTREME_COST)
      )
        .to.emit(core, "PositionIncreased")
        .withArgs(
          1, // positionId
          alice.address,
          SMALL_QUANTITY, // additionalQuantity
          MEDIUM_QUANTITY + SMALL_QUANTITY, // newQuantity
          anyValue // cost
        );
    });

    it("Should emit PositionDecreased with correct parameters", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core, router, alice } = contracts;

      // Create position first
      const tradeParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: LARGE_QUANTITY,
        maxCost: EXTREME_COST,
      };

      await core.connect(router).openPosition(alice.address, tradeParams);

      // Decrease position
      await expect(core.connect(router).decreasePosition(1, SMALL_QUANTITY, 0))
        .to.emit(core, "PositionDecreased")
        .withArgs(
          1, // positionId
          alice.address,
          SMALL_QUANTITY, // sellQuantity
          LARGE_QUANTITY - SMALL_QUANTITY, // newQuantity
          anyValue // proceeds
        );
    });

    it("Should emit PositionClosed with correct parameters", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core, router, alice } = contracts;

      // Create position first
      const tradeParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: MEDIUM_QUANTITY,
        maxCost: EXTREME_COST,
      };

      await core.connect(router).openPosition(alice.address, tradeParams);

      // Close position
      await expect(core.connect(router).closePosition(1, 0))
        .to.emit(core, "PositionClosed")
        .withArgs(
          1, // positionId
          alice.address,
          anyValue // proceeds
        );
    });

    it("Should emit PositionClaimed with correct parameters", async function () {
      const contracts = await loadFixture(deployStandardFixture);
      const { marketId } = await createActiveMarket(contracts);
      const { core, keeper, router, alice } = contracts;

      // Create position first
      const tradeParams = {
        marketId,
        lowerTick: 10,
        upperTick: 20,
        quantity: MEDIUM_QUANTITY,
        maxCost: EXTREME_COST,
      };

      await core.connect(router).openPosition(alice.address, tradeParams);

      // Settle market with winning tick in range
      await core.connect(keeper).settleMarket(marketId, 15);

      // Claim position
      await expect(core.connect(router).claimPayout(1))
        .to.emit(core, "PositionClaimed")
        .withArgs(
          1, // positionId
          alice.address,
          anyValue // payout
        );
    });
  });

  describe("Router Events", function () {
    it("Should emit RouterSet when router is updated", async function () {
      const contracts = await loadFixture(deployStandardFixture);
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
