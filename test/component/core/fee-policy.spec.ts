import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import {
  createActiveMarketFixture,
  MEDIUM_QUANTITY,
  SMALL_QUANTITY,
} from "../../helpers/fixtures/core";
import { COMPONENT_TAG } from "../../helpers/tags";

const LOWER_TICK = 100450;
const UPPER_TICK = 100550;

describe(`${COMPONENT_TAG} Core Fee Policy Overlay`, function () {
  const FIXED_PERCENT_POLICIES = {
    "10": { name: "PercentFeePolicy10bps", feeBps: 10n },
    "50": { name: "PercentFeePolicy50bps", feeBps: 50n },
    "100": { name: "PercentFeePolicy100bps", feeBps: 100n },
    "200": { name: "PercentFeePolicy200bps", feeBps: 200n },
  } as const;
  type FixedPercentKey = keyof typeof FIXED_PERCENT_POLICIES;
  const BPS_DENOMINATOR = 10_000n;

  async function deployPercentPolicy(feeBps: FixedPercentKey, signer = undefined) {
    const deployer = signer ?? (await ethers.getSigners())[0];
    const { name, feeBps: feeBpsValue } = FIXED_PERCENT_POLICIES[feeBps];
    const factory = await ethers.getContractFactory(name, deployer);
    const policy = await factory.deploy();
    await policy.waitForDeployment();
    return { policy, feeBps: feeBpsValue };
  }

  async function deployExcessivePolicy(signer = undefined) {
    const deployer = signer ?? (await ethers.getSigners())[0];
    const factory = await ethers.getContractFactory("MockExcessiveFeePolicy", deployer);
    const policy = await factory.deploy();
    await policy.waitForDeployment();
    return policy;
  }

  it("provides zero preview fees when no policy is configured", async function () {
    const { core, alice, marketId, mockPosition } = await loadFixture(createActiveMarketFixture);

    const quantity = MEDIUM_QUANTITY;
    const cost = await core.calculateOpenCost(marketId, LOWER_TICK, UPPER_TICK, quantity);

    const preview = await (core.connect(alice) as any).previewOpenFee(
      marketId,
      LOWER_TICK,
      UPPER_TICK,
      quantity,
      cost
    );
    expect(preview).to.equal(0n);

    const nextId = await mockPosition.getNextId();
    const maxCost = cost + ethers.parseUnits("1", 6);
    await core
      .connect(alice)
      .openPosition(marketId, LOWER_TICK, UPPER_TICK, quantity, maxCost);

    const sellQuantity = SMALL_QUANTITY;
    const proceeds = await core.calculateDecreaseProceeds(nextId, sellQuantity);
    const sellPreview = await (core.connect(alice) as any).previewSellFee(
      nextId,
      sellQuantity,
      proceeds
    );
    expect(sellPreview).to.equal(0n);
  });

  it("charges overlay fee on buy actions when policy is set", async function () {
    const {
      core,
      keeper,
      alice,
      charlie,
      paymentToken,
      mockPosition,
      marketId,
    } = await loadFixture(createActiveMarketFixture);

    const { policy, feeBps } = await deployPercentPolicy("100", keeper);
    const coreWithPolicy = core.connect(keeper) as any;
    await coreWithPolicy.setMarketFeePolicy(marketId, await policy.getAddress());
    await coreWithPolicy.setFeeRecipient(charlie.address);

    const quantity = MEDIUM_QUANTITY;
    const cost = await core.calculateOpenCost(marketId, LOWER_TICK, UPPER_TICK, quantity);
    const expectedFee = (cost * feeBps) / BPS_DENOMINATOR;
    const preview = await (core.connect(alice) as any).previewOpenFee(
      marketId,
      LOWER_TICK,
      UPPER_TICK,
      quantity,
      cost
    );
    expect(preview).to.equal(expectedFee);

    const balanceBefore = await paymentToken.balanceOf(alice.address);
    const recipientBefore = await paymentToken.balanceOf(charlie.address);

    const maxCost = cost + expectedFee + ethers.parseUnits("1", 6);
    const nextId = await mockPosition.getNextId();
    await expect(
      core
        .connect(alice)
        .openPosition(marketId, LOWER_TICK, UPPER_TICK, quantity, maxCost)
    )
      .to.emit(core, "TradeFeeCharged")
      .withArgs(
        alice.address,
        marketId,
        nextId,
        true,
        cost,
        expectedFee,
        await policy.getAddress()
      );

    const balanceAfter = await paymentToken.balanceOf(alice.address);
    const recipientAfter = await paymentToken.balanceOf(charlie.address);

    expect(balanceAfter).to.equal(balanceBefore - cost - expectedFee);
    expect(recipientAfter).to.equal(recipientBefore + expectedFee);
  });

  it("reverts when maxCost does not include overlay fee", async function () {
    const {
      core,
      keeper,
      alice,
      marketId,
    } = await loadFixture(createActiveMarketFixture);

    const { policy, feeBps } = await deployPercentPolicy("200", keeper);
    await (core.connect(keeper) as any).setMarketFeePolicy(marketId, await policy.getAddress());

    const quantity = ethers.parseUnits("1", 6);
    const cost = await core.calculateOpenCost(marketId, LOWER_TICK, UPPER_TICK, quantity);
    const expectedFee = (cost * feeBps) / BPS_DENOMINATOR;
    expect(expectedFee).to.be.gt(0n);

    const tightMaxCost = cost + expectedFee - 1n;
    await expect(
      core
        .connect(alice)
        .openPosition(marketId, LOWER_TICK, UPPER_TICK, quantity, tightMaxCost)
    ).to.be.revertedWithCustomError(core, "CostExceedsMaximum");
  });

  it("deducts overlay fee from sell proceeds when policy is set", async function () {
    const {
      core,
      keeper,
      alice,
      bob,
      paymentToken,
      mockPosition,
      marketId,
    } = await loadFixture(createActiveMarketFixture);

    const { policy, feeBps } = await deployPercentPolicy("200", keeper);
    const coreWithPolicy = core.connect(keeper) as any;
    await coreWithPolicy.setMarketFeePolicy(marketId, await policy.getAddress());
    await coreWithPolicy.setFeeRecipient(bob.address);

    const quantity = MEDIUM_QUANTITY;
    const cost = await core.calculateOpenCost(marketId, LOWER_TICK, UPPER_TICK, quantity);
    const openMaxCost = cost + ethers.parseUnits("1", 6);
    const nextId = await mockPosition.getNextId();
    await core
      .connect(alice)
      .openPosition(marketId, LOWER_TICK, UPPER_TICK, quantity, openMaxCost);

    const sellQuantity = SMALL_QUANTITY;
    const proceeds = await core.calculateDecreaseProceeds(nextId, sellQuantity);
    const expectedFee = (proceeds * feeBps) / BPS_DENOMINATOR;
    const preview = await (core.connect(alice) as any).previewSellFee(
      nextId,
      sellQuantity,
      proceeds
    );
    expect(preview).to.equal(expectedFee);

    const traderBefore = await paymentToken.balanceOf(alice.address);
    const recipientBefore = await paymentToken.balanceOf(bob.address);

    await expect(
      core
        .connect(alice)
        .decreasePosition(nextId, sellQuantity, 0)
    )
      .to.emit(core, "TradeFeeCharged")
      .withArgs(
        alice.address,
        marketId,
        nextId,
        false,
        proceeds,
        expectedFee,
        await policy.getAddress()
      );

    const traderAfter = await paymentToken.balanceOf(alice.address);
    const recipientAfter = await paymentToken.balanceOf(bob.address);

    expect(traderAfter).to.equal(traderBefore + proceeds - expectedFee);
    expect(recipientAfter).to.equal(recipientBefore + expectedFee);
  });

  it("reverts when minProceeds exceeds net proceeds after fee", async function () {
    const {
      core,
      keeper,
      alice,
      marketId,
      mockPosition,
    } = await loadFixture(createActiveMarketFixture);

    const { policy, feeBps } = await deployPercentPolicy("200", keeper);
    await (core.connect(keeper) as any).setMarketFeePolicy(marketId, await policy.getAddress());

    const quantity = ethers.parseUnits("1", 6);
    const cost = await core.calculateOpenCost(marketId, LOWER_TICK, UPPER_TICK, quantity);
    const openFee = (cost * feeBps) / BPS_DENOMINATOR;
    expect(openFee).to.be.gt(0n);
    const nextId = await mockPosition.getNextId();
    const openMaxCost = cost + openFee + ethers.parseUnits("1", 6);

    await core
      .connect(alice)
      .openPosition(marketId, LOWER_TICK, UPPER_TICK, quantity, openMaxCost);

    const sellQuantity = SMALL_QUANTITY;
    const baseProceeds = await core.calculateDecreaseProceeds(nextId, sellQuantity);
    const expectedFee = (baseProceeds * feeBps) / BPS_DENOMINATOR;
    expect(expectedFee).to.be.gt(0n);
    const netProceeds = baseProceeds - expectedFee;
    const minProceeds = netProceeds + 1n;

    await expect(
      core.connect(alice).decreasePosition(nextId, sellQuantity, minProceeds)
    ).to.be.revertedWithCustomError(core, "ProceedsBelowMinimum");
  });

  it("enforces owner-only access for fee controls", async function () {
    const { core, keeper, alice, marketId } = await loadFixture(createActiveMarketFixture);
    const { policy } = await deployPercentPolicy("100", keeper);

    await expect(
      (core.connect(alice) as any).setMarketFeePolicy(marketId, await policy.getAddress())
    )
      .to.be.revertedWithCustomError(core, "OwnableUnauthorizedAccount")
      .withArgs(alice.address);

    await expect((core.connect(alice) as any).setFeeRecipient(alice.address))
      .to.be.revertedWithCustomError(core, "OwnableUnauthorizedAccount")
      .withArgs(alice.address);
  });

  it("rejects configuring non-contract fee policies", async function () {
    const { core, keeper, alice, marketId } = await loadFixture(createActiveMarketFixture);

    await expect(
      (core.connect(keeper) as any).setMarketFeePolicy(marketId, alice.address)
    )
      .to.be.revertedWithCustomError(core, "InvalidFeePolicy")
      .withArgs(alice.address);
  });

  it("defaults fee recipient to the owner when unset", async function () {
    const {
      core,
      keeper,
      alice,
      paymentToken,
      mockPosition,
      marketId,
    } = await loadFixture(createActiveMarketFixture);

    const { policy, feeBps } = await deployPercentPolicy("200", keeper);
    await (core.connect(keeper) as any).setMarketFeePolicy(marketId, await policy.getAddress());
    // recipient intentionally left unset -> fallback to owner (keeper)

    const quantity = MEDIUM_QUANTITY;
    const cost = await core.calculateOpenCost(marketId, LOWER_TICK, UPPER_TICK, quantity);
    const expectedFee = (cost * feeBps) / BPS_DENOMINATOR;
    const nextId = await mockPosition.getNextId();

    const keeperBefore = await paymentToken.balanceOf(keeper.address);
    const maxCost = cost + expectedFee + ethers.parseUnits("1", 6);

    await expect(
      core.connect(alice).openPosition(marketId, LOWER_TICK, UPPER_TICK, quantity, maxCost)
    )
      .to.emit(core, "TradeFeeCharged")
      .withArgs(
        alice.address,
        marketId,
        nextId,
        true,
        cost,
        expectedFee,
        await policy.getAddress()
      );

    const keeperAfter = await paymentToken.balanceOf(keeper.address);
    expect(keeperAfter).to.equal(keeperBefore + expectedFee);
  });

  it("emits TradeFeeCharged when closing positions under an overlay policy", async function () {
    const {
      core,
      keeper,
      alice,
      charlie,
      paymentToken,
      mockPosition,
      marketId,
    } = await loadFixture(createActiveMarketFixture);

    const { policy, feeBps } = await deployPercentPolicy("200", keeper);
    await (core.connect(keeper) as any).setMarketFeePolicy(marketId, await policy.getAddress());
    await (core.connect(keeper) as any).setFeeRecipient(charlie.address);

    const quantity = MEDIUM_QUANTITY;
    const cost = await core.calculateOpenCost(marketId, LOWER_TICK, UPPER_TICK, quantity);
    const openFee = (cost * feeBps) / BPS_DENOMINATOR;
    const nextId = await mockPosition.getNextId();
    const openMaxCost = cost + openFee + ethers.parseUnits("1", 6);

    await core
      .connect(alice)
      .openPosition(marketId, LOWER_TICK, UPPER_TICK, quantity, openMaxCost);

    const proceeds = await core.calculateDecreaseProceeds(nextId, quantity);
    const expectedCloseFee = (proceeds * feeBps) / BPS_DENOMINATOR;
    const recipientBefore = await paymentToken.balanceOf(charlie.address);

    await expect(core.connect(alice).closePosition(nextId, 0))
      .to.emit(core, "TradeFeeCharged")
      .withArgs(
        alice.address,
        marketId,
        nextId,
        false,
        proceeds,
        expectedCloseFee,
        await policy.getAddress()
      );

    const recipientAfter = await paymentToken.balanceOf(charlie.address);
    expect(recipientAfter).to.equal(recipientBefore + expectedCloseFee);
  });

  it("reverts sell attempts when the fee exceeds base proceeds", async function () {
    const {
      core,
      keeper,
      alice,
      mockPosition,
      marketId,
    } = await loadFixture(createActiveMarketFixture);

    const policy = await deployExcessivePolicy(keeper);
    await (core.connect(keeper) as any).setMarketFeePolicy(marketId, await policy.getAddress());

    const quantity = MEDIUM_QUANTITY;
    const cost = await core.calculateOpenCost(marketId, LOWER_TICK, UPPER_TICK, quantity);
    const nextId = await mockPosition.getNextId();
    const maxCost = cost + ethers.parseUnits("1", 6);

    await core
      .connect(alice)
      .openPosition(marketId, LOWER_TICK, UPPER_TICK, quantity, maxCost);

    const sellQuantity = SMALL_QUANTITY;
    const baseProceeds = await core.calculateDecreaseProceeds(nextId, sellQuantity);

    await expect(
      core.connect(alice).decreasePosition(nextId, sellQuantity, 0)
    )
      .to.be.revertedWithCustomError(core, "FeeExceedsBase")
      .withArgs(baseProceeds + 1n, baseProceeds);
  });
});
