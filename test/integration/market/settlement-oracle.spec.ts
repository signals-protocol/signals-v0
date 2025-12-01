import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import {
  coreFixture,
  createMarketWithConfig,
} from "../../helpers/fixtures/core";
import { INTEGRATION_TAG } from "../../helpers/tags";
import type { CLMSRMarketCore } from "../../../typechain-types";
import {
  DataPackage,
  NumericDataPoint,
  RedstonePayload,
} from "@redstone-finance/protocol";
import type { Wallet } from "ethers";

const MIN_TICK = 100000;
const MAX_TICK = 100500;
const DATA_FEED_ID = "BTC";
const DATA_SERVICE_ID = "redstone-primary-prod";
const FEED_DECIMALS = 8;
const UNIQUE_SIGNERS_THRESHOLD = 3;
const PRICE_NUMERIC = 100_250; // will be encoded with 8 decimals -> raw 10_025_000_000_000, maps to tick ~100250
const SUBMIT_IFACE = new ethers.Interface([
  "function submitSettlement(uint256 marketId)",
]);
const ORACLE_STATE_SLOT = 9; // settlementOracleState mapping slot index

const AUTHORISED_SIGNER_KEYS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // hardhat default #0
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", // hardhat default #1
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a", // hardhat default #2
];
const UNAUTHORISED_SIGNER_KEY =
  "0x8b3a350cf5c34c9194ca9f2aeabc9b3a2b0a3f3f127f6ed7d231a1e6e84d27b3"; // arbitrary test key

const authorisedWallets = AUTHORISED_SIGNER_KEYS.map(
  (key) => new ethers.Wallet(key)
);
const unauthorisedWallet = new ethers.Wallet(UNAUTHORISED_SIGNER_KEY);

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
    timestampSec * 1000, // protocol uses ms
    DATA_FEED_ID
  );
  return pkg.sign(signer.privateKey);
}

function buildRedstonePayload(
  valueWithDecimals: number,
  timestampSec: number,
  signers: Wallet[]
) {
  const signedPackages = signers.map((signer) =>
    buildSignedDataPackage(valueWithDecimals, timestampSec, signer)
  );
  return RedstonePayload.prepare(signedPackages, DATA_SERVICE_ID);
}

async function submitWithPayload(
  core: CLMSRMarketCore,
  submitter: any,
  marketId: number | bigint,
  payload?: string
) {
  const baseData = SUBMIT_IFACE.encodeFunctionData("submitSettlement", [
    marketId,
  ]);
  const data =
    payload === undefined
      ? baseData
      : `${baseData}${payload.replace(/^0x/, "")}`;
  return submitter.sendTransaction({
    to: await core.getAddress(),
    data,
  });
}

describe(`${INTEGRATION_TAG} Settlement oracle submission (Redstone pull)`, function () {
  async function fixture() {
    const contracts = await coreFixture();
    const { core, keeper } = contracts;
    const coreTyped = core as unknown as CLMSRMarketCore;

    const now = await time.latest();
    const startTime = now - 400;
    const endTime = now - 100;
    const settlementTime = now + 100;

    const marketId = await createMarketWithConfig(core, keeper, {
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

  it("reverts when calldata has no Redstone payload", async function () {
    const { core, marketId, settlementTime, alice } = await loadFixture(
      fixture
    );

    await time.increaseTo(settlementTime + 1);

    await expect(
      submitWithPayload(core, alice, marketId)
    ).to.be.revertedWithCustomError(core, "CalldataMustHaveValidPayload");
  });

  it("reverts when payload is signed only by unauthorised signers", async function () {
    const { core, marketId, settlementTime, alice } = await loadFixture(
      fixture
    );

    await time.increaseTo(settlementTime + 1);
    const payload = buildRedstonePayload(
      PRICE_NUMERIC,
      settlementTime + 2,
      [unauthorisedWallet]
    );

    await expect(
      submitWithPayload(core, alice, marketId, payload)
    )
      .to.be.revertedWithCustomError(core, "SignerNotAuthorised")
      .withArgs(unauthorisedWallet.address);
  });

  it("reverts when unique signers threshold is not met", async function () {
    const { core, marketId, settlementTime, alice } = await loadFixture(
      fixture
    );

    await time.increaseTo(settlementTime + 1);
    const payload = buildRedstonePayload(
      PRICE_NUMERIC,
      settlementTime + 3,
      [authorisedWallets[0]]
    );

    await expect(
      submitWithPayload(core, alice, marketId, payload)
    )
      .to.be.revertedWithCustomError(core, "InsufficientNumberOfUniqueSigners")
      .withArgs(1, UNIQUE_SIGNERS_THRESHOLD);
  });

  it("reverts when oracle timestamp is too old", async function () {
    const { core, marketId, settlementTime, alice } = await loadFixture(
      fixture
    );

    // Move near settlement; choose a timestamp far in the past (>3m)
    await time.increaseTo(settlementTime + 5);
    const staleTimestamp = settlementTime - 600; // 10 minutes earlier
    const payload = buildRedstonePayload(
      PRICE_NUMERIC,
      staleTimestamp,
      authorisedWallets
    );

    await expect(
      submitWithPayload(core, alice, marketId, payload)
    ).to.be.reverted;
  });

  it("stores scaled settlementValue and tick within bounds", async function () {
    const { core, marketId, settlementTime, alice } = await loadFixture(
      fixture
    );
    const coreAddr = await core.getAddress();

    await time.increaseTo(settlementTime + 2);
    const priceTs = settlementTime + 1;
    const payload = buildRedstonePayload(
      PRICE_NUMERIC,
      priceTs,
      authorisedWallets
    );

    await submitWithPayload(core, alice, marketId, payload);

    const candidate = await readCandidateState(coreAddr, marketId);
    expect(candidate.candidatePriceTimestamp).to.equal(priceTs);
    // 8 decimals -> settlementValue scaled down by 1e2 (REDSTONE_FEED_DECIMALS - 6)
    expect(candidate.candidateValue).to.equal(100_250_000_000n);
  });

  it("reverts when scaled tick is out of bounds", async function () {
    const { core, marketId, settlementTime, alice } = await loadFixture(
      fixture
    );

    await time.increaseTo(settlementTime + 3);
    const tooHighPrice = 100_800; // tick ~100800 > maxTick
    const payload = buildRedstonePayload(
      tooHighPrice,
      settlementTime + 2,
      authorisedWallets
    );

    await expect(
      submitWithPayload(core, alice, marketId, payload)
    ).to.be.revertedWithCustomError(core, "InvalidTick");
  });

  it("selects candidate closer to settlement timestamp (ties prefer earlier)", async function () {
    const { core, marketId, settlementTime, alice } = await loadFixture(
      fixture
    );
    const coreAddr = await core.getAddress();

    await time.increaseTo(settlementTime + 5);
    const farTs = settlementTime + 120; // +120s
    const closeTs = settlementTime + 10; // +10s (closer)

    const payloadFar = buildRedstonePayload(
      PRICE_NUMERIC,
      farTs,
      authorisedWallets
    );
    // move near far timestamp to satisfy Redstone future-tolerance
    await time.increaseTo(farTs + 1);
    await submitWithPayload(core, alice, marketId, payloadFar);

    const payloadClose = buildRedstonePayload(
      PRICE_NUMERIC,
      closeTs,
      authorisedWallets
    );
    await time.increase(1); // keep monotonic, still within default timestamp tolerance
    await submitWithPayload(core, alice, marketId, payloadClose);

    const candidate = await readCandidateState(coreAddr, marketId);
    expect(candidate.candidatePriceTimestamp).to.equal(closeTs);
  });
});
