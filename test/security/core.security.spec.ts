import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SECURITY_TAG } from "../helpers/tags";
import {
  createActiveMarketFixture,
  createActiveMarket,
  unitFixture,
  INITIAL_SUPPLY,
  settleMarketUsingRange,
} from "../helpers/fixtures/core";

describe(`${SECURITY_TAG} CLMSRMarketCore - Security`, function () {
  const USDC_DECIMALS = 6;
  const BPS_DENOMINATOR = 10_000n;
  const BUFFER_BPS = 500n;

  const applyBuffer = (amount: bigint, buffer: bigint = BUFFER_BPS) =>
    ((amount * (BPS_DENOMINATOR + buffer)) / BPS_DENOMINATOR) + 1n;

  async function reentrantCoreFixture() {
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

    const ReentrantPositionFactory = await ethers.getContractFactory(
      "ReentrantPositionMock"
    );
    const reentrantPosition = await ReentrantPositionFactory.deploy();
    await reentrantPosition.waitForDeployment();

    const CoreFactory = await ethers.getContractFactory("CLMSRMarketCore", {
      libraries: {
        FixedPointMathU: await fixedPointMathU.getAddress(),
        LazyMulSegmentTree: await lazyMulSegmentTree.getAddress(),
      },
    });
    const core = await CoreFactory.deploy();
    await core.waitForDeployment();

    await core.initialize(
      await paymentToken.getAddress(),
      await reentrantPosition.getAddress()
    );

    await core.connect(deployer).setManager(await manager.getAddress());
    await paymentToken.mint(await core.getAddress(), INITIAL_SUPPLY);
    await reentrantPosition.setCore(await core.getAddress());
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
      reentrantPosition,
      manager,
      deployer,
      keeper,
      alice,
      bob,
      charlie,
    };
  }

  it("should block reentrant openPosition attempts from ERC721 receivers", async function () {
    const { core, paymentToken, alice, marketId } = await loadFixture(
      createActiveMarketFixture
    );

    const attackerFactory = await ethers.getContractFactory(
      "ReentrantPositionAttacker"
    );
    const attacker = await attackerFactory.deploy(
      await core.getAddress(),
      await paymentToken.getAddress()
    );
    await attacker.waitForDeployment();
    const attackerAddress = await attacker.getAddress();

    const lowerTick = 100100;
    const upperTick = 100200;
    const quantity = ethers.parseUnits("0.01", USDC_DECIMALS);

    const quotedCost = await core.calculateOpenCost(
      marketId,
      lowerTick,
      upperTick,
      quantity
    );
    const maxCost = applyBuffer(quotedCost);

    await paymentToken.connect(alice).transfer(attackerAddress, maxCost);
    await attacker.approvePayment();
    await attacker.configureAttack(
      marketId,
      lowerTick,
      upperTick,
      quantity,
      maxCost
    );

    await expect(attacker.attackOpenPosition()).to.be.revertedWithCustomError(
      core,
      "ReentrancyGuardReentrantCall"
    );
  });

  it("should block reentrant decreasePosition attempts", async function () {
    const contracts = await loadFixture(reentrantCoreFixture);
    const { core, reentrantPosition, alice, keeper, deployer } = contracts as any;

    const { marketId } = await createActiveMarket(contracts);

    const quantity = ethers.parseUnits("0.02", USDC_DECIMALS);
    const cost = await core.calculateOpenCost(
      marketId,
      100450,
      100550,
      quantity
    );

    await core
      .connect(alice)
      .openPosition(marketId, 100450, 100550, quantity, cost);

    const positions = await reentrantPosition.getPositionsByOwner(alice.address);
    const positionId = Number(positions[positions.length - 1]);

    const attackQuantity = ethers.parseUnits("0.005", USDC_DECIMALS);

    await reentrantPosition
      .connect(deployer)
      .configureAttack(1, positionId, attackQuantity, 0, 0);

    await expect(
      core
        .connect(alice)
        .decreasePosition(positionId, attackQuantity, 0)
    ).to.be.revertedWithCustomError(core, "ReentrancyGuardReentrantCall");
  });

  it("should block reentrant closePosition attempts", async function () {
    const contracts = await loadFixture(reentrantCoreFixture);
    const { core, reentrantPosition, alice, keeper, deployer } = contracts as any;

    const { marketId } = await createActiveMarket(contracts);

    const quantity = ethers.parseUnits("0.03", USDC_DECIMALS);
    const cost = await core.calculateOpenCost(
      marketId,
      100460,
      100560,
      quantity
    );

    await core
      .connect(alice)
      .openPosition(marketId, 100460, 100560, quantity, cost);

    const positions = await reentrantPosition.getPositionsByOwner(alice.address);
    const positionId = Number(positions[positions.length - 1]);

    await reentrantPosition
      .connect(deployer)
      .configureAttack(2, positionId, 0, 0, 0);

    await expect(
      core.connect(alice).closePosition(positionId, 0)
    ).to.be.revertedWithCustomError(core, "ReentrancyGuardReentrantCall");
  });

  it("should block reentrant claimPayout attempts", async function () {
    const contracts = await loadFixture(reentrantCoreFixture);
    const { core, reentrantPosition, alice, keeper, deployer } = contracts as any;

    const { marketId } = await createActiveMarket(contracts);

    const quantity = ethers.parseUnits("0.04", USDC_DECIMALS);
    const cost = await core.calculateOpenCost(
      marketId,
      100470,
      100570,
      quantity
    );

    await core
      .connect(alice)
      .openPosition(marketId, 100470, 100570, quantity, cost);

    const positions = await reentrantPosition.getPositionsByOwner(alice.address);
    const positionId = Number(positions[positions.length - 1]);

    await settleMarketUsingRange(core, keeper, marketId, 100480, 100500);

    await reentrantPosition
      .connect(deployer)
      .configureAttack(3, positionId, 0, 0, 0);

    await expect(core.connect(alice).claimPayout(positionId)).to.be.revertedWithCustomError(
      core,
      "ReentrancyGuardReentrantCall"
    );
  });

  it("should prevent unauthorized emitPositionSettledBatch reentry", async function () {
    const contracts = await loadFixture(reentrantCoreFixture);
    const { core, reentrantPosition, alice, keeper, deployer } = contracts as any;

    const { marketId } = await createActiveMarket(contracts);

    const quantity = ethers.parseUnits("0.05", USDC_DECIMALS);
    const cost = await core.calculateOpenCost(
      marketId,
      100480,
      100580,
      quantity
    );

    await core
      .connect(alice)
      .openPosition(marketId, 100480, 100580, quantity, cost);

    const positions = await reentrantPosition.getPositionsByOwner(alice.address);
    const positionId = Number(positions[positions.length - 1]);

    await settleMarketUsingRange(core, keeper, marketId, 100490, 100500);

    await reentrantPosition
      .connect(deployer)
      .configureAttack(4, positionId, 0, 0, 1);

    await expect(core.connect(alice).claimPayout(positionId)).to.be.revertedWithCustomError(
      core,
      "OwnableUnauthorizedAccount"
    );
  });
});
