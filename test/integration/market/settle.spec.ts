import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { coreFixture } from "../../helpers/fixtures/core";
import { INTEGRATION_TAG } from "../../helpers/tags";

describe(`${INTEGRATION_TAG} Market Settlement`, function () {
  const ALPHA = ethers.parseEther("1");
  const TICK_COUNT = 100;
  const MARKET_DURATION = 7 * 24 * 60 * 60; // 7 days

  async function createMarketFixture() {
    const contracts = await loadFixture(coreFixture);
    const { core, keeper } = contracts;

    const currentTime = await time.latest();
    const startTime = currentTime + 3600; // 1 hour from now
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

  it("Should settle market successfully", async function () {
    const { core, keeper, marketId } = await loadFixture(createMarketFixture);

    const winningTick = 50;

    await expect(core.connect(keeper).settleMarket(marketId, winningTick))
      .to.emit(core, "MarketSettled")
      .withArgs(marketId, winningTick);

    const market = await core.getMarket(marketId);
    expect(market.settled).to.be.true;
    expect(market.settlementTick).to.equal(winningTick);
    expect(market.isActive).to.be.false;
  });

  it("Should prevent double settlement", async function () {
    const { core, keeper, marketId } = await loadFixture(createMarketFixture);

    const winningTick = 50;

    // First settlement
    await core.connect(keeper).settleMarket(marketId, winningTick);

    // Try to settle again
    await expect(
      core.connect(keeper).settleMarket(marketId, 60)
    ).to.be.revertedWithCustomError(core, "MarketAlreadySettled");
  });

  it("Should validate winning tick range", async function () {
    const { core, keeper, marketId } = await loadFixture(createMarketFixture);

    // Test winning tick >= tickCount
    await expect(
      core.connect(keeper).settleMarket(marketId, TICK_COUNT) // exactly at limit
    ).to.be.revertedWithCustomError(core, "InvalidTick");

    await expect(
      core.connect(keeper).settleMarket(marketId, TICK_COUNT + 1) // over limit
    ).to.be.revertedWithCustomError(core, "InvalidTick");
  });

  it("Should settle with edge case winning ticks", async function () {
    const { core, keeper } = await loadFixture(coreFixture);

    const currentTime = await time.latest();
    const startTime = currentTime + 3600;
    const endTime = startTime + MARKET_DURATION;

    // Test first tick (0)
    const marketId1 = 1;
    await core
      .connect(keeper)
      .createMarket(marketId1, TICK_COUNT, startTime, endTime, ALPHA);
    await core.connect(keeper).settleMarket(marketId1, 0);

    let market = await core.getMarket(marketId1);
    expect(market.settlementTick).to.equal(0);

    // Test last tick (TICK_COUNT - 1)
    const marketId2 = 2;
    await core
      .connect(keeper)
      .createMarket(marketId2, TICK_COUNT, startTime, endTime, ALPHA);
    await core.connect(keeper).settleMarket(marketId2, TICK_COUNT - 1);

    market = await core.getMarket(marketId2);
    expect(market.settlementTick).to.equal(TICK_COUNT - 1);
  });

  it("Should prevent settlement of non-existent market", async function () {
    const { core, keeper } = await loadFixture(coreFixture);

    await expect(
      core.connect(keeper).settleMarket(999, 50) // non-existent market
    ).to.be.revertedWithCustomError(core, "MarketNotFound");
  });

  it("Should only allow manager to settle markets", async function () {
    const { core, alice, bob, marketId } = await loadFixture(
      createMarketFixture
    );

    await expect(
      core.connect(alice).settleMarket(marketId, 50)
    ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");

    await expect(
      core.connect(bob).settleMarket(marketId, 50)
    ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");
  });
});
