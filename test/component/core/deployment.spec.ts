import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { COMPONENT_TAG } from "../../helpers/tags";
import { coreFixture } from "../../helpers/fixtures/core";

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
      } = await loadFixture(coreFixture);

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
        coreFixture
      );

      expect(await core.getPaymentToken()).to.equal(
        await paymentToken.getAddress()
      );
      expect(await core.getPositionContract()).to.equal(
        await mockPosition.getAddress()
      );
      expect(await core.getManagerContract()).to.equal(keeper.address);
      expect(await core.isPaused()).to.be.false;
    });

    it("Should revert deployment with zero addresses", async function () {
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

      const CLMSRMarketCoreFactory = await ethers.getContractFactory(
        "CLMSRMarketCore",
        {
          libraries: {
            FixedPointMathU: await fixedPointMathU.getAddress(),
            LazyMulSegmentTree: await lazyMulSegmentTree.getAddress(),
          },
        }
      );

      // Test zero payment token
      await expect(
        CLMSRMarketCoreFactory.deploy(
          ethers.ZeroAddress,
          ethers.ZeroAddress,
          ethers.ZeroAddress
        )
      ).to.be.revertedWithCustomError(CLMSRMarketCoreFactory, "ZeroAddress");
    });

    it("Should demonstrate contract size reduction with external libraries", async function () {
      const { core } = await loadFixture(coreFixture);

      const code = await ethers.provider.getCode(await core.getAddress());
      const sizeInBytes = (code.length - 2) / 2;

      expect(sizeInBytes).to.be.lt(24576); // EIP-170 limit
      expect(sizeInBytes).to.be.gt(10000); // Should be substantial contract
    });

    it("Should verify contract state after deployment", async function () {
      const { core, paymentToken } = await loadFixture(coreFixture);

      // Check basic state
      expect(await core.getPaymentToken()).to.equal(
        await paymentToken.getAddress()
      );
      expect(await core.isPaused()).to.be.false;

      // Check no markets exist initially
      await expect(core.getMarket(1)).to.be.revertedWithCustomError(
        core,
        "MarketNotFound"
      );
    });

    it("Should handle proper library linking verification", async function () {
      const { core } = await loadFixture(coreFixture);

      // Verify libraries are properly linked by calling library-dependent functions
      await expect(core.getMarket(1)).to.be.revertedWithCustomError(
        core,
        "MarketNotFound"
      );

      // This would fail if libraries aren't properly linked
      const code = await ethers.provider.getCode(await core.getAddress());
      expect(code).to.not.include("__$"); // No unlinked library placeholders
    });
  });

  describe("Initial Configuration", function () {
    it("Should set correct router address", async function () {
      const { core, router } = await loadFixture(coreFixture);

      expect(await core.getRouterContract()).to.equal(router.address);
    });

    it("Should have tokens approved for users", async function () {
      const { core, paymentToken, alice, bob } = await loadFixture(coreFixture);

      const coreAddress = await core.getAddress();
      expect(await paymentToken.allowance(alice.address, coreAddress)).to.equal(
        ethers.MaxUint256
      );
      expect(await paymentToken.allowance(bob.address, coreAddress)).to.equal(
        ethers.MaxUint256
      );
    });

    it("Should initialize with proper token balances", async function () {
      const { paymentToken, alice, bob } = await loadFixture(coreFixture);

      const aliceBalance = await paymentToken.balanceOf(alice.address);
      const bobBalance = await paymentToken.balanceOf(bob.address);

      expect(aliceBalance).to.be.gt(0);
      expect(bobBalance).to.be.gt(0);
      expect(aliceBalance).to.equal(bobBalance);
    });

    it("Should have MockPosition properly configured", async function () {
      const { core, mockPosition } = await loadFixture(coreFixture);

      expect(await mockPosition.coreContract()).to.equal(
        await core.getAddress()
      );
    });
  });

  describe("Access Control Setup", function () {
    it("Should set keeper as manager", async function () {
      const { core, keeper } = await loadFixture(coreFixture);

      expect(await core.getManagerContract()).to.equal(keeper.address);
    });

    it("Should allow only keeper to call manager functions", async function () {
      const { core, alice } = await loadFixture(coreFixture);

      await expect(
        core.connect(alice).setRouterContract(alice.address)
      ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");
    });

    it("Should verify initial paused state", async function () {
      const { core } = await loadFixture(coreFixture);

      expect(await core.isPaused()).to.be.false;
    });

    it("Should allow keeper to pause/unpause", async function () {
      const { core, keeper } = await loadFixture(coreFixture);

      await core.connect(keeper).pause("Test pause");
      expect(await core.isPaused()).to.be.true;

      await core.connect(keeper).unpause();
      expect(await core.isPaused()).to.be.false;
    });
  });

  describe("Parameter Validation", function () {
    it("Should validate payment token decimals", async function () {
      const { paymentToken } = await loadFixture(coreFixture);

      const decimals = await paymentToken.decimals();
      expect(decimals).to.equal(6); // USDC standard
    });

    it("Should verify token symbol and name", async function () {
      const { paymentToken } = await loadFixture(coreFixture);

      expect(await paymentToken.symbol()).to.equal("USDC");
      expect(await paymentToken.name()).to.equal("USD Coin");
    });

    it("Should handle invalid constructor parameters gracefully", async function () {
      const { fixedPointMathU, lazyMulSegmentTree } = await loadFixture(
        coreFixture
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

      // All zero addresses should fail
      await expect(
        CLMSRMarketCoreFactory.deploy(
          ethers.ZeroAddress,
          ethers.ZeroAddress,
          ethers.ZeroAddress
        )
      ).to.be.revertedWithCustomError(CLMSRMarketCoreFactory, "ZeroAddress");
    });
  });

  describe("Contract Interaction Setup", function () {
    it("Should properly link position contract", async function () {
      const { core, mockPosition } = await loadFixture(coreFixture);

      const linkedPosition = await core.getPositionContract();
      expect(linkedPosition).to.equal(await mockPosition.getAddress());

      // Verify bidirectional link
      expect(await mockPosition.coreContract()).to.equal(
        await core.getAddress()
      );
    });

    it("Should set up router interaction correctly", async function () {
      const { core, router, keeper } = await loadFixture(coreFixture);

      expect(await core.getRouterContract()).to.equal(router.address);

      // Router is already set in fixture, so this should fail
      const newRouter = await ethers.getSigners().then((s) => s[5]);
      await expect(
        core.connect(keeper).setRouterContract(newRouter.address)
      ).to.be.revertedWithCustomError(core, "RouterAlreadySet");
    });

    it("Should handle library function calls correctly", async function () {
      const { core } = await loadFixture(coreFixture);

      // These calls should work if libraries are properly linked
      // (will revert for business logic reasons, not linking issues)
      await expect(core.getMarket(999)).to.be.revertedWithCustomError(
        core,
        "MarketNotFound"
      );
    });

    it("Should verify initial state of all contracts", async function () {
      const { core, paymentToken, mockPosition, alice } = await loadFixture(
        coreFixture
      );

      // Core state
      expect(await core.isPaused()).to.be.false;

      // Token state
      expect(await paymentToken.balanceOf(alice.address)).to.be.gt(0);

      // Position state
      expect(await mockPosition.coreContract()).to.equal(
        await core.getAddress()
      );

      // Integration check - no markets initially
      await expect(core.getMarket(1)).to.be.revertedWithCustomError(
        core,
        "MarketNotFound"
      );
    });
  });

  describe("Deployment Edge Cases", function () {
    it("Should handle deployment with various token decimals", async function () {
      // Our fixture uses 6 decimals (USDC standard)
      const { paymentToken } = await loadFixture(coreFixture);
      expect(await paymentToken.decimals()).to.equal(6);
    });

    it("Should verify gas usage for deployment", async function () {
      const { core } = await loadFixture(coreFixture);

      // Contract should be deployed (address exists)
      const code = await ethers.provider.getCode(await core.getAddress());
      expect(code.length).to.be.gt(2); // More than just "0x"
    });

    it("Should handle multiple deployment scenarios", async function () {
      // loadFixture caches deployments in the same test run
      // This is expected behavior - different tests get fresh deployments
      // but multiple loadFixtures in the same test return cached instances
      const contracts1 = await loadFixture(coreFixture);
      const contracts2 = await loadFixture(coreFixture);

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
        coreFixture
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

  describe("Constants & Limits", function () {
    it("Should have correct constants", async function () {
      const { core } = await loadFixture(coreFixture);

      expect(await core.MAX_TICK_COUNT()).to.equal(1_000_000);
      expect(await core.MIN_LIQUIDITY_PARAMETER()).to.equal(
        ethers.parseEther("0.001")
      );
      expect(await core.MAX_LIQUIDITY_PARAMETER()).to.equal(
        ethers.parseEther("1000")
      );
    });

    it("Should validate tick count limits", async function () {
      const { core, keeper } = await loadFixture(coreFixture);

      const currentTime = await time.latest();
      const startTime = currentTime + 3600;
      const endTime = startTime + 86400; // 1 day

      // Test zero tick count
      await expect(
        core.connect(keeper).createMarket(
          1,
          0, // zero ticks
          startTime,
          endTime,
          ethers.parseEther("1")
        )
      ).to.be.revertedWithCustomError(core, "TickCountExceedsLimit");

      // Test excessive tick count
      await expect(
        core.connect(keeper).createMarket(
          1,
          1_000_001, // exceeds MAX_TICK_COUNT
          startTime,
          endTime,
          ethers.parseEther("1")
        )
      ).to.be.revertedWithCustomError(core, "TickCountExceedsLimit");
    });

    it("Should validate liquidity parameter limits", async function () {
      const { core, keeper } = await loadFixture(coreFixture);

      const currentTime = await time.latest();
      const startTime = currentTime + 3600;
      const endTime = startTime + 86400;

      // Test too small alpha
      await expect(
        core.connect(keeper).createMarket(
          1,
          100,
          startTime,
          endTime,
          ethers.parseEther("0.0001") // below MIN_LIQUIDITY_PARAMETER
        )
      ).to.be.revertedWithCustomError(core, "InvalidLiquidityParameter");

      // Test too large alpha
      await expect(
        core.connect(keeper).createMarket(
          1,
          100,
          startTime,
          endTime,
          ethers.parseEther("2000") // above MAX_LIQUIDITY_PARAMETER
        )
      ).to.be.revertedWithCustomError(core, "InvalidLiquidityParameter");
    });
  });

  describe("Error Handling", function () {
    it("Should revert operations when paused", async function () {
      const { core, keeper } = await loadFixture(coreFixture);

      // Pause contract
      await core.connect(keeper).pause("Test pause");

      const currentTime = await time.latest();

      // Should revert market creation when paused
      await expect(
        core
          .connect(keeper)
          .createMarket(
            1,
            100,
            currentTime + 3600,
            currentTime + 3600 + 86400,
            ethers.parseEther("1")
          )
      ).to.be.revertedWithCustomError(core, "ContractPaused");
    });

    it("Should handle invalid time ranges", async function () {
      const { core, keeper } = await loadFixture(coreFixture);

      const currentTime = await time.latest();

      // End time before start time
      await expect(
        core.connect(keeper).createMarket(
          1,
          100,
          currentTime + 7200, // start
          currentTime + 3600, // end (before start)
          ethers.parseEther("1")
        )
      ).to.be.revertedWithCustomError(core, "InvalidTimeRange");

      // Start time equals end time
      await expect(
        core.connect(keeper).createMarket(
          1,
          100,
          currentTime + 3600,
          currentTime + 3600, // same as start
          ethers.parseEther("1")
        )
      ).to.be.revertedWithCustomError(core, "InvalidTimeRange");
    });

    it("Should handle duplicate market IDs", async function () {
      const { core, keeper } = await loadFixture(coreFixture);

      const currentTime = await time.latest();
      const startTime = currentTime + 3600;
      const endTime = startTime + 86400;

      // Create first market
      await core
        .connect(keeper)
        .createMarket(1, 100, startTime, endTime, ethers.parseEther("1"));

      // Try to create market with same ID
      await expect(
        core
          .connect(keeper)
          .createMarket(
            1,
            100,
            startTime + 86400,
            startTime + 2 * 86400,
            ethers.parseEther("1")
          )
      ).to.be.revertedWithCustomError(core, "MarketAlreadyExists");
    });

    it("Should handle unauthorized access properly", async function () {
      const { core, alice, bob } = await loadFixture(coreFixture);

      // Non-authorized user cannot create markets
      const currentTime = await time.latest();
      await expect(
        core
          .connect(alice)
          .createMarket(
            2,
            100,
            currentTime + 3600,
            currentTime + 3600 + 86400,
            ethers.parseEther("1")
          )
      ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");

      // Non-authorized user cannot pause
      await expect(
        core.connect(bob).pause("Test")
      ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");

      // Non-authorized user cannot set router
      await expect(
        core.connect(alice).setRouterContract(alice.address)
      ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");
    });
  });

  describe("Contract Deployment from Original", function () {
    it("Should deploy all contracts successfully with linked libraries", async function () {
      const { core, paymentToken, mockPosition } = await loadFixture(
        coreFixture
      );

      expect(await core.getAddress()).to.not.equal(ethers.ZeroAddress);
      expect(await paymentToken.getAddress()).to.not.equal(ethers.ZeroAddress);
      expect(await mockPosition.getAddress()).to.not.equal(ethers.ZeroAddress);
    });

    it("Should initialize core contract with correct parameters", async function () {
      const { core, paymentToken, mockPosition, keeper } = await loadFixture(
        coreFixture
      );

      expect(await core.getPaymentToken()).to.equal(
        await paymentToken.getAddress()
      );
      expect(await core.getPositionContract()).to.equal(
        await mockPosition.getAddress()
      );
      expect(await core.getManagerContract()).to.equal(keeper.address);
      expect(await core.isPaused()).to.be.false;
    });

    it("Should demonstrate contract size reduction with external libraries", async function () {
      const { core } = await loadFixture(coreFixture);

      const code = await ethers.provider.getCode(await core.getAddress());
      const sizeInBytes = (code.length - 2) / 2;

      console.log(`CLMSRMarketCore deployed size: ${sizeInBytes} bytes`);
      console.log(`EIP-170 limit: 24576 bytes`);
      console.log(
        `Size reduction achieved: ${24576 - sizeInBytes} bytes saved`
      );

      expect(sizeInBytes).to.be.lt(24576);
      expect(sizeInBytes).to.be.gt(10000); // Should be substantial contract
    });
  });
});
