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

describe(`${INTEGRATION_TAG} claim gating after settlement`, function () {
  async function fixture() {
    const contracts = await coreFixture();
    const { core, keeper, alice } = contracts;
    const coreTyped = core as unknown as CLMSRMarketCore;

    const now = await time.latest();
    const startTime = now + 100;
    const endTime = startTime + 100;
    const settlementTime = endTime + 200;

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

    await coreTyped.connect(keeper).setMarketActive(marketId, true);

    // move just after start
    await time.increaseTo(startTime + 1);

    // open a small position
    await coreTyped
      .connect(alice)
      .openPosition(marketId, 100000, 100010, 1_000_000n, ethers.MaxUint256);

    return { ...contracts, core: coreTyped, marketId, settlementTime };
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

  it("blocks claim before T+15 even after settlement, allows after", async function () {
    const { core, marketId, settlementTime, alice, keeper } = await loadFixture(
      fixture
    );

    // submit candidate
    const settlementValue = toSettlementValue(100005);
    const priceTimestamp = settlementTime + 1;

    await time.increaseTo(settlementTime + 1);

    const payload = buildRedstonePayload(
      100_005,
      priceTimestamp,
      authorisedWallets
    );
    await submitWithPayload(core, alice, marketId, payload);

    // finalize within window
    await time.increaseTo(settlementTime + SUBMIT_WINDOW + 1);
    await core.connect(alice).finalizeSettlement(marketId, false);

    const market = await core.getMarket(marketId);
    expect(market.settlementTimestamp).to.equal(BigInt(settlementTime));
    const claimOpen =
      Number(
        market.settlementTimestamp === 0n
          ? market.endTimestamp
          : market.settlementTimestamp
      ) + FINALIZE_DEADLINE;
    const nowAfterFinalize = await time.latest();
    expect(BigInt(claimOpen)).to.be.greaterThan(nowAfterFinalize);

    // before claimOpen: claim should revert
    await time.increaseTo(claimOpen - 10);
    await expect(core.connect(alice).claimPayout(1)).to.be.reverted;

    // after claimOpen: claim succeeds
    await time.increaseTo(claimOpen + 1);
    await expect(core.connect(alice).claimPayout(1)).to.emit(
      core,
      "PositionClaimed"
    );
  });

  it("enforces claim gate after manual settleMarket", async function () {
    const { core, marketId, settlementTime, keeper, alice } =
      await loadFixture(fixture);

    // manual settle by owner (keeper)
    await time.increaseTo(settlementTime + 1);
    await core.connect(keeper).settleMarket(marketId, toSettlementValue(100010));

    const market = await core.getMarket(marketId);
    const claimOpen =
      Number(
        market.settlementTimestamp === 0n
          ? market.endTimestamp
          : market.settlementTimestamp
      ) + FINALIZE_DEADLINE;

    await time.setNextBlockTimestamp(claimOpen - 100);
    await expect(core.connect(alice).claimPayout(1)).to.be.reverted;

    await time.setNextBlockTimestamp(claimOpen + 1);
    await expect(core.connect(alice).claimPayout(1)).to.emit(
      core,
      "PositionClaimed"
    );
  });
});
