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

describe("CLMSRMarketCore - Deployment & Configuration", function () {
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

  describe("Contract Deployment", function () {
    it("Should deploy all contracts successfully with linked libraries", async function () {
      const {
        core,
        paymentToken,
        mockPosition,
        fixedPointMathU,
        lazyMulSegmentTree,
      } = await loadFixture(deployFixture);

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
        deployFixture
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
          libraries: {
            FixedPointMathU: await fixedPointMathU.getAddress(),
          },
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
      ).to.be.revertedWithCustomError(
        CLMSRMarketCoreFactory,
        "InvalidMarketParameters"
      );
    });

    it("Should demonstrate contract size reduction with external libraries", async function () {
      const { core } = await loadFixture(deployFixture);

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

  describe("Library Functionality", function () {
    it("Should use FixedPointMathU library correctly", async function () {
      const { fixedPointMathU } = await loadFixture(deployFixture);

      // Test basic math operations
      const a = ethers.parseEther("2");
      const b = ethers.parseEther("3");

      const product = await fixedPointMathU.wMul(a, b);
      expect(product).to.equal(ethers.parseEther("6"));

      const quotient = await fixedPointMathU.wDiv(
        ethers.parseEther("6"),
        ethers.parseEther("2")
      );
      expect(quotient).to.equal(ethers.parseEther("3"));

      // Test exponential
      const expResult = await fixedPointMathU.wExp(0); // e^0 = 1
      expect(expResult).to.equal(WAD);

      // Test natural log
      const lnResult = await fixedPointMathU.wLn(WAD); // ln(1) = 0
      expect(lnResult).to.equal(0);
    });

    it("Should handle edge cases in math operations", async function () {
      const { fixedPointMathU } = await loadFixture(deployFixture);

      // Test division by zero
      await expect(
        fixedPointMathU.wDiv(ethers.parseEther("1"), 0)
      ).to.be.revertedWithCustomError(fixedPointMathU, "FP_DivisionByZero");

      // Test ln of zero
      await expect(fixedPointMathU.wLn(0)).to.be.revertedWithCustomError(
        fixedPointMathU,
        "FP_InvalidInput"
      );

      // Test empty array
      await expect(fixedPointMathU.sumExp([])).to.be.revertedWithCustomError(
        fixedPointMathU,
        "FP_EmptyArray"
      );
    });

    it("Should calculate CLMSR functions correctly", async function () {
      const { fixedPointMathU } = await loadFixture(deployFixture);

      // Test CLMSR price calculation
      const expValue = ethers.parseEther("2");
      const totalSum = ethers.parseEther("10");
      const price = await fixedPointMathU.clmsrPrice(expValue, totalSum);
      expect(price).to.equal(ethers.parseEther("0.2")); // 2/10 = 0.2

      // Test CLMSR cost calculation
      const alpha = ethers.parseEther("1");
      const sumBefore = ethers.parseEther("10");
      const sumAfter = ethers.parseEther("20");
      const cost = await fixedPointMathU.clmsrCost(alpha, sumBefore, sumAfter);
      expect(cost).to.be.gt(0); // Should be positive for ratio > 1
    });

    it("Should demonstrate DELEGATECALL overhead", async function () {
      const { fixedPointMathU } = await loadFixture(deployFixture);

      const tx = await fixedPointMathU.wMul.populateTransaction(
        ethers.parseEther("2"),
        ethers.parseEther("3")
      );

      const gasEstimate = await ethers.provider.estimateGas(tx);
      console.log(`External library call gas estimate: ${gasEstimate}`);

      expect(gasEstimate).to.be.gt(21000); // Base transaction cost
      expect(gasEstimate).to.be.lt(50000); // Should be reasonable
    });
  });

  describe("Authorization & Access Control", function () {
    it("Should set router contract correctly", async function () {
      const { core, keeper, alice, router } = await loadFixture(deployFixture);

      // Only manager can set router
      await expect(
        core.connect(alice).setRouterContract(alice.address)
      ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");

      // Router is already set in fixture, check it's correct
      expect(await core.getRouterContract()).to.equal(router.address);

      // Cannot set router again (already set)
      await expect(
        core.connect(keeper).setRouterContract(alice.address)
      ).to.be.revertedWithCustomError(core, "InvalidMarketParameters");
    });

    it("Should check authorization correctly", async function () {
      const { core, keeper, router, alice } = await loadFixture(deployFixture);

      // Manager should be authorized
      expect(await core.isAuthorizedCaller(keeper.address)).to.be.true;

      // Router should be authorized
      expect(await core.isAuthorizedCaller(router.address)).to.be.true;

      // Position contract should be authorized
      expect(await core.isAuthorizedCaller(await core.getPositionContract())).to
        .be.true;

      // Random user should not be authorized
      expect(await core.isAuthorizedCaller(alice.address)).to.be.false;
    });

    it("Should handle pause/unpause correctly", async function () {
      const { core, keeper, alice } = await loadFixture(deployFixture);

      // Only manager can pause
      await expect(
        core.connect(alice).pause("Test pause")
      ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");

      // Manager can pause
      await expect(core.connect(keeper).pause("Emergency pause"))
        .to.emit(core, "EmergencyPaused")
        .withArgs(keeper.address, "Emergency pause");

      expect(await core.isPaused()).to.be.true;

      // Only manager can unpause
      await expect(core.connect(alice).unpause()).to.be.revertedWithCustomError(
        core,
        "UnauthorizedCaller"
      );

      // Manager can unpause
      await expect(core.connect(keeper).unpause())
        .to.emit(core, "EmergencyUnpaused")
        .withArgs(keeper.address);

      expect(await core.isPaused()).to.be.false;
    });
  });

  describe("Constants & Limits", function () {
    it("Should have correct constants", async function () {
      const { core } = await loadFixture(deployFixture);

      expect(await core.MAX_TICK_COUNT()).to.equal(1_000_000);
      expect(await core.MIN_LIQUIDITY_PARAMETER()).to.equal(
        ethers.parseEther("0.001")
      );
      expect(await core.MAX_LIQUIDITY_PARAMETER()).to.equal(
        ethers.parseEther("1000")
      );
    });

    it("Should validate tick count limits", async function () {
      const { core, keeper } = await loadFixture(deployFixture);

      const currentTime = await time.latest();
      const startTime = currentTime + 3600;
      const endTime = startTime + MARKET_DURATION;

      // Test zero tick count
      await expect(
        core.connect(keeper).createMarket(
          1,
          0, // zero ticks
          startTime,
          endTime,
          ALPHA
        )
      ).to.be.revertedWithCustomError(core, "TickCountExceedsLimit");

      // Test excessive tick count
      await expect(
        core.connect(keeper).createMarket(
          1,
          1_000_001, // exceeds MAX_TICK_COUNT
          startTime,
          endTime,
          ALPHA
        )
      ).to.be.revertedWithCustomError(core, "TickCountExceedsLimit");
    });

    it("Should validate liquidity parameter limits", async function () {
      const { core, keeper } = await loadFixture(deployFixture);

      const currentTime = await time.latest();
      const startTime = currentTime + 3600;
      const endTime = startTime + MARKET_DURATION;

      // Test too small alpha
      await expect(
        core.connect(keeper).createMarket(
          1,
          TICK_COUNT,
          startTime,
          endTime,
          ethers.parseEther("0.0001") // below MIN_LIQUIDITY_PARAMETER
        )
      ).to.be.revertedWithCustomError(core, "InvalidMarketParameters");

      // Test too large alpha
      await expect(
        core.connect(keeper).createMarket(
          1,
          TICK_COUNT,
          startTime,
          endTime,
          ethers.parseEther("2000") // above MAX_LIQUIDITY_PARAMETER
        )
      ).to.be.revertedWithCustomError(core, "InvalidMarketParameters");
    });
  });

  describe("Error Handling", function () {
    it("Should revert operations when paused", async function () {
      const { core, keeper } = await loadFixture(deployFixture);

      // Pause contract
      await core.connect(keeper).pause("Test pause");

      const currentTime = await time.latest();

      // Should revert market creation when paused
      await expect(
        core
          .connect(keeper)
          .createMarket(
            1,
            TICK_COUNT,
            currentTime + 3600,
            currentTime + 3600 + MARKET_DURATION,
            ALPHA
          )
      ).to.be.revertedWithCustomError(core, "ContractPaused");
    });

    it("Should handle invalid time ranges", async function () {
      const { core, keeper } = await loadFixture(deployFixture);

      const currentTime = await time.latest();

      // End time before start time
      await expect(
        core.connect(keeper).createMarket(
          1,
          TICK_COUNT,
          currentTime + 7200, // start
          currentTime + 3600, // end (before start)
          ALPHA
        )
      ).to.be.revertedWithCustomError(core, "InvalidMarketParameters");

      // Start time equals end time
      await expect(
        core.connect(keeper).createMarket(
          1,
          TICK_COUNT,
          currentTime + 3600,
          currentTime + 3600, // same as start
          ALPHA
        )
      ).to.be.revertedWithCustomError(core, "InvalidMarketParameters");
    });
  });
});
