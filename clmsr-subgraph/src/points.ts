import { BigInt, BigDecimal, Bytes } from "@graphprotocol/graph-ts";
import { UserStats } from "../generated/schema";
import { PointsGranted } from "../generated/PointsGranter/PointsGranter";
import { getOrCreateUserStats } from "./clmsr-market-core";

// ============= 유틸리티 함수들 =============

/** UTC 기준 일자 계산 (timestamp를 일 단위로 floor) */
export function getUtcDay(timestamp: BigInt): BigInt {
  const secondsPerDay = BigInt.fromI32(86400); // 24 * 60 * 60
  return timestamp.div(secondsPerDay);
}

/** Activity Point 하루 3번 제한 체크 */
export function checkActivityLimit(
  userStats: UserStats,
  timestamp: BigInt
): boolean {
  const currentDay = getUtcDay(timestamp);

  // 새로운 날이면 카운터 리셋
  if (userStats.lastActivityDay.lt(currentDay)) {
    userStats.activityPointsToday = BigInt.fromI32(0);
    userStats.lastActivityDay = currentDay;
  }

  // 하루 3번 제한 체크
  return userStats.activityPointsToday.lt(BigInt.fromI32(3));
}

// ============= 순수 계산 함수들 =============

/** Activity 포인트 계산 */
export function calcActivityPoints(cost: BigInt): BigInt {
  return cost.div(BigInt.fromI32(10)); // A = cost / 10
}

/** Performance 포인트 계산 */
export function calcPerformancePoints(realizedPnL: BigInt): BigInt {
  return realizedPnL.gt(BigInt.fromI32(0)) ? realizedPnL : BigInt.fromI32(0);
}

/** Risk 보너스 포인트 계산 (보유시간 >= 1시간일 때만) */
export function calcRiskBonusPoints(
  activityPoints: BigInt,
  userRange: BigInt,
  marketRange: BigInt,
  holdingSeconds: BigInt
): BigInt {
  // 1시간(3600초) 미만이면 0 포인트
  if (holdingSeconds.lt(BigInt.fromI32(3600))) {
    return BigInt.fromI32(0);
  }

  // 범위 차이 계산
  let rangeDiff = marketRange.minus(userRange);
  if (rangeDiff.lt(BigInt.fromI32(0))) rangeDiff = BigInt.fromI32(0);

  // multiplier = 1 + rangeDiff/marketRange (최대 2.0으로 제한)
  let multiplier = BigInt.fromI32(1000000).plus(
    rangeDiff.times(BigInt.fromI32(1000000)).div(marketRange)
  ); // 1000000 = 100%
  if (multiplier.gt(BigInt.fromI32(2000000)))
    multiplier = BigInt.fromI32(2000000); // 최대 200%

  // R = A × 0.3 × multiplier = A × 300000 / 1000000
  let risk = activityPoints
    .times(BigInt.fromI32(300000))
    .div(BigInt.fromI32(1000000))
    .times(multiplier)
    .div(BigInt.fromI32(1000000));

  // min(R, 2A)
  let maxRisk = activityPoints.times(BigInt.fromI32(2));
  return risk.gt(maxRisk) ? maxRisk : risk;
}

// ============= 단순 적립 헬퍼들 =============

/** Activity Points 적립 (카운터 증가 포함) */
export function addActivityPoints(userStats: UserStats, amount: BigInt): void {
  userStats.totalPoints = userStats.totalPoints.plus(amount);
  userStats.activityPoints = userStats.activityPoints.plus(amount);
  userStats.activityPointsToday = userStats.activityPointsToday.plus(
    BigInt.fromI32(1)
  );
}

/** Performance Points 적립 */
export function addPerformancePoints(
  userStats: UserStats,
  amount: BigInt
): void {
  userStats.totalPoints = userStats.totalPoints.plus(amount);
  userStats.performancePoints = userStats.performancePoints.plus(amount);
}

/** Risk Bonus Points 적립 */
export function addRiskBonusPoints(userStats: UserStats, amount: BigInt): void {
  userStats.totalPoints = userStats.totalPoints.plus(amount);
  userStats.riskBonusPoints = userStats.riskBonusPoints.plus(amount);
}

// ============= Points 이벤트 핸들러 =============

/** Map reason code to string */
function mapReason(code: i32): string {
  if (code == 1) return "ACTIVITY";
  if (code == 2) return "PERFORMANCE";
  if (code == 3) return "RISK_BONUS";
  return "MANUAL";
}

/** Handle manual grant from PointsGranter */
export function handlePointsGranted(e: PointsGranted): void {
  const ts = e.params.contextTs.notEqual(BigInt.zero())
    ? e.params.contextTs
    : e.block.timestamp;

  const reason = mapReason(e.params.reason as i32);
  const userStats = getOrCreateUserStats(e.params.user);

  // 포인트 적립
  userStats.totalPoints = userStats.totalPoints.plus(e.params.amount);
  if (reason == "ACTIVITY") {
    userStats.activityPoints = userStats.activityPoints.plus(e.params.amount);
  } else if (reason == "PERFORMANCE") {
    userStats.performancePoints = userStats.performancePoints.plus(
      e.params.amount
    );
  } else if (reason == "RISK_BONUS") {
    userStats.riskBonusPoints = userStats.riskBonusPoints.plus(e.params.amount);
  }
  userStats.save();
}
