import hre from "hardhat";
import { envManager } from "../utils/environment";
import type { Environment } from "../types/environment";

// ========================================
// 🎯 CONFIGURATION - 여기서 값을 설정하세요
// ========================================
const CONFIG = {
  marketId: 23, // 마켓 ID
  low: 111000, // 하한 tick
  high: 112000, // 상한 tick
  testAmount: "100", // 테스트할 베팅 금액 (SUSD)
};

export async function rangeSumAction(environment: Environment): Promise<void> {
  console.log(`\n🔍 Getting Range Sum for ${environment}`);
  console.log(`📊 Market ID: ${CONFIG.marketId}`);
  console.log(`📉 Range: [${CONFIG.low}, ${CONFIG.high}]`);

  try {
    // 배포된 주소 가져오기
    const addresses = envManager.getDeployedAddresses(environment);
    if (!addresses.CLMSRMarketCoreProxy) {
      throw new Error(`❌ CLMSRMarketCoreProxy not deployed on ${environment}`);
    }

    console.log(`📍 Contract Address: ${addresses.CLMSRMarketCoreProxy}`);

    // 컨트랙트 연결
    const marketCore = await hre.ethers.getContractAt(
      "CLMSRMarketCore",
      addresses.CLMSRMarketCoreProxy
    );

    // 마켓 존재 여부 확인
    let market;
    try {
      market = await marketCore.getMarket(CONFIG.marketId);
      console.log(`✅ Market found: ${market.name || "Unnamed Market"}`);
      console.log(`📊 Tick Spacing: ${market.tickSpacing}`);
    } catch (error) {
      throw new Error(`❌ Market ${CONFIG.marketId} not found`);
    }

    // getRangeSum 호출
    console.log(
      `\n🔄 Calling getRangeSum(${CONFIG.marketId}, ${CONFIG.low}, ${CONFIG.high})...`
    );

    const rangeSum = await marketCore.getRangeSum(
      CONFIG.marketId,
      CONFIG.low,
      CONFIG.high
    );

    console.log(`\n📊 Range Sum Results:`);
    console.log(`  Market ID: ${CONFIG.marketId}`);
    console.log(`  Range: [${CONFIG.low}, ${CONFIG.high}]`);
    console.log(`  Sum (Raw): ${rangeSum.toString()}`);
    console.log(`  Sum (Formatted): ${hre.ethers.formatEther(rangeSum)} ETH`);

    // 추가 정보: 구간 내 모든 tick 값들 조회
    console.log(`\n🔍 Individual Tick Values in Range:`);
    const tickSpacing = market.tickSpacing;
    const ticksInRange = [];

    // 구간 내 모든 tick 수집 (tickSpacing 간격으로)
    for (
      let tick = CONFIG.low;
      tick < CONFIG.high;
      tick += Number(tickSpacing)
    ) {
      ticksInRange.push(tick);
    }

    console.log(`  Total ticks in range: ${ticksInRange.length}`);

    // 전체 마켓의 구간합을 미리 계산 (각 tick 비율 계산용)
    const totalMarketSum = await marketCore.getRangeSum(
      CONFIG.marketId,
      market.minTick,
      market.maxTick
    );

    for (const tick of ticksInRange) {
      try {
        const tickValue = await marketCore.getRangeSum(
          CONFIG.marketId,
          tick,
          tick + Number(tickSpacing)
        );
        const tickValueEth = Number(hre.ethers.formatEther(tickValue));
        const totalMarketSumEth = Number(
          hre.ethers.formatEther(totalMarketSum)
        );
        const tickPercentage = (tickValueEth / totalMarketSumEth) * 100;

        console.log(
          `  Tick ${tick}: ${hre.ethers.formatEther(
            tickValue
          )} ETH (${tickPercentage.toFixed(4)}% of total)`
        );
      } catch (error) {
        console.log(`  Tick ${tick}: ❌ Error (${error})`);
      }
    }

    // Price Impact 분석: openCost vs 뷰함수 비교
    console.log(`\n💰 Price Impact Analysis:`);
    console.log(`📊 Test Amount: ${CONFIG.testAmount} SUSD`);

    try {
      // SUSD는 6 decimals이므로 parseUnits 사용
      const targetCostMicro = hre.ethers.parseUnits(CONFIG.testAmount, 6);

      // 1. calculateQuantityFromCost로 100 SUSD로 살 수 있는 quantity 계산
      const quantityFromCost = await marketCore.calculateQuantityFromCost(
        CONFIG.marketId,
        CONFIG.low,
        CONFIG.high,
        targetCostMicro
      );

      // 2. 그 quantity로 실제 cost 재계산
      const actualOpenCost = await marketCore.calculateOpenCost(
        CONFIG.marketId,
        CONFIG.low,
        CONFIG.high,
        quantityFromCost
      );

      console.log(`\n📈 Open Cost Analysis:`);
      console.log(`  Target Cost: ${CONFIG.testAmount} SUSD`);
      console.log(`  Quantity from Cost: ${quantityFromCost.toString()} units`);
      console.log(`  Actual Open Cost (Raw): ${actualOpenCost.toString()}`);
      console.log(
        `  Actual Open Cost: ${hre.ethers.formatUnits(actualOpenCost, 6)} SUSD`
      );

      // 2. 전체 구간합과 비교 계산
      // 전체 마켓의 구간합을 구해야 함 (마켓 전체 범위)
      const totalRangeSum = await marketCore.getRangeSum(
        CONFIG.marketId,
        market.minTick,
        market.maxTick
      );

      const rangeSize = CONFIG.high - CONFIG.low;
      const totalRangeSize = market.maxTick - market.minTick;

      // 1. 분포로부터 해당 구간의 확률 (비율)
      const rangeProbability =
        Number(hre.ethers.formatEther(rangeSum)) /
        Number(hre.ethers.formatEther(totalRangeSum));

      // 2. 분포 기반 이론적 비용 (확률 * 100달러)
      const distributionBasedCost =
        parseFloat(CONFIG.testAmount) * rangeProbability;

      // 3. 실제 100달러로 구매시 평균가격 계산
      const actualQuantity = Number(quantityFromCost.toString()) / 1e6; // micro units to SUSD units
      const actualAvgPrice = parseFloat(CONFIG.testAmount) / actualQuantity; // 100 SUSD / quantity

      // 4. 분포 기반 평균가격 계산
      const distributionAvgPrice = rangeSum / totalRangeSum;

      console.log(`\n📊 Range Analysis:`);
      console.log(
        `  Target Range: [${CONFIG.low}, ${CONFIG.high}] (${rangeSize} ticks)`
      );
      console.log(
        `  Total Range: [${market.minTick}, ${market.maxTick}] (${totalRangeSize} ticks)`
      );
      console.log(
        `  Target Range Sum: ${hre.ethers.formatEther(rangeSum)} ETH`
      );
      console.log(
        `  Total Range Sum: ${hre.ethers.formatEther(totalRangeSum)} ETH`
      );
      console.log(
        `  Range Probability: ${(rangeProbability * 100).toFixed(4)}%`
      );
      console.log(
        `  Distribution Based Cost: ${distributionBasedCost.toFixed(6)} SUSD`
      );
      console.log(
        `  Actual Quantity Bought: ${actualQuantity.toFixed(6)} units`
      );
      console.log(
        `  Actual Average Price: ${actualAvgPrice.toFixed(6)} SUSD/unit`
      );
      console.log(
        `  Distribution Average Price: ${distributionAvgPrice.toFixed(
          6
        )} ETH/tick`
      );

      // 5. 비율 대 비율로 Price Impact 계산
      const distributionCostRatio = distributionBasedCost / 100; // 분포 기반 이론 비용

      const priceImpact = (actualAvgPrice / distributionCostRatio) * 100;

      console.log(`\n🎯 Price Impact Analysis (Ratio-based):`);
      console.log(
        `  Actual Cost Ratio: ${actualAvgPrice.toFixed(6)} SUSD (fixed)`
      );
      console.log(
        `  Distribution Cost Ratio: ${distributionCostRatio.toFixed(6)}`
      );
      console.log(`  Price Impact: ${priceImpact.toFixed(2)}%`);
      console.log(
        `  Cost Multiplier: ${(
          actualAvgPrice / distributionCostRatio -
          1
        ).toFixed(2)}x`
      );

      // 6. 단위 통일해서 평균가격 비교
      // actualAvgPrice는 SUSD/unit, distributionAvgPrice는 ETH/tick
      // 단위를 맞춰서 비교해야 함
      console.log(`\n📊 Price Analysis:`);
      console.log(`  Actual Avg Price: ${actualAvgPrice.toFixed(6)} SUSD/unit`);
      console.log(
        `  Distribution Avg Price: ${distributionAvgPrice.toFixed(6)} ETH/tick`
      );
      console.log(`  Note: Different units - direct comparison not meaningful`);

      if (priceImpact > 0) {
        console.log(
          `  📈 Cost is ${priceImpact.toFixed(2)}% higher due to price impact`
        );
      } else {
        console.log(
          `  📉 Cost is ${Math.abs(priceImpact).toFixed(
            2
          )}% lower than linear expectation`
        );
      }
    } catch (error) {
      console.log(`  ❌ Error calculating price impact: ${error}`);
    }

    console.log(
      `\n✅ Range sum and price impact analysis completed successfully!`
    );
  } catch (error) {
    console.error(`❌ Error getting range sum:`, error);
    throw error;
  }
}
