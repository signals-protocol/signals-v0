import { ethers } from "hardhat";
import { envManager } from "./utils/environment";

const USDC_DECIMALS = 6;

async function increaseTimeTo(timestamp: number) {
  await ethers.provider.send("evm_setNextBlockTimestamp", [timestamp]);
  await ethers.provider.send("evm_mine", []);
}

function applyBpsBuffer(value: bigint, bps: number) {
  return (value * BigInt(10_000 + bps)) / 10_000n;
}

async function main() {
  const [deployer, alice] = await ethers.getSigners();
  const bob = ethers.Wallet.createRandom().connect(ethers.provider);
  const bobAddress = await bob.getAddress();
  await (
    await deployer.sendTransaction({
      to: bobAddress,
      value: ethers.parseEther("1"),
    })
  ).wait();

  const addresses = envManager.getDeployedAddresses("localhost");
  const coreAddress = addresses.CLMSRMarketCoreProxy;
  const susdAddress = addresses.SUSD;

  if (!coreAddress || !susdAddress) {
    throw new Error("Missing core or SUSD deployment in localhost environment");
  }

  console.log({ coreAddress, susdAddress });

  const core = await ethers.getContractAt("CLMSRMarketCore", coreAddress);
  const susd = await ethers.getContractAt("MockERC20", susdAddress);

  const participants = [deployer, alice, bob];
  for (const signer of participants) {
    const signerAddress = await signer.getAddress();
    const mintAmount = ethers.parseUnits("1000", USDC_DECIMALS);
    await (await susd.connect(deployer).mint(signerAddress, mintAmount)).wait();
    await (await susd.connect(signer).approve(coreAddress, ethers.MaxUint256)).wait();
  }

  const latestBlock = await ethers.provider.getBlock("latest");
  if (!latestBlock) {
    throw new Error("Failed to fetch latest block");
  }
  const startTime = Number(latestBlock.timestamp) + 10;
  const endTime = startTime + 30 * 60;
  const settlementTime = endTime + 60;

  const minTick = 100_000;
  const maxTick = 101_000;
  const tickSpacing = 10;
  const alphaWad = ethers.parseEther("0.5");

  const marketId = await core.createMarket.staticCall(
    minTick,
    maxTick,
    tickSpacing,
    startTime,
    endTime,
    settlementTime,
    alphaWad
  );

  await (
    await core.createMarket(
      minTick,
      maxTick,
      tickSpacing,
      startTime,
      endTime,
      settlementTime,
      alphaWad
    )
  ).wait();
  console.log("Market created", marketId.toString());

  await (await core.setMarketActive(marketId, true)).wait();
  console.log("Market activated");

  await increaseTimeTo(startTime + 1);

  const lowerTick = 100_450;
  const upperTick = 100_550;
  const positionSize = ethers.parseUnits("0.005", USDC_DECIMALS);
  const estimatedCost = await core.calculateOpenCost(
    marketId,
    lowerTick,
    upperTick,
    positionSize
  );
  const maxCost = applyBpsBuffer(estimatedCost, 300);

  const alicePositionId = await core.openPosition.staticCall(
    marketId,
    lowerTick,
    upperTick,
    positionSize,
    maxCost
  );
  await (
    await core
      .connect(alice)
      .openPosition(marketId, lowerTick, upperTick, positionSize, maxCost)
  ).wait();
  console.log("Alice position", alicePositionId.toString());

  const bobLowerTick = 100_010;
  const bobUpperTick = 100_020;
  const bobSize = ethers.parseUnits("0.005", USDC_DECIMALS);
  const bobEstimate = await core.calculateOpenCost(
    marketId,
    bobLowerTick,
    bobUpperTick,
    bobSize
  );
  const bobMaxCost = applyBpsBuffer(bobEstimate, 300);
  const bobPositionId = await core.openPosition.staticCall(
    marketId,
    bobLowerTick,
    bobUpperTick,
    bobSize,
    bobMaxCost
  );
  await (
    await core
      .connect(bob)
      .openPosition(marketId, bobLowerTick, bobUpperTick, bobSize, bobMaxCost)
  ).wait();
  console.log("Bob position", bobPositionId.toString());

  await increaseTimeTo(settlementTime + 1);

  const settlementTick = 100_490;
  const settlementValue = BigInt(settlementTick) * 1_000_000n;
  await (await core.settleMarket(marketId, settlementValue)).wait();
  console.log("Market settled", settlementTick);

  for (let i = 0; i < 3; i++) {
    try {
      const receipt = await (
        await core.emitPositionSettledBatch(marketId, 100)
      ).wait();
      console.log(`emitPositionSettledBatch #${i + 1}`, receipt?.hash);
    } catch (error) {
      console.log(
        "Batch emission complete",
        error instanceof Error ? error.message : error
      );
      break;
    }
  }

  const aliceBalanceBefore = await susd.balanceOf(await alice.getAddress());
  await (await core.connect(alice).claimPayout(alicePositionId)).wait();
  const aliceBalanceAfter = await susd.balanceOf(await alice.getAddress());
  console.log(
    "Alice payout",
    ethers.formatUnits(aliceBalanceAfter - aliceBalanceBefore, USDC_DECIMALS)
  );

  const bobBalanceBefore = await susd.balanceOf(bobAddress);
  await (await core.connect(bob).claimPayout(bobPositionId)).wait();
  const bobBalanceAfter = await susd.balanceOf(bobAddress);
  console.log(
    "Bob payout",
    ethers.formatUnits(bobBalanceAfter - bobBalanceBefore, USDC_DECIMALS)
  );

  const rangeSum = await core.getRangeSum(marketId, 100_400, 100_600);
  console.log("Range sum", ethers.formatUnits(rangeSum, 18));

  console.log("E2E completed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
