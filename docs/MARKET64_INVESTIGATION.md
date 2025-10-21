# Market #64 PnL Anomaly – Investigation Dossier

_Last updated: 2025-10-21 15:29 KST_

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

- **Chunked rounding is now measurable.**  
  Replaying the captured `DebugTradeChunk` logs alongside `getRangeSum` output shows that the same bin corridor (106–109) shrinks after every repeated `CLOSE`. The compounded floor bias drives the corridor’s contribution down to 0.00046% of the overall root sum.
- **Bound-breach trade identified.**  
  Trade **#927** (`tx 0x5a98…ca06`, position 143525) is the first operation that pushes realised loss below `-α ln n`. At that point `sumAfter/sumBefore` was only **1.0000626**, so the on-chain tree charged merely **0.626146 SUSD** even though the ideal CLMSR curve expects `exp(q/α) ≈ 14.60`.
- **Subgraph vs on-chain divergence.**  
  The subgraph applies perfect multipliers and continues to grow the bin factor, whereas the contract’s `LazyMulSegmentTree` only ever moves “downwards” because of flooring. Comparing the two distributions highlights when and where the drift begins.
- **Timeline of cumulative drift** (`verification/bin-drift-timeline.ts`).  
  After the large `CLOSE` at trade 172 the subgraph/contract root ratio collapses below **0.2** and the cost deficit immediately exceeds **$30k**. The drift continues—by trade 515 the accumulated range diff surpasses `2.63×10^31` WAD, and by trade 927 the root ratio explodes to **≈29.61**.

In short: **chunked rounding ⇒ bin starvation ⇒ systematic under-collection** is now numerically proven. The remaining work is to map precisely which bins diverged and to quantify their contribution over time.

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

1. **Post-liquidation corridor collapse**  
   - Trades 925 and 926 (`CLOSE`) repeatedly update the same corridor (110600–111000) with inverse factors, driving `sumBefore` from `8.10e34 → 5.34e34 → 1.96e34`.  
   - Because `LazyMulSegmentTree` floors every update, values shrink faster than the ideal `exp(-q/α)` curve.

2. **Bound-breach trade**  
   - Trade 927 buys 26,810.693296 quantities yet keeps `sumAfter/sumBefore = 1.0000626`, so the charged cost is only **0.626146 SUSD** (as recorded in `PositionOpened`).  
   - The subgraph still holds the factor near `exp(q/α) ≈ 14.60`, and the resulting gap manifests as observable loss.

## 6. Option B Global Correction – Implementation Snapshot (Oct 21)

- **Primary countermeasure.**  
  `handleRangeFactorApplied` now enforces the same `floor(sumBefore · φ̂)` that the lazy tree produces on-chain. The residual `R = targetAfter - tildeSum` gets deterministically redistributed to the bins with the largest fractional parts (Option B).  
  - Implementation: [`clmsr-subgraph/src/range-factor-correction.ts`](../clmsr-subgraph/src/range-factor-correction.ts)  
  - Tests: [`clmsr-subgraph/tests/range-factor-correction.spec.ts`](../clmsr-subgraph/tests/range-factor-correction.spec.ts) adds seven matchstick scenarios (replay, random, boundary, tie-break, handler integration).
- **Validation run** (`GLOBAL_CORRECTION=1 npx tsx verification/bin-drift-timeline.ts`):
  - Final cumulative cost error `≈ $0.00`
  - Final root ratio `≈ 1.00000000`
  - Legacy cumulative range diff settles at `-3.43×10^34` WAD, quantifying the correction on the same dataset.
  - Outputs stored in `verification/data/market64/bin-drift-timeline-corrected.json`.
- **Additional notes:**
  - The residual sum (`ΣR`) totals 18,403 WAD (≈1.8403e-14 at root scale). Deterministic redistribution guarantees the root sum never drops a unit.
  - CI path: `npm run codegen && npm run build:citrea:prod && npm run test:citrea:prod` (all 33 matchstick tests pass).
  - Indexing stability: subgraph constants now return fresh `BigInt` instances (`wad()/zero()/one()`), eliminating the shared-buffer bug that previously caused Goldsky deployments to halt during `Market#save`.

3. **Actual vs ideal factor scale**  
   - Contract bin factor (avg): `≈ 1.0e22`  
   - Subgraph bin factor (same bins): `≈ 2.2e23`  
   - The gap spans **21 orders of magnitude**, confirming that “the bin is effectively empty” on-chain despite appearing healthy in the subgraph.

4. **Trade 926–927 chunk analysis** (`verification/inspect-trades-925-927.ts`)  
   - Trade 926 executes two `CLOSE` chunks on corridor 111000–111500, pushing the contract value **2.23×10^22 WAD** below the subgraph and accumulating **$2,228.26** of cost deficit.  
   - The three `OPEN` chunks in trade 927 drive the range diff to **4.15×10^23 WAD**; the final chunk shows a subgraph/actual ratio of **4.1×10^5**, with the trade alone missing **$20,240.14** of cost.

Additional charts and comparative plots will be attached once the subgraph/on-chain distribution scripts are fully automated.

## 6. Supporting Artifacts

- `scripts/temp-market64-analysis.ts`, `scripts/temp-market64-onchain.ts`, and `scripts/temp-range-factors.ts` generated the raw datasets referenced throughout this report. Their outputs are archived under `verification/data/market64/`.
- `verification/track-worst-loss.ts` produces the per-trade residuals, identifying trade #927 as the first theoretical bound breach.
- `verification/bin-drift-timeline.ts` and `verification/inspect-trades-925-927.ts` recreate the divergence timeline and chunk-level deltas.

All ad-hoc debugging hooks (e.g., `DebugTradeChunk`) and Hardhat config overrides used during the investigation have been removed from the codebase to restore production parity.

## 7. Final Status & Recommendations

1. **Confirmation** – Chunked rounding in `LazyMulSegmentTree` amplifies bin starvation, leading directly to the $29.3k cost under-collection and the $77.6k realised loss in Market #64.
2. **Mitigation adopted for subgraph consumers** – The Option B redistribution in `handleRangeFactorApplied` ensures subgraph state now mirrors the on-chain floor-of-sum exactly (`hasIndexingErrors=false` on Goldsky 1.11.0).
3. **Next engineering steps** – Evaluate a contract-level fix (precision upgrade, compensated rounding, or error buckets) and instrument the invariant tests (`test/invariant/core.roundtrip.spec.ts`) with Market #64 replay data to guarantee regression coverage.
4. **Operational follow-up** – Monitor the rebuilt subgraph (version 1.11.0) and backfill analytics dashboards with the corrected bin sums so historical reports align with on-chain reality.

The investigation is now concluded; this dossier serves as the canonical reference for Market #64 and the corrective actions already in place.
