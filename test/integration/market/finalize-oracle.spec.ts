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
import {
  DataPackage,
  NumericDataPoint,
  RedstonePayload,
} from "@redstone-finance/protocol";
import type { Wallet } from "ethers";

const SUBMIT_WINDOW = 10 * 60; // 10 minutes
const FINALIZE_DEADLINE = 15 * 60; // 15 minutes
const ORACLE_STATE_SLOT = 9; // settlementOracleState mapping slot index
const MIN_TICK = 100000;
const MAX_TICK = 100500;
const DATA_FEED_ID = "BTC";
const DATA_SERVICE_ID = "redstone-primary-prod";
const FEED_DECIMALS = 8;

const AUTHORISED_SIGNER_KEYS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // hardhat default #0
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", // hardhat default #1
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a", // hardhat default #2
];
const authorisedWallets = AUTHORISED_SIGNER_KEYS.map(
  (key) => new ethers.Wallet(key)
);
const SUBMIT_IFACE = new ethers.Interface([
  "function submitSettlement(uint256 marketId)",
]);

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
      minTick: MIN_TICK,
      maxTick: MAX_TICK,
      tickSpacing: 10,
      startTime,
      endTime,
      settlementTime,
      liquidityParameter: ethers.parseEther("1"),
      feePolicy: ethers.ZeroAddress,
    });

    return { ...contracts, core: coreTyped, marketId, settlementTime, keeper };
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

  async function setCandidateRaw(core: any, marketId: number, value: bigint, ts: number) {
    const base = mappingSlot(marketId);
    const coreAddress = await core.getAddress();
    await ethers.provider.send("hardhat_setStorageAt", [
      coreAddress,
      ethers.toBeHex(base, 32),
      ethers.toBeHex(value, 32),
    ]);
    await ethers.provider.send("hardhat_setStorageAt", [
      coreAddress,
      ethers.toBeHex(base + 1n, 32),
      ethers.toBeHex(BigInt(ts), 32),
    ]);
  }

  function buildSignedDataPackage(
    valueWithDecimals: number,
    timestampSec: number,
    signer: Wallet
  ) {
    const dataPoint = new NumericDataPoint({
      dataFeedId: DATA_FEED_ID,
      value: valueWithDecimals,
      decimals: FEED_DECIMALS,
    });
    const pkg = new DataPackage(
      [dataPoint],
      timestampSec * 1000,
      DATA_FEED_ID
    );
    return pkg.sign(signer.privateKey);
  }

  function buildRedstonePayload(
    valueNumeric: number,
    timestampSec: number,
    signers: Wallet[]
  ) {
    const signedPackages = signers.map((signer) =>
      buildSignedDataPackage(valueNumeric, timestampSec, signer)
    );
    return RedstonePayload.prepare(signedPackages, DATA_SERVICE_ID);
  }

  async function submitWithPayload(
    core: CLMSRMarketCore,
    submitter: any,
    marketId: number | bigint,
    payload: string
  ) {
    const baseData = SUBMIT_IFACE.encodeFunctionData("submitSettlement", [
      marketId,
    ]);
    const data = `${baseData}${payload.replace(/^0x/, "")}`;
    return submitter.sendTransaction({
      to: await core.getAddress(),
      data,
    });
  }

  it("reverts finalizeSettlement before T+10", async function () {
    const { core, marketId, settlementTime, alice, keeper } = await loadFixture(
      fixture
    );

    await time.increaseTo(settlementTime + 1);

    // submit once so candidate exists
    const priceTimestamp = settlementTime + 1;
    const payload = buildRedstonePayload(
      100_200, // tick encoded with 8 decimals inside payload
      priceTimestamp,
      authorisedWallets
    );
    await submitWithPayload(core, alice, marketId, payload);

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
    const payload = buildRedstonePayload(
      100_200,
      priceTimestamp,
      authorisedWallets
    );
    await submitWithPayload(core, alice, marketId, payload);

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

    const payload = buildRedstonePayload(
      100_250,
      priceTimestamp,
      authorisedWallets
    );
    await submitWithPayload(core, alice, marketId, payload);

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
    const payload = buildRedstonePayload(
      100_210,
      priceTimestamp,
      authorisedWallets
    );
    await submitWithPayload(core, alice, marketId, payload);

    await time.increaseTo(settlementTime + SUBMIT_WINDOW + 2);

    await expect(core.connect(keeper).finalizeSettlement(marketId, true))
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

  it("allows owner fallback settleMarket after oracle failure", async function () {
    const { core, marketId, settlementTime, alice, keeper } = await loadFixture(
      fixture
    );

    const oracleValue = toSettlementValue(100210);
    const priceTimestamp = settlementTime + 2;
    await time.increaseTo(settlementTime + 1);
    const payload = buildRedstonePayload(
      100_210,
      priceTimestamp,
      authorisedWallets
    );
    await submitWithPayload(core, alice, marketId, payload);

    await time.increaseTo(settlementTime + SUBMIT_WINDOW + 1);
    await core.connect(keeper).finalizeSettlement(marketId, true);

    // manual settle by owner after failure
    const manualValue = toSettlementValue(100230);
    await expect(
      core.connect(keeper).settleMarket(marketId, manualValue)
    ).to.emit(core, "MarketSettled");

    const market = await core.getMarket(marketId);
    expect(market.settled).to.equal(true);
    expect(market.settlementValue).to.equal(manualValue);
  });

  it("requires owner to markFailed in finalize", async function () {
    const { core, marketId, settlementTime, alice, keeper } = await loadFixture(
      fixture
    );

    const settlementValue = toSettlementValue(100220);
    const priceTimestamp = settlementTime + 2;

    await time.increaseTo(settlementTime + 1);
    const payload = buildRedstonePayload(
      100_220,
      priceTimestamp,
      authorisedWallets
    );
    await submitWithPayload(core, alice, marketId, payload);

    await time.increaseTo(settlementTime + SUBMIT_WINDOW + 1);

    await expect(
      core.connect(alice).finalizeSettlement(marketId, true)
    ).to.be.revertedWithCustomError(core, "UnauthorizedCaller");
  });

  it("reverts finalizeSettlement if candidate tick is out of bounds", async function () {
    const { core, marketId, settlementTime, keeper } = await loadFixture(
      fixture
    );

    await time.increaseTo(settlementTime + SUBMIT_WINDOW + 1);

    // Inject invalid candidate directly (tick below min)
    const badValue = toSettlementValue(MIN_TICK - 1000);
    await setCandidateRaw(core, marketId, badValue, settlementTime + 2);

    await expect(
      core.connect(keeper).finalizeSettlement(marketId, false)
    ).to.be.revertedWithCustomError(core, "InvalidTick");
  });
});
