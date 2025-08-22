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

  // Deploy core contract (upgradeable)
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
    await mockPosition.getAddress()
  );

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

  // 새로운 틱 시스템: 100000부터 시작, 10 간격으로 TICK_COUNT개
  const minTick = 100000;
  const maxTick = minTick + (TICK_COUNT - 1) * 10;
  const tickSpacing = 10;

  await core
    .connect(keeper)
    .createMarket(
      marketId,
      minTick,
      maxTick,
      tickSpacing,
      startTime,
      endTime,
      ALPHA
    );

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
export async function createActiveMarket(
  contracts: any,
  marketId: number = Math.floor(Math.random() * 1000000) + 1
) {
  const currentTime = await time.latest();
  const startTime = currentTime + 200; // Add larger buffer to avoid timestamp conflicts
  const endTime = startTime + MARKET_DURATION;

  // 새로운 틱 시스템: 100000부터 시작, 10 간격으로 TICK_COUNT개
  const minTick = 100000;
  const maxTick = minTick + (TICK_COUNT - 1) * 10;
  const tickSpacing = 10;

  // createMarket은 marketId를 자동 생성하므로 매개변수에서 제외
  // 업그레이더블 컨트랙트에서는 deployer가 owner이므로 keeper 대신 deployer 사용
  await contracts.core
    .connect(contracts.deployer)
    .createMarket(minTick, maxTick, tickSpacing, startTime, endTime, ALPHA);

  // Move to market start time
  await time.increaseTo(startTime + 1);

  // Tree 초기화를 위한 첫 번째 position 생성 (매우 작은 수량)
  await contracts.core.connect(contracts.alice).openPosition(
    marketId,
    100500, // 중간 틱
    100500,
    1n, // 1 wei (최소 수량)
    ethers.parseEther("1000.0") // 충분한 최대 비용
  );

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

  // 새로운 틱 시스템: 100000부터 시작, 10 간격으로 TICK_COUNT개
  const minTick = 100000;
  const maxTick = minTick + (TICK_COUNT - 1) * 10;
  const tickSpacing = 10;

  await core
    .connect(keeper)
    .createMarket(
      marketId,
      minTick,
      maxTick,
      tickSpacing,
      startTime,
      endTime,
      ALPHA
    );

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

  // 새로운 틱 시스템: 100000부터 시작, 10 간격으로 TICK_COUNT개
  const minTick = 100000;
  const maxTick = minTick + (TICK_COUNT - 1) * 10;
  const tickSpacing = 10;

  await contracts.core
    .connect(contracts.keeper)
    .createMarket(
      marketId,
      minTick,
      maxTick,
      tickSpacing,
      startTime,
      endTime,
      extremeAlpha
    );

  return { marketId, startTime, endTime, alpha: extremeAlpha };
}

// 틱 인덱스를 실제 틱 값으로 변환하는 헬퍼 함수
export function indexToTick(index: number): number {
  return 100000 + index * 10;
}

// 실제 틱 값을 인덱스로 변환하는 헬퍼 함수
export function tickToIndex(tick: number): number {
  return (tick - 100000) / 10;
}

// 의미 기반 마켓 설정 헬퍼 함수들

/**
 * 표준 활성 마켓 설정 - 대부분의 테스트에서 사용
 */
export async function setupActiveMarket(
  contracts: any,
  marketId: number = Math.floor(Math.random() * 1000000) + 1
) {
  return await createActiveMarket(contracts, marketId);
}

/**
 * 다중 마켓 설정 - 여러 마켓이 필요한 테스트용
 */
export async function setupMultipleMarkets(contracts: any, count: number = 3) {
  const markets = [];
  for (let i = 1; i <= count; i++) {
    const market = await createActiveMarket(contracts, i);
    markets.push(market);
  }
  return markets;
}

/**
 * 커스텀 마켓 설정 - 특별한 파라미터가 필요한 테스트용
 */
export async function setupCustomMarket(
  contracts: any,
  options: {
    marketId?: number;
    numTicks?: number;
    alpha?: bigint;
    duration?: number;
  } = {}
) {
  const {
    marketId = Math.floor(Math.random() * 1000000) + 1, // 랜덤 marketId 생성
    numTicks = TICK_COUNT,
    alpha = ALPHA,
    duration = MARKET_DURATION,
  } = options;

  const currentTime = await time.latest();
  const startTime = currentTime + 200;
  const endTime = startTime + duration;

  // 새로운 틱 시스템으로 변환
  const minTick = 100000;
  const maxTick = minTick + (numTicks - 1) * 10;
  const tickSpacing = 10;

  await contracts.core
    .connect(contracts.keeper)
    .createMarket(
      marketId,
      minTick,
      maxTick,
      tickSpacing,
      startTime,
      endTime,
      alpha
    );

  await time.increaseTo(startTime + 1);

  return { marketId, startTime, endTime, numTicks, alpha };
}

/**
 * 고유동성 마켓 설정 - 성능/스트레스 테스트용
 */
export async function setupHighLiquidityMarket(
  contracts: any,
  marketId: number = 1
) {
  return await setupCustomMarket(contracts, {
    marketId,
    alpha: ethers.parseEther("10"),
  });
}

/**
 * 경계값 테스트용 극한 마켓 설정
 */
export async function setupExtremeMarket(contracts: any, marketId: number = 1) {
  return await createExtremeMarket(contracts, marketId);
}

// 가격/틱 값 기반 헬퍼 함수들 (index 개념 완전 제거)

/**
 * 실제 가격 범위를 나타내는 틱 값들
 */
export const TICK_VALUES = {
  // 시장 범위: 100,000 ~ 199,990 (10 간격)
  MARKET_MIN: 100000,
  MARKET_MAX: 199990,
  SPACING: 10,

  // 테스트용 의미있는 가격들
  LOW_PRICE: 105000, // 105.0 (저가)
  MID_PRICE: 150000, // 150.0 (중간가)
  HIGH_PRICE: 195000, // 195.0 (고가)

  // 거래 범위들
  NARROW_RANGE: { lower: 149990, upper: 150010 }, // 150.0 ± 0.1
  WIDE_RANGE: { lower: 120000, upper: 180000 }, // 120.0 ~ 180.0
  SINGLE_TICK: { lower: 150000, upper: 150000 }, // 정확히 150.0
} as const;

/**
 * 가격 기반 포지션 열기 헬퍼
 */
export async function openPositionAtPrice(
  core: any,
  trader: any,
  marketId: number,
  lowerPrice: number,
  upperPrice: number,
  quantity: bigint,
  maxCost: bigint
) {
  return await core
    .connect(trader)
    .openPosition(marketId, lowerPrice, upperPrice, quantity, maxCost);
}

/**
 * 단일 가격에서의 포지션 열기
 */
export async function openSinglePricePosition(
  core: any,
  trader: any,
  marketId: number,
  price: number,
  quantity: bigint,
  maxCost: bigint
) {
  return await openPositionAtPrice(
    core,
    trader,
    marketId,
    price,
    price,
    quantity,
    maxCost
  );
}
