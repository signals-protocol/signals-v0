import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { COMPONENT_TAG } from "../../helpers/tags";
import { createActiveMarketFixture } from "../../helpers/fixtures/core";

describe(`${COMPONENT_TAG} CLMSRMarketCore - Security`, function () {
  const USDC_DECIMALS = 6;
  const BPS_DENOMINATOR = 10_000n;
  const BUFFER_BPS = 500n;

  const applyBuffer = (amount: bigint, buffer: bigint = BUFFER_BPS) =>
    ((amount * (BPS_DENOMINATOR + buffer)) / BPS_DENOMINATOR) + 1n;

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
});
