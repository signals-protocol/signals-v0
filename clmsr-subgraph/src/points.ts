import { BigInt, Bytes, ethereum, crypto } from "@graphprotocol/graph-ts";
import { EventHistory, UserStats } from "../generated/schema";
import { PointsGranted } from "../generated/PointsGranterUpgradeable/PointsGranterUpgradeable";
import { getOrCreateUserStats } from "./clmsr-market-core";

function reasonCode(reason: string): i32 {
  if (reason == "ACTIVITY") return 1;
  if (reason == "PERFORMANCE") return 2;
  if (reason == "RISK_BONUS") return 3;
  return 100;
}

function mapReason(code: i32): string {
  if (code == 1) return "ACTIVITY";
  if (code == 2) return "PERFORMANCE";
  if (code == 3) return "RISK_BONUS";
  return "MANUAL";
}

/** Append a single history row from an event (no totals mutation) */
export function recordEventHistory(
  e: ethereum.Event,
  user: Bytes,
  amount: BigInt,
  reason: string,
  timestamp: BigInt
): void {
  // Unique id: keccak256(txHash || logIndex || reasonCode)
  const preimage = e.transaction.hash
    .concatI32(e.logIndex.toI32())
    .concatI32(reasonCode(reason));
  const id = Bytes.fromByteArray(crypto.keccak256(preimage));

  let h = new EventHistory(id);
  h.user = user;
  h.amount = amount;
  h.reason = reason;
  h.timestamp = timestamp;
  h.save();
}

/** Single entry point: accrue totals (create UserStats if needed) and record history */
export function accrueAndRecord(
  e: ethereum.Event,
  user: Bytes,
  amount: BigInt,
  reason: string,
  timestamp: BigInt
): void {
  const stats = getOrCreateUserStats(user);  // 👈 없으면 생성!
  stats.totalPoints = stats.totalPoints.plus(amount);
  if (reason == "ACTIVITY") {
    stats.activityPoints = stats.activityPoints.plus(amount);
  } else if (reason == "PERFORMANCE") {
    stats.performancePoints = stats.performancePoints.plus(amount);
  } else if (reason == "RISK_BONUS") {
    stats.riskBonusPoints = stats.riskBonusPoints.plus(amount);
  }
  stats.save();

  recordEventHistory(e, user, amount, reason, timestamp);
}

/** Handle manual grant from PointsGranter using the unified entry */
export function handlePointsGranted(e: PointsGranted): void {
  const ts = e.params.contextTs.notEqual(BigInt.zero())
    ? e.params.contextTs
    : e.block.timestamp;

  const reason = mapReason(e.params.reason as i32);
  accrueAndRecord(e, e.params.user, e.params.amount, reason, ts);
}
