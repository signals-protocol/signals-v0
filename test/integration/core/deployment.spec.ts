import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { COMPONENT_TAG } from "../../helpers/tags";
import {
  createActiveMarketFixture,
  unitFixture,
  TICK_COUNT,
} from "../../helpers/fixtures/core";

describe(`${COMPONENT_TAG} CLMSRMarketCore - Deployment & Configuration`, function () {
  const WAD = ethers.parseEther("1");

  describe("Contract Deployment", function () {
    it("Should deploy all contracts successfully with linked libraries", async function () {
      const {
        core,
        paymentToken,
        mockPosition,
        fixedPointMathU,
        lazyMulSegmentTree,
      } = await loadFixture(createActiveMarketFixture);

      expect(await core.getAddress()).to.not.equal(ethers.ZeroAddress);
      expect(await paymentToken.getAddress()).to.not.equal(ethers.ZeroAddress);
      expect(await mockPosition.getAddress()).to.not.equal(ethers.ZeroAddress);
      expect(await fixedPointMathU.getAddress()).to.not.equal(
        ethers.ZeroAddress
      );
      expect(await lazyMulSegmentTree.getAddress()).to.not.equal(
        ethers.ZeroAddress
      );
    });

    it("Should initialize core contract with correct parameters", async function () {
      const { core, paymentToken, mockPosition, keeper } = await loadFixture(
        createActiveMarketFixture
      );

      expect(await core.getPaymentToken()).to.equal(
        await paymentToken.getAddress()
      );
      expect(await core.getPositionContract()).to.equal(
        await mockPosition.getAddress()
      );
      expect(await core.owner()).to.equal(keeper.address);
      expect(await core.isPaused()).to.be.false;
    });

    it("Should revert initialization with zero addresses", async function () {
      const { fixedPointMathU, lazyMulSegmentTree } = await loadFixture(
        unitFixture
      );

      const CLMSRMarketCoreFactory = await ethers.getContractFactory(
        "CLMSRMarketCore",
        {
          libraries: {
            FixedPointMathU: await fixedPointMathU.getAddress(),
            LazyMulSegmentTree: await lazyMulSegmentTree.getAddress(),
          },
        }
      );

      const core = await CLMSRMarketCoreFactory.deploy();

      await expect(
        core.initialize(ethers.ZeroAddress, ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(core, "ZeroAddress");
    });

    it("Should reject payment tokens with non-6 decimals", async function () {
      const { fixedPointMathU, lazyMulSegmentTree } = await loadFixture(
        unitFixture
      );

      const CLMSRMarketCoreFactory = await ethers.getContractFactory(
        "CLMSRMarketCore",
        {
          libraries: {
            FixedPointMathU: await fixedPointMathU.getAddress(),
            LazyMulSegmentTree: await lazyMulSegmentTree.getAddress(),
          },
        }
      );
      const MockERC20Factory = await ethers.getContractFactory("MockERC20");
      const MockPositionFactory = await ethers.getContractFactory("MockPosition");

      const weirdToken = await MockERC20Factory.deploy("Weird USD", "WUSD", 18);
      await weirdToken.waitForDeployment();
      const mockPosition = await MockPositionFactory.deploy();
      await mockPosition.waitForDeployment();

      const core = await CLMSRMarketCoreFactory.deploy();
      await core.waitForDeployment();

      await expect(
        core.initialize(await weirdToken.getAddress(), await mockPosition.getAddress())
      )
        .to.be.revertedWithCustomError(core, "InvalidTokenDecimals")
        .withArgs(18, 6);
    });

    it("Should verify contract state after deployment", async function () {
      const { core, paymentToken, marketId, startTime, endTime } =
        await loadFixture(createActiveMarketFixture);

      // Check basic state
      expect(await core.getPaymentToken()).to.equal(
        await paymentToken.getAddress()
      );
      expect(await core.isPaused()).to.be.false;

      const market = await core.getMarket(marketId);
      expect(market.isActive).to.be.true;
      expect(market.startTimestamp).to.equal(BigInt(startTime));
      expect(market.endTimestamp).to.equal(BigInt(endTime));
      expect(market.minTick).to.equal(BigInt(100000));
      expect(market.maxTick).to.equal(
        BigInt(100000 + (TICK_COUNT - 1) * 10)
      );

      // Next market should not exist yet
      await expect(core.getMarket(marketId + 1)).to.be.revertedWithCustomError(
        core,
        "MarketNotFound"
      );
    });

    it("Should handle proper library linking verification", async function () {
      const { core, marketId } = await loadFixture(createActiveMarketFixture);

      const cost = await core.calculateOpenCost(
        marketId,
        100000,
        100010,
        ethers.parseUnits("0.01", 6)
      );
      expect(cost).to.be.greaterThan(0n);

      // This would fail if libraries aren't properly linked
      const code = await ethers.provider.getCode(await core.getAddress());
      expect(code).to.not.include("__$"); // No unlinked library placeholders
    });
  });

  describe("Initial Configuration", function () {
    it("Should have tokens approved for users", async function () {
      const { core, paymentToken, alice, bob } = await loadFixture(
        createActiveMarketFixture
      );

      const coreAddress = await core.getAddress();
      expect(await paymentToken.allowance(alice.address, coreAddress)).to.equal(
        ethers.MaxUint256
      );
      expect(await paymentToken.allowance(bob.address, coreAddress)).to.equal(
        ethers.MaxUint256
      );
    });

    it("Should have correct token balances", async function () {
      const { paymentToken, alice, bob, charlie } = await loadFixture(
        createActiveMarketFixture
      );

      const expectedBalance = ethers.parseUnits("1000000000000", 6); // 1T USDC (INITIAL_SUPPLY)
      expect(await paymentToken.balanceOf(alice.address)).to.equal(
        expectedBalance
      );
      expect(await paymentToken.balanceOf(bob.address)).to.equal(
        expectedBalance
      );
      expect(await paymentToken.balanceOf(charlie.address)).to.equal(
        expectedBalance
      );
    });

    it("Should verify payment token properties", async function () {
      const { paymentToken } = await loadFixture(createActiveMarketFixture);

      expect(await paymentToken.name()).to.equal("USD Coin");
      expect(await paymentToken.symbol()).to.equal("USDC");
      expect(await paymentToken.decimals()).to.equal(6);
    });

    it("Should link position contract correctly", async function () {
      const { core, mockPosition } = await loadFixture(
        createActiveMarketFixture
      );

      expect(await mockPosition.coreContract()).to.equal(
        await core.getAddress()
      );
    });
  });

  describe("Access Control Setup", function () {
    it("Should set keeper as manager", async function () {
      const { core, keeper } = await loadFixture(createActiveMarketFixture);

      expect(await core.owner()).to.equal(keeper.address);
    });

    it("Should verify initial paused state", async function () {
      const { core } = await loadFixture(createActiveMarketFixture);

      expect(await core.isPaused()).to.be.false;
    });

    it("Should allow keeper to pause/unpause", async function () {
      const { core, keeper } = await loadFixture(createActiveMarketFixture);

      await core.connect(keeper).pause("Test pause");
      expect(await core.isPaused()).to.be.true;

      await core.connect(keeper).unpause();
      expect(await core.isPaused()).to.be.false;
    });

    it("Should prevent non-keeper from pause operations", async function () {
      const { core, alice } = await loadFixture(createActiveMarketFixture);

      await expect(
        core.connect(alice).pause("Unauthorized")
      )
        .to.be.revertedWithCustomError(core, "OwnableUnauthorizedAccount")
        .withArgs(alice.address);

      await expect(core.connect(alice).unpause())
        .to.be.revertedWithCustomError(core, "OwnableUnauthorizedAccount")
        .withArgs(alice.address);
    });
  });

  describe("Contract Interaction Setup", function () {
    it("Should properly link position contract", async function () {
      const { core, mockPosition } = await loadFixture(
        createActiveMarketFixture
      );

      const linkedPosition = await core.getPositionContract();
      expect(linkedPosition).to.equal(await mockPosition.getAddress());

      // Verify bidirectional link
      expect(await mockPosition.coreContract()).to.equal(
        await core.getAddress()
      );
    });

    it("Should handle library function calls correctly", async function () {
      const { core } = await loadFixture(createActiveMarketFixture);

      // These calls should work if libraries are properly linked
      // (will revert for business logic reasons, not linking issues)
      await expect(core.getMarket(999)).to.be.revertedWithCustomError(
        core,
        "MarketNotFound"
      );
    });

    it("Should verify payment token integration", async function () {
      const { core, paymentToken } = await loadFixture(
        createActiveMarketFixture
      );

      expect(await core.getPaymentToken()).to.equal(
        await paymentToken.getAddress()
      );

      // Core should have tokens from setup
      const coreBalance = await paymentToken.balanceOf(await core.getAddress());
      expect(coreBalance).to.be.gt(0);
    });
  });

  describe("Error Handling", function () {
    it("Should handle basic error scenarios", async function () {
      const { core } = await loadFixture(createActiveMarketFixture);

      // Market not found
      await expect(core.getMarket(999)).to.be.revertedWithCustomError(
        core,
        "MarketNotFound"
      );

      // Invalid tick value on existing market
      await expect(core.getRangeSum(1, 0, 10)).to.be.revertedWithCustomError(
        core,
        "InvalidTick"
      );
    });
  });

  describe("Gas and Performance", function () {
    it("Should deploy within gas limits", async function () {
      const { core } = await loadFixture(createActiveMarketFixture);

      const deploymentTx = core.deploymentTransaction();
      expect(deploymentTx).to.not.be.null;

      if (deploymentTx) {
        const receipt = await deploymentTx.wait();
        expect(receipt?.gasUsed).to.be.lt(15_000_000); // Reasonable deployment limit
      }
    });

    it("Should handle multiple deployment scenarios", async function () {
      // loadFixture caches deployments in the same test run
      // This is expected behavior - different tests get fresh deployments
      // but multiple loadFixtures in the same test return cached instances
      const contracts1 = await loadFixture(createActiveMarketFixture);
      const contracts2 = await loadFixture(createActiveMarketFixture);

      // They should be the same due to fixture caching
      expect(await contracts1.core.getAddress()).to.equal(
        await contracts2.core.getAddress()
      );

      // Verify both work correctly
      expect(await contracts1.core.isPaused()).to.be.false;
      expect(await contracts2.core.isPaused()).to.be.false;
    });

    it("Should verify all required contracts are functional", async function () {
      const { core, paymentToken, mockPosition, keeper } = await loadFixture(
        createActiveMarketFixture
      );

      // Test core functionality
      expect(await core.isPaused()).to.be.false;

      // Test token functionality
      expect(await paymentToken.totalSupply()).to.be.gt(0);

      // Test position functionality
      expect(await mockPosition.coreContract()).to.equal(
        await core.getAddress()
      );

      // Test manager functionality
      await core.connect(keeper).pause("Test pause");
      expect(await core.isPaused()).to.be.true;
      await core.connect(keeper).unpause();
    });
  });

  describe("Contract Deployment from Original", function () {
    it("Should deploy all contracts successfully with linked libraries", async function () {
      const { core, paymentToken, mockPosition } = await loadFixture(
        createActiveMarketFixture
      );

      expect(await core.getAddress()).to.not.equal(ethers.ZeroAddress);
      expect(await paymentToken.getAddress()).to.not.equal(ethers.ZeroAddress);
      expect(await mockPosition.getAddress()).to.not.equal(ethers.ZeroAddress);
    });

    it("Should initialize core contract with correct parameters", async function () {
      const { core, paymentToken, mockPosition, keeper } = await loadFixture(
        createActiveMarketFixture
      );

      expect(await core.getPaymentToken()).to.equal(
        await paymentToken.getAddress()
      );
      expect(await core.getPositionContract()).to.equal(
        await mockPosition.getAddress()
      );
      expect(await core.owner()).to.equal(keeper.address);
      expect(await core.isPaused()).to.be.false;
    });

  });
});
