import { ethers } from "hardhat";
import { envManager } from "../utils/environment";

async function main() {
  const environment = "localhost";

  const config = envManager.loadEnvironment(environment);
  const coreAddress = config.contracts.core.CLMSRMarketCoreProxy;
  const paymentTokenAddress = config.contracts.tokens.SUSD;

  if (!coreAddress || !paymentTokenAddress) {
    throw new Error("Missing core or payment token address in environment file");
  }

  const [deployer, alice] = await ethers.getSigners();
  const feeRecipient = ethers.Wallet.createRandom().address;
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Trader: ${alice.address}`);
  console.log(`Fee recipient: ${feeRecipient}`);
  const core = await ethers.getContractAt("CLMSRMarketCore", coreAddress);
  const paymentToken = await ethers.getContractAt(
    "MockERC20",
    paymentTokenAddress
  );

  // Deploy fee policies
  const NullFeePolicy = await ethers.getContractFactory("NullFeePolicy");
  const nullPolicy = await NullFeePolicy.deploy();
  await nullPolicy.waitForDeployment();

  const PercentFeePolicy100bps = await ethers.getContractFactory(
    "PercentFeePolicy100bps"
  );
  const percentPolicy = await PercentFeePolicy100bps.deploy();
  // 1% fee overlay (100 bps)
  await percentPolicy.waitForDeployment();

  await core.connect(deployer).setFeePolicy(await nullPolicy.getAddress());

  // Prepare market
  const latestBlock = await ethers.provider.getBlock("latest");
  const startTime = BigInt(latestBlock?.timestamp ?? Math.floor(Date.now() / 1000)) - 1n;
  const endTime = startTime + 7n * 24n * 60n * 60n;
  const settlementTime = endTime + 3600n;

  const marketArgs: [
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
    string
  ] = [
    100000n,
    101000n,
    10n,
    startTime,
    endTime,
    settlementTime,
    ethers.parseEther("1"),
    ethers.ZeroAddress,
  ];

  const marketId = await core
    .connect(deployer)
    .createMarket.staticCall(...marketArgs);
  await core.connect(deployer).createMarket(...marketArgs);
  await core.connect(deployer).setMarketActive(marketId, true);

  // Fund trader
  const transferAmount = ethers.parseUnits("1000", 6);
  await paymentToken.connect(deployer).transfer(alice.address, transferAmount);
  await paymentToken
    .connect(alice)
    .approve(coreAddress, ethers.MaxUint256);

  const quantity = ethers.parseUnits("10", 6);
  const lowerTick = 100200;
  const upperTick = 100400;
  const cost = await core.calculateOpenCost(
    marketId,
    lowerTick,
    upperTick,
    quantity
  );

  const nullFee = await core.previewOpenFee(
    marketId,
    lowerTick,
    upperTick,
    quantity,
    cost
  );
  console.log(`[NullPolicy] preview fee: ${nullFee}`);

  await core.connect(deployer).setFeePolicy(await percentPolicy.getAddress());
  await core.connect(deployer).setFeeRecipient(feeRecipient);

  const fee = await core.previewOpenFee(
    marketId,
    lowerTick,
    upperTick,
    quantity,
    cost
  );
  console.log(`[PercentPolicy] preview fee: ${fee}`);

  const maxCost = cost + fee + ethers.parseUnits("1", 6);
  const openTx = await core
    .connect(alice)
    .openPosition(marketId, lowerTick, upperTick, quantity, maxCost);
  const openReceipt = await openTx.wait();

  let positionId: bigint | null = null;
  let tradeFeeLog: ReturnType<typeof core.interface.parseLog> | null = null;
  for (const rawLog of openReceipt?.logs ?? []) {
    try {
      const parsed = core.interface.parseLog(rawLog);
      if (parsed.name === "PositionOpened") {
        positionId = parsed.args.positionId;
      } else if (parsed.name === "TradeFeeCharged") {
        tradeFeeLog = parsed;
      }
    } catch {
      continue;
    }
  }

  if (positionId == null) {
    throw new Error("PositionOpened event not found");
  }
  if (tradeFeeLog == null) {
    throw new Error("TradeFeeCharged event not emitted");
  }

  console.log(
    `Opened position ${positionId} with base cost ${tradeFeeLog.args.baseAmount} and fee ${tradeFeeLog.args.feeAmount}`
  );

  const sellQuantity = quantity / 2n;
  const proceeds = await core.calculateDecreaseProceeds(
    positionId,
    sellQuantity
  );
  const sellFee = await core.previewSellFee(
    positionId,
    sellQuantity,
    proceeds
  );
  console.log(
    `Preview sell fee for quantity ${sellQuantity}: ${sellFee}`
  );

  const decreaseTx = await core
    .connect(alice)
    .decreasePosition(positionId, sellQuantity, 0);
  const decreaseReceipt = await decreaseTx.wait();

  for (const rawLog of decreaseReceipt?.logs ?? []) {
    try {
      const parsed = core.interface.parseLog(rawLog);
      if (parsed.name === "TradeFeeCharged") {
        console.log(
          `Decrease fee charged: base=${parsed.args.baseAmount} fee=${parsed.args.feeAmount}`
        );
      }
    } catch {
      continue;
    }
  }

  const aliceBalance = await paymentToken.balanceOf(alice.address);
  const recipientBalance = await paymentToken.balanceOf(feeRecipient);
  console.log(`Final balances => Alice: ${aliceBalance}, Fee recipient: ${recipientBalance}`);
}

main()
  .then(() => {
    console.log("✅ Fee overlay verification completed");
  })
  .catch((error) => {
    console.error("❌ Verification failed", error);
    process.exitCode = 1;
  });
