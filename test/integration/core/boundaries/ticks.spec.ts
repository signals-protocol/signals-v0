import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { COMPONENT_TAG } from "../../../helpers/tags";
import { createActiveMarketFixture } from "../../../helpers/fixtures/core";

const describeMaybe = process.env.COVERAGE ? describe.skip : describe;

describeMaybe(`${COMPONENT_TAG} CLMSRMarketCore - Price Range Trading`, function () {
  const MIN_TICK = 100000;
  const MAX_TICK = 100990;
  const TICK_SPACING = 10;

  describe("Price Range Validation", function () {
    it("Should reject single tick trades (lowerTick == upperTick)", async function () {
      const { core, alice, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      await expect(
        core
          .connect(alice)
          .openPosition(
            marketId,
            100500,
            100500,
            ethers.parseUnits("0.01", 6),
            ethers.parseUnits("1000", 6)
          )
      ).to.be.revertedWithCustomError(core, "InvalidTickRange");
    });

    it("Should reject single tick trades at market boundaries", async function () {
      const { core, alice, bob, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      await expect(
        core
          .connect(alice)
          .openPosition(
            marketId,
            MIN_TICK,
            MIN_TICK,
            ethers.parseUnits("0.01", 6),
            ethers.parseUnits("1000", 6)
          )
      ).to.be.revertedWithCustomError(core, "InvalidTickRange");

      await expect(
        core
          .connect(bob)
          .openPosition(
            marketId,
            MAX_TICK,
            MAX_TICK,
            ethers.parseUnits("0.01", 6),
            ethers.parseUnits("1000", 6)
          )
      ).to.be.revertedWithCustomError(core, "InvalidTickRange");
    });

    it("Should allow minimum-width range trades at boundaries", async function () {
      const { core, alice, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      const tx = await core
        .connect(alice)
        .openPosition(
          marketId,
          MIN_TICK,
          MIN_TICK + TICK_SPACING,
          ethers.parseUnits("0.01", 6),
          ethers.parseUnits("1000", 6)
        );

      await expect(tx)
        .to.emit(core, "PositionOpened")
        .withArgs(
          anyValue,
          alice.address,
          marketId,
          MIN_TICK,
          MIN_TICK + TICK_SPACING,
          ethers.parseUnits("0.01", 6),
          anyValue
        );

      await expect(
        core
          .connect(alice)
          .openPosition(
            marketId,
            MAX_TICK - TICK_SPACING,
            MAX_TICK,
            ethers.parseUnits("0.01", 6),
            ethers.parseUnits("1000", 6)
          )
      ).to.not.be.reverted;
    });
  });

  describe("Tick Range Boundaries", function () {
    it("Should handle trades starting at first tick", async function () {
      const { core, alice, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      await expect(
        core
          .connect(alice)
          .openPosition(
            marketId,
            MIN_TICK,
            MIN_TICK + 3 * TICK_SPACING,
            ethers.parseUnits("0.01", 6),
            ethers.parseUnits("1000", 6)
          )
      ).to.not.be.reverted;
    });

    it("Should handle trades ending at last tick", async function () {
      const { core, alice, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      await expect(
        core
          .connect(alice)
          .openPosition(
            marketId,
            MAX_TICK - 3 * TICK_SPACING,
            MAX_TICK,
            ethers.parseUnits("0.01", 6),
            ethers.parseUnits("1000", 6)
          )
      ).to.not.be.reverted;
    });

    it("Should handle maximum tick range", async function () {
      const { core, alice, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      await expect(
        core
          .connect(alice)
          .openPosition(
            marketId,
            MIN_TICK,
            MAX_TICK,
            ethers.parseUnits("0.01", 6),
            ethers.parseUnits("1000", 6)
          )
      ).to.not.be.reverted;
    });

    it("Should revert when tick exceeds market bounds", async function () {
      const { core, alice, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      await expect(
        core
          .connect(alice)
          .openPosition(
            marketId,
            MIN_TICK,
            MAX_TICK + TICK_SPACING,
            ethers.parseUnits("0.01", 6),
            ethers.parseUnits("1000", 6)
          )
      ).to.be.revertedWithCustomError(core, "InvalidTick");
    });
  });

  describe("Edge Cases for Tick Handling", function () {
    it("Should handle boundary tick positions with minimal range", async function () {
      const { core, alice, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      await expect(
        core
          .connect(alice)
          .openPosition(
            marketId,
            MIN_TICK,
            MIN_TICK + TICK_SPACING,
            ethers.parseUnits("0.01", 6),
            ethers.parseUnits("1000", 6)
          )
      ).to.not.be.reverted;

      await expect(
        core
          .connect(alice)
          .openPosition(
            marketId,
            MAX_TICK - TICK_SPACING,
            MAX_TICK,
            ethers.parseUnits("0.01", 6),
            ethers.parseUnits("1000", 6)
          )
      ).to.not.be.reverted;
    });

    it("Should handle large tick range operations efficiently", async function () {
      const { core, alice, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      const tx = await core
        .connect(alice)
        .openPosition(
          marketId,
          MIN_TICK,
          MAX_TICK,
          ethers.parseUnits("0.05", 6),
          ethers.parseUnits("1000", 6)
        );
      const receipt = await tx.wait();

      expect(receipt!.gasUsed).to.be.lt(500000n);
    });

    it("Should handle overlapping tick ranges", async function () {
      const { core, alice, bob, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      await core
        .connect(alice)
        .openPosition(
          marketId,
          100400,
          100600,
          ethers.parseUnits("0.05", 6),
          ethers.parseUnits("1000", 6)
        );

      await core
        .connect(bob)
        .openPosition(
          marketId,
          100500,
          100700,
          ethers.parseUnits("0.05", 6),
          ethers.parseUnits("1000", 6)
        );

      expect(true).to.be.true;
    });

    it("Should validate tick order (lowerTick <= upperTick)", async function () {
      const { core, alice, marketId } = await loadFixture(
        createActiveMarketFixture
      );

      await expect(
        core
          .connect(alice)
          .openPosition(
            marketId,
            100550,
            100450,
            ethers.parseUnits("0.01", 6),
            ethers.parseUnits("1000", 6)
          )
      ).to.be.revertedWithCustomError(core, "InvalidTickRange");
    });
  });
});
