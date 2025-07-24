import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { COMPONENT_TAG } from "../../../helpers/tags";
import {
  createActiveMarketFixture,
  setupActiveMarket,
} from "../../../helpers/fixtures/core";

describe(`${COMPONENT_TAG} CLMSRMarketCore - Price Range Trading`, function () {
  describe("Price Range Validation", function () {
    it("Should allow single tick trades (lowerTick == upperTick)", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, alice, marketId } = contracts;

      // 표준 활성 마켓 설정

      const tradeParams = {
        marketId,
        lowerTick: 100500, // 중간 틱값
        upperTick: 100500, // Same tick
        quantity: ethers.parseUnits("0.01", 6),
        maxCost: ethers.parseUnits("1000", 6),
      };

      await expect(
        core
          .connect(alice)
          .openPosition(
            alice.address,
            tradeParams.marketId,
            tradeParams.lowerTick,
            tradeParams.upperTick,
            tradeParams.quantity,
            tradeParams.maxCost
          )
      )
        .to.emit(core, "PositionOpened")
        .withArgs(
          1, // positionId
          alice.address,
          marketId,
          100500,
          100500,
          ethers.parseUnits("0.01", 6),
          anyValue
        );
    });

    it("Should handle single tick at market boundaries", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, alice, bob, marketId } = contracts;

      await expect(
        core.connect(alice).openPosition(
          alice.address,
          marketId,
          100000, // 첫 번째 틱
          100000,
          ethers.parseUnits("0.01", 6),
          ethers.parseUnits("1000", 6)
        )
      ).to.not.be.reverted;

      // Test last tick
      await expect(
        core.connect(bob).openPosition(
          bob.address,
          marketId,
          100990, // 마지막 틱
          100990,
          ethers.parseUnits("0.01", 6),
          ethers.parseUnits("1000", 6)
        )
      ).to.not.be.reverted;
    });
  });

  describe("Tick Range Boundaries", function () {
    it("Should handle trades at first tick (100000)", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, alice, marketId } = contracts;

      const tradeParams = {
        marketId,
        lowerTick: 100000,
        upperTick: 100000,
        quantity: ethers.parseUnits("0.01", 6),
        maxCost: ethers.parseUnits("1000", 6),
      };

      await expect(
        core
          .connect(alice)
          .openPosition(
            alice.address,
            tradeParams.marketId,
            tradeParams.lowerTick,
            tradeParams.upperTick,
            tradeParams.quantity,
            tradeParams.maxCost
          )
      ).to.not.be.reverted;
    });

    it("Should handle trades at last tick (100990)", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, alice, marketId } = contracts;

      const tradeParams = {
        marketId,
        lowerTick: 100990,
        upperTick: 100990,
        quantity: ethers.parseUnits("0.01", 6),
        maxCost: ethers.parseUnits("1000", 6),
      };

      await expect(
        core
          .connect(alice)
          .openPosition(
            alice.address,
            tradeParams.marketId,
            tradeParams.lowerTick,
            tradeParams.upperTick,
            tradeParams.quantity,
            tradeParams.maxCost
          )
      ).to.not.be.reverted;
    });

    it("Should handle maximum tick range (100000 to 100990)", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, alice, marketId } = contracts;

      const tradeParams = {
        marketId,
        lowerTick: 100000,
        upperTick: 100990,
        quantity: ethers.parseUnits("0.01", 6),
        maxCost: ethers.parseUnits("1000", 6),
      };

      await expect(
        core
          .connect(alice)
          .openPosition(
            alice.address,
            tradeParams.marketId,
            tradeParams.lowerTick,
            tradeParams.upperTick,
            tradeParams.quantity,
            tradeParams.maxCost
          )
      ).to.not.be.reverted;
    });

    it("Should revert when tick exceeds market bounds", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, alice, marketId } = contracts;

      const tradeParams = {
        marketId,
        lowerTick: 100000,
        upperTick: 101000, // Out of bounds (market has 100000-100990)
        quantity: ethers.parseUnits("0.01", 6),
        maxCost: ethers.parseUnits("1000", 6),
      };

      await expect(
        core
          .connect(alice)
          .openPosition(
            alice.address,
            tradeParams.marketId,
            tradeParams.lowerTick,
            tradeParams.upperTick,
            tradeParams.quantity,
            tradeParams.maxCost
          )
      ).to.be.revertedWithCustomError(core, "InvalidTick");
    });
  });

  describe("Edge Cases for Tick Handling", function () {
    it("Should handle boundary tick positions", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, alice, marketId } = contracts;

      // First tick
      await expect(
        core
          .connect(alice)
          .openPosition(
            alice.address,
            marketId,
            100000,
            100000,
            ethers.parseUnits("0.01", 6),
            ethers.parseUnits("1000", 6)
          )
      ).to.not.be.reverted;

      // Last tick
      await expect(
        core
          .connect(alice)
          .openPosition(
            alice.address,
            marketId,
            100990,
            100990,
            ethers.parseUnits("0.01", 6),
            ethers.parseUnits("1000", 6)
          )
      ).to.not.be.reverted;
    });

    it("Should handle large tick range operations efficiently", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, alice, marketId } = contracts;

      const tx = await core
        .connect(alice)
        .openPosition(
          alice.address,
          marketId,
          100000,
          100990,
          ethers.parseUnits("0.05", 6),
          ethers.parseUnits("1000", 6)
        );
      const receipt = await tx.wait();

      // Full range should still be efficient
      expect(receipt!.gasUsed).to.be.lt(400000);
    });

    it("Should handle overlapping tick ranges", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, alice, bob, marketId } = contracts;

      // Alice: 100400-100600
      await core
        .connect(alice)
        .openPosition(
          alice.address,
          marketId,
          100400,
          100600,
          ethers.parseUnits("0.05", 6),
          ethers.parseUnits("1000", 6)
        );

      // Bob: 100500-100700 (overlaps with Alice)
      await core
        .connect(bob)
        .openPosition(
          bob.address,
          marketId,
          100500,
          100700,
          ethers.parseUnits("0.05", 6),
          ethers.parseUnits("1000", 6)
        );

      // Should succeed
      expect(true).to.be.true;
    });

    it("Should validate tick order (lowerTick <= upperTick)", async function () {
      const contracts = await loadFixture(createActiveMarketFixture);
      const { core, alice, marketId } = contracts;

      await expect(
        core.connect(alice).openPosition(
          alice.address,
          marketId,
          100550,
          100450, // upperTick < lowerTick
          ethers.parseUnits("0.01", 6),
          ethers.parseUnits("1000", 6)
        )
      ).to.be.revertedWithCustomError(core, "InvalidTickRange");
    });
  });
});
