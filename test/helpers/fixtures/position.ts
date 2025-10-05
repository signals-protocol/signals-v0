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

const DEFAULT_POSITION_QUANTITY = ethers.parseUnits("10", 6);
const DEFAULT_POSITION_MAX_COST = ethers.parseUnits("1000", 6);

async function createMarketAndReturnId(
  core: any,
  signer: any,
  args: [number, number, number, number, number, number, bigint]
) {
  const marketIdBig = await core.connect(signer).createMarket.staticCall(...args);
  await core.connect(signer).createMarket(...args);
  return Number(marketIdBig);
}

/**
 * Position fixture - CLMSRPosition contract for complex testing
 */
export async function positionFixture() {
  const baseFixture = await unitFixture();
  const { deployer, keeper, alice, bob, charlie } = baseFixture;

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

  // Deploy core with position address (upgradeable)
  const CLMSRMarketCoreFactory = await ethers.getContractFactory(
    "CLMSRMarketCore",
    {
      libraries: {
        FixedPointMathU: await baseFixture.fixedPointMathU.getAddress(),
        LazyMulSegmentTree: await baseFixture.lazyMulSegmentTree.getAddress(),
      },
    }
  );

  const core = await CLMSRMarketCoreFactory.deploy();
  await core.waitForDeployment();

  // Initialize upgradeable contract
  await core.initialize(
    await paymentToken.getAddress(),
    await position.getAddress()
  );

  // Set core in position contract
  await position.setCore(await core.getAddress());

  // Delegate ownership to keeper for compatibility
  await core.connect(deployer).transferOwnership(keeper.address);
  await position.connect(deployer).transferOwnership(keeper.address);

  // Setup contracts
  await paymentToken.mint(await core.getAddress(), INITIAL_SUPPLY);

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
    deployer,
  };
}

/**
 * Active Position fixture - Actual CLMSRPosition contract for unit tests
 */
export async function activePositionFixture() {
  const baseFixture = await unitFixture();
  const { deployer, keeper, alice, bob, charlie } = baseFixture;

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

  // Deploy position implementation and initialize with placeholder core
  const position = await CLMSRPositionFactory.deploy();
  await position.waitForDeployment();
  await position.initialize(ethers.ZeroAddress);

  // Deploy core and initialize with position address
  const core = await CLMSRMarketCoreFactory.deploy();
  await core.waitForDeployment();

  await core.initialize(
    await paymentToken.getAddress(),
    await position.getAddress()
  );

  // Link position to core and delegate ownership
  await position.updateCore(await core.getAddress());
  await core.connect(deployer).transferOwnership(keeper.address);
  await position.connect(deployer).transferOwnership(keeper.address);

  // Setup contracts
  await paymentToken.mint(await core.getAddress(), INITIAL_SUPPLY);

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
    deployer,
  };
}

/**
 * Position market fixture - CLMSRPosition + active market
 */
export async function positionMarketFixture() {
  const contracts = await positionFixture();
  const { core, keeper } = contracts;

  const currentTime = await time.latest();
  const startTime = currentTime + 500; // Larger buffer for position market tests
  const endTime = startTime + MARKET_DURATION;

  // 새로운 틱 시스템 사용
  const minTick = 100000;
  const maxTick = minTick + (TICK_COUNT - 1) * 10;
  const tickSpacing = 10;
  const settlementTime = endTime + 3600;

  const createArgs: [number, number, number, number, number, number, bigint] = [
    minTick,
    maxTick,
    tickSpacing,
    startTime,
    endTime,
    settlementTime,
    ALPHA,
  ];

  const marketId = await createMarketAndReturnId(core, keeper, createArgs);

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
 * Active Position market fixture - CLMSRPosition + active market
 */
export async function activePositionMarketFixture() {
  const contracts = await activePositionFixture();
  const { core, keeper } = contracts;

  const currentTime = await time.latest();
  const startTime = currentTime + 600; // Even larger buffer for real position tests
  const endTime = startTime + MARKET_DURATION;
  const settlementTime = endTime + 3600;

  // 새로운 틱 시스템 사용
  const minTick = 100000;
  const maxTick = minTick + (TICK_COUNT - 1) * 10;
  const tickSpacing = 10;

  const createArgs: [number, number, number, number, number, number, bigint] = [
    minTick,
    maxTick,
    tickSpacing,
    startTime,
    endTime,
    settlementTime,
    ALPHA,
  ];

  const marketId = await createMarketAndReturnId(core, keeper, createArgs);

  // LazyMulSegmentTree는 createMarket에서 자동 초기화됨

  // Move to market start time
  await time.increaseTo(startTime + 1);

  return {
    ...contracts,
    marketId,
    startTime,
    endTime,
  };
}

function applyBuffer(value: bigint, bufferBps: bigint = 1000n) {
  const buffer = (value * bufferBps) / 10000n + 1n;
  return value + buffer;
}

export async function quoteOpenCost(
  core: any,
  marketId: number,
  lowerTick: number,
  upperTick: number,
  quantity: bigint,
  bufferBps: bigint = 1000n
) {
  const baseCost: bigint = await core.calculateOpenCost(
    marketId,
    lowerTick,
    upperTick,
    quantity
  );
  return applyBuffer(baseCost, bufferBps);
}

export async function openPositionWithQuote(
  core: any,
  signer: any,
  params: {
    marketId: number;
    lowerTick: number;
    upperTick: number;
    quantity: bigint;
    maxCost?: bigint;
    bufferBps?: bigint;
  }
) {
  const { marketId, lowerTick, upperTick, quantity, maxCost, bufferBps } = params;
  const costLimit =
    maxCost ?? (await quoteOpenCost(core, marketId, lowerTick, upperTick, quantity, bufferBps));

  const positionId = await core
    .connect(signer)
    .openPosition.staticCall(marketId, lowerTick, upperTick, quantity, costLimit);

  await core
    .connect(signer)
    .openPosition(marketId, lowerTick, upperTick, quantity, costLimit);

  return { positionId, maxCost: costLimit };
}

export async function quoteIncreaseCostWithBuffer(
  core: any,
  positionId: bigint,
  additionalQuantity: bigint,
  bufferBps: bigint = 1000n
) {
  const baseCost: bigint = await core.calculateIncreaseCost(
    positionId,
    additionalQuantity
  );
  return applyBuffer(baseCost, bufferBps);
}

export async function listMarketPositions(position: any, marketId: number) {
  if (typeof position.getMarketPositions === "function") {
    return position.getMarketPositions(marketId);
  }

  const length: bigint = await position.getMarketTokenLength(marketId);
  const results: bigint[] = [];
  for (let i = 0n; i < length; i++) {
    const tokenId: bigint = await position.getMarketTokenAt(marketId, i);
    if (tokenId !== 0n) {
      results.push(tokenId);
    }
  }
  return results;
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
    lowerTick: 100100,
    upperTick: 100200,
    quantity: DEFAULT_POSITION_QUANTITY,
    maxCost: DEFAULT_POSITION_MAX_COST,
  };

  // Alice opens position
  const alicePositionId = await core
    .connect(alice)
    .openPosition.staticCall(
      positionParams.marketId,
      positionParams.lowerTick,
      positionParams.upperTick,
      positionParams.quantity,
      positionParams.maxCost
    );
  await core
    .connect(alice)
    .openPosition(
      positionParams.marketId,
      positionParams.lowerTick,
      positionParams.upperTick,
      positionParams.quantity,
      positionParams.maxCost
    );

  // Bob opens position
  const bobPositionId = await core
    .connect(bob)
    .openPosition.staticCall(
      positionParams.marketId,
      positionParams.lowerTick,
      positionParams.upperTick,
      positionParams.quantity,
      positionParams.maxCost
    );
  await core
    .connect(bob)
    .openPosition(
      positionParams.marketId,
      positionParams.lowerTick,
      positionParams.upperTick,
      positionParams.quantity,
      positionParams.maxCost
    );

  return {
    contracts,
    alicePositionId,
    bobPositionId,
    positionParams,
  };
}

/**
 * Helper to create position with specific parameters
 */
export async function createTestPosition(
  contracts: Awaited<ReturnType<typeof positionFixture>>,
  user: any,
  marketId: number,
  lowerTick: number = 100100, // 실제 틱값으로 변경
  upperTick: number = 100200, // 실제 틱값으로 변경
  quantity: bigint = DEFAULT_POSITION_QUANTITY,
  maxCost: bigint = DEFAULT_POSITION_MAX_COST
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
    maxCost,
  };

  const positionId = await contracts.core
    .connect(user)
    .openPosition.staticCall(
      params.marketId,
      params.lowerTick,
      params.upperTick,
      params.quantity,
      params.maxCost
    );
  await contracts.core
    .connect(user)
    .openPosition(
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
  contracts: Awaited<ReturnType<typeof activePositionFixture>>,
  user: any,
  marketId: number,
  lowerTick: number = 100100,
  upperTick: number = 100200,
  quantity: bigint = DEFAULT_POSITION_QUANTITY,
  maxCost: bigint = DEFAULT_POSITION_MAX_COST
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
    maxCost,
  };

  // Call directly to core (no router needed)
  const positionId = await contracts.core
    .connect(user)
    .openPosition.staticCall(
      params.marketId,
      params.lowerTick,
      params.upperTick,
      params.quantity,
      params.maxCost
    );
  await contracts.core
    .connect(user)
    .openPosition(
      params.marketId,
      params.lowerTick,
      params.upperTick,
      params.quantity,
      params.maxCost
    );

  return { positionId, params };
}
