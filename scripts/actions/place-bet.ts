import { ethers } from "hardhat";
import { parseUnits } from "ethers";
import { envManager } from "../utils/environment";
import type { Environment } from "../types/environment";

export async function placeBetAction(environment: Environment): Promise<void> {
  console.log(`🎯 마켓 9에 베팅 시작 on ${environment}`);

  const [deployer] = await ethers.getSigners();
  console.log("베터 주소:", deployer.address);

  const addresses = envManager.getDeployedAddresses(environment);

  if (!addresses.CLMSRMarketCoreProxy) {
    throw new Error(`Core proxy not deployed in ${environment} environment`);
  }

  if (!addresses.SUSD) {
    throw new Error(`SUSD not deployed in ${environment} environment`);
  }

  // 컨트랙트 연결
  const core = await ethers.getContractAt(
    "CLMSRMarketCore",
    addresses.CLMSRMarketCoreProxy
  );

  const susd = await ethers.getContractAt("ERC20", addresses.SUSD);

  // 베팅 파라미터 설정 - 큰 범위를 작은 범위들로 나누어 베팅
  const marketId = 9;
  const startTick = 110000; // 110k
  const endTick = 115000; // 115k
  const costPerSegment = parseUnits("100000000", 6); // 100000000USD

  // 1000 tick씩 나누어 베팅 (110k-111k, 111k-112k, 112k-113k, 113k-114k, 114k-115k)
  const segments = [];
  for (let lower = startTick; lower < endTick; lower += 1000) {
    const upper = Math.min(lower + 1000, endTick);
    segments.push({ lower, upper });
  }

  console.log("\n🎲 베팅 파라미터:");
  console.log(`  - 마켓 ID: ${marketId}`);
  console.log(
    `  - 전체 베팅 범위: ${startTick.toLocaleString()} ~ ${endTick.toLocaleString()}`
  );
  console.log(`  - 세그먼트 개수: ${segments.length}`);
  console.log(`  - 각 구간 quantity: 1,000,000 (1달러어치 payout)`);
  console.log(`  - 최대 비용 한도: 1억 USD (최대치!)`);
  console.log(`  - 총 한도: $${segments.length * 100000000} USD`);

  // 각 세그먼트 출력
  segments.forEach((seg, i) => {
    console.log(
      `    ${
        i + 1
      }. ${seg.lower.toLocaleString()} ~ ${seg.upper.toLocaleString()}`
    );
  });

  try {
    // 1. 마켓 정보 확인
    console.log("\n📊 마켓 정보 확인...");
    const market = await core.getMarket(marketId);

    console.log("마켓 정보:");
    console.log(`  - 활성 상태: ${market.isActive}`);
    console.log(`  - 정산 여부: ${market.settled}`);
    console.log(
      `  - 틱 범위: ${market.minTick.toString()} ~ ${market.maxTick.toString()}`
    );
    console.log(`  - 틱 간격: ${market.tickSpacing.toString()}`);
    console.log(
      `  - 시작 시간: ${new Date(
        Number(market.startTimestamp) * 1000
      ).toLocaleString()}`
    );
    console.log(
      `  - 종료 시간: ${new Date(
        Number(market.endTimestamp) * 1000
      ).toLocaleString()}`
    );

    // 마켓 상태 검증
    if (!market.isActive) {
      throw new Error("마켓이 비활성 상태입니다");
    }

    if (market.settled) {
      throw new Error("마켓이 이미 정산되었습니다");
    }

    // 틱 범위 검증
    const minTick = Number(market.minTick);
    const maxTick = Number(market.maxTick);
    const tickSpacing = Number(market.tickSpacing);

    for (const segment of segments) {
      if (segment.lower < minTick || segment.upper > maxTick) {
        throw new Error(
          `베팅 범위가 마켓 범위를 벗어납니다. 마켓 범위: ${minTick} ~ ${maxTick}`
        );
      }

      if ((segment.lower - minTick) % tickSpacing !== 0) {
        throw new Error(
          `lowerTick이 틱 간격에 맞지 않습니다. tickSpacing: ${tickSpacing}`
        );
      }

      if ((segment.upper - minTick) % tickSpacing !== 0) {
        throw new Error(
          `upperTick이 틱 간격에 맞지 않습니다. tickSpacing: ${tickSpacing}`
        );
      }

      if ((segment.upper - segment.lower) % tickSpacing !== 0) {
        throw new Error(
          `베팅 범위가 틱 간격의 배수가 아닙니다. tickSpacing: ${tickSpacing}`
        );
      }
    }

    // 2. USDC 잔액 확인
    const userBalance = await susd.balanceOf(deployer.address);
    const totalCost = BigInt(costPerSegment) * BigInt(segments.length);
    console.log(`\n💰 잔액 확인:`);
    console.log(`현재 USDC 잔액: ${ethers.formatUnits(userBalance, 6)} USDC`);
    console.log(`필요한 총 금액: ${ethers.formatUnits(totalCost, 6)} USDC`);

    if (userBalance < totalCost) {
      throw new Error(
        `USDC 잔액이 부족합니다. 필요: ${ethers.formatUnits(
          totalCost,
          6
        )} USDC, 보유: ${ethers.formatUnits(userBalance, 6)} USDC`
      );
    }

    // 3. USDC 승인 (전체 금액의 110% 여유분)
    const maxTotalCost = (totalCost * 110n) / 100n; // 10% 여유분
    console.log(
      `\n✅ USDC 승인 중... (${ethers.formatUnits(maxTotalCost, 6)} USDC)`
    );

    const approveTx = await susd.approve(
      addresses.CLMSRMarketCoreProxy,
      maxTotalCost
    );
    await approveTx.wait();
    console.log("USDC 승인 완료!");

    // 4. 각 세그먼트에 대해 베팅 실행
    const results = [];
    let totalActualCost = 0n;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      console.log(`\n🚀 세그먼트 ${i + 1}/${segments.length} 베팅 실행 중...`);
      console.log(
        `   범위: ${segment.lower.toLocaleString()} ~ ${segment.upper.toLocaleString()}`
      );

      // quantity를 loop 밖으로 이동
      const quantity = 1000000; // 1,000,000 고정 (1달러어치 payout)
      const maxCost = costPerSegment * 10n; // 목표 비용의 1000% 여유분 (최대치로!)

      try {
        // calculateCost 건너뛰고 바로 베팅! 고정 quantity 사용

        console.log(`   고정 quantity 사용: ${quantity.toString()}`);
        console.log(
          `   최대 비용 한도: ${ethers.formatUnits(maxCost, 6)} USDC`
        );
        const tx = await core.openPosition(
          marketId,
          segment.lower,
          segment.upper,
          quantity,
          maxCost
        );

        console.log(`   트랜잭션 해시: ${tx.hash}`);
        const receipt = await tx.wait();

        // 포지션 ID와 실제 비용 추출
        const events = receipt?.logs || [];
        let positionId = "Unknown";
        let actualCost = 0n;

        for (const log of events) {
          try {
            const parsed = core.interface.parseLog({
              topics: log.topics as string[],
              data: log.data,
            });

            if (parsed?.name === "PositionOpened") {
              positionId = parsed.args[0]?.toString() || "Unknown";
              actualCost = BigInt(parsed.args[6]?.toString() || "0"); // cost는 7번째 인자 (0부터 시작)
              console.log(`   ✅ 포지션 ID: ${positionId}`);
              console.log(
                `   💰 실제 비용: ${ethers.formatUnits(actualCost, 6)} USDC`
              );
              break;
            }
          } catch {
            // 파싱 실패는 무시
          }
        }

        if (actualCost === 0n) {
          console.log(`   ⚠️  실제 비용을 이벤트에서 추출하지 못했습니다`);
          actualCost = maxCost; // fallback으로 최대 비용 사용
        }

        results.push({
          segment: `${segment.lower}-${segment.upper}`,
          positionId,
          quantity: quantity.toString(),
          actualCost: ethers.formatUnits(actualCost, 6),
          txHash: tx.hash,
          gasUsed: receipt?.gasUsed?.toString(),
        });

        totalActualCost += actualCost;
      } catch (error: any) {
        console.error(`   ❌ 세그먼트 ${i + 1} 베팅 실패:`);
        console.error(`      에러 메시지: ${error.message}`);

        // 자세한 에러 정보 출력
        if (error.reason) {
          console.error(`      에러 이유: ${error.reason}`);
        }

        if (error.code) {
          console.error(`      에러 코드: ${error.code}`);
        }

        if (error.data) {
          console.error(`      에러 데이터: ${error.data}`);
        }

        if (error.transaction) {
          console.error(`      실패한 트랜잭션:`, error.transaction);
        }

        if (error.receipt) {
          console.error(`      트랜잭션 영수증:`, error.receipt);
        }

        // 전체 에러 객체 출력 (디버깅용)
        console.error(`      전체 에러 정보:`, JSON.stringify(error, null, 2));

        console.log(`   ⏭️  다음 세그먼트로 계속 진행...`);

        // 실패한 세그먼트도 결과에 기록
        results.push({
          segment: `${segment.lower}-${segment.upper}`,
          positionId: "FAILED",
          quantity: quantity.toString(),
          actualCost: "0",
          txHash: "FAILED",
          gasUsed: "0",
        });

        continue; // 다음 세그먼트로 계속
      }
    }

    console.log("\n🎉 모든 베팅 완료!");
    console.log("\n📊 베팅 요약:");
    console.log(`  - 마켓 ID: ${marketId}`);
    console.log(
      `  - 전체 범위: ${startTick.toLocaleString()} ~ ${endTick.toLocaleString()}`
    );
    console.log(`  - 세그먼트 수: ${results.length}`);
    console.log(
      `  - 총 실제 비용: ${ethers.formatUnits(totalActualCost, 6)} USDC`
    );

    console.log("\n📋 포지션 상세:");
    results.forEach((result, i) => {
      const status = result.positionId === "FAILED" ? "❌ 실패" : "✅ 성공";
      console.log(
        `  ${i + 1}. 범위: ${result.segment}, 포지션 ID: ${
          result.positionId
        }, 비용: ${result.actualCost} USDC [${status}]`
      );
    });

    // 성공/실패 통계
    const successCount = results.filter(
      (r) => r.positionId !== "FAILED"
    ).length;
    const failCount = results.filter((r) => r.positionId === "FAILED").length;
    console.log(`\n📈 결과: 성공 ${successCount}개, 실패 ${failCount}개`);
  } catch (error: any) {
    console.error("\n❌ 초기화 실패:");
    console.error(`메시지: ${error.message}`);

    // 자세한 에러 정보 출력
    if (error.reason) {
      console.error(`에러 이유: ${error.reason}`);
    }

    if (error.code) {
      console.error(`에러 코드: ${error.code}`);
    }

    if (error.data) {
      console.error(`에러 데이터: ${error.data}`);
    }

    if (error.transaction) {
      console.error(`실패한 트랜잭션:`, error.transaction);
    }

    if (error.receipt) {
      console.error(`트랜잭션 영수증:`, error.receipt);
    }

    // 전체 에러 객체 출력 (디버깅용)
    console.error(`전체 에러 정보:`, JSON.stringify(error, null, 2));

    throw error;
  }
}
