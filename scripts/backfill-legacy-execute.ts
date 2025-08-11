import { ethers } from "hardhat";
import { envManager } from "./utils/environment";

// 레거시 컨트랙트 주소
const LEGACY_CONTRACT = "0x4424687a25302db5d1D3A9f7504e4710b0ab17E9";

// 포인트 계산 로직 (서브그래프와 동일)
function calcActivityPoints(cost: bigint): bigint {
  return cost / 10n; // A = cost / 10 (6 decimals)
}

function calcPerformancePoints(realizedPnL: bigint): bigint {
  return realizedPnL > 0n ? realizedPnL : 0n; // Performance = max(PnL, 0)
}

function calcRiskBonusPoints(
  activityPoints: bigint,
  userRange: bigint,
  marketRange: bigint,
  holdingSeconds: bigint
): bigint {
  // 1시간(3600초) 미만이면 0 포인트
  if (holdingSeconds < 3600n) {
    return 0n;
  }

  // 범위 차이 계산
  let rangeDiff = marketRange - userRange;
  if (rangeDiff < 0n) rangeDiff = 0n;

  // multiplier = 1 + rangeDiff/marketRange (최대 2.0으로 제한)
  let multiplier = 1000000n + (rangeDiff * 1000000n) / marketRange; // 6 decimals
  if (multiplier > 2000000n) multiplier = 2000000n; // 최대 200%

  // R = A × 0.3 × multiplier
  let risk = (activityPoints * 300000n * multiplier) / (1000000n * 1000000n);

  // min(R, 2A)
  let maxRisk = activityPoints * 2n;
  return risk > maxRisk ? maxRisk : risk;
}

// 백필 실행자
class LegacyBackfillExecutor {
  private pointsGranter: any;
  private positions = new Map<bigint, any>();
  private markets = new Map<bigint, any>();
  private executedEvents: Array<{
    user: string;
    amount: bigint;
    reason: number;
    contextTs: number;
    txHash: string;
  }> = [];

  async initialize(environment: string): Promise<void> {
    console.log(`🔧 ${environment} 환경 초기화 중...`);

    const addresses = envManager.getDeployedAddresses(
      environment as "localhost" | "dev" | "prod"
    );

    if (!addresses.PointsGranterProxy) {
      throw new Error(
        `PointsGranter not deployed in ${environment} environment`
      );
    }

    // PointsGranter 컨트랙트 연결
    const PointsGranterUpgradeable = await ethers.getContractFactory(
      "PointsGranterUpgradeable"
    );
    this.pointsGranter = PointsGranterUpgradeable.attach(
      addresses.PointsGranterProxy
    );

    console.log(`✅ PointsGranter 연결: ${addresses.PointsGranterProxy}`);
  }

  async processLegacyContract(dryRun: boolean = true): Promise<void> {
    console.log("🔍 레거시 컨트랙트 로그 분석 시작...");
    console.log(`📍 컨트랙트 주소: ${LEGACY_CONTRACT}`);
    console.log(
      `🏃 실행 모드: ${dryRun ? "DRY RUN (실제 실행 없음)" : "실제 실행"}`
    );

    // 여러 RPC 제공자 옵션 - 사용자 추천 RPC 우선
    const rpcUrls = [
      "https://base-mainnet.g.allthatnode.com/archive/evm/92c0459bd6394890a091bead6672bde8",
      process.env.BASE_RPC_URL,
      "https://mainnet.base.org",
      "https://base.publicnode.com",
    ].filter(Boolean);

    let provider = ethers.provider;
    let workingRpc = null;

    // RPC 연결 테스트
    for (const rpcUrl of rpcUrls) {
      try {
        console.log(`🔗 RPC 테스트: ${rpcUrl?.slice(0, 50)}...`);
        const testProvider = new ethers.JsonRpcProvider(rpcUrl);
        await testProvider.getBlockNumber();
        provider = testProvider;
        workingRpc = rpcUrl;
        console.log(`✅ RPC 연결 성공!`);
        break;
      } catch (error) {
        console.log(`❌ RPC 실패: ${error.message}`);
        continue;
      }
    }

    if (!workingRpc) {
      throw new Error("모든 RPC 제공자 연결 실패. 네트워크 상태를 확인하세요.");
    }

    // 컨트랙트 ABI (실제 이벤트 기반)
    const abi = [
      "event MarketCreated(uint256 indexed marketId, uint64 startTimestamp, uint64 endTimestamp, int256 minTick, int256 maxTick, int256 tickSpacing, uint32 numBins, uint256 liquidityParameter)",
      "event MarketSettled(uint256 indexed marketId, int256 settlementTick)",
      "event PositionOpened(uint256 indexed positionId, address indexed trader, uint256 indexed marketId, int256 lowerTick, int256 upperTick, uint128 quantity, uint256 cost)",
      "event PositionIncreased(uint256 indexed positionId, address indexed trader, uint128 additionalQuantity, uint128 newQuantity, uint256 cost)",
      "event PositionDecreased(uint256 indexed positionId, address indexed trader, uint128 decreasedQuantity, uint128 newQuantity, uint256 proceeds)",
      "event PositionClosed(uint256 indexed positionId, address indexed trader, uint256 proceeds)",
      "event PositionClaimed(uint256 indexed positionId, address indexed trader, uint256 payout)",
    ];

    const contract = new ethers.Contract(LEGACY_CONTRACT, abi, provider);

    // 블록 범위 설정
    const startBlock = 33546152; // 레거시 컨트랙트 권장 시작 블록
    const endBlock = 33824978; // 사용자 지정 끝 블록

    // RPC 제한에 맞춰 배치 사이즈 조정 (최대 50,000블록)
    const batchSize = 50000;
    console.log(
      `📅 블록 범위: ${startBlock} ~ ${endBlock} (총 ${
        endBlock - startBlock
      }블록)`
    );

    // Step 1: 마켓 정보 수집
    console.log("📊 마켓 정보 수집 중...");
    await this.collectMarketInfo(contract, startBlock, endBlock);

    // Step 2: 모든 포지션 이벤트를 시간순으로 처리
    console.log("📈 포지션 이벤트 처리 중...");
    await this.processPositionEvents(contract, startBlock, endBlock, dryRun);

    console.log(
      `✅ 총 ${this.executedEvents.length}개 포인트 이벤트 처리 완료`
    );
  }

  private async collectMarketInfo(
    contract: any,
    startBlock: number,
    endBlock: number
  ): Promise<void> {
    const batchSize = 50000; // RPC 제한에 맞춤

    // MarketCreated 이벤트 배치 수집
    console.log("🔄 MarketCreated 이벤트 배치 수집 중...");
    const marketCreatedEvents = [];
    for (let i = startBlock; i <= endBlock; i += batchSize) {
      const batchEnd = Math.min(i + batchSize - 1, endBlock);
      try {
        const events = await contract.queryFilter(
          contract.filters.MarketCreated(),
          i,
          batchEnd
        );
        marketCreatedEvents.push(...events);
        console.log(
          `✅ MarketCreated 배치 ${i}-${batchEnd}: ${events.length}개`
        );
      } catch (error) {
        console.log(
          `⚠️  MarketCreated 배치 ${i}-${batchEnd} 실패: ${error.message}`
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    console.log(`📊 MarketCreated 이벤트: ${marketCreatedEvents.length}개`);

    for (const event of marketCreatedEvents) {
      if (event.args) {
        this.markets.set(event.args.marketId, {
          marketId: event.args.marketId,
          minTick: event.args.minTick,
          maxTick: event.args.maxTick,
          endTimestamp: Number(event.args.endTimestamp),
          isSettled: false,
        });
      }
    }

    // MarketSettled 이벤트 배치 수집
    console.log("🔄 MarketSettled 이벤트 배치 수집 중...");
    const marketSettledEvents = [];
    for (let i = startBlock; i <= endBlock; i += batchSize) {
      const batchEnd = Math.min(i + batchSize - 1, endBlock);
      try {
        const events = await contract.queryFilter(
          contract.filters.MarketSettled(),
          i,
          batchEnd
        );
        marketSettledEvents.push(...events);
        console.log(
          `✅ MarketSettled 배치 ${i}-${batchEnd}: ${events.length}개`
        );
      } catch (error) {
        console.log(
          `⚠️  MarketSettled 배치 ${i}-${batchEnd} 실패: ${error.message}`
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    console.log(`🏁 MarketSettled 이벤트: ${marketSettledEvents.length}개`);

    for (const event of marketSettledEvents) {
      if (event.args) {
        const market = this.markets.get(event.args.marketId);
        if (market) {
          market.isSettled = true;
        }
      }
    }
  }

  private async processPositionEvents(
    contract: any,
    startBlock: number,
    endBlock: number,
    dryRun: boolean
  ): Promise<void> {
    // 모든 포지션 이벤트 배치 수집
    const allEvents = [];
    const batchSize = 50000; // RPC 제한에 맞춤

    const eventTypes = [
      { name: "PositionOpened", filter: contract.filters.PositionOpened() },
      {
        name: "PositionIncreased",
        filter: contract.filters.PositionIncreased(),
      },
      {
        name: "PositionDecreased",
        filter: contract.filters.PositionDecreased(),
      },
      { name: "PositionClosed", filter: contract.filters.PositionClosed() },
      { name: "PositionClaimed", filter: contract.filters.PositionClaimed() },
      { name: "MarketSettled", filter: contract.filters.MarketSettled() },
    ];

    for (const eventType of eventTypes) {
      console.log(`🔄 ${eventType.name} 배치 수집 중...`);
      const events = [];

      for (let i = startBlock; i <= endBlock; i += batchSize) {
        const batchEnd = Math.min(i + batchSize - 1, endBlock);
        try {
          const batchEvents = await contract.queryFilter(
            eventType.filter,
            i,
            batchEnd
          );
          events.push(...batchEvents);
          console.log(
            `✅ ${eventType.name} 배치 ${i}-${batchEnd}: ${batchEvents.length}개`
          );
        } catch (error) {
          console.log(
            `⚠️  ${eventType.name} 배치 ${i}-${batchEnd} 실패: ${error.message}`
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      allEvents.push(
        ...events.map((e) => ({ ...e, eventType: eventType.name }))
      );
      console.log(`✅ ${eventType.name}: ${events.length}개 완료`);
    }

    // 시간순 정렬
    allEvents.sort((a, b) => {
      if (a.blockNumber !== b.blockNumber) {
        return a.blockNumber - b.blockNumber;
      }
      return a.logIndex - b.logIndex;
    });

    console.log(`📈 총 포지션 이벤트: ${allEvents.length}개`);
    console.log("⚡ 이벤트 처리 시작...");

    // 배치 처리를 위한 변수 (고속 처리)
    const processingBatchSize = 100; // 한 번에 처리할 이벤트 수
    let batch = [];
    let processedCount = 0;

    for (const event of allEvents) {
      const pointEvents = await this.processEvent(event);
      batch.push(...pointEvents);
      processedCount++;

      // 배치가 가득 차거나 마지막 이벤트인 경우 실행
      if (
        batch.length >= processingBatchSize ||
        processedCount === allEvents.length
      ) {
        if (batch.length > 0) {
          if (dryRun) {
            console.log(
              `🔍 [DRY RUN] 배치 처리: ${batch.length}개 포인트 이벤트`
            );
            for (const pointEvent of batch) {
              console.log(
                `  💎 ${pointEvent.user} | ${this.getReasonName(
                  pointEvent.reason
                )} | ${ethers.formatUnits(pointEvent.amount, 6)} 포인트`
              );
            }
          } else {
            await this.executeBatch(batch);
          }

          this.executedEvents.push(...batch);
          batch = [];
        }
      }

      if (processedCount % 100 === 0) {
        console.log(
          `⏳ 처리 진행률: ${processedCount}/${allEvents.length} (${Math.round(
            (processedCount / allEvents.length) * 100
          )}%)`
        );
      }
    }

    console.log("✅ 모든 이벤트 처리 완료!");
  }

  private async processEvent(event: any): Promise<
    Array<{
      user: string;
      amount: bigint;
      reason: number;
      contextTs: number;
      txHash: string;
    }>
  > {
    if (!event.args) return [];

    const block = await ethers.provider.getBlock(event.blockNumber);
    const timestamp = block?.timestamp || 0;
    const pointEvents = [];

    switch (event.eventType) {
      case "PositionOpened":
        {
          const { positionId, trader, marketId, lowerTick, upperTick, cost } =
            event.args;

          // Activity Points 계산
          const activityPoints = calcActivityPoints(cost);

          // 포지션 상태 저장
          this.positions.set(positionId, {
            user: trader,
            marketId,
            lowerTick,
            upperTick,
            activityRemaining: activityPoints,
            weightedEntryTime: timestamp,
            totalCostBasis: cost,
            isActive: true,
          });

          // Activity 포인트 (이미 지급됨 - 상태 추적만 수행)
          // pointEvents.push({
          //   user: trader,
          //   amount: activityPoints,
          //   reason: 1, // ACTIVITY
          //   contextTs: timestamp,
          //   txHash: event.transactionHash,
          // });
        }
        break;

      case "PositionIncreased":
        {
          const { positionId, trader, cost } = event.args;

          const position = this.positions.get(positionId);
          if (position) {
            // Activity Points 계산
            const activityPoints = calcActivityPoints(cost);

            // 포지션 상태 업데이트
            position.activityRemaining += activityPoints;
            position.totalCostBasis += cost;

            // Activity 포인트 (이미 지급됨 - 상태 추적만 수행)
            // pointEvents.push({
            //   user: trader,
            //   amount: activityPoints,
            //   reason: 1, // ACTIVITY
            //   contextTs: timestamp,
            //   txHash: event.transactionHash,
            // });
          }
        }
        break;

      case "PositionClosed":
        {
          const { positionId, trader, proceeds } = event.args;

          const position = this.positions.get(positionId);
          if (position) {
            // PnL 계산
            const realizedPnL = proceeds - position.totalCostBasis;

            // Performance Points 계산
            const performancePoints = calcPerformancePoints(realizedPnL);

            // Risk Bonus Points 계산
            const holdingSeconds = BigInt(
              timestamp - position.weightedEntryTime
            );
            const userRange = position.upperTick - position.lowerTick;

            const market = this.markets.get(position.marketId);
            const marketRange = market
              ? market.maxTick - market.minTick
              : userRange;

            const riskBonusPoints = calcRiskBonusPoints(
              position.activityRemaining,
              userRange,
              marketRange,
              holdingSeconds
            );

            // Performance 포인트 추가 (이미 지급됨 - 상태 추적만 수행)
            // if (performancePoints > 0n) {
            //   pointEvents.push({
            //     user: trader,
            //     amount: performancePoints,
            //     reason: 2, // PERFORMANCE
            //     contextTs: timestamp,
            //     txHash: event.transactionHash,
            //   });
            // }

            // Risk Bonus 포인트 추가 (이미 지급됨 - 상태 추적만 수행)
            // if (riskBonusPoints > 0n) {
            //   pointEvents.push({
            //     user: trader,
            //     amount: riskBonusPoints,
            //     reason: 3, // RISK_BONUS
            //     contextTs: timestamp,
            //     txHash: event.transactionHash,
            //   });
            // }

            // 포지션 비활성화
            position.isActive = false;
            position.activityRemaining = 0n;
          }
        }
        break;

      case "PositionClaimed":
        {
          const { positionId, trader, payout } = event.args;

          const position = this.positions.get(positionId);
          if (position) {
            // PnL 계산
            const realizedPnL = payout - position.totalCostBasis;

            // Performance Points 계산
            const performancePoints = calcPerformancePoints(realizedPnL);

            // Risk Bonus Points 계산
            const holdingSeconds = BigInt(
              timestamp - position.weightedEntryTime
            );
            const userRange = position.upperTick - position.lowerTick;

            const market = this.markets.get(position.marketId);
            const marketRange = market
              ? market.maxTick - market.minTick
              : userRange;

            const riskBonusPoints = calcRiskBonusPoints(
              position.activityRemaining,
              userRange,
              marketRange,
              holdingSeconds
            );

            // Performance 포인트 추가 (이미 지급됨 - 상태 추적만 수행)
            // if (performancePoints > 0n) {
            //   pointEvents.push({
            //     user: trader,
            //     amount: performancePoints,
            //     reason: 2, // PERFORMANCE
            //     contextTs: timestamp,
            //     txHash: event.transactionHash,
            //   });
            // }

            // Risk Bonus 포인트 추가 (이미 지급됨 - 상태 추적만 수행)
            // if (riskBonusPoints > 0n) {
            //   pointEvents.push({
            //     user: trader,
            //     amount: riskBonusPoints,
            //     reason: 3, // RISK_BONUS
            //     contextTs: timestamp,
            //     txHash: event.transactionHash,
            //   });
            // }

            // 포지션 비활성화 및 클레임 표시
            position.isActive = false;
            position.activityRemaining = 0n;
            position.isClaimed = true;
          }
        }
        break;

      case "MarketSettled":
        {
          const { marketId, settlementTick } = event.args;

          // 마켓의 실제 endTimestamp 사용
          const market = this.markets.get(marketId);
          const marketEndTimestamp = market?.endTimestamp || timestamp;

          console.log(
            `🏁 마켓 ${marketId} 정산 처리 중... (정산 틱: ${settlementTick})`
          );
          console.log(
            `📅 마켓 종료 시간: ${new Date(
              marketEndTimestamp * 1000
            ).toISOString()}`
          );

          let settledPositions = 0;
          let totalPerformancePoints = 0n;
          let totalRiskBonusPoints = 0n;

          // 해당 마켓의 모든 활성 포지션들에 대해 정산 포인트 계산
          for (const [positionId, position] of this.positions) {
            if (
              position.marketId === marketId &&
              position.isActive &&
              !position.isClaimed
            ) {
              // 정산 결과 계산 (승패 여부)
              const isWin =
                position.lowerTick <= settlementTick &&
                position.upperTick > settlementTick;

              // 페이아웃 계산 (승리시 quantity, 패배시 0)
              // 구 컨트랙트에서는 승리시 quantity만큼 받음
              // quantity를 cost 기반으로 추정: quantity ≈ cost * 2 (대략적인 추정)
              const estimatedQuantity = position.totalCostBasis * 2n; // 간단한 추정
              const estimatedPayout = isWin ? estimatedQuantity : 0n;

              // PnL 계산
              const realizedPnL = estimatedPayout - position.totalCostBasis;

              // Performance Points 계산
              const performancePoints = calcPerformancePoints(realizedPnL);

              // Risk Bonus Points 계산 (마켓 종료 시간 사용)
              const holdingSeconds = BigInt(
                marketEndTimestamp - position.weightedEntryTime
              );
              const userRange = position.upperTick - position.lowerTick;

              const market = this.markets.get(position.marketId);
              const marketRange = market
                ? market.maxTick - market.minTick
                : userRange;

              const riskBonusPoints = calcRiskBonusPoints(
                position.activityRemaining,
                userRange,
                marketRange,
                holdingSeconds
              );

              // Performance 포인트 추가
              if (performancePoints > 0n) {
                pointEvents.push({
                  user: position.user,
                  amount: performancePoints,
                  reason: 2, // PERFORMANCE
                  contextTs: timestamp,
                  txHash: event.transactionHash,
                });
                totalPerformancePoints += performancePoints;
              }

              // Risk Bonus 포인트 추가
              if (riskBonusPoints > 0n) {
                pointEvents.push({
                  user: position.user,
                  amount: riskBonusPoints,
                  reason: 3, // RISK_BONUS
                  contextTs: timestamp,
                  txHash: event.transactionHash,
                });
                totalRiskBonusPoints += riskBonusPoints;
              }

              // 포지션 상태 업데이트 (정산 완료 표시)
              position.isActive = false;
              position.activityRemaining = 0n;
              position.isSettled = true;
              settledPositions++;
            }
          }

          console.log(`✅ 마켓 ${marketId} 정산 완료:`);
          console.log(`  - 정산된 포지션: ${settledPositions}개`);
          console.log(
            `  - Performance 포인트: ${totalPerformancePoints.toString()}`
          );
          console.log(
            `  - Risk Bonus 포인트: ${totalRiskBonusPoints.toString()}`
          );
        }
        break;
    }

    return pointEvents;
  }

  private async executeBatch(
    batch: Array<{
      user: string;
      amount: bigint;
      reason: number;
      contextTs: number;
      txHash: string;
    }>
  ): Promise<void> {
    if (batch.length === 0) return;

    console.log(`🚀 실제 배치 실행: ${batch.length}개 포인트 이벤트`);

    try {
      // batchGrantPoints 호출
      const users = batch.map((e) => e.user);
      const amounts = batch.map((e) => e.amount);
      const reasons = batch.map((e) => e.reason);
      const contextTs = batch.map((e) => e.contextTs);

      const tx = await this.pointsGranter.batchGrantPoints(
        users,
        amounts,
        reasons,
        contextTs
      );
      await tx.wait();

      console.log(`✅ 배치 실행 완료: ${tx.hash}`);

      // 개별 이벤트 로그
      for (const pointEvent of batch) {
        console.log(
          `  💎 ${pointEvent.user.slice(0, 8)}... | ${this.getReasonName(
            pointEvent.reason
          )} | ${ethers.formatUnits(pointEvent.amount, 6)} 포인트`
        );
      }
    } catch (error) {
      console.error(`❌ 배치 실행 실패:`, error);
      throw error;
    }
  }

  private getReasonName(reason: number): string {
    switch (reason) {
      case 1:
        return "ACTIVITY";
      case 2:
        return "PERFORMANCE";
      case 3:
        return "RISK_BONUS";
      default:
        return "MANUAL";
    }
  }

  generateSummary(): void {
    console.log("\n" + "=".repeat(80));
    console.log("📊 백필 실행 결과 요약");
    console.log("=".repeat(80));

    // 이벤트 타입별 통계
    const typeStats = {
      ACTIVITY: { count: 0, total: 0n },
      PERFORMANCE: { count: 0, total: 0n },
      RISK_BONUS: { count: 0, total: 0n },
    };

    for (const event of this.executedEvents) {
      const reasonName = this.getReasonName(event.reason);
      if (reasonName in typeStats) {
        typeStats[reasonName as keyof typeof typeStats].count++;
        typeStats[reasonName as keyof typeof typeStats].total += event.amount;
      }
    }

    // 사용자별 집계
    const userStats = new Map<
      string,
      {
        activity: bigint;
        performance: bigint;
        riskBonus: bigint;
        total: bigint;
      }
    >();
    for (const event of this.executedEvents) {
      if (!userStats.has(event.user)) {
        userStats.set(event.user, {
          activity: 0n,
          performance: 0n,
          riskBonus: 0n,
          total: 0n,
        });
      }

      const stat = userStats.get(event.user)!;
      stat.total += event.amount;

      switch (event.reason) {
        case 1:
          stat.activity += event.amount;
          break;
        case 2:
          stat.performance += event.amount;
          break;
        case 3:
          stat.riskBonus += event.amount;
          break;
      }
    }

    console.log(`\n📈 총 포인트 이벤트: ${this.executedEvents.length}개`);
    console.log(`👥 참여 사용자: ${userStats.size}명`);
    console.log(`📊 처리된 마켓: ${this.markets.size}개`);
    console.log(`🎯 처리된 포지션: ${this.positions.size}개`);

    console.log("\n🎯 포인트 타입별 통계:");
    console.log(
      `  Activity Points: ${
        typeStats.ACTIVITY.count
      }개 이벤트, 총 ${ethers.formatUnits(typeStats.ACTIVITY.total, 6)} 포인트`
    );
    console.log(
      `  Performance Points: ${
        typeStats.PERFORMANCE.count
      }개 이벤트, 총 ${ethers.formatUnits(
        typeStats.PERFORMANCE.total,
        6
      )} 포인트`
    );
    console.log(
      `  Risk Bonus Points: ${
        typeStats.RISK_BONUS.count
      }개 이벤트, 총 ${ethers.formatUnits(
        typeStats.RISK_BONUS.total,
        6
      )} 포인트`
    );

    const grandTotal =
      typeStats.ACTIVITY.total +
      typeStats.PERFORMANCE.total +
      typeStats.RISK_BONUS.total;
    console.log(`💎 총 포인트: ${ethers.formatUnits(grandTotal, 6)} 포인트`);

    console.log("\n" + "=".repeat(80));
    console.log("✅ 백필 실행 완료!");
    console.log("=".repeat(80));
  }
}

async function main() {
  const args = process.argv.slice(2);
  const environment = args[0] || "dev";
  const dryRun = args[1] !== "--execute"; // --execute 플래그가 없으면 DRY RUN

  try {
    console.log("🚀 레거시 컨트랙트 백필 실행기");
    console.log(`🌍 환경: ${environment}`);
    console.log(`🏃 모드: ${dryRun ? "DRY RUN (미리보기)" : "실제 실행"}\n`);

    if (dryRun) {
      console.log("⚠️  이것은 DRY RUN입니다. 실제 포인트는 지급되지 않습니다.");
      console.log("💡 실제 실행을 원하면 --execute 플래그를 추가하세요.\n");
    }

    const executor = new LegacyBackfillExecutor();
    await executor.initialize(environment);
    await executor.processLegacyContract(dryRun);
    executor.generateSummary();

    if (dryRun) {
      console.log("\n💡 다음 단계:");
      console.log(`1. 결과를 검토하고 로직이 올바른지 확인`);
      console.log(
        `2. 실제 실행: npx hardhat run scripts/backfill-legacy-execute.ts --network base-${environment} -- ${environment} --execute`
      );
    }
  } catch (error) {
    console.error("❌ 오류 발생:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export { LegacyBackfillExecutor };
