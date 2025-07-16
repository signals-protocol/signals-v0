import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import {
  coreFixture,
  unitFixture,
  INITIAL_SUPPLY,
  ALPHA,
  TICK_COUNT,
  MARKET_DURATION,
} from "./core";

/**
 * Position fixture - MockPosition for integration tests
 */
export async function positionFixture() {
  const baseFixture = await unitFixture();
  const { keeper, router, alice, bob, charlie } = baseFixture;

  // Deploy USDC token
  const MockERC20Factory = await ethers.getContractFactory("MockERC20");
  const paymentToken = await MockERC20Factory.deploy("USD Coin", "USDC", 6);
  await paymentToken.waitForDeployment();

  // Mint tokens
  const users = [alice, bob, charlie];
  for (const user of users) {
    await paymentToken.mint(user.address, INITIAL_SUPPLY);
  }

  // Use MockPosition for testing to avoid circular dependency
  const MockPositionFactory = await ethers.getContractFactory("MockPosition");
  const position = await MockPositionFactory.deploy();
  await position.waitForDeployment();

  // Deploy core with position address
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
    await position.getAddress(),
    keeper.address
  );
  await core.waitForDeployment();

  // Set core in position contract
  await position.setCore(await core.getAddress());

  // Setup contracts
  await paymentToken.mint(await core.getAddress(), INITIAL_SUPPLY);
  await core.connect(keeper).setRouterContract(router.address);

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
    position,
  };
}

/**
 * Real Position fixture - Actual CLMSRPosition contract for unit tests
 */
export async function realPositionFixture() {
  const baseFixture = await unitFixture();
  const { keeper, router, alice, bob, charlie } = baseFixture;

  // Deploy USDC token
  const MockERC20Factory = await ethers.getContractFactory("MockERC20");
  const paymentToken = await MockERC20Factory.deploy("USD Coin", "USDC", 6);
  await paymentToken.waitForDeployment();

  // Mint tokens
  const users = [alice, bob, charlie];
  for (const user of users) {
    await paymentToken.mint(user.address, INITIAL_SUPPLY);
  }

  // Calculate deterministic addresses for circular dependency
  const CLMSRMarketCoreFactory = await ethers.getContractFactory(
    "CLMSRMarketCore",
    {
      libraries: {
        FixedPointMathU: await baseFixture.fixedPointMathU.getAddress(),
        LazyMulSegmentTree: await baseFixture.lazyMulSegmentTree.getAddress(),
      },
    }
  );
  const CLMSRPositionFactory = await ethers.getContractFactory("CLMSRPosition");

  // Get deployer nonce to calculate future addresses
  const deployer = await ethers.provider.getSigner();
  const deployerAddress = await deployer.getAddress();
  const nonce = await ethers.provider.getTransactionCount(deployerAddress);

  // Calculate future core address (will be deployed after position)
  const futureCore = ethers.getCreateAddress({
    from: deployerAddress,
    nonce: nonce + 1, // Position deploys first, then core
  });

  // Deploy position with future core address
  const position = await CLMSRPositionFactory.deploy(futureCore);
  await position.waitForDeployment();

  // Deploy core with actual position address
  const core = await CLMSRMarketCoreFactory.deploy(
    await paymentToken.getAddress(),
    await position.getAddress(),
    keeper.address
  );
  await core.waitForDeployment();

  // Verify the addresses match
  const actualCoreAddress = await core.getAddress();
  const positionCoreAddress = await position.getCoreContract();

  if (actualCoreAddress !== positionCoreAddress) {
    throw new Error(
      `Core address mismatch: expected ${actualCoreAddress}, got ${positionCoreAddress}`
    );
  }

  // Setup contracts
  await paymentToken.mint(await core.getAddress(), INITIAL_SUPPLY);
  await core.connect(keeper).setRouterContract(router.address);

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
    position,
  };
}

/**
 * Position market fixture - Position + active market
 */
export async function positionMarketFixture() {
  const contracts = await positionFixture();
  const { core, keeper } = contracts;

  const currentTime = await time.latest();
  const startTime = currentTime + 500; // Larger buffer for position market tests
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
 * Real Position market fixture - Real CLMSRPosition + active market
 */
export async function realPositionMarketFixture() {
  const contracts = await realPositionFixture();
  const { core, keeper } = contracts;

  const currentTime = await time.latest();
  const startTime = currentTime + 600; // Even larger buffer for real position tests
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
 * Position with active market and positions
 */
export async function positionWithDataFixture() {
  const contracts = await positionMarketFixture();
  const { core, position, alice, bob, marketId } = contracts;

  // Create some test positions
  const positionParams = {
    marketId,
    lowerTick: 10,
    upperTick: 20,
    quantity: ethers.parseUnits("0.01", 6),
    maxCost: ethers.parseUnits("1", 6),
  };

  // Alice opens position
  const alicePositionId = await core
    .connect(alice)
    .openPosition.staticCall(
      alice.address,
      positionParams.marketId,
      positionParams.lowerTick,
      positionParams.upperTick,
      positionParams.quantity,
      positionParams.maxCost
    );
  await core
    .connect(alice)
    .openPosition(
      alice.address,
      positionParams.marketId,
      positionParams.lowerTick,
      positionParams.upperTick,
      positionParams.quantity,
      positionParams.maxCost
    );

  // Bob opens different position
  const bobPositionParams = {
    ...positionParams,
    lowerTick: 30,
    upperTick: 40,
  };
  const bobPositionId = await core
    .connect(bob)
    .openPosition.staticCall(
      bob.address,
      bobPositionParams.marketId,
      bobPositionParams.lowerTick,
      bobPositionParams.upperTick,
      bobPositionParams.quantity,
      bobPositionParams.maxCost
    );
  await core
    .connect(bob)
    .openPosition(
      bob.address,
      bobPositionParams.marketId,
      bobPositionParams.lowerTick,
      bobPositionParams.upperTick,
      bobPositionParams.quantity,
      bobPositionParams.maxCost
    );

  return {
    ...contracts,
    alicePositionId,
    bobPositionId,
    positionParams,
    bobPositionParams,
  };
}

/**
 * Helper to create position with specific parameters
 */
export async function createTestPosition(
  contracts: Awaited<ReturnType<typeof positionFixture>>,
  user: any,
  marketId: number,
  lowerTick: number = 10,
  upperTick: number = 20,
  quantity: bigint = ethers.parseUnits("0.01", 6)
) {
  // Ensure core exists
  if (!contracts.core) {
    throw new Error("Core contract not found in contracts");
  }

  const params = {
    marketId,
    lowerTick,
    upperTick,
    quantity,
    maxCost: ethers.parseUnits("10", 6), // High max cost
  };

  const positionId = await contracts.core
    .connect(user)
    .openPosition.staticCall(
      user.address,
      params.marketId,
      params.lowerTick,
      params.upperTick,
      params.quantity,
      params.maxCost
    );
  await contracts.core
    .connect(user)
    .openPosition(
      user.address,
      params.marketId,
      params.lowerTick,
      params.upperTick,
      params.quantity,
      params.maxCost
    );

  return { positionId, params };
}

/**
 * Helper to create position with real CLMSRPosition contract
 */
export async function createRealTestPosition(
  contracts: Awaited<ReturnType<typeof realPositionFixture>>,
  user: any,
  marketId: number,
  lowerTick: number = 10,
  upperTick: number = 20,
  quantity: bigint = ethers.parseUnits("0.01", 6)
) {
  // Ensure core and router exist
  if (!contracts.core) {
    throw new Error("Core contract not found in contracts");
  }
  if (!contracts.router) {
    throw new Error("Router contract not found in contracts");
  }

  const params = {
    marketId,
    lowerTick,
    upperTick,
    quantity,
    maxCost: ethers.parseUnits("10", 6), // High max cost
  };

  // Call through router (authorized caller) instead of directly to core
  const positionId = await contracts.core
    .connect(contracts.router)
    .openPosition.staticCall(
      user.address,
      params.marketId,
      params.lowerTick,
      params.upperTick,
      params.quantity,
      params.maxCost
    );
  await contracts.core
    .connect(contracts.router)
    .openPosition(
      user.address,
      params.marketId,
      params.lowerTick,
      params.upperTick,
      params.quantity,
      params.maxCost
    );

  return { positionId, params };
}
