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
const ORACLE_STATE_SLOT = 9; // storage slot index for settlementOracleState mapping

function mappingSlot(marketId: number | bigint) {
  const abi = ethers.AbiCoder.defaultAbiCoder();
  return BigInt(
    ethers.keccak256(
      abi.encode(["uint256", "uint256"], [marketId, ORACLE_STATE_SLOT])
    )
  );
}

async function readCandidateState(
  coreAddress: string,
  marketId: number | bigint
) {
  const provider = ethers.provider;
  const baseSlot = mappingSlot(marketId);

  const rawValue = await provider.getStorage(coreAddress, baseSlot);
  const rawTimestamp = await provider.getStorage(coreAddress, baseSlot + 1n);

  return {
    candidateValue: ethers.toBigInt(rawValue),
    candidatePriceTimestamp: Number(rawTimestamp),
  };
}

describe(`${INTEGRATION_TAG} Settlement oracle submission`, function () {
  async function fixture() {
    const contracts = await coreFixture();
    const { core, keeper } = contracts;
    const coreTyped = core as unknown as CLMSRMarketCore;

    const now = await time.latest();
    const startTime = now - 400;
    const endTime = now - 100;
    const settlementTime = now + 100;

    const marketId = await createMarketWithConfig(core, keeper, {
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

    return { ...contracts, core: coreTyped, marketId, settlementTime };
  }

  it("reverts submitSettlement before settlement timestamp", async function () {
    const { core, marketId, settlementTime, alice } = await loadFixture(
      fixture
    );

    await time.increaseTo(settlementTime - 10);

    await expect(
      core
        .connect(alice)
        .submitSettlement(
          marketId,
          toSettlementValue(100200),
          settlementTime - 20,
          "0x"
        )
    )
      .to.be.revertedWithCustomError(core, "SettlementTooEarly")
      .withArgs(BigInt(settlementTime), anyValue);
  });

  it("reverts submitSettlement after submit window closes", async function () {
    const { core, marketId, settlementTime, alice } = await loadFixture(
      fixture
    );

    await time.increaseTo(settlementTime + SUBMIT_WINDOW + 1);

    await expect(
      core
        .connect(alice)
        .submitSettlement(
          marketId,
          toSettlementValue(100200),
          settlementTime + SUBMIT_WINDOW + 1,
          "0x"
        )
    )
      .to.be.revertedWithCustomError(core, "SettlementFinalizeWindowClosed")
      .withArgs(BigInt(settlementTime + SUBMIT_WINDOW), anyValue);
  });

  it("stores the closest candidate price timestamp within submit window", async function () {
    const { core, marketId, settlementTime, alice, keeper } = await loadFixture(
      fixture
    );
    const coreAddress = await core.getAddress();

    await time.increaseTo(settlementTime + 1);

    const farTimestamp = settlementTime + 120;
    const closeTimestamp = settlementTime + 5;

    const signPayload = async (value: bigint, ts: number) => {
      const hash = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["string", "uint256", "int256", "uint64"],
          ["CLMSR_SETTLEMENT", marketId, value, ts]
        )
      );
      return keeper.signMessage(ethers.getBytes(hash));
    };

    await core
      .connect(alice)
      .submitSettlement(
        marketId,
        toSettlementValue(100300),
        farTimestamp,
        await signPayload(toSettlementValue(100300), farTimestamp)
      );

    await core
      .connect(alice)
      .submitSettlement(
        marketId,
        toSettlementValue(100250),
        closeTimestamp,
        await signPayload(toSettlementValue(100250), closeTimestamp)
      );

    const candidate = await readCandidateState(coreAddress, marketId);
    expect(candidate.candidatePriceTimestamp).to.equal(closeTimestamp);
    expect(candidate.candidateValue).to.equal(toSettlementValue(100250));
  });

  it("prefers earlier timestamp when distance is tied", async function () {
    const { core, marketId, settlementTime, alice, keeper } = await loadFixture(
      fixture
    );
    const coreAddress = await core.getAddress();

    await time.increaseTo(settlementTime + 1);

    const afterTimestamp = settlementTime + 5; // +5
    const beforeTimestamp = settlementTime - 5; // -5 (tie, earlier should win)

    const signPayload = async (value: bigint, ts: number) => {
      const hash = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["string", "uint256", "int256", "uint64"],
          ["CLMSR_SETTLEMENT", marketId, value, ts]
        )
      );
      return keeper.signMessage(ethers.getBytes(hash));
    };

    await core
      .connect(alice)
      .submitSettlement(
        marketId,
        toSettlementValue(100300),
        afterTimestamp,
        await signPayload(toSettlementValue(100300), afterTimestamp)
      );

    await core
      .connect(alice)
      .submitSettlement(
        marketId,
        toSettlementValue(100310),
        beforeTimestamp,
        await signPayload(toSettlementValue(100310), beforeTimestamp)
      );

    const candidate = await readCandidateState(coreAddress, marketId);
    expect(candidate.candidatePriceTimestamp).to.equal(beforeTimestamp);
    expect(candidate.candidateValue).to.equal(toSettlementValue(100310));
  });

  it("accepts only oracle-signed payloads", async function () {
    const { core, marketId, settlementTime, alice, keeper } = await loadFixture(
      fixture
    );
    const coreAddress = await core.getAddress();

    const oracle = ethers.Wallet.createRandom().connect(ethers.provider);
    await core
      .connect(keeper)
      .setSettlementOracleSigner(await oracle.getAddress());

    await time.increaseTo(settlementTime + 1);

    const settlementValue = toSettlementValue(100111);
    const priceTimestamp = settlementTime + 2;
    const payloadHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["string", "uint256", "int256", "uint64"],
        ["CLMSR_SETTLEMENT", marketId, settlementValue, priceTimestamp]
      )
    );
    const signature = await oracle.signMessage(ethers.getBytes(payloadHash));

    await expect(
      core
        .connect(alice)
        .submitSettlement(marketId, settlementValue, priceTimestamp, signature)
    )
      .to.emit(core, "MarketSettlementCandidateSubmitted")
      .withArgs(
        marketId,
        settlementValue,
        settlementValue / 1_000_000n,
        priceTimestamp,
        alice.address,
        signature
      );

    const candidate = await readCandidateState(coreAddress, marketId);
    expect(candidate.candidateValue).to.equal(settlementValue);
  });

  it("reverts when oracle signature is invalid", async function () {
    const { core, marketId, settlementTime, alice, keeper } = await loadFixture(
      fixture
    );

    const oracle = ethers.Wallet.createRandom().connect(ethers.provider);
    await core
      .connect(keeper)
      .setSettlementOracleSigner(await oracle.getAddress());

    await time.increaseTo(settlementTime + 1);

    const settlementValue = toSettlementValue(100111);
    const priceTimestamp = settlementTime + 2;

    // Sign with a different wallet to produce invalid signature
    const impostor = ethers.Wallet.createRandom().connect(ethers.provider);
    const payloadHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["string", "uint256", "int256", "uint64"],
        ["CLMSR_SETTLEMENT", marketId, settlementValue, priceTimestamp]
      )
    );
    const invalidSignature = await impostor.signMessage(
      ethers.getBytes(payloadHash)
    );

    await expect(
      core
        .connect(alice)
        .submitSettlement(
          marketId,
          settlementValue,
          priceTimestamp,
          invalidSignature
        )
    )
      .to.be.revertedWithCustomError(core, "SettlementOracleSignatureInvalid")
      .withArgs(await impostor.getAddress());
  });
});
