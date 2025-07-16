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
      const CLMSRMarketCoreFactory = await ethers.getContractFactory(
        "CLMSRMarketCore",
        {
          libraries: {
            FixedPointMathU: ethers.ZeroAddress,
            LazyMulSegmentTree: ethers.ZeroAddress,
          },
        }
      );

      await expect(
        CLMSRMarketCoreFactory.deploy(
          ethers.ZeroAddress,
          ethers.ZeroAddress,
          ethers.ZeroAddress
        )
      ).to.be.revertedWithCustomError(CLMSRMarketCoreFactory, "ZeroAddress");
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

    it("Should have correct token balances", async function () {
      const { paymentToken, alice, bob, charlie } = await loadFixture(
        coreFixture
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
      const { paymentToken } = await loadFixture(coreFixture);

      expect(await paymentToken.name()).to.equal("USD Coin");
      expect(await paymentToken.symbol()).to.equal("USDC");
      expect(await paymentToken.decimals()).to.equal(6);
    });

    it("Should link position contract correctly", async function () {
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

    it("Should prevent non-keeper from pause operations", async function () {
      const { core, alice } = await loadFixture(coreFixture);

      await expect(
        core.connect(alice).pause("Unauthorized")
      ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");

      await expect(core.connect(alice).unpause()).to.be.revertedWithCustomError(
        core,
        "UnauthorizedCaller"
      );
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

    it("Should handle library function calls correctly", async function () {
      const { core } = await loadFixture(coreFixture);

      // These calls should work if libraries are properly linked
      // (will revert for business logic reasons, not linking issues)
      await expect(core.getMarket(999)).to.be.revertedWithCustomError(
        core,
        "MarketNotFound"
      );
    });

    it("Should verify payment token integration", async function () {
      const { core, paymentToken } = await loadFixture(coreFixture);

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
      const { core } = await loadFixture(coreFixture);

      // Market not found
      await expect(core.getMarket(999)).to.be.revertedWithCustomError(
        core,
        "MarketNotFound"
      );

      // Invalid tick value (market doesn't exist)
      await expect(core.getTickValue(1, 0)).to.be.revertedWithCustomError(
        core,
        "MarketNotFound"
      );
    });
  });

  describe("Gas and Performance", function () {
    it("Should deploy within gas limits", async function () {
      const { core } = await loadFixture(coreFixture);

      const deploymentTx = core.deploymentTransaction();
      expect(deploymentTx).to.not.be.null;

      if (deploymentTx) {
        const receipt = await deploymentTx.wait();
        expect(receipt?.gasUsed).to.be.lt(15_000_000); // Reasonable deployment limit
      }
    });

    it("Should have reasonable contract size", async function () {
      const { core } = await loadFixture(coreFixture);

      const code = await ethers.provider.getCode(await core.getAddress());
      const sizeInBytes = (code.length - 2) / 2;

      console.log(`CLMSRMarketCore deployed size: ${sizeInBytes} bytes`);
      expect(sizeInBytes).to.be.lt(24576); // EIP-170 limit
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
