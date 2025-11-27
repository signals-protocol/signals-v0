import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import {
  coreFixture,
  createMarketWithConfig,
  toSettlementValue,
} from "../../helpers/fixtures/core";
import { INTEGRATION_TAG } from "../../helpers/tags";
import type { CLMSRMarketCore } from "../../../typechain-types";

const SUBMIT_WINDOW = 10 * 60; // 10 minutes
const FINALIZE_DEADLINE = 15 * 60; // 15 minutes
const ORACLE_MESSAGE_TAG = "CLMSR_SETTLEMENT";
const ORACLE_STATE_SLOT = 9; // settlementOracleState mapping slot index

describe(`${INTEGRATION_TAG} finalizeSettlement windows and state`, function () {
  async function fixture() {
    const contracts = await coreFixture();
    const { core, keeper } = contracts;
    const coreTyped = core as unknown as CLMSRMarketCore;

    const now = await time.latest();
    const startTime = now - 400;
    const endTime = now - 100;
    const settlementTime = now + 100;

    const marketId = await createMarketWithConfig(coreTyped, keeper, {
      minTick: 100000,
      maxTick: 100500,
      tickSpacing: 10,
      startTime,
      endTime,
      settlementTime,
      liquidityParameter: ethers.parseEther("1"),
      feePolicy: ethers.ZeroAddress,
    });

    await coreTyped
      .connect(keeper)
      .setSettlementOracleSigner(await keeper.getAddress());

    return { ...contracts, core: coreTyped, marketId, settlementTime, keeper };
  }

  async function signPayload(
    signer: any,
    marketId: number,
    value: bigint,
    priceTimestamp: number
  ) {
    const hash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["string", "uint256", "int256", "uint64"],
        [ORACLE_MESSAGE_TAG, marketId, value, priceTimestamp]
      )
    );
    return signer.signMessage(ethers.getBytes(hash));
  }

  function mappingSlot(marketId: number | bigint) {
    return BigInt(
      ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["uint256", "uint256"],
          [marketId, ORACLE_STATE_SLOT]
        )
      )
    );
  }

  it("reverts finalizeSettlement before T+10", async function () {
    const { core, marketId, settlementTime, alice, keeper } = await loadFixture(
      fixture
    );

    await time.increaseTo(settlementTime + 1);

    // submit once so candidate exists
    const priceTimestamp = settlementTime + 1;
    await core
      .connect(alice)
      .submitSettlement(
        marketId,
        toSettlementValue(100200),
        priceTimestamp,
        await signPayload(
          keeper,
          marketId,
          toSettlementValue(100200),
          priceTimestamp
        )
      );

    await expect(core.connect(alice).finalizeSettlement(marketId, false))
      .to.be.revertedWithCustomError(core, "SettlementTooEarly")
      .withArgs(BigInt(settlementTime + SUBMIT_WINDOW), anyValue);
  });

  it("reverts finalizeSettlement after T+15", async function () {
    const { core, marketId, settlementTime, alice, keeper } = await loadFixture(
      fixture
    );

    await time.increaseTo(settlementTime + 1);

    const priceTimestamp = settlementTime + 2;
    await core
      .connect(alice)
      .submitSettlement(
        marketId,
        toSettlementValue(100200),
        priceTimestamp,
        await signPayload(
          keeper,
          marketId,
          toSettlementValue(100200),
          priceTimestamp
        )
      );

    await time.increaseTo(settlementTime + FINALIZE_DEADLINE + 1);

    await expect(core.connect(alice).finalizeSettlement(marketId, false))
      .to.be.revertedWithCustomError(core, "SettlementFinalizeWindowClosed")
      .withArgs(BigInt(settlementTime + FINALIZE_DEADLINE), anyValue);
  });

  it("reverts finalizeSettlement when no candidate was submitted", async function () {
    const { core, marketId, settlementTime, alice } = await loadFixture(
      fixture
    );

    await time.increaseTo(settlementTime + SUBMIT_WINDOW + 1);

    await expect(
      core.connect(alice).finalizeSettlement(marketId, false)
    ).to.be.revertedWithCustomError(core, "SettlementOracleCandidateMissing");
  });

  it("confirms settlement: sets state, emits events, clears candidate", async function () {
    const { core, marketId, settlementTime, alice, keeper } = await loadFixture(
      fixture
    );

    const settlementValue = toSettlementValue(100250);
    const priceTimestamp = settlementTime + 3;

    await time.increaseTo(settlementTime + 1);

    await core
      .connect(alice)
      .submitSettlement(
        marketId,
        settlementValue,
        priceTimestamp,
        await signPayload(keeper, marketId, settlementValue, priceTimestamp)
      );

    await time.increaseTo(settlementTime + SUBMIT_WINDOW + 1);

    await expect(core.connect(alice).finalizeSettlement(marketId, false))
      .to.emit(core, "MarketSettled")
      .withArgs(marketId, settlementValue / 1_000_000n)
      .and.to.emit(core, "MarketSettlementValueSubmitted")
      .withArgs(marketId, settlementValue)
      .and.to.emit(core, "MarketSettlementFinalized")
      .withArgs(
        marketId,
        false,
        settlementValue,
        settlementValue / 1_000_000n,
        priceTimestamp,
        anyValue
      );

    const market = await core.getMarket(marketId);
    expect(market.settled).to.equal(true);
    expect(market.isActive).to.equal(false);
    expect(market.settlementValue).to.equal(settlementValue);
    expect(market.settlementTick).to.equal(settlementValue / 1_000_000n);

    const coreAddress = await core.getAddress();
    // candidate cleared (both slots zero)
    const baseSlot = mappingSlot(marketId);
    const valueSlot = await ethers.provider.getStorage(coreAddress, baseSlot);
    const tsSlot = await ethers.provider.getStorage(coreAddress, baseSlot + 1n);
    expect(ethers.toBigInt(valueSlot)).to.equal(0n);
    expect(ethers.toBigInt(tsSlot)).to.equal(0n);
  });

  it("fail finalize clears candidate but leaves market unsettled", async function () {
    const { core, marketId, settlementTime, alice, keeper } = await loadFixture(
      fixture
    );

    const settlementValue = toSettlementValue(100210);
    const priceTimestamp = settlementTime + 4;

    await time.increaseTo(settlementTime + 1);
    await core
      .connect(alice)
      .submitSettlement(
        marketId,
        settlementValue,
        priceTimestamp,
        await signPayload(keeper, marketId, settlementValue, priceTimestamp)
      );

    await time.increaseTo(settlementTime + SUBMIT_WINDOW + 2);

    await expect(core.connect(alice).finalizeSettlement(marketId, true))
      .to.emit(core, "MarketSettlementFinalized")
      .withArgs(marketId, true, 0, 0, 0, anyValue);

    const market = await core.getMarket(marketId);
    expect(market.settled).to.equal(false);
    expect(market.isActive).to.equal(false); // stays as created state

    const coreAddress = await core.getAddress();
    const valueSlot = await ethers.provider.getStorage(
      coreAddress,
      mappingSlot(marketId)
    );
    expect(ethers.toBigInt(valueSlot)).to.equal(0n);
  });
});
