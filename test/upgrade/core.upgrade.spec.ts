import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import {
  unitFixture,
  createMarketWithId,
  setMarketActivation,
  ALPHA,
  INITIAL_SUPPLY,
  MARKET_DURATION,
  TICK_COUNT,
  applyCoreCompatibility,
} from "../helpers/fixtures/core";

const PROXIABLE_UUID = ethers.toBeHex(
  BigInt(ethers.id("eip1967.proxy.implementation")) - 1n,
  32
);

const INITIAL_POSITION_RANGE = {
  lowerTick: 100450,
  upperTick: 100550,
  quantity: ethers.parseUnits("0.02", 6),
} as const;

const SNAPSHOT_BENCHMARK_RANGE = {
  lowerTick: 100460,
  upperTick: 100560,
  quantity: ethers.parseUnits("0.013", 6),
} as const;

const SNAPSHOT_INCREASE_QUANTITY = ethers.parseUnits("0.004", 6);
const SNAPSHOT_DECREASE_QUANTITY = ethers.parseUnits("0.006", 6);

type RangeBenchmark = {
  lowerTick: number;
  upperTick: number;
  quantity: bigint;
};

type MarketSnapshot = {
  isActive: boolean;
  settled: boolean;
  startTimestamp: bigint;
  endTimestamp: bigint;
  settlementTick: bigint;
  minTick: bigint;
  maxTick: bigint;
  tickSpacing: bigint;
  numBins: bigint;
  liquidityParameter: bigint;
  positionEventsCursor: bigint;
  positionEventsEmitted: boolean;
  settlementValue: bigint;
  settlementTimestamp: bigint;
};

type CoreSnapshot = {
  manager: string;
  paymentToken: string;
  positionContract: string;
  nextMarketId: bigint;
  market: MarketSnapshot;
  totalRangeSum: bigint;
  openCostBenchmark: bigint;
  increaseCostBenchmark?: bigint;
  decreaseProceedsBenchmark?: bigint;
  closeProceeds?: bigint;
};

interface SnapshotOptions {
  openRange?: RangeBenchmark;
  positionId?: bigint;
  increaseQuantity?: bigint;
  decreaseQuantity?: bigint;
}

function toBigIntField(value: any, field: string): bigint {
  if (value === undefined || value === null) {
    throw new Error(`Missing ${field} in market snapshot`);
  }
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number") {
    return BigInt(value);
  }
  if (typeof value === "string") {
    return BigInt(value);
  }
  if (typeof value.toString === "function") {
    return BigInt(value.toString());
  }
  throw new Error(`Unable to coerce ${field} to bigint`);
}

function normalizeMarketData(raw: any): MarketSnapshot {
  return {
    isActive: Boolean(raw.isActive ?? raw[0]),
    settled: Boolean(raw.settled ?? raw[1]),
    startTimestamp: toBigIntField(raw.startTimestamp ?? raw[2], "startTimestamp"),
    endTimestamp: toBigIntField(raw.endTimestamp ?? raw[3], "endTimestamp"),
    settlementTick: toBigIntField(raw.settlementTick ?? raw[4], "settlementTick"),
    minTick: toBigIntField(raw.minTick ?? raw[5], "minTick"),
    maxTick: toBigIntField(raw.maxTick ?? raw[6], "maxTick"),
    tickSpacing: toBigIntField(raw.tickSpacing ?? raw[7], "tickSpacing"),
    numBins: toBigIntField(raw.numBins ?? raw[8], "numBins"),
    liquidityParameter: toBigIntField(
      raw.liquidityParameter ?? raw[9],
      "liquidityParameter"
    ),
    positionEventsCursor: toBigIntField(
      raw.positionEventsCursor ?? raw[10],
      "positionEventsCursor"
    ),
    positionEventsEmitted: Boolean(raw.positionEventsEmitted ?? raw[11]),
    settlementValue: toBigIntField(raw.settlementValue ?? raw[12], "settlementValue"),
    settlementTimestamp: toBigIntField(
      raw.settlementTimestamp ?? raw[13],
      "settlementTimestamp"
    ),
  };
}

async function captureCoreSnapshot(
  core: any,
  marketId: number,
  options: SnapshotOptions = {}
): Promise<CoreSnapshot> {
  const openRange = options.openRange ?? SNAPSHOT_BENCHMARK_RANGE;

  const [paymentToken, positionContractAddr, manager, nextMarketIdRaw, rawMarket] =
    await Promise.all([
      core.paymentToken(),
      core.positionContract(),
      core.manager(),
      core._nextMarketId(),
      core.getMarket(marketId),
    ]);

  const market = normalizeMarketData(rawMarket);

  const [totalRangeSum, openCostBenchmark] = await Promise.all([
    core.getRangeSum(marketId, market.minTick, market.maxTick),
    core.calculateOpenCost(
      marketId,
      openRange.lowerTick,
      openRange.upperTick,
      openRange.quantity
    ),
  ]);

  let increaseCostBenchmark: bigint | undefined;
  let decreaseProceedsBenchmark: bigint | undefined;
  let closeProceeds: bigint | undefined;

  if (options.positionId !== undefined) {
    const increaseQuantity = options.increaseQuantity ?? SNAPSHOT_INCREASE_QUANTITY;
    const decreaseQuantity = options.decreaseQuantity ?? SNAPSHOT_DECREASE_QUANTITY;
    const [increaseCost, decreaseProceeds, closeProceedsValue] = await Promise.all([
      core.calculateIncreaseCost(options.positionId, increaseQuantity),
      core.calculateDecreaseProceeds(options.positionId, decreaseQuantity),
      core.calculateCloseProceeds(options.positionId),
    ]);
    increaseCostBenchmark = increaseCost;
    decreaseProceedsBenchmark = decreaseProceeds;
    closeProceeds = closeProceedsValue;
  }

  return {
    manager,
    paymentToken,
    positionContract: positionContractAddr,
    nextMarketId: toBigIntField(nextMarketIdRaw, "_nextMarketId"),
    market,
    totalRangeSum,
    openCostBenchmark,
    increaseCostBenchmark,
    decreaseProceedsBenchmark,
    closeProceeds,
  };
}

async function deployCoreProxyFixture() {
  const base = await unitFixture();
  const {
    deployer,
    keeper,
    alice,
    bob,
    charlie,
    manager,
    fixedPointMathU,
    lazyMulSegmentTree,
  } = base as any;

  const MockERC20Factory = await ethers.getContractFactory("MockERC20");
  const paymentToken = await MockERC20Factory.deploy("USD Coin", "USDC", 6);
  await paymentToken.waitForDeployment();

  for (const user of [alice, bob, charlie]) {
    await paymentToken.mint(user.address, INITIAL_SUPPLY);
  }

  const MockPositionFactory = await ethers.getContractFactory("MockPosition");
  const mockPosition = await MockPositionFactory.deploy();
  await mockPosition.waitForDeployment();

  const CoreFactory = await ethers.getContractFactory("CLMSRMarketCore", {
    libraries: {
      FixedPointMathU: await fixedPointMathU.getAddress(),
      LazyMulSegmentTree: await lazyMulSegmentTree.getAddress(),
    },
  });

  const core = await upgrades.deployProxy(
    CoreFactory,
    [await paymentToken.getAddress(), await mockPosition.getAddress()],
    {
      kind: "uups",
      unsafeAllowLinkedLibraries: true,
      unsafeAllow: ["delegatecall"],
    }
  );
  await core.waitForDeployment();

  applyCoreCompatibility(core);

  await core.connect(deployer).setManager(await manager.getAddress());
  await paymentToken.mint(await core.getAddress(), INITIAL_SUPPLY);
  await mockPosition.setCore(await core.getAddress());

  await core.connect(deployer).transferOwnership(keeper.address);

  for (const user of [alice, bob, charlie]) {
    await paymentToken
      .connect(user)
      .approve(await core.getAddress(), ethers.MaxUint256);
  }

  return {
    ...base,
    core,
    paymentToken,
    mockPosition,
  };
}

async function createActiveMarketProxyFixture() {
  const contracts = await deployCoreProxyFixture();
  const { core, keeper } = contracts as any;

  const currentTime = await time.latest();
  const startTime = currentTime + 300;
  const endTime = startTime + MARKET_DURATION;
  const settlementTime = endTime + 3600;

  const minTick = 100000;
  const maxTick = minTick + (TICK_COUNT - 1) * 10;
  const tickSpacing = 10;

  const marketId = await createMarketWithId(core, keeper, [
    minTick,
    maxTick,
    tickSpacing,
    startTime,
    endTime,
    settlementTime,
    ALPHA,
    ethers.ZeroAddress,
  ]);

  await setMarketActivation(core, keeper, marketId, true);

  await time.increaseTo(startTime + 1);

  return { ...contracts, marketId, startTime, endTime };
}

async function getV2Factory(contracts: any, signer?: any) {
  const { fixedPointMathU, lazyMulSegmentTree } = contracts;
  const factory = await ethers.getContractFactory("CLMSRMarketCoreV2Mock", {
    libraries: {
      FixedPointMathU: await fixedPointMathU.getAddress(),
      LazyMulSegmentTree: await lazyMulSegmentTree.getAddress(),
    },
  });
  return signer ? factory.connect(signer) : factory;
}

describe("[upgrade] CLMSRMarketCore UUPS 업그레이드", function () {
  it("소유자만 업그레이드를 실행할 수 있어야 한다", async function () {
    const contracts = await loadFixture(deployCoreProxyFixture);
    const { core, alice } = contracts as any;

    const CoreV2Factory = await getV2Factory(contracts, alice);
    const implementation = await CoreV2Factory.deploy();
    await implementation.waitForDeployment();

    await expect(
      core
        .connect(alice)
        .upgradeToAndCall(await implementation.getAddress(), "0x")
    )
      .to.be.revertedWithCustomError(core, "OwnableUnauthorizedAccount")
      .withArgs(alice.address);
  });

  it("업그레이드 이후에도 상태와 이벤트 호환성이 유지되어야 한다", async function () {
    const contracts = await loadFixture(createActiveMarketProxyFixture);
    const { core, keeper, alice, mockPosition, paymentToken, marketId } =
      contracts as any;

    const initialCost = await core.calculateOpenCost(
      marketId,
      INITIAL_POSITION_RANGE.lowerTick,
      INITIAL_POSITION_RANGE.upperTick,
      INITIAL_POSITION_RANGE.quantity
    );

    await core
      .connect(alice)
      .openPosition(
        marketId,
        INITIAL_POSITION_RANGE.lowerTick,
        INITIAL_POSITION_RANGE.upperTick,
        INITIAL_POSITION_RANGE.quantity,
        initialCost
      );

    const ownerPositionsBefore = await mockPosition.getPositionsByOwner(
      alice.address
    );
    expect(ownerPositionsBefore.length).to.equal(1);
    const positionId = ownerPositionsBefore[0];

    const positionBefore = await mockPosition.getPosition(positionId);

    const preSnapshot = await captureCoreSnapshot(core, marketId, {
      positionId,
    });
    const { manager: managerBefore, nextMarketId: nextMarketIdBefore, market: marketBefore } =
      preSnapshot;

    const proxyAddress = await core.getAddress();

    const implementationBefore =
      await upgrades.erc1967.getImplementationAddress(proxyAddress);

    const CoreV2Factory = await getV2Factory(contracts);
    const implementation = await CoreV2Factory.deploy();
    await implementation.waitForDeployment();

    await expect(
      core
        .connect(keeper)
        .upgradeToAndCall(await implementation.getAddress(), "0x")
    )
      .to.emit(core, "Upgraded")
      .withArgs(await implementation.getAddress());

    const implementationAfter = await upgrades.erc1967.getImplementationAddress(
      proxyAddress
    );
    expect(implementationAfter).to.not.equal(implementationBefore);

    const upgraded = await ethers.getContractAt(
      "CLMSRMarketCoreV2Mock",
      proxyAddress
    );

    expect(await upgraded.version()).to.equal("v2-mock");

    const [managerAfter, nextMarketIdAfter] = await upgraded.snapshotState();
    expect(managerAfter).to.equal(managerBefore);
    expect(nextMarketIdAfter).to.equal(nextMarketIdBefore);

    const postSnapshot = await captureCoreSnapshot(upgraded, marketId, {
      positionId,
    });
    expect(postSnapshot).to.deep.equal(preSnapshot);

    const marketAfter = postSnapshot.market;
    expect(marketAfter.startTimestamp).to.equal(marketBefore.startTimestamp);
    expect(marketAfter.endTimestamp).to.equal(marketBefore.endTimestamp);
    expect(marketAfter.numBins).to.equal(marketBefore.numBins);
    expect(marketAfter.liquidityParameter).to.equal(
      marketBefore.liquidityParameter
    );

    const ownerPositions = await mockPosition.getPositionsByOwner(alice.address);
    expect(ownerPositions.length).to.equal(1);
    expect(ownerPositions[0]).to.equal(positionId);

    const positionAfter = await mockPosition.getPosition(positionId);
    expect(positionAfter.marketId).to.equal(positionBefore.marketId);
    expect(positionAfter.lowerTick).to.equal(positionBefore.lowerTick);
    expect(positionAfter.upperTick).to.equal(positionBefore.upperTick);
    expect(positionAfter.quantity).to.equal(positionBefore.quantity);

    const implementationContract = await ethers.getContractAt(
      "CLMSRMarketCoreV2Mock",
      implementationAfter
    );
    expect(await implementationContract.proxiableUUID()).to.equal(
      PROXIABLE_UUID
    );

    const addedCost = postSnapshot.openCostBenchmark;
    await expect(
      upgraded
        .connect(alice)
        .openPosition(
          marketId,
          SNAPSHOT_BENCHMARK_RANGE.lowerTick,
          SNAPSHOT_BENCHMARK_RANGE.upperTick,
          SNAPSHOT_BENCHMARK_RANGE.quantity,
          addedCost
        )
    ).to.emit(upgraded, "PositionOpened");

    const ownerPositionsAfterOpen = await mockPosition.getPositionsByOwner(
      alice.address
    );
    expect(ownerPositionsAfterOpen.length).to.equal(2);

    const coreBalance = await paymentToken.balanceOf(proxyAddress);
    expect(coreBalance).to.be.gt(0);
  });

  it("upgradeToAndCall을 통한 재초기화 시도를 차단해야 한다", async function () {
    const contracts = await loadFixture(deployCoreProxyFixture);
    const { core, keeper, paymentToken, mockPosition } = contracts as any;

    const CoreV2Factory = await getV2Factory(contracts);
    const implementation = await CoreV2Factory.deploy();
    await implementation.waitForDeployment();

    await core
      .connect(keeper)
      .upgradeToAndCall(await implementation.getAddress(), "0x");

    const initCalldata = core.interface.encodeFunctionData("initialize", [
      await paymentToken.getAddress(),
      await mockPosition.getAddress(),
    ]);

    await expect(
      core
        .connect(keeper)
        .upgradeToAndCall(await implementation.getAddress(), initCalldata)
    ).to.be.revertedWithCustomError(core, "InvalidInitialization");
  });
});
