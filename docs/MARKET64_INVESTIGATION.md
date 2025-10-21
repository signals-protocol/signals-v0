# Market #64 PnL Anomaly – Investigation Dossier

_Last updated: 2025-10-20 11:21 KST_

## 1. Background

- **Alert**: Market #64 (citrea-prod) shows `totalMarketPnL = -$77,615.32`, which violates the theoretical CLMSR bound `α ln n ≈ $59,914.65` (`α = 10,000`, `n = 400`).
- **Observation**: Subgraph monitoring (`verification/check-market-pnl.ts`) surfaced the anomaly; the user requested full root-cause analysis and proof.

## 2. Initial Data Collection

1. **PnL Scanner** (`verification/check-market-pnl.ts`)
   - Queried citrea-prod subgraph.
   - Confirmed Market #64 breach (`totalMarketPnL = -$77,615.31`, `theoretical = -$59,914.64`).
   - Logged raw totals (bet received, bet paid, settlement, etc.).

2. **Deep Subgraph Dump** (`scripts/temp-market64-analysis.ts`)
   - Fetches market metadata, trades (1,396 records), user positions (698 records).
   - Recomputed aggregates exactly matching subgraph numbers.
   - Exported per-position breakdown, top winners, per-bin exposure summary, and synthetic log-sum-exp estimates.
   - Output stored in `/tmp/market64_analysis.log`.

3. **Winning Positions Identified**
   - Position 143507: Range [110700, 111900), cost $116,923.57 → payout $215,990.42.
   - Position 143344: Range [110400, 112400), cost $22.35 → payout $74,108.66.
   - Position 143065: Range [110600, 113400), cost $44,796.44 → payout $104,330.54.
   - Concentrated profit addresses: 0x6067… (+$78.9k), 0x2aa7… (+$47.5k), 0x16a4… (+$26.8k), etc.

## 3. Theoretical vs. Observed Calculations

| Metric | Value |
|--------|-------|
| `C(0)` (ideal) | $59,914.645471 |
| `C(q_final)` (ideal) | $677,572.800626 |
| Ideal cost collected (`C(q_final) - C(0)`) | $617,658.155155 |
| Actual `bettingNetIncome` | $588,305.076773 |
| Under-collected cost | **$29,353.078382** |
| Winning range exposure (bin 107) | $665,920.394443 |

Notes:
- On-chain tree sums (`scripts/temp-market64-onchain.ts`) produced `C(q_final) = $643,554.576172`, noticeably lower than the ideal simulation ($677k) and even lower than payouts.
- No `RangeFactorApplied` corrections recorded in block range `16,830,000–16,890,000` (`scripts/temp-range-factors.ts` → 0 events).

## 4. Findings to Date

- **Chunked rounding is no longer just a hypothesis.**  
  Local 재현에서 `DebugTradeChunk` 로그와 `getRangeSum` 값을 함께 수집한 결과, 동일 구간(bin 106–109)이 반복적인 `CLOSE` 요청을 맞을 때마다 내림(FLOOR)으로 인한 손실이 누적되어, 전체 루트 합 대비 0.00046% 수준까지 축소된 것을 확인했다.
- **Bound breach 트레이드 확인**: tradeIndex **927** (`tx 0x5a98…ca06`, position 143525) 직후의 worst-case 손실이 처음으로 `-α ln n`을 밑돌았으며, 이 시점의 `sumAfter/sumBefore`는 **1.0000626**에 불과했다(자연히 `α·ln` 값도 0.626146 SUSD만큼만 증가).  
  이상적인 CLMSR이라면 `exp(q/α) ≈ 14.60`이어야 했던 상황이므로, 구간 합이 “거의 0”에 가까웠다는 뜻이다.
- **서브그래프 vs 온체인**: 서브그래프는 이벤트 스트림을 이상적으로 누적하므로 bin factor가 지속적으로 커지는 모습이 잡히지만, 컨트랙트의 `LazyMulSegmentTree`는 같은 이벤트에도 rounding으로 인해 값이 음의 방향으로만 움직였다. 두 분포를 비교하면 오차가 얼마나, 언제부터 커졌는지 추적할 수 있을 것으로 보인다 (다음 단계 작업으로 예정).
- **서브그래프 대비 누적 오차 타임라인 확인** (`verification/bin-drift-timeline.ts`): trade 172의 대규모 `CLOSE` 이후 서브그래프/로컬 루트 합 비율이 **0.2 이하**로 붕괴하며 비용 오차가 즉시 **$30k+**로 증가했다. 이후에도 드리프트가 누적돼 trade 515 기준 누적 range diff가 `2.63×10^31` WAD를 넘었고, trade 927 시점에는 루트 합 비율이 **≈29.61**까지 벌어졌다.

요약하면 “chunked rounding → bin 편중 → 비용 과소 징수”의 메커니즘이 수치로 증명되었고, 이제 서브그래프/온체인 분포 비교로 편차가 발생한 정확한 타이밍과 구간을 규명할 예정이다.

## 5. Attempts to Prove Rounding Drift

| Attempt | Status | Notes |
|---------|--------|-------|
| Inject `DebugTradeChunk` in `_applyFactorChunked` | ✅ compiled | Emits sumBefore/sumAfter per chunk, ready for local replay. |
| Hardhat fork replay (`scripts/debug-trade-chunks.ts`) | ❌ failed | `hardhat_reset` cannot fork citrea chain; “No known hardfork… activation history” even after setting `hardfork=cancun` and `hardforkHistory`. Hardhat lacks fork history for chain id 5115. |
| Hardhat chain config tweaks (`hardhat.config.ts`) | partial | Set chainId=5115, hardfork=cancun, but Hardhat still refuses to execute citrea historical blocks. |
| Local market reconstruction replay (`scripts/temp-market64-replay.ts`) | ✅ complete | Rebuilt market #64 on in-process Hardhat network (1,396 trades) and captured 1,703 `DebugTradeChunk` events with bin ranges in `verification/data/market64/replay-debug.json`. |
| Worst-case loss scan (`verification/track-worst-loss.ts`) | ✅ complete | Replayed chunk logs with on-chain rounding to track per-trade worst loss; trade #927 (`tx 0x5a98…ca06`, pos 143525) is first to push loss below `-α ln n` (worst PnL ≈ -$80.7k). |

### Pending Proof Strategy
Options for the next investigator:
1. **Custom Fork Provider**: Use Anvil/Foundry or Besu that accepts chain id 5115 with manual hardfork history.
2. **Full Local Replay**: ✅ Completed via local reconstruction; next step is analysing captured chunk logs to quantify rounding drift.
3. **Analytical Evidence**: Construct a high-precision script (per-bin reconstruction) to compare `_applyFactorChunked` outputs with ideal math and attribute cumulative loss.

### Replay Deep-Dive (Oct 20)

1. **대량 청산 직후 구간 붕괴**  
   - trade 925·926(CLOSE)이 동일 구간(110600–111000)을 inverse factor로 반복 갱신하면서 `sumBefore`가 각각 `8.10e34 → 5.34e34 → 1.96e34`로 급감.  
   - `LazyMulSegmentTree`는 매번 내림 처리만 하므로, 이상적인 `exp(-q/α)`보다 더 빠른 속도로 값이 줄어든다.

2. **Bound breach 트레이드**  
   - trade 927이 26,810.693296 수량을 매수했음에도 `sumAfter/sumBefore = 1.0000626`에 그쳐 비용이 **0.626146 SUSD**밖에 잡히지 않았다 (PositionOpened 이벤트 값과 일치).  
   - 서브그래프에서 동일 시점의 factor는 `exp(q/α) ≈ 14.60`에 해당하는 값으로 유지되어 있으며, 이 괴리가 실제 손실로 이어졌다.

## 6. Option B Global Correction – Implementation Snapshot (Oct 21)

- **핵심 조치**: `handleRangeFactorApplied`가 lazy tree 루트와 동일한 `floor(sumBefore · φ̂)`을 강제하도록, 잔차 `R = targetAfter - tildeSum`을 소수부가 큰 bin에 결정적으로 분배(Option B)하는 로직을 서브그래프에 도입했다.  
  - 구현: [`clmsr-subgraph/src/range-factor-correction.ts`](../clmsr-subgraph/src/range-factor-correction.ts)  
  - 테스트: [`clmsr-subgraph/tests/range-factor-correction.spec.ts`](../clmsr-subgraph/tests/range-factor-correction.spec.ts) – 7개 매치스틱 케이스(재현·무작위·경계·타이브레이크·핸들러 통합) 추가.
- **검증 런** (`GLOBAL_CORRECTION=1 npx tsx verification/bin-drift-timeline.ts`):
  - 최종 누적 비용 오차 `≈ $0.00`
  - 최종 루트 비율 `≈ 1.00000000`
  - 이전 서브그래프 대비 누적 range diff (`legacy`)는 `-3.43×10^34` WAD로 유지되어, 동일 데이터셋에서 교정 효과를 정량 확인.
  - 산출 결과가 `verification/data/market64/bin-drift-timeline-corrected.json`에 기록됨.
- **추가 참고**:
  - 잔차 총합(`ΣR`)은 18,403 WAD(≈ 1.8403e-14의 루트 스케일)로, 결정성 분배를 통해 루트 합이 한 번도 누락되지 않음을 확인했다.
  - 테스트/빌드 파이프라인: `npm run codegen && npm run build:citrea:prod && npm run test:citrea:prod` (33개 matchstick 테스트 전부 통과).

3. **실제 factor vs 이상적 factor**  
   - 컨트랙트 기준 bin factor (평균) : `≈ 1.0e22`  
   - 서브그래프 기준 동일 bin factor : `≈ 2.2e23`  
   - 전체 루트 합 대비 차지 비중이 **21자리 이상** 벌어져 있었으며, 이를 통해 “bin이 사실상 비어 있다”는 상태가 확인됐다.

4. **trade 926–927 chunk 분석** (`verification/inspect-trades-925-927.ts`)  
   - trade 926은 동일 구간(111000–111500)을 두 번 `CLOSE`하면서 서브그래프 대비 **2.23×10^22 WAD**만큼 값이 낮아졌고, 비용 오차가 **$2,228.26**까지 누적됐다.  
   - trade 927의 세 번의 `OPEN` chunk는 range diff를 **4.15×10^23 WAD**까지 밀어 올렸고, 마지막 chunk 기준 subgraph/actual 비율이 **4.1×10^5 배**로 폭주했다 (총 비용 오차 **$20,240.14**).

추가 지표와 그래프는 서브그래프/온체인 비교 스크립트 완성 후 문서에 추가할 예정이다.

## 6. Code Modifications to Revert (Once Investigation Completes)

1. `contracts/core/CLMSRMarketCore.sol`
   - Added `DebugTradeChunk` event and `_emitDebugTradeChunk`.
   - Emits additional logs in `_applyFactorChunked`.
2. `scripts/debug-trade-chunks.ts`
   - New script orchestrating Hardhat fork simulation.
3. `scripts/temp-market64-analysis.ts` & `scripts/temp-market64-onchain.ts`
   - Temporary utilities for data extraction.
4. `hardhat.config.ts`
   - Hardhat network `chainId = 5115`, `hardfork=cancun`. Revert to default (`31337`, previous hardfork) when done.
5. `scripts/temp-range-factors.ts`, `scripts/temp-market64-analysis.ts`, `scripts/temp-market64-inspect-trade.ts`
   - Remove before finalizing repository (or move under `/tmp`).

## 7. Files & Outputs

- `/tmp/market64_analysis.log`: Snapshot from `scripts/temp-market64-analysis.ts`.
- `scripts/temp-market64-analysis.ts`, `scripts/temp-market64-onchain.ts`: Pull data and compute theoretical vs. actual values.
- `scripts/temp-range-factors.ts`: Confirms absence of RangeFactorApplied events.
- `scripts/temp-inspect-trade.ts`: Verifies `calculateOpenCost` values before/after key transactions.
- `scripts/debug-trade-chunks.ts`: Intended for Hardhat replay; currently blocked by fork issues.
- `verification/track-worst-loss.ts`: Reconstructs per-trade bin values and checks bound breach timing.

## 8. Work Remaining

1. **Forking Issue**: Either teach Hardhat about Citrea hardfork history or switch to a provider that supports citrea forking.
2. **Chunk Logging**: Once fork works, run `scripts/debug-trade-chunks.ts`, capture `DebugTradeChunk` events, and quantify per-chunk loss.
3. **서브그래프 vs 온체인 분포 비교**: per-bin factor를 시점별로 추출해 편차가 시작된 지점과 가중치 분포를 정량화한다 (진행 중).
4. **Mitigation Plan**: After numerical proof, modify contract (e.g., dual precision accumulation, log-space arithmetic, or positive rounding on tree updates) and verify with invariants.
5. **Cleanup**: Remove temporary scripts and revert config changes prior to merge/deployment.

## 9. Quick Links

- Market data scripts: `scripts/temp-*`
- Debug replay: `scripts/debug-trade-chunks.ts`
- Core contract: `contracts/core/CLMSRMarketCore.sol`
- Lazy tree library: `contracts/libraries/LazyMulSegmentTree.sol`
- Worklog trail: `WORKLOG.md` (timestamps KST).

## 10. Contact & Next Steps

1. Resolve the Hardhat fork limitation; gather `DebugTradeChunk` outputs for trades 143065 / 143344 / 143507.
2. Verify chunk sums vs. theoretical expectations to decisively attribute the loss to rounding.
3. Draft remediation: adjust tree math, add regression tests (`test/invariant/core.roundtrip.spec.ts`), document bound enforcement.

## 11. Mitigation Candidates (Draft)

### Precision & Rounding Options

1. **Round-to-nearest on tree updates**  
   - Replace pure floor `wMul` with symmetric rounding (e.g., add `WAD / 2` before `mulDiv`).  
   - Pros: minimal storage changes, keeps leaf values closer to subgraph trajectory.  
   - Cons: needs careful auditing for overflow and for scenarios where upward rounding breaks invariants (e.g., enforcing `MAX_FACTOR`). Requires re-auditing every path that relies on flooring (cost lower-bound guarantees).

2. **Higher internal precision for tree sums**  
   - Promote `Node.sum` and `pendingFactor` maths to a wider scale (e.g., 1e27 or Q128.64) while keeping external interfaces at WAD.  
   - Pros: reduces repeated floor loss by carrying more headroom per multiplication.  
   - Cons: increases gas/storage, mandates bespoke math helpers, and introduces conversion complexity when interacting with other modules remaining on 1e18.

3. **Error-compensation buckets per node**  
   - Track residual fractions when truncating (`node.error += (a*b) % WAD`) and periodically re-inject them once they exceed a threshold.  
   - Pros: keeps existing math scale, bounds per-update drift, deterministic behaviour.  
   - Cons: Extra storage per node, careful design needed to avoid unbounded error build-up or re-entrancy during propagation.

4. **Force fine-grained flushing near hotspots**  
   - Detect when `pendingFactor` drops below/above thresholds (already present) and additionally force leaf-level propagation when magnitude crosses configurable guard bands.  
   - Pros: focuses mitigation on bins experiencing runaway chunking.  
   - Cons: Does not eliminate intrinsic rounding bias; may worsen gas cost during heavy trading.

### Verification & Regression Plan

1. **Unit tests – LazyMulSegmentTree**  
   - Add a regression under `test/unit/libraries/lazyMulSegmentTree` that replays the trade 926/927 chunk sequence and asserts post-range sums stay within ±0.1% of subgraph values.  
   - Include randomized fuzz covering alternating BUY/SELL to validate compensation logic (if we adopt error buckets).

2. **Invariant test – `core.roundtrip.spec.ts`**  
   - Extend to compute both subgraph-style (ideal) and on-chain tree sums after scripted trading, asserting cost delta `|Δ| < ε` (e.g., $10) for markets with 400 bins.  
   - Use the existing replay dataset as fixture input to guarantee regression coverage.

3. **Scripted verification pipeline**  
   - Integrate `verification/bin-drift-timeline.ts` and `verification/inspect-trades-925-927.ts` into CI docs as manual verification steps. After implementing fixes, expect ratios to remain within `[0.99, 1.01]` and per-trade cost deltas < $1.

4. **Contract audit checklist update**  
   - Document the chosen strategy (rounding vs precision) and update `docs/CONTRACT_INTEGRATION.md` to warn indexer/front-end teams about any format changes (e.g., new scaling factor).

After finishing analysis, revert config changes and remove debug events to restore contract fidelity before proceeding with fixes or deployment.
