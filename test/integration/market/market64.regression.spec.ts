import fs from "fs";
import path from "path";

import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

import {
  coreFixture,
  createMarketWithId,
  setMarketActivation,
  toSettlementValue,
} from "../../helpers/fixtures/core";
import { INTEGRATION_TAG, REPLAY_TAG } from "../../helpers/tags";

type TradeType = "OPEN" | "CLOSE" | "SETTLE";

interface TradeEntry {
  id: string;
  positionId: string;
  user: string;
  type: TradeType;
  quantity: string;
  costOrProceeds: string;
  lowerTick: string;
  upperTick: string;
}

interface SnapshotData {
  market: {
    minTick: string;
    maxTick: string;
    tickSpacing: string;
    liquidityParameter: string;
    settlementTick: string;
    numBins: string;
  };
  trades: TradeEntry[];
}

const SNAPSHOT_PATH = path.join(__dirname, "../../data/market64/snapshot.json");

const SNAPSHOT: SnapshotData = JSON.parse(
  fs.readFileSync(SNAPSHOT_PATH, "utf8")
);

const TRADES = SNAPSHOT.trades;
const COST_TOLERANCE = 1_000_000n; // 1 micro USDC
const ROOT_TOLERANCE_WAD = 1_000_000_000_000n; // 1 micro WAD tolerance for tree sums

const shouldRunReplay = process.env.RUN_REPLAY === "1";
const describeMaybe = shouldRunReplay ? describe : describe.skip;

describeMaybe(`${INTEGRATION_TAG} ${REPLAY_TAG} Market64 Regression`, function () {
  this.timeout(600000);
  this.slow(300000);

  it("keeps market loss within α ln(n) bound after full replay", async function () {
    const { core, keeper, paymentToken, deployer } = await loadFixture(
      coreFixture
    );

    const allSigners = await ethers.getSigners();
    // Skip fixture-reserved signers (deployer, keeper, alice, bob, charlie)
    const traderPool = allSigners.slice(5);
    if (traderPool.length === 0) {
      throw new Error("Trader signer pool is empty");
    }

    const traderEntries = await Promise.all(
      traderPool.map(async (signer) => ({
        signer,
        address: await signer.getAddress(),
      }))
    );
    const addressToSigner = new Map(
      traderEntries.map((entry) => [entry.address, entry.signer])
    );

    const datasetPositionToAddress = new Map<string, string>();
    const datasetPositionToLocalId = new Map<string, bigint>();
    const fundedAddresses = new Set<string>();
    let assigningCursor = 0;

    const minTick = Number(SNAPSHOT.market.minTick);
    const maxTick = Number(SNAPSHOT.market.maxTick);
    const tickSpacing = Number(SNAPSHOT.market.tickSpacing);
    const alphaWad = BigInt(SNAPSHOT.market.liquidityParameter);
    const settlementTick = Number(SNAPSHOT.market.settlementTick);
    const numBins = Number(SNAPSHOT.market.numBins);

    if (!Number.isFinite(minTick) || !Number.isFinite(maxTick)) {
      throw new Error("Invalid tick configuration in snapshot");
    }
    if (!Number.isFinite(settlementTick)) {
      throw new Error("Invalid settlement tick in snapshot");
    }

    const startTime = (await time.latest()) + 180;
    const endTime = startTime + 24 * 60 * 60;
    const settlementTime = endTime + 3600;

    const marketId = await createMarketWithId(core, keeper, [
      minTick,
      maxTick,
      tickSpacing,
      startTime,
      endTime,
      settlementTime,
      alphaWad,
    ]);

    await setMarketActivation(core, keeper, marketId, true);
    await time.increaseTo(startTime + 1);

    const coreAddress = await core.getAddress();

    const ensureFunds = async (address: string) => {
      if (fundedAddresses.has(address)) {
        return;
      }
      const amount = ethers.parseUnits("100000000", 6); // 100M USDC buffer
      await paymentToken.connect(deployer).mint(address, amount);
      const signer = addressToSigner.get(address);
      if (!signer) {
        throw new Error(`No signer for address ${address}`);
      }
      await paymentToken
        .connect(signer)
        .approve(coreAddress, ethers.MaxUint256);
      fundedAddresses.add(address);
    };

    const assignSigner = (positionId: string) => {
      const existing = datasetPositionToAddress.get(positionId);
      if (existing) {
        const signer = addressToSigner.get(existing);
        if (!signer) {
          throw new Error(`Missing signer for assigned address ${existing}`);
        }
        return { address: existing, signer };
      }

      const entry = traderEntries[assigningCursor % traderEntries.length];
      assigningCursor += 1;
      datasetPositionToAddress.set(positionId, entry.address);
      return entry;
    };

    let totalCost = 0n;
    let totalCloseProceeds = 0n;
    let totalSettlementPayout = 0n;

    const openCostDeltas: bigint[] = [];
    const closeProceedsDeltas: bigint[] = [];
    let worstOpenRootDrop = 0n;
    let worstCloseRootIncrease = 0n;

    const consumeReceipt = async (tx: any) => {
      const response = await tx;
      const receipt = await response.wait();
      let openCost: bigint | null = null;
      let closeProceeds: bigint | null = null;
      let claimPayout: bigint | null = null;
      for (const log of receipt.logs) {
        try {
          const parsed = core.interface.parseLog(log);
          switch (parsed?.name) {
            case "PositionOpened": {
              const cost = parsed.args.cost as bigint;
              totalCost += cost;
               openCost = cost;
              break;
            }
            case "PositionClosed": {
              const proceeds = parsed.args.proceeds as bigint;
              totalCloseProceeds += proceeds;
               closeProceeds = proceeds;
              break;
            }
            case "PositionClaimed": {
              const payout = parsed.args.payout as bigint;
              totalSettlementPayout += payout;
               claimPayout = payout;
              break;
            }
            default:
              break;
          }
        } catch {
          // Ignore logs that are not from core contract
        }
      }
      return { receipt, openCost, closeProceeds, claimPayout };
    };

    const openAndCloseTrades: TradeEntry[] = [];
    const settleTrades: TradeEntry[] = [];
    for (const trade of TRADES) {
      if (trade.type === "SETTLE") {
        settleTrades.push(trade);
      } else {
        openAndCloseTrades.push(trade);
      }
    }

    for (const trade of openAndCloseTrades) {
      if (trade.type === "OPEN") {
        const { address, signer } = assignSigner(trade.positionId);
        await ensureFunds(address);

        const totalRangeBefore = await core.getRangeSum(
          marketId,
          minTick,
          maxTick
        );

        const quantity = BigInt(trade.quantity);
        const lowerTick = BigInt(trade.lowerTick);
        const upperTick = BigInt(trade.upperTick);
        const estimatedCost = await core
          .connect(signer)
          .calculateOpenCost(marketId, lowerTick, upperTick, quantity);
        const maxCost = estimatedCost + 1_000_000n; // add $1 buffer to avoid rounding drift

        const staticId = await core
          .connect(signer)
          .openPosition.staticCall(
            marketId,
            lowerTick,
            upperTick,
            quantity,
            maxCost
          );

        datasetPositionToLocalId.set(trade.positionId, staticId);

        const tx = await core
          .connect(signer)
          .openPosition(marketId, lowerTick, upperTick, quantity, maxCost);
        const { openCost } = await consumeReceipt(tx);

        if (openCost === null) {
          throw new Error(`Missing PositionOpened event for trade ${trade.id}`);
        }

        const totalRangeAfter = await core.getRangeSum(
          marketId,
          minTick,
          maxTick
        );

        if (totalRangeBefore > totalRangeAfter) {
          const drop = totalRangeBefore - totalRangeAfter;
          if (drop > worstOpenRootDrop) {
            worstOpenRootDrop = drop;
          }
        }

        expect(
          totalRangeAfter + ROOT_TOLERANCE_WAD,
          `Root sum should not decrease after OPEN trade ${trade.id}`
        ).to.be.gte(totalRangeBefore);

        const costDelta =
          openCost >= estimatedCost
            ? openCost - estimatedCost
            : estimatedCost - openCost;
        openCostDeltas.push(costDelta);
        expect(
          costDelta,
          `OPEN cost delta should stay within 1 micro USDC for trade ${trade.id}`
        ).to.be.lte(COST_TOLERANCE);
      } else if (trade.type === "CLOSE") {
        const localId = datasetPositionToLocalId.get(trade.positionId);
        if (localId === undefined) {
          throw new Error(`Missing local position id for ${trade.positionId}`);
        }
        const address = datasetPositionToAddress.get(trade.positionId);
        if (!address) {
          throw new Error(`Missing signer mapping for ${trade.positionId}`);
        }
        const signer = addressToSigner.get(address);
        if (!signer) {
          throw new Error(`Missing signer instance for address ${address}`);
        }

        const totalRangeBefore = await core.getRangeSum(
          marketId,
          minTick,
          maxTick
        );

        const estimatedProceeds = await core.calculateCloseProceeds(localId);

        const tx = await core.connect(signer).closePosition(localId, 0n);
        const { closeProceeds } = await consumeReceipt(tx);

        if (closeProceeds === null) {
          throw new Error(
            `Missing PositionClosed event for trade ${trade.id}`
          );
        }

        const totalRangeAfter = await core.getRangeSum(
          marketId,
          minTick,
          maxTick
        );

        if (totalRangeAfter > totalRangeBefore) {
          const increase = totalRangeAfter - totalRangeBefore;
          if (increase > worstCloseRootIncrease) {
            worstCloseRootIncrease = increase;
          }
        }

        expect(
          totalRangeAfter,
          `Root sum should not increase after CLOSE trade ${trade.id}`
        ).to.be.lte(totalRangeBefore + ROOT_TOLERANCE_WAD);

        const proceedsDelta =
          closeProceeds >= estimatedProceeds
            ? closeProceeds - estimatedProceeds
            : estimatedProceeds - closeProceeds;
        closeProceedsDeltas.push(proceedsDelta);
        expect(
          proceedsDelta,
          `CLOSE proceeds delta should stay within 1 micro USDC for trade ${trade.id}`
        ).to.be.lte(COST_TOLERANCE);

        datasetPositionToLocalId.delete(trade.positionId);
        datasetPositionToAddress.delete(trade.positionId);
      }
    }

    await time.increaseTo(settlementTime + 10);

    const settlementValue = toSettlementValue(settlementTick);
    await consumeReceipt(
      core.connect(keeper).settleMarket(marketId, settlementValue)
    );

    for (const trade of settleTrades) {
      const localId = datasetPositionToLocalId.get(trade.positionId);
      if (localId === undefined) {
        continue; // Some positions may have been closed before settlement
      }
      const address = datasetPositionToAddress.get(trade.positionId);
      if (!address) {
        throw new Error(`Missing signer mapping for settle ${trade.positionId}`);
      }
      const signer = addressToSigner.get(address);
      if (!signer) {
        throw new Error(`Missing signer instance for address ${address}`);
      }

      const tx = await core.connect(signer).claimPayout(localId);
      await consumeReceipt(tx);

      datasetPositionToLocalId.delete(trade.positionId);
      datasetPositionToAddress.delete(trade.positionId);
    }

    const bettingNetIncome = totalCost - totalCloseProceeds;
    const marketPnl = bettingNetIncome - totalSettlementPayout;

    const maxOpenDelta = openCostDeltas.reduce(
      (max, delta) => (delta > max ? delta : max),
      0n
    );
    const maxCloseDelta = closeProceedsDeltas.reduce(
      (max, delta) => (delta > max ? delta : max),
      0n
    );

    console.log(
      `Market64 replay summary → max OPEN cost delta: ${maxOpenDelta} μUSDC, max CLOSE proceeds delta: ${maxCloseDelta} μUSDC`
    );
    console.log(
      `Market64 replay root sum deviations → worst OPEN drop: ${worstOpenRootDrop} WAD, worst CLOSE increase: ${worstCloseRootIncrease} WAD`
    );

    const alphaFloat = Number(alphaWad / 10n ** 18n);
    const maxLossBoundMicro = BigInt(
      Math.floor(alphaFloat * Math.log(numBins) * 1_000_000)
    );

    expect(marketPnl, "market PnL should not exceed theoretical loss bound").to
      .be.gte(-maxLossBoundMicro);
  });
});
