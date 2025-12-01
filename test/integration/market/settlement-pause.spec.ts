/// <reference types="@nomicfoundation/hardhat-chai-matchers" />
/// <reference types="@nomicfoundation/hardhat-ethers" />
/// <reference types="@nomicfoundation/hardhat-network-helpers" />

import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import {
  coreFixture,
  createMarketWithConfig,
  toSettlementValue,
  advanceToClaimOpen,
} from "../../helpers/fixtures/core";
import { INTEGRATION_TAG } from "../../helpers/tags";
import type { CLMSRMarketCore } from "../../../typechain-types";
import {
  DataPackage,
  NumericDataPoint,
  RedstonePayload,
} from "@redstone-finance/protocol";
import type { Wallet } from "ethers";

const DATA_FEED_ID = "BTC";
const DATA_SERVICE_ID = "redstone-primary-prod";
const FEED_DECIMALS = 8;
const AUTHORISED_SIGNER_KEYS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
];
const authorisedWallets = AUTHORISED_SIGNER_KEYS.map(
  (key) => new ethers.Wallet(key)
);
const SUBMIT_IFACE = new ethers.Interface([
  "function submitSettlement(uint256 marketId)",
]);

describe(`${INTEGRATION_TAG} Settlement pause behavior`, function () {
  async function fixture() {
    const contracts = await coreFixture();
    const { core, keeper, alice } = contracts;
    const coreTyped = core as unknown as CLMSRMarketCore;

    const now = await time.latest();
    const startTime = now - 1000;
    const endTime = now - 500;
    const settlementTime = now + 200;

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

    return { ...contracts, core: coreTyped, marketId, settlementTime, keeper, alice };
  }

  function buildSignedDataPackage(
    valueNumeric: number,
    timestampSec: number,
    signer: Wallet
  ) {
    const dataPoint = new NumericDataPoint({
      dataFeedId: DATA_FEED_ID,
      value: valueNumeric,
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

  it("submitSettlement is blocked when paused", async function () {
    const { core, marketId, settlementTime, keeper, alice } =
      await loadFixture(fixture);

    await core.connect(keeper).pause("pause for test");

    await time.increaseTo(settlementTime + 1);

    await expect(
      core
        .connect(alice)
        .submitSettlement(marketId)
    ).to.be.revertedWithCustomError(core, "EnforcedPause");
  });

  it("finalizeSettlement is blocked when paused", async function () {
    const { core, marketId, settlementTime, keeper, alice } =
      await loadFixture(fixture);

    await time.increaseTo(settlementTime + 1);
    const payload = buildRedstonePayload(
      100_200,
      settlementTime + 2,
      authorisedWallets
    );
    await submitWithPayload(core, alice, marketId, payload);

    await core.connect(keeper).pause("pause for test");
    await time.increaseTo(settlementTime + 11 * 60); // within finalize window

    await expect(
      core.connect(alice).finalizeSettlement(marketId, false)
    ).to.be.revertedWithCustomError(core, "EnforcedPause");
  });

  it("claimPayout is blocked when paused", async function () {
    const { core, marketId, settlementTime, keeper, alice } =
      await loadFixture(fixture);

    await time.increaseTo(settlementTime + 1);
    const payload = buildRedstonePayload(
      100_200,
      settlementTime + 2,
      authorisedWallets
    );
    await submitWithPayload(core, alice, marketId, payload);
    await time.increaseTo(settlementTime + 11 * 60);
    await core.connect(alice).finalizeSettlement(marketId, false);

    await advanceToClaimOpen(core, marketId);
    await core.connect(keeper).pause("pause for test");

    await expect(core.connect(alice).claimPayout(1)).to.be.revertedWithCustomError(
      core,
      "EnforcedPause"
    );
  });
});
