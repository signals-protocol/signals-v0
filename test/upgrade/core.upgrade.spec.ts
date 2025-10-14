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
} from "../helpers/fixtures/core";

const PROXIABLE_UUID = ethers.toBeHex(
  BigInt(ethers.id("eip1967.proxy.implementation")) - 1n,
  32
);

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

    const quantity = ethers.parseUnits("0.02", 6);
    const cost = await core.calculateOpenCost(
      marketId,
      100450,
      100550,
      quantity
    );

    await core
      .connect(alice)
      .openPosition(marketId, 100450, 100550, quantity, cost);

    const marketBefore = await core.getMarket(marketId);
    const managerBefore = await core.manager();
    const nextMarketIdBefore = await core._nextMarketId();
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

    const marketAfter = await upgraded.getMarket(marketId);
    expect(marketAfter.startTimestamp).to.equal(marketBefore.startTimestamp);
    expect(marketAfter.endTimestamp).to.equal(marketBefore.endTimestamp);
    expect(marketAfter.numBins).to.equal(marketBefore.numBins);
    expect(marketAfter.liquidityParameter).to.equal(
      marketBefore.liquidityParameter
    );

    const ownerPositions = await mockPosition.getPositionsByOwner(alice.address);
    expect(ownerPositions.length).to.equal(1);

    const implementationContract = await ethers.getContractAt(
      "CLMSRMarketCoreV2Mock",
      implementationAfter
    );
    expect(await implementationContract.proxiableUUID()).to.equal(
      PROXIABLE_UUID
    );

    const addedCost = await upgraded.calculateOpenCost(
      marketId,
      100460,
      100560,
      quantity
    );
    await expect(
      upgraded
        .connect(alice)
        .openPosition(marketId, 100460, 100560, quantity, addedCost)
    ).to.emit(upgraded, "PositionOpened");

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
