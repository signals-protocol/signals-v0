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

    await coreTyped
      .connect(keeper)
      .setSettlementOracleSigner(await keeper.getAddress());

    await coreTyped.connect(keeper).setMarketActive(marketId, true);

    // move just after start
    await time.increaseTo(startTime + 1);

    // open a small position
    await coreTyped
      .connect(alice)
      .openPosition(marketId, 100000, 100010, 1_000_000n, ethers.MaxUint256);

    return { ...contracts, core: coreTyped, marketId, settlementTime };
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

  it("blocks claim before T+15 even after settlement, allows after", async function () {
    const { core, marketId, settlementTime, alice, keeper } = await loadFixture(
      fixture
    );

    // submit candidate
    const settlementValue = toSettlementValue(100005);
    const priceTimestamp = settlementTime + 1;

    await time.increaseTo(settlementTime + 1);

    await core
      .connect(alice)
      .submitSettlement(
        marketId,
        settlementValue,
        priceTimestamp,
        await signPayload(keeper, marketId, settlementValue, priceTimestamp)
      );

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
    await expect(core.connect(alice).claimPayout(1))
      .to.be.revertedWithCustomError(core, "SettlementTooEarly")
      .withArgs(BigInt(claimOpen), anyValue);

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
    await expect(core.connect(alice).claimPayout(1))
      .to.be.revertedWithCustomError(core, "SettlementTooEarly")
      .withArgs(BigInt(claimOpen), anyValue);

    await time.setNextBlockTimestamp(claimOpen + 1);
    await expect(core.connect(alice).claimPayout(1)).to.emit(
      core,
      "PositionClaimed"
    );
  });
});
