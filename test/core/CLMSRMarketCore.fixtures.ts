import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

// Common constants - 6 decimal based (USDC)
export const WAD = ethers.parseEther("1"); // Still use WAD for internal calculations
export const USDC_DECIMALS = 6;
export const INITIAL_SUPPLY = ethers.parseUnits("1000000000000", USDC_DECIMALS); // 1T USDC
export const ALPHA = ethers.parseEther("0.1"); // 0.1 ETH in WAD (18 decimals) for liquidity parameter
export const TICK_COUNT = 100;
export const MARKET_DURATION = 7 * 24 * 60 * 60;

// Test quantities - 6 decimal based, carefully chosen to avoid factor bounds issues
// Note: These quantities when converted to WAD (multiply by 1e12) should not cause exp() overflow
// With alpha = 0.1e18, quantity/alpha should be << 0.13 to avoid chunk-split
export const SMALL_QUANTITY = ethers.parseUnits("0.001", 6); // 0.001 USDC
export const MEDIUM_QUANTITY = ethers.parseUnits("0.01", 6); // 0.01 USDC
export const LARGE_QUANTITY = ethers.parseUnits("0.1", 6); // 0.1 USDC
export const CHUNK_BOUNDARY_QUANTITY = ethers.parseUnits("0.013", 6); // ~chunk boundary with alpha=0.1

// Cost limits - 6 decimal based
export const SMALL_COST = ethers.parseUnits("0.01", 6); // 0.01 USDC
export const MEDIUM_COST = ethers.parseUnits("0.1", 6); // 0.1 USDC
export const LARGE_COST = ethers.parseUnits("1", 6); // 1 USDC
export const EXTREME_COST = ethers.parseUnits("1000", 6); // 1000 USDC

// Factor limits for testing
export const MIN_FACTOR = ethers.parseEther("0.0001"); // LazyMulSegmentTree.MIN_FACTOR
export const MAX_FACTOR = ethers.parseEther("10000"); // LazyMulSegmentTree.MAX_FACTOR

/**
 * Deploy all contracts with 6-decimal USDC token
 */
export async function deployStandardFixture() {
  const [deployer, keeper, router, alice, bob, charlie, attacker] =
    await ethers.getSigners();

  // Deploy libraries
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

  // Deploy USDC (6 decimals)
  const MockERC20Factory = await ethers.getContractFactory("MockERC20");
  const paymentToken = await MockERC20Factory.deploy("USD Coin", "USDC", 6);
  await paymentToken.waitForDeployment();

  // Mint tokens to users
  const users = [alice, bob, charlie, attacker];
  for (const user of users) {
    await paymentToken.mint(user.address, INITIAL_SUPPLY);
  }

  // Deploy position contract
  const MockPositionFactory = await ethers.getContractFactory("MockPosition");
  const mockPosition = await MockPositionFactory.deploy();
  await mockPosition.waitForDeployment();

  // Deploy core contract
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
    keeper.address
  );
  await core.waitForDeployment();

  // Setup contracts
  await paymentToken.mint(await core.getAddress(), INITIAL_SUPPLY);
  await mockPosition.setCore(await core.getAddress());
  await core.connect(keeper).setRouterContract(router.address);

  // Approve tokens
  for (const user of users) {
    await paymentToken
      .connect(user)
      .approve(await core.getAddress(), ethers.MaxUint256);
  }

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
    charlie,
    attacker,
  };
}

/**
 * Create an active market with standard parameters
 */
export async function createActiveMarket(contracts: any, marketId: number = 1) {
  const startTime = await time.latest();
  const endTime = startTime + MARKET_DURATION;

  await contracts.core
    .connect(contracts.keeper)
    .createMarket(marketId, TICK_COUNT, startTime, endTime, ALPHA);

  return { marketId, startTime, endTime };
}

/**
 * Create a market with extreme parameters for boundary testing
 */
export async function createExtremeMarket(
  contracts: any,
  marketId: number = 1
) {
  const startTime = await time.latest();
  const endTime = startTime + MARKET_DURATION;
  const extremeAlpha = ethers.parseEther("1000"); // 1000 ETH in WAD for extreme testing

  await contracts.core
    .connect(contracts.keeper)
    .createMarket(marketId, TICK_COUNT, startTime, endTime, extremeAlpha);

  return { marketId, startTime, endTime, alpha: extremeAlpha };
}
