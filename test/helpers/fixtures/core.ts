import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

// Common constants - 6 decimal based (USDC)
export const WAD = ethers.parseEther("1");
export const USDC_DECIMALS = 6;
export const INITIAL_SUPPLY = ethers.parseUnits("1000000000000", USDC_DECIMALS);
export const ALPHA = ethers.parseEther("1"); // 1 ETH = ~$3000, more realistic liquidity parameter
export const TICK_COUNT = 100;
export const MARKET_DURATION = 7 * 24 * 60 * 60;

// Test quantities - 6 decimal based
export const SMALL_QUANTITY = ethers.parseUnits("0.001", 6);
export const MEDIUM_QUANTITY = ethers.parseUnits("0.01", 6);
export const LARGE_QUANTITY = ethers.parseUnits("0.1", 6);
export const CHUNK_BOUNDARY_QUANTITY = ethers.parseUnits("0.013", 6);

// Cost limits - 6 decimal based
export const SMALL_COST = ethers.parseUnits("0.01", 6);
export const MEDIUM_COST = ethers.parseUnits("0.1", 6);
export const LARGE_COST = ethers.parseUnits("1", 6);
export const EXTREME_COST = ethers.parseUnits("1000", 6);

// Factor limits
export const MIN_FACTOR = ethers.parseEther("0.0001");
export const MAX_FACTOR = ethers.parseEther("10000");

/**
 * Unit fixture - 라이브러리만
 */
export async function unitFixture() {
  const [deployer, keeper, alice, bob, charlie] = await ethers.getSigners();

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

  return {
    fixedPointMathU,
    lazyMulSegmentTree,
    deployer,
    keeper,
    alice,
    bob,
    charlie,
  };
}

/**
 * Component fixture - Core + Mocks
 */
export async function coreFixture() {
  const baseFixture = await unitFixture();
  const { keeper, alice, bob, charlie } = baseFixture;

  // Deploy USDC token
  const MockERC20Factory = await ethers.getContractFactory("MockERC20");
  const paymentToken = await MockERC20Factory.deploy("USD Coin", "USDC", 6);
  await paymentToken.waitForDeployment();

  // Mint tokens
  const users = [alice, bob, charlie];
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
        FixedPointMathU: await baseFixture.fixedPointMathU.getAddress(),
        LazyMulSegmentTree: await baseFixture.lazyMulSegmentTree.getAddress(),
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

  // Approve tokens
  for (const user of users) {
    await paymentToken
      .connect(user)
      .approve(await core.getAddress(), ethers.MaxUint256);
  }

  return {
    ...baseFixture,
    core,
    paymentToken,
    mockPosition,
  };
}

/**
 * Integration fixture - Core + Position real (추후 실제 Position 구현 시)
 */
export async function marketFixture() {
  const contracts = await coreFixture();
  const { core, keeper } = contracts;

  const startTime = await time.latest();
  const endTime = startTime + MARKET_DURATION;
  const marketId = 1;

  await core
    .connect(keeper)
    .createMarket(marketId, TICK_COUNT, startTime, endTime, ALPHA);

  return {
    ...contracts,
    marketId,
    startTime,
    endTime,
  };
}

/**
 * Create active market helper
 */
export async function createActiveMarket(contracts: any, marketId: number = 1) {
  const currentTime = await time.latest();
  const startTime = currentTime + 200; // Add larger buffer to avoid timestamp conflicts
  const endTime = startTime + MARKET_DURATION;

  await contracts.core
    .connect(contracts.keeper)
    .createMarket(marketId, TICK_COUNT, startTime, endTime, ALPHA);

  // Move to market start time
  await time.increaseTo(startTime + 1);

  return { marketId, startTime, endTime };
}

/**
 * Create active market fixture for integration tests
 */
export async function createActiveMarketFixture() {
  const contracts = await coreFixture();
  const { core, keeper } = contracts;

  const currentTime = await time.latest();
  const startTime = currentTime + 300; // Larger buffer for fixture tests
  const endTime = startTime + MARKET_DURATION;
  const marketId = 1;

  await core
    .connect(keeper)
    .createMarket(marketId, TICK_COUNT, startTime, endTime, ALPHA);

  // Move to market start time
  await time.increaseTo(startTime + 1);

  return {
    ...contracts,
    marketId,
    startTime,
    endTime,
  };
}

/**
 * Create a market with extreme parameters for boundary testing
 */
export async function createExtremeMarket(
  contracts: Awaited<ReturnType<typeof coreFixture>>,
  marketId: number = 1
) {
  const startTime = await time.latest();
  const endTime = startTime + MARKET_DURATION;
  const extremeAlpha = ethers.parseEther("1000");

  await contracts.core
    .connect(contracts.keeper)
    .createMarket(marketId, TICK_COUNT, startTime, endTime, extremeAlpha);

  return { marketId, startTime, endTime, alpha: extremeAlpha };
}
