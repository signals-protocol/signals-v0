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

const ORACLE_MESSAGE_TAG = "CLMSR_SETTLEMENT";

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

    await coreTyped
      .connect(keeper)
      .setSettlementOracleSigner(await keeper.getAddress());

    return { ...contracts, core: coreTyped, marketId, settlementTime, keeper, alice };
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

  it("submitSettlement is blocked when paused", async function () {
    const { core, marketId, settlementTime, keeper, alice } =
      await loadFixture(fixture);

    await core.connect(keeper).pause("pause for test");

    await time.increaseTo(settlementTime + 1);

    await expect(
      core
        .connect(alice)
        .submitSettlement(
          marketId,
          toSettlementValue(100200),
          settlementTime + 2,
          await signPayload(keeper, marketId, toSettlementValue(100200), settlementTime + 2)
        )
    ).to.be.revertedWithCustomError(core, "EnforcedPause");
  });

  it("finalizeSettlement is blocked when paused", async function () {
    const { core, marketId, settlementTime, keeper, alice } =
      await loadFixture(fixture);

    await time.increaseTo(settlementTime + 1);
    await core
      .connect(alice)
      .submitSettlement(
        marketId,
        toSettlementValue(100200),
        settlementTime + 2,
        await signPayload(keeper, marketId, toSettlementValue(100200), settlementTime + 2)
      );

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
    await core
      .connect(alice)
      .submitSettlement(
        marketId,
        toSettlementValue(100200),
        settlementTime + 2,
        await signPayload(keeper, marketId, toSettlementValue(100200), settlementTime + 2)
      );
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
