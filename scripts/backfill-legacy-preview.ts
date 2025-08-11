import { ethers } from "hardhat";
import { getEnvironmentVariables } from "./utils/environment";

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

// 이벤트 타입 정의
interface ActivityEvent {
  type: "ACTIVITY";
  user: string;
  amount: bigint;
  timestamp: number;
  txHash: string;
  blockNumber: number;
}

interface PerformanceEvent {
  type: "PERFORMANCE";
  user: string;
  amount: bigint;
  timestamp: number;
  txHash: string;
  blockNumber: number;
}

interface RiskBonusEvent {
  type: "RISK_BONUS";
  user: string;
  amount: bigint;
  timestamp: number;
  txHash: string;
  blockNumber: number;
}

type PointEvent = ActivityEvent | PerformanceEvent | RiskBonusEvent;

// 포지션 상태 추적
interface PositionState {
  user: string;
  marketId: bigint;
  lowerTick: bigint;
  upperTick: bigint;
  activityRemaining: bigint;
  weightedEntryTime: number;
  totalCostBasis: bigint;
  isActive: boolean;
  isClaimed?: boolean;
  isSettled?: boolean;
}

// 마켓 상태 추적
interface MarketState {
  marketId: bigint;
  minTick: bigint;
  maxTick: bigint;
  endTimestamp: number;
  isSettled: boolean;
}

class LegacyBackfillAnalyzer {
  private positions = new Map<bigint, PositionState>();
  private markets = new Map<bigint, MarketState>();
  private pointEvents: PointEvent[] = [];

  async analyzeLegacyContract(): Promise<void> {
    console.log("🔍 레거시 컨트랙트 로그 분석 시작...");
    console.log(`📍 컨트랙트 주소: ${LEGACY_CONTRACT}`);

    // 여러 RPC 제공자 옵션 - 사용자 추천 RPC 우선
    const rpcUrls = [
      "https://base-mainnet.g.allthatnode.com/archive/evm/***REMOVED***",
      process.env.BASE_RPC_URL,
      "https://mainnet.base.org",
      "https://base.publicnode.com",
    ].filter(Boolean);

    // 모든 RPC 동시 테스트 및 작동하는 것들 수집
    console.log(`🔗 ${rpcUrls.length}개 RPC 제공자 동시 테스트 중...`);
    const workingProviders = [];

    const testPromises = rpcUrls.map(async (rpcUrl, index) => {
      try {
        const testProvider = new ethers.JsonRpcProvider(rpcUrl);
        await testProvider.getBlockNumber();
        console.log(
          `✅ RPC ${index + 1} 연결 성공: ${rpcUrl?.slice(0, 50)}...`
        );
        return { provider: testProvider, url: rpcUrl, index };
      } catch (error) {
        console.log(`❌ RPC ${index + 1} 실패: ${rpcUrl?.slice(0, 50)}...`);
        return null;
      }
    });

    const results = await Promise.all(testPromises);
    workingProviders.push(...results.filter((r) => r !== null));

    if (workingProviders.length === 0) {
      throw new Error("모든 RPC 제공자 연결 실패. 네트워크 상태를 확인하세요.");
    }

    console.log(`🚀 ${workingProviders.length}개 RPC 제공자로 병렬 처리 시작!`);

    // 첫 번째 작동하는 provider를 주 provider로 사용
    const provider = workingProviders[0].provider;

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

    // 모든 이벤트를 시간순으로 가져오기
    console.log("📥 이벤트 로그 수집 중...");

    // 레거시 컨트랙트 배포 블록 (정확한 정보)
    const startBlock = 33546152; // 레거시 컨트랙트 권장 시작 블록
    const endBlock = 33824978; // 사용자 지정 끝 블록
    console.log(
      `📅 블록 범위: ${startBlock} ~ ${endBlock} (총 ${
        endBlock - startBlock
      }블록)`
    );

    // 블록 범위를 배치로 나누어 처리 (50000 블록씩 - 🔥초고속 처리)
    const batchSize = 50000;
    const totalBlocks = endBlock - startBlock;
    console.log(
      `📦 배치 처리: ${Math.ceil(
        totalBlocks / batchSize
      )}개 배치로 분할 (🔥고속 모드)`
    );

    // 마켓 이벤트 순차 수집 (RPC 제한 회피)
    console.log("📊 마켓 이벤트 순차 수집 중...");

    // MarketCreated 이벤트 순차 수집
    console.log("🔄 MarketCreated 이벤트 수집 중...");
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
      // RPC 부하 방지를 위한 딜레이
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // MarketSettled 이벤트 순차 수집
    console.log("🔄 MarketSettled 이벤트 수집 중...");
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
      // RPC 부하 방지를 위한 딜레이
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // MarketCreated 이벤트 처리
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

    // MarketSettled 이벤트 처리
    for (const event of marketSettledEvents) {
      if (event.args) {
        const market = this.markets.get(event.args.marketId);
        if (market) {
          market.isSettled = true;
        }
      }
    }

    // 모든 포지션 이벤트를 시간순으로 처리
    const allEvents = [];

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

    // 모든 이벤트 타입을 순차적으로 수집
    console.log("📥 모든 포지션 이벤트를 순차적으로 수집 중...");

    for (const eventType of eventTypes) {
      console.log(`🔄 ${eventType.name} 시작...`);
      const events = [];

      // 각 이벤트 타입별로 배치를 순차 처리
      for (let i = startBlock; i <= endBlock; i += batchSize) {
        const batchEnd = Math.min(i + batchSize - 1, endBlock);

        try {
          const batchEvents = await contract.queryFilter(
            eventType.filter,
            i,
            batchEnd
          );
          const taggedEvents = batchEvents.map((e) => ({
            ...e,
            eventType: eventType.name,
          }));
          events.push(...taggedEvents);
          console.log(
            `✅ ${eventType.name} 배치 ${i}-${batchEnd}: ${batchEvents.length}개`
          );
        } catch (error) {
          console.log(
            `⚠️  ${eventType.name} 배치 ${i}-${batchEnd} 실패: ${error.message}`
          );
        }

        // RPC 부하 방지를 위한 극소 딜레이
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      allEvents.push(...events);
      console.log(`✅ ${eventType.name}: ${events.length}개 완료`);
    }

    // 블록 번호와 로그 인덱스로 정렬
    allEvents.sort((a, b) => {
      if (a.blockNumber !== b.blockNumber) {
        return a.blockNumber - b.blockNumber;
      }
      return a.logIndex - b.logIndex;
    });

    console.log(`📈 총 포지션 이벤트: ${allEvents.length}개`);
    console.log("⚡ 이벤트 처리 시작...");

    let processedCount = 0;
    for (const event of allEvents) {
      await this.processEvent(event);
      processedCount++;

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

  private async processEvent(event: any): Promise<void> {
    if (!event.args) return;

    // Base 네트워크: 2초마다 블록 생성, 블록 0은 2023년 8월경
    // 블록 33546152는 대략 2024년 2월경 (추정)
    const baseGenesisTimestamp = 1691251200; // 2023-08-05 20:00:00 UTC (추정)
    const blockTime = 2; // 2초마다 블록
    const estimatedTimestamp =
      baseGenesisTimestamp + event.blockNumber * blockTime;

    // 실제 블록 정보도 시도해보지만 fallback으로 추정값 사용
    let timestamp = estimatedTimestamp;
    try {
      const block = await ethers.provider.getBlock(event.blockNumber);
      if (block?.timestamp) {
        timestamp = block.timestamp;
      }
    } catch (error) {
      // RPC 오류시 추정값 사용
    }

    switch (event.eventType) {
      case "PositionOpened":
        await this.handlePositionOpened(event, timestamp);
        break;
      case "PositionIncreased":
        await this.handlePositionIncreased(event, timestamp);
        break;
      case "PositionDecreased":
        // 감소는 포인트 발생하지 않음
        break;
      case "PositionClosed":
        await this.handlePositionClosed(event, timestamp);
        break;
      case "PositionClaimed":
        await this.handlePositionClaimed(event, timestamp);
        break;
      case "MarketSettled":
        await this.handleMarketSettled(event, timestamp);
        break;
    }
  }

  private async handlePositionOpened(
    event: any,
    timestamp: number
  ): Promise<void> {
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

    // Activity 포인트 이벤트 기록 (이미 지급됨 - 상태 추적만 수행)
    // this.pointEvents.push({
    //   type: "ACTIVITY",
    //   user: trader,
    //   amount: activityPoints,
    //   timestamp,
    //   txHash: event.transactionHash,
    //   blockNumber: event.blockNumber,
    // });
  }

  private async handlePositionIncreased(
    event: any,
    timestamp: number
  ): Promise<void> {
    const { positionId, trader, cost } = event.args;

    const position = this.positions.get(positionId);
    if (!position) return;

    // Activity Points 계산
    const activityPoints = calcActivityPoints(cost);

    // 포지션 상태 업데이트
    position.activityRemaining += activityPoints;
    position.totalCostBasis += cost;

    // Activity 포인트 이벤트 기록 (이미 지급됨 - 상태 추적만 수행)
    // this.pointEvents.push({
    //   type: "ACTIVITY",
    //   user: trader,
    //   amount: activityPoints,
    //   timestamp,
    //   txHash: event.transactionHash,
    //   blockNumber: event.blockNumber,
    // });
  }

  private async handlePositionClosed(
    event: any,
    timestamp: number
  ): Promise<void> {
    const { positionId, trader, proceeds } = event.args;

    const position = this.positions.get(positionId);
    if (!position) return;

    // PnL 계산
    const realizedPnL = proceeds - position.totalCostBasis;

    // Performance Points 계산
    const performancePoints = calcPerformancePoints(realizedPnL);

    // Risk Bonus Points 계산
    const holdingSeconds = BigInt(timestamp - position.weightedEntryTime);
    const userRange = position.upperTick - position.lowerTick;

    const market = this.markets.get(position.marketId);
    const marketRange = market ? market.maxTick - market.minTick : userRange;

    const riskBonusPoints = calcRiskBonusPoints(
      position.activityRemaining,
      userRange,
      marketRange,
      holdingSeconds
    );

    // Performance 포인트 이벤트 기록 (이미 지급됨 - 상태 추적만 수행)
    // if (performancePoints > 0n) {
    //   this.pointEvents.push({
    //     type: "PERFORMANCE",
    //     user: trader,
    //     amount: performancePoints,
    //     timestamp,
    //     txHash: event.transactionHash,
    //     blockNumber: event.blockNumber,
    //   });
    // }

    // Risk Bonus 포인트 이벤트 기록 (이미 지급됨 - 상태 추적만 수행)
    // if (riskBonusPoints > 0n) {
    //   this.pointEvents.push({
    //     type: "RISK_BONUS",
    //     user: trader,
    //     amount: riskBonusPoints,
    //     timestamp,
    //     txHash: event.transactionHash,
    //     blockNumber: event.blockNumber,
    //   });
    // }

    // 포지션 비활성화
    position.isActive = false;
    position.activityRemaining = 0n;
  }

  private async handlePositionClaimed(
    event: any,
    timestamp: number
  ): Promise<void> {
    const { positionId, trader, payout } = event.args;

    const position = this.positions.get(positionId);
    if (!position) return;

    // PnL 계산
    const realizedPnL = payout - position.totalCostBasis;

    // Performance Points 계산
    const performancePoints = calcPerformancePoints(realizedPnL);

    // Risk Bonus Points 계산
    const holdingSeconds = BigInt(timestamp - position.weightedEntryTime);
    const userRange = position.upperTick - position.lowerTick;

    const market = this.markets.get(position.marketId);
    const marketRange = market ? market.maxTick - market.minTick : userRange;

    const riskBonusPoints = calcRiskBonusPoints(
      position.activityRemaining,
      userRange,
      marketRange,
      holdingSeconds
    );

    // Performance 포인트 이벤트 기록 (이미 지급됨 - 상태 추적만 수행)
    // if (performancePoints > 0n) {
    //   this.pointEvents.push({
    //     type: "PERFORMANCE",
    //     user: trader,
    //     amount: performancePoints,
    //     timestamp,
    //     txHash: event.transactionHash,
    //     blockNumber: event.blockNumber,
    //   });
    // }

    // Risk Bonus 포인트 이벤트 기록 (이미 지급됨 - 상태 추적만 수행)
    // if (riskBonusPoints > 0n) {
    //   this.pointEvents.push({
    //     type: "RISK_BONUS",
    //     user: trader,
    //     amount: riskBonusPoints,
    //     timestamp,
    //     txHash: event.transactionHash,
    //     blockNumber: event.blockNumber,
    //   });
    // }

    // 포지션 비활성화 및 클레임 표시
    position.isActive = false;
    position.activityRemaining = 0n;
    position.isClaimed = true;
  }

  private async handleMarketSettled(
    event: any,
    timestamp: number
  ): Promise<void> {
    const { marketId, settlementTick } = event.args;

    // 마켓의 실제 endTimestamp 사용
    const market = this.markets.get(marketId);
    const marketEndTimestamp = market?.endTimestamp || timestamp;

    console.log(
      `🏁 마켓 ${marketId} 정산 처리 중... (정산 틱: ${settlementTick})`
    );
    console.log(
      `📅 마켓 종료 시간: ${new Date(marketEndTimestamp * 1000).toISOString()}`
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

        // Risk Bonus Points 계산
        const holdingSeconds = BigInt(timestamp - position.weightedEntryTime);
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

        // Performance 포인트 이벤트 기록
        if (performancePoints > 0n) {
          this.pointEvents.push({
            type: "PERFORMANCE",
            user: position.user,
            amount: performancePoints,
            timestamp,
            txHash: event.transactionHash,
            blockNumber: event.blockNumber,
          });
          totalPerformancePoints += performancePoints;
        }

        // Risk Bonus 포인트 이벤트 기록
        if (riskBonusPoints > 0n) {
          this.pointEvents.push({
            type: "RISK_BONUS",
            user: position.user,
            amount: riskBonusPoints,
            timestamp,
            txHash: event.transactionHash,
            blockNumber: event.blockNumber,
          });
          totalRiskBonusPoints += riskBonusPoints;
        }

        // 첫 번째 포지션에 대해서만 디버깅 로그 출력
        if (settledPositions === 0) {
          console.log(
            `🔍 Risk Debug Sample - User: ${position.user.slice(0, 8)}...`
          );
          console.log(
            `  - Holding: ${holdingSeconds}초 (${
              Number(holdingSeconds) / 3600
            }시간)`
          );
          console.log(`  - Activity: ${position.activityRemaining}`);
          console.log(`  - Risk Points: ${riskBonusPoints}`);
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
    console.log(`  - Performance 포인트: ${totalPerformancePoints.toString()}`);
    console.log(`  - Risk Bonus 포인트: ${totalRiskBonusPoints.toString()}`);
  }

  generateReport(): void {
    console.log("\n" + "=".repeat(80));
    console.log("📊 백필 예상 결과 리포트");
    console.log("=".repeat(80));

    // 사용자별 포인트 집계
    const userPoints = new Map<
      string,
      {
        activity: bigint;
        performance: bigint;
        riskBonus: bigint;
        total: bigint;
      }
    >();

    for (const event of this.pointEvents) {
      if (!userPoints.has(event.user)) {
        userPoints.set(event.user, {
          activity: 0n,
          performance: 0n,
          riskBonus: 0n,
          total: 0n,
        });
      }

      const userStat = userPoints.get(event.user)!;
      userStat.total += event.amount;

      switch (event.type) {
        case "ACTIVITY":
          userStat.activity += event.amount;
          break;
        case "PERFORMANCE":
          userStat.performance += event.amount;
          break;
        case "RISK_BONUS":
          userStat.riskBonus += event.amount;
          break;
      }
    }

    // 이벤트 타입별 통계
    const typeStats = {
      ACTIVITY: { count: 0, total: 0n },
      PERFORMANCE: { count: 0, total: 0n },
      RISK_BONUS: { count: 0, total: 0n },
    };

    for (const event of this.pointEvents) {
      typeStats[event.type].count++;
      typeStats[event.type].total += event.amount;
    }

    console.log(`\n📈 총 포인트 이벤트: ${this.pointEvents.length}개`);
    console.log(`👥 참여 사용자: ${userPoints.size}명`);
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

    // 상위 10명 사용자
    console.log("\n🏆 상위 10명 사용자:");
    const sortedUsers = Array.from(userPoints.entries())
      .sort((a, b) => Number(b[1].total - a[1].total))
      .slice(0, 10);

    for (let i = 0; i < sortedUsers.length; i++) {
      const [user, points] = sortedUsers[i];
      console.log(`  ${i + 1}. ${user}`);
      console.log(
        `     Activity: ${ethers.formatUnits(
          points.activity,
          6
        )} | Performance: ${ethers.formatUnits(
          points.performance,
          6
        )} | Risk: ${ethers.formatUnits(points.riskBonus, 6)}`
      );
      console.log(`     Total: ${ethers.formatUnits(points.total, 6)} 포인트`);
    }

    // 시간순 샘플 이벤트 (처음 10개)
    console.log("\n⏰ 시간순 샘플 이벤트 (처음 10개):");
    const sortedEvents = this.pointEvents
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(0, 10);

    for (const event of sortedEvents) {
      const date = new Date(event.timestamp * 1000).toISOString();
      console.log(
        `  ${date} | ${event.type} | ${event.user.slice(
          0,
          8
        )}... | ${ethers.formatUnits(event.amount, 6)} 포인트`
      );
    }

    console.log("\n" + "=".repeat(80));
    console.log(
      "✅ 리포트 생성 완료! 실제 백필을 위해서는 이 결과를 검토하세요."
    );
    console.log("=".repeat(80));
  }

  getPointEvents(): PointEvent[] {
    return this.pointEvents.sort((a, b) => a.timestamp - b.timestamp);
  }
}

async function main() {
  try {
    console.log("🚀 레거시 컨트랙트 백필 분석 시작");
    console.log(
      "⚠️  이것은 미리보기입니다. 실제 이벤트는 emit하지 않습니다.\n"
    );

    const analyzer = new LegacyBackfillAnalyzer();
    await analyzer.analyzeLegacyContract();
    analyzer.generateReport();

    console.log("\n💡 다음 단계:");
    console.log("1. 결과를 검토하고 로직이 올바른지 확인");
    console.log("2. Dev 환경에서 실제 백필 테스트");
    console.log("3. Production 환경에서 최종 백필 실행");
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

export { LegacyBackfillAnalyzer };
