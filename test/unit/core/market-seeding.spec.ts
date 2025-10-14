import { expect } from "chai";
import { ethers } from "hardhat";
import { AbiCoder, parseEther } from "ethers";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { positionFixture } from "../../helpers/fixtures/position";

const abi = AbiCoder.defaultAbiCoder();

function buildSeedHash(factors: bigint[]): string {
  return ethers.keccak256(abi.encode(["uint256[]"], [factors]));
}

type MarketParams = {
  minTick: number;
  maxTick: number;
  tickSpacing: number;
  startTimestamp: number;
  endTimestamp: number;
  settlementTimestamp: number;
  liquidityParameter: bigint;
};

describe("Market range factor batching", function () {
  async function setup() {
    const fixture = await loadFixture(positionFixture);
    const { core, keeper } = fixture;
    return { ...fixture, core, keeper };
  }

  async function createTestMarket(
    core: any,
    keeper: any,
    overrides: Partial<MarketParams> = {}
  ) {
    const now = await time.latest();
    const base: MarketParams = {
      minTick: 1000,
      maxTick: 1400,
      tickSpacing: 100,
      startTimestamp: now + 3600,
      endTimestamp: now + 7200,
      settlementTimestamp: now + 10800,
      liquidityParameter: parseEther("100"),
    };

    const params: MarketParams = { ...base, ...overrides };

    const marketId = await core
      .connect(keeper)
      .createMarket.staticCall(
        params.minTick,
        params.maxTick,
        params.tickSpacing,
        params.startTimestamp,
        params.endTimestamp,
        params.settlementTimestamp,
        params.liquidityParameter
      );

    await core.connect(keeper).createMarket(
      params.minTick,
      params.maxTick,
      params.tickSpacing,
      params.startTimestamp,
      params.endTimestamp,
      params.settlementTimestamp,
      params.liquidityParameter
    );

    return { marketId, params };
  }

  it("applies batch range factors and updates tree sums", async function () {
    const { core, keeper } = await setup();
    const { marketId, params } = await createTestMarket(core, keeper);

    const spacing = BigInt(params.tickSpacing);
    const lowers = [
      BigInt(params.minTick),
      BigInt(params.minTick + params.tickSpacing),
      BigInt(params.minTick + 2 * params.tickSpacing),
      BigInt(params.minTick + 3 * params.tickSpacing),
    ];
    const uppers = lowers.map((lower) => lower + spacing);

    const factors = [
      parseEther("0.8"),
      parseEther("1.15"),
      parseEther("1.5"),
      parseEther("0.95"),
    ];
    const context = buildSeedHash(factors);

    const tx = await core.connect(keeper).applyRangeFactorBatch(
      marketId,
      lowers,
      uppers,
      factors,
      context
    );

    await expect(tx)
      .to.emit(core, "RangeFactorBatchApplied")
      .withArgs(marketId, factors.length, context);

    const receipt = await tx.wait();

    const appliedEvents = receipt.logs
      .map((log: any) => {
        try {
          return core.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .filter((event: any) => event && event.name === "RangeFactorApplied");

    expect(appliedEvents.length).to.equal(factors.length);

    for (let i = 0; i < factors.length; i++) {
      const event = appliedEvents[i];
      expect(event.args.marketId).to.equal(marketId);
      expect(event.args.lo).to.equal(lowers[i]);
      expect(event.args.hi).to.equal(uppers[i]);
      expect(event.args.factor).to.equal(factors[i]);

      const binSum = await core.getRangeSum(marketId, lowers[i], uppers[i]);
      expect(binSum).to.equal(factors[i]);
    }

    const totalSum = await core.getRangeSum(
      marketId,
      lowers[0],
      uppers[uppers.length - 1]
    );
    const expectedTotal = factors.reduce((acc, factor) => acc + factor, 0n);
    expect(totalSum).to.equal(expectedTotal);

    const market = await core.getMarket(marketId);
    expect(market.isActive).to.equal(true);
  });

  it("reverts on length mismatch", async function () {
    const { core, keeper } = await setup();
    const { marketId } = await createTestMarket(core, keeper, {
      liquidityParameter: parseEther("50"),
    });

    const lowers = [1000n];
    const uppers = [1100n, 1200n];
    const factors = [parseEther("1"), parseEther("1")];

    await expect(
      core
        .connect(keeper)
        .applyRangeFactorBatch(marketId, lowers, uppers, factors, ethers.ZeroHash)
    ).to.be.revertedWithCustomError(core, "ArrayLengthMismatch");
  });

  it("reverts on zero-length batch", async function () {
    const { core, keeper } = await setup();
    const { marketId } = await createTestMarket(core, keeper);

    const empty: bigint[] = [];
    const emptyFactors: bigint[] = [];

    await expect(
      core
        .connect(keeper)
        .applyRangeFactorBatch(marketId, empty, empty, emptyFactors, ethers.ZeroHash)
    ).to.be.revertedWithCustomError(core, "ArrayLengthMismatch");
  });

  it("reverts when factor is out of allowed range", async function () {
    const { core, keeper } = await setup();
    const { marketId, params } = await createTestMarket(core, keeper, {
      liquidityParameter: parseEther("25"),
    });

    const spacing = BigInt(params.tickSpacing);
    const lowers = [
      BigInt(params.minTick),
      BigInt(params.minTick + params.tickSpacing),
      BigInt(params.minTick + 2 * params.tickSpacing),
      BigInt(params.minTick + 3 * params.tickSpacing),
    ];
    const uppers = lowers.map((lower) => lower + spacing);
    const factors = Array(4).fill(parseEther("0.005"));

    await expect(
      core
        .connect(keeper)
        .applyRangeFactorBatch(marketId, lowers, uppers, factors, ethers.ZeroHash)
    ).to.be.revertedWithCustomError(core, "InvalidFactor");
  });

  it("reverts when ticks fall outside market bounds", async function () {
    const { core, keeper } = await setup();
    const { marketId, params } = await createTestMarket(core, keeper);

    const belowMin = BigInt(params.minTick - params.tickSpacing);
    const atMin = BigInt(params.minTick);
    await expect(
      core
        .connect(keeper)
        .applyRangeFactorBatch(
          marketId,
          [belowMin],
          [atMin],
          [parseEther("1")],
          ethers.ZeroHash
        )
    )
      .to.be.revertedWithCustomError(core, "InvalidTick")
      .withArgs(belowMin, BigInt(params.minTick), BigInt(params.maxTick));

    const nearMax = BigInt(params.maxTick - params.tickSpacing);
    const aboveMax = BigInt(params.maxTick + params.tickSpacing);
    await expect(
      core
        .connect(keeper)
        .applyRangeFactorBatch(
          marketId,
          [nearMax],
          [aboveMax],
          [parseEther("1")],
          ethers.ZeroHash
        )
    )
      .to.be.revertedWithCustomError(core, "InvalidTick")
      .withArgs(aboveMax, BigInt(params.minTick), BigInt(params.maxTick));
  });

  it("reverts when paused", async function () {
    const { core, keeper } = await setup();
    const { marketId, params } = await createTestMarket(core, keeper);

    const spacing = BigInt(params.tickSpacing);
    const lower = BigInt(params.minTick);
    const upper = lower + spacing;

    await core.connect(keeper).pause("maintenance");

    await expect(
      core
        .connect(keeper)
        .applyRangeFactorBatch(
          marketId,
          [lower],
          [upper],
          [parseEther("1")],
          ethers.ZeroHash
        )
    ).to.be.revertedWithCustomError(core, "EnforcedPause");
  });

  it("reverts for non-owner callers", async function () {
    const { core, keeper, alice } = await setup();
    const { marketId, params } = await createTestMarket(core, keeper);

    const spacing = BigInt(params.tickSpacing);
    const lower = BigInt(params.minTick);
    const upper = lower + spacing;

    await expect(
      core
        .connect(alice)
        .applyRangeFactorBatch(
          marketId,
          [lower],
          [upper],
          [parseEther("1")],
          ethers.ZeroHash
        )
    )
      .to.be.revertedWithCustomError(core, "OwnableUnauthorizedAccount")
      .withArgs(alice.address);
  });

  it("supports multiple batches and composes factors", async function () {
    const { core, keeper } = await setup();
    const { marketId, params } = await createTestMarket(core, keeper);

    const spacing = BigInt(params.tickSpacing);
    const lowers = [
      BigInt(params.minTick),
      BigInt(params.minTick + params.tickSpacing),
      BigInt(params.minTick + 2 * params.tickSpacing),
      BigInt(params.minTick + 3 * params.tickSpacing),
    ];
    const uppers = lowers.map((lower) => lower + spacing);

    const firstFactors = [
      parseEther("1.1"),
      parseEther("0.9"),
      parseEther("1.05"),
      parseEther("1.2"),
    ];
    await core.connect(keeper).applyRangeFactorBatch(
      marketId,
      lowers,
      uppers,
      firstFactors,
      buildSeedHash(firstFactors)
    );

    const secondLowers = [lowers[1], lowers[3]];
    const secondUppers = [uppers[1], uppers[3]];
    const secondFactors = [parseEther("1.4"), parseEther("0.5")];
    await core.connect(keeper).applyRangeFactorBatch(
      marketId,
      secondLowers,
      secondUppers,
      secondFactors,
      ethers.ZeroHash
    );

    const WAD = parseEther("1");
    const expected = [...firstFactors];
    expected[1] = (expected[1] * secondFactors[0]) / WAD;
    expected[3] = (expected[3] * secondFactors[1]) / WAD;

    for (let i = 0; i < expected.length; i++) {
      const binSum = await core.getRangeSum(marketId, lowers[i], uppers[i]);
      expect(binSum).to.equal(expected[i]);
    }

    const totalSum = await core.getRangeSum(
      marketId,
      lowers[0],
      uppers[uppers.length - 1]
    );
    const expectedTotal = expected.reduce((acc, factor) => acc + factor, 0n);
    expect(totalSum).to.equal(expectedTotal);
  });
});
