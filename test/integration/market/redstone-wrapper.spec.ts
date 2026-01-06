import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { DataPackage, NumericDataPoint, RedstonePayload } from "@redstone-finance/protocol";
import {
  coreFixture,
  createMarketWithConfig,
} from "../../helpers/fixtures/core";
import { INTEGRATION_TAG } from "../../helpers/tags";
import type { CLMSRMarketCore } from "../../../typechain-types";
import type { Wallet } from "ethers";

const MIN_TICK = 100000;
const MAX_TICK = 100500;
const DATA_FEED_ID = "BTC";
const FEED_DECIMALS = 8;
const AUTHORISED_SIGNER_KEYS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
];
const authorisedWallets: Wallet[] = AUTHORISED_SIGNER_KEYS.map(
  (key) => new ethers.Wallet(key)
);
const ORACLE_STATE_SLOT = 9; // settlementOracleState mapping slot index
const SUBMIT_IFACE = new ethers.Interface([
  "function submitSettlement(uint256 marketId)",
]);

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

function buildPayload(
  valueNumeric: number,
  timestampSec: number,
  signers: Wallet[]
) {
  const signedPackages = signers.map((signer) => {
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
  });
  return RedstonePayload.prepare(signedPackages, "redstone-dev-test");
}

describe(`${INTEGRATION_TAG} Redstone wrapper end-to-end submitSettlement`, function () {
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

    return { ...contracts, core: coreTyped, marketId, settlementTime };
  }

  it("attaches signed payload and stores candidate", async function () {
    const { core, marketId, settlementTime, alice } = await loadFixture(
      fixture
    );
    const coreAddr = await core.getAddress();

    // Move into submit window
    await time.increaseTo(settlementTime + 2);
    const priceTimestamp = settlementTime + 2;

    // Build signed payload from authorised wallets
    const payload = buildPayload(
      100_123,
      priceTimestamp,
      authorisedWallets
    );

    const baseData = SUBMIT_IFACE.encodeFunctionData("submitSettlement", [
      marketId,
    ]);
    const txData = `${baseData}${payload.replace(/^0x/, "")}`;
    await alice.sendTransaction({
      to: coreAddr,
      data: txData,
    });

    const candidate = await readCandidateState(coreAddr, marketId);
    expect(candidate.candidatePriceTimestamp).to.equal(priceTimestamp);
    expect(candidate.candidateValue).to.equal(100_123_000_000n); // 8 decimals → scaled to 1e6
  });
});
