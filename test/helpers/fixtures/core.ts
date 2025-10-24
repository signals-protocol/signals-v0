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

export const SETTLEMENT_VALUE_UNIT = 1_000_000n; // Tick values scaled by 1e6

export function toSettlementValue(tick: number | bigint): bigint {
  return BigInt(tick) * SETTLEMENT_VALUE_UNIT;
}

export async function increaseToSafe(targetTimestamp: number) {
  const latest = await time.latest();
  const safeTarget = Math.max(targetTimestamp, latest + 1);
  await time.increaseTo(safeTarget);
}

export function toSettlementValueFromRange(
  lowerTick: number | bigint,
  upperTick: number | bigint
): bigint {
  const lower = BigInt(lowerTick);
  const upper = BigInt(upperTick);
  if (upper < lower) {
    throw new Error("upperTick must be >= lowerTick");
  }
  // Use midpoint (floor) within range to derive settlement tick
  return ((lower + upper) / 2n) * SETTLEMENT_VALUE_UNIT;
}


export async function settleMarketAtTick(
  core: any,
  keeper: any,
  marketId: number,
  tick: number | bigint
) {
  const market = await core.getMarket(marketId);
  const gate = market.settlementTimestamp === 0n ? market.endTimestamp : market.settlementTimestamp;
  const latest = await time.latest();
  if (BigInt(latest) < gate) {
    await time.increaseTo(Number(gate) + 1);
  }
  return core.connect(keeper).settleMarket(marketId, toSettlementValue(tick));
}

export async function settleMarketUsingRange(
  core: any,
  keeper: any,
  marketId: number,
  lowerTick: number | bigint,
  upperTick: number | bigint
) {
  return settleMarketAtTick(
    core,
    keeper,
    marketId,
    (BigInt(lowerTick) + BigInt(upperTick)) / 2n
  );
}

export async function createMarketWithId(
  core: any,
  signer: any,
  args: [number, number, number, number, number, number, bigint]
) {
  const createMarket = core.connect(signer)[
    "createMarket(int256,int256,int256,uint64,uint64,uint64,uint256)"
  ];

  const marketIdBig = await createMarket.staticCall(...args);
  await createMarket(...args);
  return Number(marketIdBig);
}

export async function createMarketWithConfig(
  core: any,
  signer: any,
  config: {
    minTick: number;
    maxTick: number;
    tickSpacing: number;
    startTime: number;
    endTime: number;
    liquidityParameter: bigint;
    settlementTime?: number;
  }
) {
  const {
    minTick,
    maxTick,
    tickSpacing,
    startTime,
    endTime,
    liquidityParameter,
    settlementTime = endTime + 3600,
  } = config;

  return createMarketWithId(core, signer, [
    minTick,
    maxTick,
    tickSpacing,
    startTime,
    endTime,
    settlementTime,
    liquidityParameter,
  ]);
}

export async function setMarketActivation(
  core: any,
  signer: any,
  marketId: number,
  active: boolean = true
) {
  await core.connect(signer).setMarketActive(marketId, active);
}

export async function legacyCreateMarket(
  core: any,
  signer: any,
  _legacyMarketId: number,
  minTick: number,
  maxTick: number,
  tickSpacing: number,
  startTime: number,
  endTime: number,
  liquidityParameter: bigint,
  settlementTime?: number
) {
  const effectiveSettlement = settlementTime ?? endTime + 3600;
  return createMarketWithId(core, signer, [
    minTick,
    maxTick,
    tickSpacing,
    startTime,
    endTime,
    effectiveSettlement,
    liquidityParameter,
  ]);
}

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

  const CLMSRMarketManagerFactory = await ethers.getContractFactory(
    "CLMSRMarketManager",
    {
      libraries: {
        LazyMulSegmentTree: await lazyMulSegmentTree.getAddress(),
      },
    }
  );
  const manager = await CLMSRMarketManagerFactory.deploy();
  await manager.waitForDeployment();

  return {
    fixedPointMathU,
    lazyMulSegmentTree,
    deployer,
    keeper,
    alice,
    bob,
    charlie,
    manager,
  };
}

/**
 * Component fixture - Core + Mocks
 */
export async function coreFixture() {
  const baseFixture = await unitFixture();
  const { deployer, keeper, alice, bob, charlie, manager } = baseFixture as any;

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

  const patchCoreCompatibility = (contract: any) => {
    const applyCostBuffer = (value: bigint) => (value * 1000n) / 10000n + 1n + value;

    const patchFunction = (
      key: string,
      mapper: (args: any[]) => Promise<any[]>
    ) => {
      if (typeof contract[key] !== "function") {
        return;
      }

      const originalFn = contract[key].bind(contract);
      const originalStatic = contract[key].staticCall
        ? contract[key].staticCall.bind(contract)
        : undefined;

      const patched = async (...args: any[]) => {
        const mappedArgs = await mapper(args);
        return originalFn(...mappedArgs);
      };

      if (originalStatic) {
        patched.staticCall = async (...args: any[]) => {
          const mappedArgs = await mapper(args);
          return originalStatic(...mappedArgs);
        };
      }

      contract[key] = patched;
    };

    patchFunction("createMarket", async (args) => {
      if (args.length === 7) {
        const secondValue = Number(args[1]);
        const thirdValue = Number(args[2]);

        if (!Number.isNaN(secondValue) && !Number.isNaN(thirdValue) && thirdValue > secondValue) {
          const [
            _legacyMarketId,
            minTick,
            maxTick,
            tickSpacing,
            startTs,
            endTs,
            liquidity,
          ] = args;
          const endTimestampNumber =
            typeof endTs === "bigint" ? Number(endTs) : Number(endTs);
          const settlementTimestamp = endTimestampNumber + 3600;

          return [
            minTick,
            maxTick,
            tickSpacing,
            startTs,
            endTs,
            settlementTimestamp,
            liquidity,
          ];
        }
      }

      return args;
    });

    patchFunction("openPosition", async (args) => {
      if (args.length === 6 && typeof args[0] === "string") {
        return args.slice(1);
      }

      if (args.length === 4) {
        const [marketId, lowerTick, upperTick, quantity] = args;
        const baseCost: bigint = await contract.calculateOpenCost(
          marketId,
          lowerTick,
          upperTick,
          quantity
        );
        const maxCost = applyCostBuffer(baseCost);
        return [marketId, lowerTick, upperTick, quantity, maxCost];
      }

      return args;
    });

    return contract;
  };

  const originalConnect = core.connect.bind(core);
  core.connect = (signer: any) => {
    const connected = originalConnect(signer);
    return patchCoreCompatibility(connected);
  };

  patchCoreCompatibility(core);

  // Initialize upgradeable contract
  await core.initialize(
    await paymentToken.getAddress(),
    await mockPosition.getAddress()
  );

  await core.connect(deployer).setManager(await manager.getAddress());

  // Setup contracts
  await paymentToken.mint(await core.getAddress(), INITIAL_SUPPLY);
  await mockPosition.setCore(await core.getAddress());

  // Transfer ownership to keeper so tests exercise delegated permissions
  await core.connect(deployer).transferOwnership(keeper.address);

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
    manager,
    deployer,
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
  const settlementTime = endTime + 3600; // 1 hour after end

  // 새로운 틱 시스템: 100000부터 시작, 10 간격으로 TICK_COUNT개
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

  const marketId = await createMarketWithId(core, keeper, createArgs);

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
export async function createActiveMarket(contracts: any) {
  const currentTime = await time.latest();
  const startTime = currentTime + 200; // Add larger buffer to avoid timestamp conflicts
  const endTime = startTime + MARKET_DURATION;
  const settlementTime = endTime + 3600; // 1 hour after end

  // 새로운 틱 시스템: 100000부터 시작, 10 간격으로 TICK_COUNT개
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

  const marketId = await createMarketWithId(
    contracts.core,
    contracts.keeper,
    createArgs
  );

  await setMarketActivation(contracts.core, contracts.keeper, marketId, true);

  // Move to market start time (ensure monotonic timestamp progression)
  await increaseToSafe(startTime + 1);

  // Tree 초기화를 위한 첫 번째 position 생성 (매우 작은 수량)
  await contracts.core.connect(contracts.alice).openPosition(
    marketId,
    100500, // 중간 틱
    100510,
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
  const settlementTime = endTime + 3600; // 1 hour after end

  // 새로운 틱 시스템: 100000부터 시작, 10 간격으로 TICK_COUNT개
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

  const marketId = await createMarketWithId(core, keeper, createArgs);

  await setMarketActivation(core, keeper, marketId, true);

  // Move to market start time (ensure monotonic timestamp progression)
  await increaseToSafe(startTime + 1);

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
  requestedMarketId: number = 1
) {
  const startTime = await time.latest();
  const endTime = startTime + MARKET_DURATION;
  const settlementTime = endTime + 3600; // 1 hour after end
  const extremeAlpha = ethers.parseEther("1000");

  // 새로운 틱 시스템: 100000부터 시작, 10 간격으로 TICK_COUNT개
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
    extremeAlpha,
  ];

  const marketId = await createMarketWithId(
    contracts.core,
    contracts.keeper,
    createArgs
  );

  await setMarketActivation(contracts.core, contracts.keeper, marketId, true);

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

/**
 * Helper to retrieve single tick value via range sum API
 */
export async function getTickValue(
  core: any,
  marketId: number,
  tick: number,
  tickSpacingOverride?: number
): Promise<bigint> {
  const market = await core.getMarket(marketId);
  const rawSpacing =
    tickSpacingOverride ??
    Number(
      market.tickSpacing !== undefined
        ? market.tickSpacing
        : market[7] /* tuple fallback */
    );
  if (!Number.isFinite(rawSpacing) || rawSpacing <= 0) {
    throw new Error("Invalid tick spacing");
  }
  const maxTickSource =
    market.maxTick !== undefined ? market.maxTick : market[6];
  const minTickSource =
    market.minTick !== undefined ? market.minTick : market[5];

  if (maxTickSource === undefined || minTickSource === undefined) {
    throw new Error("Market tick bounds unavailable");
  }

  const maxTick = Number(maxTickSource);
  const minTick = Number(minTickSource);

  if (tick === maxTick) {
    const lowerTick = Math.max(minTick, maxTick - rawSpacing);
    return core.getRangeSum(marketId, lowerTick, maxTick);
  }

  if (tick < minTick) {
    return core.getRangeSum(marketId, tick, tick + rawSpacing);
  }

  const upperTick = tick + rawSpacing;
  return core.getRangeSum(marketId, tick, upperTick);
}

// 의미 기반 마켓 설정 헬퍼 함수들

/**
 * 표준 활성 마켓 설정 - 대부분의 테스트에서 사용
 */
export async function setupActiveMarket(
  contracts: any
) {
  return await createActiveMarket(contracts);
}

/**
 * 다중 마켓 설정 - 여러 마켓이 필요한 테스트용
 */
export async function setupMultipleMarkets(contracts: any, count: number = 3) {
  const markets = [];
  for (let i = 1; i <= count; i++) {
    const market = await createActiveMarket(contracts);
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
    numTicks?: number;
    alpha?: bigint;
    duration?: number;
  } = {}
) {
  const {
    numTicks = TICK_COUNT,
    alpha = ALPHA,
    duration = MARKET_DURATION,
  } = options;

  const currentTime = await time.latest();
  const startTime = currentTime + 200;
  const endTime = startTime + duration;
  const settlementTime = endTime + 3600; // 1 hour after end

  // 새로운 틱 시스템으로 변환
  const minTick = 100000;
  const maxTick = minTick + (numTicks - 1) * 10;
  const tickSpacing = 10;

  const createArgs: [number, number, number, number, number, number, bigint] = [
    minTick,
    maxTick,
    tickSpacing,
    startTime,
    endTime,
    settlementTime,
    alpha,
  ];

  const actualMarketId = await createMarketWithId(
    contracts.core,
    contracts.keeper,
    createArgs
  );

  await setMarketActivation(contracts.core, contracts.keeper, actualMarketId, true);

  await increaseToSafe(startTime + 1);

  return { marketId: actualMarketId, startTime, endTime, numTicks, alpha };
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
