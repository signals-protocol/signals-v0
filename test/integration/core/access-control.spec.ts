import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import {
  coreFixture,
  createActiveMarketFixture,
  createMarketWithConfig,
  setMarketActivation,
  setupActiveMarket,
  unitFixture,
  toSettlementValue,
  ALPHA,
  TICK_COUNT,
  MARKET_DURATION,
} from "../../helpers/fixtures/core";
import { COMPONENT_TAG } from "../../helpers/tags";

describe(`${COMPONENT_TAG} CLMSRMarketCore - Access Control`, function () {
  describe("Role Management", function () {
    it("Should have correct initial admin roles", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, keeper } = contracts;

      // Manager should be able to pause/unpause
      await expect(core.connect(keeper).pause("Test pause"))
        .to.emit(core, "EmergencyPaused")
        .withArgs(keeper.address, "Test pause"); // reason 파라미터 추가

      expect(await core.isPaused()).to.be.true;

      // Test unpause functionality
      await expect(core.connect(keeper).unpause())
        .to.emit(core, "EmergencyUnpaused")
        .withArgs(keeper.address);

      expect(await core.isPaused()).to.be.false;
    });

    it("Should reject unauthorized manager operations", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, alice } = contracts;

      // Non-manager should not be able to pause
      await expect(core.connect(alice).pause("Unauthorized"))
        .to.be.revertedWithCustomError(core, "OwnableUnauthorizedAccount")
        .withArgs(alice.address);
    });
  });

  describe("Trading Access", function () {
    it("Should allow public trading operations", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, keeper, alice, paymentToken } = contracts;

      // Create a test market using helper (already active)
      const { marketId } = await setupActiveMarket(contracts);

      // Approve tokens for alice
      await paymentToken
        .connect(alice)
        .approve(await core.getAddress(), ethers.parseUnits("1000", 6));

      // Alice should be able to open position directly (no authorization needed)
      const quantity = 100;
      const maxCost = ethers.parseUnits("10", 6); // 10 USDC

      await expect(
        core
          .connect(alice)
          .openPosition(
            marketId,
            100100,
            100200,
            quantity,
            maxCost
          )
      ).to.not.be.reverted;
    });
  });

  describe("Market Activation Controls", function () {
    it("Should restrict activation toggles to owner", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper, alice } = contracts;

      const now = await time.latest();
      const startTime = now + 600;
      const endTime = startTime + MARKET_DURATION;
      const marketId = await createMarketWithConfig(core, keeper, {
        minTick: 100000,
        maxTick: 100990,
        tickSpacing: 10,
        startTime,
        endTime,
        liquidityParameter: ALPHA,
      });

      await expect(
        core.connect(alice).setMarketActive(marketId, true)
      )
        .to.be.revertedWithCustomError(core, "OwnableUnauthorizedAccount")
        .withArgs(alice.address);

      const tx = core.connect(keeper).setMarketActive(marketId, true);
      await expect(tx)
        .to.emit(core, "MarketActivationUpdated")
        .withArgs(BigInt(marketId), true);
    });

    it("Should prevent activation changes after settlement", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper } = contracts;

      const now = await time.latest();
      const startTime = now + 600;
      const endTime = startTime + MARKET_DURATION;
      const settlementTime = endTime + 3600;
      const marketId = await createMarketWithConfig(core, keeper, {
        minTick: 100000,
        maxTick: 100990,
        tickSpacing: 10,
        startTime,
        endTime,
        liquidityParameter: ALPHA,
        settlementTime,
      });

      await setMarketActivation(core, keeper, marketId, true);
      await time.increaseTo(settlementTime + 1);

      await core
        .connect(keeper)
        .settleMarket(marketId, toSettlementValue(100450));

      await expect(
        core.connect(keeper).setMarketActive(marketId, true)
      ).to.be.revertedWithCustomError(core, "MarketAlreadySettled");
    });

    it("Should be idempotent when toggling to same state", async function () {
      const contracts = await loadFixture(coreFixture);
      const { core, keeper } = contracts;

      const now = await time.latest();
      const startTime = now + 600;
      const endTime = startTime + MARKET_DURATION;
      const marketId = await createMarketWithConfig(core, keeper, {
        minTick: 100000,
        maxTick: 100990,
        tickSpacing: 10,
        startTime,
        endTime,
        liquidityParameter: ALPHA,
      });

      const activateTx = core.connect(keeper).setMarketActive(marketId, true);
      await expect(activateTx)
        .to.emit(core, "MarketActivationUpdated")
        .withArgs(BigInt(marketId), true);

      const noopTx = core.connect(keeper).setMarketActive(marketId, true);
      await expect(noopTx).to.not.emit(core, "MarketActivationUpdated");
    });
  });

  describe("Position Contract Integration", function () {
    it("Should have correct position contract reference", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, mockPosition } = contracts;

      // Core should reference the correct position contract
      expect(await core.getPositionContract()).to.equal(
        await mockPosition.getAddress()
      );
    });
  });

  describe("Manager Delegation", function () {
    it("Should emit ManagerUpdated and update manager pointer", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, keeper, manager, lazyMulSegmentTree } = contracts as any;

      const ManagerFactory = await ethers.getContractFactory(
        "CLMSRMarketManager",
        {
          libraries: {
            LazyMulSegmentTree: await lazyMulSegmentTree.getAddress(),
          },
        }
      );
      const newManager = await ManagerFactory.deploy();
      await newManager.waitForDeployment();

      await expect(
        core.connect(keeper).setManager(await newManager.getAddress())
      )
        .to.emit(core, "ManagerUpdated")
        .withArgs(
          await manager.getAddress(),
          await newManager.getAddress()
        );

      expect(await core.manager()).to.equal(
        await newManager.getAddress()
      );
    });

    it("Should revert lifecycle calls when manager is not configured", async function () {
      const base = await loadFixture(unitFixture);
      const { deployer, fixedPointMathU, lazyMulSegmentTree } = base as any;

      const MockERC20Factory = await ethers.getContractFactory("MockERC20");
      const paymentToken = await MockERC20Factory.deploy("USD Coin", "USDC", 6);
      await paymentToken.waitForDeployment();

      const MockPositionFactory = await ethers.getContractFactory("MockPosition");
      const mockPosition = await MockPositionFactory.deploy();
      await mockPosition.waitForDeployment();

      const CoreFactory = await ethers.getContractFactory(
        "CLMSRMarketCore",
        {
          libraries: {
            FixedPointMathU: await fixedPointMathU.getAddress(),
            LazyMulSegmentTree: await lazyMulSegmentTree.getAddress(),
          },
        }
      );
      const core = await CoreFactory.deploy();
      await core.waitForDeployment();

      await core.initialize(
        await paymentToken.getAddress(),
        await mockPosition.getAddress()
      );

      const now = await time.latest();
      const startTime = now + 60;
      const endTime = startTime + MARKET_DURATION;
      const settlementTime = endTime + 3600;

      await expect(
        core
          .connect(deployer)
          .createMarket(
            100000,
            100000 + (TICK_COUNT - 1) * 10,
            10,
            startTime,
            endTime,
            settlementTime,
            ALPHA,
            ethers.ZeroAddress
          )
      ).to.be.revertedWithCustomError(core, "ManagerNotSet");
    });
  });
});
