# Signals 개발 스프린트 플랜

## 운영 루틴
- [ ] **플랜 확인**: 현재 진행 중인 스프린트의 체크박스를 살펴보고, 미완료 상태와 마지막 작업 노트를 읽는다.
- [ ] **브랜치 워크플로**: 작업 시작 전 항상 `feature/...` 등 목적이 드러나는 신규 브랜치를 `main`에서 분기하고, 모든 수정·테스트·문서를 해당 브랜치에서 완료한다.
- [ ] **워크로그 실시간 기록**: 모든 행동과 판단을 발생 즉시 `WORKLOG.md`에 남겨 작업자 간 실시간 소통을 유지한다.
- [ ] **TDD 사이클 유지**: 실패 테스트 추가 → 최소 구현 → 리팩터링/커버리지 보강 → 문서/노트 업데이트 루프를 한 번에 하나의 항목에 대해 수행한다.
- [ ] **결과 기록**: 각 태스크의 `결과 메모` 영역에 테스트 로그, 설계 결정, 파생 영향, 잔여 리스크 등 후속 작업자가 반드시 알아야 할 정보를 자세히 작성하고, 완료 시 대응 체크박스를 체크한다.
- [ ] **검증 공통**: 단위/프로퍼티 테스트, 가스/재진입/권한/업그레이드 영향, 이벤트·ABI·스토리지 호환성, SDK/Subgraph/Scripts 파생 영향까지 반드시 검토한다.
- [ ] **검토 요청**: 모든 체크리스트 완료 후 사용자에게 결과 검토를 요청하고, `WORKLOG.md`에 최종 요청 시점과 핵심 산출물을 정리한다.

## 공통 원칙
- 커밋과 브랜치 관리는 작업자의 기본 의무이며, 모든 수정은 표준 브랜치→커밋→푸시→PR 순서에 맞춰 진행한다.
- 테스트는 contracts / sdk / subgraph 전부 커버리지 보고서 확인이 기본이다.
- 가스/스토리지/업그레이드 영향이 의심되면 Hardhat 가스 리포트나 스냅샷 비교를 병행한다.
- 이벤트/ABI/스토리지 레이아웃 변경 시 반드시 하위 호환성 증명 또는 차단 근거를 문서화한다.
- SDK·Subgraph·Scripts와의 인터페이스 변경 여부를 체크하고, 영향이 있으면 해당 리포지토리 테스트를 함께 실행한다.
- 결과 체크박스 위/아래에 있는 「결과 메모」 섹션에 실행 로그, 핵심 결론, 추가 To-do를 적는다.

### 브랜치 & PR 규범
- 모든 작업은 `main`에서 분기한 목적 지향적 브랜치에서 수행하고, 완료 시까지 브랜치 전환 없이 유지한다.
- 변경 사항을 검증한 뒤에는 브랜치를 원격(origin)에 푸시하고, `gh pr create` 또는 동등한 GitHub CLI 명령으로 PR을 생성한다.
- PR 본문에는 **이유/목적**, **접근 방법(How)**, **결과·테스트(Results)**를 상세히 기술하고, 관련 로그·명령·리스크를 포함한다.
- 리뷰 요청 전 `plan.md`와 `WORKLOG.md`에 브랜치명, 테스트 결과, 남은 과제를 체계적으로 반영한다.

## 권한과 제한
- 허용: 로컬 하드햇 노드/시뮬레이션 배포, 테스트 실행, 스크립트 드라이런, view 함수 호출, 서브그래프 쿼리.
- 금지: 프로덕션 네트워크 배포/업그레이드/트랜잭션, 실계정 자금 이동, 승인되지 않은 외부 네트워크 의존 작업.
- 모든 실행 결과와 의사결정 근거는 `WORKLOG.md`에 즉시 기록한다.

## 공통 게이트: No Regression
- [ ] 모든 작업 전·후에 핵심 테스트 스위트가 그린 상태인지 확인하고, 실패 시 즉시 원인 분석 후 수정/롤백을 진행한다.
- [ ] 이벤트 시그니처, 스토리지 레이아웃, 퍼블릭 ABI 변경은 사전 합의 없이는 진행하지 않는다.
- [ ] 새로운 경고·에러·가스 급등 조짐을 발견하면 `WORKLOG.md`에 기록하고 근본 원인을 제거한다.
- [ ] 손실 상한: 무작위 시퀀스에서 Maker PnL ≤ α·ln(n) + ε가 항상 성립함을 테스트로 확인한다.
- [ ] 왕복 쐐기: 동일 범위에서 buy(q) 후 sell(q) 차이가 ≤ 1 μUSDC임을 검증한다.

## 스프린트 서술 템플릿
모든 스프린트는 아래 템플릿 항목을 채워 의사결정 흔적을 남긴다.

- **배경(Background)**: 현재 상태, 의존 코드, 제약.
- **왜(Reason / Problem)**: 해결하려는 리스크·모호성·운영 비용.
- **의도(Principles / Intent)**: 이번 스프린트에서 지키는 의사결정 원칙과 하지 않을 일.
- **목표(Goals)**: 테스트·문서·검증 조건 등 측정 가능한 산출.
- **범위(Scope) / 비범위(Non-Goals)**: 포함/제외 범위 명시.
- **구체 작업(Tasks / Issues)**: 실행 가능한 할 일(파일·함수 기준).
- **검수기준(Acceptance / DoD)**: 완료 조건 체크리스트.
- **리스크 & 롤백(Stats/Backout)**: 실패 신호, 진단 포인트, 되돌리는 방법.

## 스프린트 진행 개요
| 스프린트 | 우선순위 | 목적 요약 |
| --- | --- | --- |
| 스프린트 0 | P0 | 안전망 구축 (커버리지, 업그레이드 스냅샷) |
| 스프린트 1 | P0 | 수학·경계값 검증 |
| 스프린트 R | P0 | 라운딩 정책 전환(Nearest + 단조 가드) |
| 스프린트 2 | P0 | 거래 플로우 (open/increase/decrease/close/claim) |
| 스프린트 3 | P0 | 세그먼트 트리 릴라이어빌리티 |
| 스프린트 4 | P0 | 업그레이드/스토리지/매니저 위임 보증 |
| 스프린트 5 | P0 | 보안(재진입/DoS) 검증 |
| 스프린트 6 | P1 | SDK ↔ 컨트랙트 정합성 |
| 스프린트 7 | P1 | Subgraph 정확성·성능 |
| 스프린트 8 | P3 | 운영 스크립트 안정화 (라운딩 전환 이후) |
| 스프린트 9 | P2 | 엔드투엔드 유저 시나리오 (차단 게이트 아님) |

※ 실행 순서: 0 → 1 → R → 2 → 3 → 4 → 5 → 6 → 7 (8, 9는 라운딩 전환 안정화 이후).

아래 세부 항목들은 **미완료 상태에서 체크박스를 비워둔 채 시작**하고, 완료 후 체크한다. `결과 메모`에는 실행한 명령·테스트 로그, 설계 판단, 파생 영향, 후속 액션을 상세히 기록한다.

---

## 스프린트 0 — 안전망/도구 세팅 (P0)
**배경(Background)**: `CLMSRMarketCore`가 UUPS 업그레이드 패턴을 따르고, 수명주기 제어는 `CLMSRMarketManager`에 `delegatecall`로 위임된다. 초기화 시 USDC 6 decimals 강제, 세그먼트 트리는 `cachedRootSum`을 보존해야 한다.

**왜(Reason / Problem)**: 업그레이드/위임 구조는 강력하지만 스토리지 호환성과 회귀 위험이 높아, 최소한의 안전망 없이 변경 시 전체 시장 상태가 손상될 수 있다.

**의도(Principles / Intent)**: 회귀를 빠르게 감지하고 언제든지 롤백 가능한 가드레일을 구축한다. 이벤트/스토리지 불변성 검증을 자동화하며, 실환경 배포는 다루지 않는다.

**목표(Goals)**:
- 스프린트별 DoD 체크리스트와 공통 규칙을 리포지토리 최상위에서 공유한다.
- 업그레이드 스냅샷 테스트로 매니저 주소, `_nextMarketId` 등 핵심 필드를 비교한다.
- contracts 테스트가 커버리지 보고서를 산출하고, SDK/Subgraph 커버리지는 실패 시 원인을 기록한다.

**범위(Scope) / 비범위(Non-Goals)**:
- Scope: CI/로컬 테스트 파이프라인, 업그레이드 스냅샷 하니스, DoD 문서화.
- Non-Goals: 프로덕션 배포, 실 계정 트랜잭션, 가스 최적화 작업.

**검수기준(Acceptance / DoD)**:
- [ ] 기존 테스트 스위트 전부 그린 유지.
- [ ] 업그레이드 전/후 상태 스냅샷이 완전히 동일하며 비교 결과를 `WORKLOG.md`에 남김.
- [ ] contracts 커버리지 리포트가 생성되고 경로를 `WORKLOG.md`에 기록하며, SDK/Subgraph 커버리지 실패 시 원인을 기록한다.
- [ ] 이벤트 시그니처·스토리지 레이아웃 변화 없음 확인.

**리스크 & 롤백(Stats/Backout)**:
- CI 파이프라인이 실패하면 즉시 로컬에서 동일 명령 재현 후 마지막 통과 커밋 기준으로 재실행.
- 스냅샷 비교 실패 시 `CLMSRMarketCoreStorage` 레이아웃 변경 여부를 diff 후, 필요 시 변경 전 브랜치로 체크아웃하여 상태 복원.
- 커버리지 리포트 미생성 시 해당 테스트 명령을 개별 실행하고, 실패 원인은 `WORKLOG.md`에 기록 후 수정.

### 구체 작업(Tasks / Issues)
- [ ] **스프린트 완료 선언**: 모든 하위 태스크 완료 후 체크
- 결과 메모:
  - 진행 요약:
  - 관련 링크/로그:

### T0-1 | 커버리지/정적분석 파이프라인
- [x] `test:` 실패 테스트 추가 (contracts/sdk/subgraph 커버리지 스냅샷 검증)
- [x] `feat:` 최소 구현 (CI 워크플로, 하드햇 커버리지, TS jest --coverage, matchstick-as 실행)
- [x] `refactor:` 중복 제거·설정 정리
- [x] `docs:` 리포트 확인 방법 문서화
- [x] DoD: contracts 커버리지 리포트 생성 및 경로 기록, SDK/Subgraph 커버리지 실패 시 원인 기록
- [ ] 결과 메모 업데이트
  - 테스트 로그:
    - 2025-10-23 `NODE_OPTIONS=--max-old-space-size=8192 npm run coverage` (530 passing / 175 pending, branches 61.83% 등)  
    - 2025-10-23 `npm run coverage:check` (thresholds 모두 통과)  
    - 2025-10-23 `npm test -- --coverage` @ `clmsr-sdk` (Statements 71.6%)  
    - 2025-10-23 `npm run test:citrea:dev` @ `clmsr-subgraph` (Matchstick 33 tests)
    - 2025-10-23 `npm run test:replay` (@replay 전용 회귀, 214s)
  - 커버리지 스냅샷 경로:
    - contracts: `coverage/coverage-final.json`, `coverage/index.html`
    - sdk: `clmsr-sdk/coverage/lcov-report/index.html`
    - subgraph: `clmsr-subgraph/tests/.latest.json`
  - 추가 메모:
    - Market64 회귀 테스트를 `@replay` 태그로 분리, `npm run test:fast`/`npm run test:replay` 스크립트 신설
      - `test:fast`는 기본적으로 `RUN_REPLAY` 미설정 상태라 리플레이 스위트가 skip 되며, `test:replay`는 `RUN_REPLAY=1`로 전용 실행
    - `npm run coverage:all`로 컨트랙트/SDK/Subgraph 커버리지 일괄 실행
    - `docs/TEST_PIPELINE.md`에 테스트/커버리지 실행 및 산출물 경로 문서화
    - GitHub Actions `.github/workflows/tests.yml`에서 모든 브랜치 push마다 `test-fast` job 실행 후 `test-replay`/`coverage` job을 병렬로 실행
    - 커버리지 실행 시 리플레이 테스트 포함으로 장시간 소요 → 향후 CI 단계 분리/샘플 축소 검토 필요

### T0-2 | 업그레이드 회귀 스냅샷
- [x] `test:` Proxy → V2Mock 업그레이드 전후 snapshotState 비교 테스트
- [x] `feat:` 배포/테스트 플로우에 업그레이드 흐름 추가
- [x] `refactor:` 업그레이드 헬퍼 정리
- [x] `docs:` 스냅샷 확인 절차 기록
- [x] DoD: 업그레이드 전후 스토리지 일치(매니저 주소, _nextMarketId 등)
- [x] 결과 메모 업데이트
  - 테스트 로그:
    - 2025-10-24 `npx hardhat test test/upgrade/core.upgrade.spec.ts` (3 passing, 666ms) — 업그레이드 회귀 스냅샷 그린
  - 스냅샷 비교 요약:
    - `captureCoreSnapshot` 헬퍼로 manager/paymentToken/positionContract/_nextMarketId, 마켓 파라미터, 세그트리 합계, `calculateOpen/Increase/Decrease/Close` 뷰 결과를 업그레이드 전후 동일성 검증
    - `snapshotState` 반환값과 사전 스냅샷이 일치함을 확인하고, 업그레이드 후 신규 포지션 생성 이벤트까지 재확인
  - 추가 메모:
    - `docs/TEST_PIPELINE.md`에 업그레이드 회귀 스냅샷 절차 추가, `WORKLOG.md`에 실행 로그 기록
    - `test/upgrade/position.upgrade.spec.ts`로 CLMSRPosition 업그레이드 스냅샷/동작 검증 커버리지 추가

---

## 스프린트 1 — 수학·경계값 (P0)
**배경(Background)**: `CLMSRMarketCore._calculateTradeCostInternal`/`_calculateSellProceeds`는 대량 거래를 청크로 분할해 `MAX_CHUNKS_PER_TX` 한도를 준수하며, `LazyMulSegmentTree`는 `MIN_FACTOR`~`MAX_FACTOR` 범위를 강제하고 `cachedRootSum`을 유지한다. SDK는 `safeExp`, `fromWadRoundUp` 등 동일한 수학 유틸을 복제한다.

**왜(Reason / Problem)**: 큰 수량·넓은 범위 거래에서 오버/언더플로, 라운딩 비대칭이 발생할 수 있고, 청크 한도 초과·경계 위반 시 예외가 누락될 위험이 있다.

**의도(Principles / Intent)**: 온체인/SDK 수학을 테스트로 고정하고, 경계 조건을 명시적으로 검증한다. 가스 최적화나 새로운 수식 도입은 이번 스프린트 범위에서 제외한다.

**목표(Goals)**:
- `LazyMulSegmentTree` 범위 곱·조회가 동일 합계를 반환하고 캐시 무결성을 지킨다.
- `FixedPointMathU` 경계 입력(wLn 1e18±1, fromWadRoundUp 최소 단위)에서 올바른 라운딩 동작.
- `MAX_CHUNKS_PER_TX` 근처에서 단일 계산과 청크 계산 비용/수익이 일치하고, 가드 revert 케이스가 포착된다.
- SDK safeExp ↔ 온체인 safeExp 결과 비교 테스트 추가.

**범위(Scope) / 비범위(Non-Goals)**:
- Scope: 수학 유틸, 세그먼트 트리, 코어 비용/수익 계산, SDK 동형성 테스트.
- Non-Goals: 새로운 수학 알고리즘 도입, 가스 측정 기반 최적화, 이벤트 정의 변경.

**검수기준(Acceptance / DoD)**:
- [ ] 경계/랜덤 입력 property 테스트 100건 이상 통과(`FixedPointMathU`, `LazyMulSegmentTree`).
- [ ] 청크 분할 경로에서 단일 계산 대비 오차 ≤ 1 microUSDC.
- [ ] `MAX_CHUNKS_PER_TX`, `NoChunkProgress`, factor 범위 위반 등 네거티브 케이스 revert 메시지 일치.
- [ ] SDK와 온체인 수학 비교 테스트가 그린 유지.
- [ ] 테스트 결과와 파생 영향이 `WORKLOG.md`에 상세 기록.

**리스크 & 롤백(Stats/Backout)**:
- 수학 테스트 실패 시 마지막 통과 버전으로 코드 diff 확인 후 문제 함수 단위 롤백.
- 세그트리 캐시 불일치 시 `LazyMulSegmentTree` 관련 변경 되돌리고 baseline 대비 재테스트.
- SDK 비교 테스트 실패 시 fixtures로 문제 데이터를 고정하고, 불일치 원인을 문서화한 뒤 수정.

### 구체 작업(Tasks / Issues)
- [ ] **스프린트 완료 선언**
- 결과 메모:
  - 진행 요약:
  - 관련 링크/로그:

**검수기준(Acceptance / DoD)**:
- [ ] 손실 상한 인바리언트: 무작위 시퀀스에서 Maker PnL ≤ α·ln(n) + ε.
- [ ] 왕복 쐐기 인바리언트: 동일 범위 buy(q)→sell(q) 차이 ≤ 1 μUSDC.

### T1-1 | FixedPointMathU 경계/라운딩
- [x] `test:` 경계/무작위 100건 property 테스트 추가
- [x] `feat:` wLn, fromWadRoundUp 최소 수정
- [ ] `refactor:` 중복 수학 유틸 정리
- [ ] `docs:` 라운딩 규칙 노트 업데이트
- [x] DoD: 1e18±1 및 대규모 값 케이스 통과
- [x] 결과 메모 업데이트
  - 테스트 로그:
    - `npx hardhat test test/unit/libraries/fixedPointMath/basic.spec.ts --grep "round up conversion"` (기존 구현 실패 재현, MAX_UINT256 → 0 반환)
    - `npx hardhat test test/unit/libraries/fixedPointMath/basic.spec.ts --grep "round up conversion"` (수정 후 통과, 118ms)
    - `npx hardhat test test/unit/libraries/fixedPointMath/basic.spec.ts test/unit/libraries/fixedPointMath/exp-ln.spec.ts` (39 passing / 516ms)
  - 발견 이슈 & 해결:
    - `fromWadRoundUp`가 `MAX_UINT256` 입력에서 0을 반환해 최소 비용 가드가 붕괴 → 0 입력 분기와 감산 기반 올림 로직으로 수정.
    - `wLn` revert 경로가 PRB-Math 내부 오류에 의존 → WAD 미만 입력 시 `FP_InvalidInput` 강제.
    - 경계/랜덤 100샘플 property 테스트(라운딩/ln 비교)로 회귀 탐지 커버리지 확보.

### T1-2 | LazyMulSegmentTree 합/지연값 보존성
- [ ] `test:` rangeSum vs propagateLazy 비교, 임의 200샘플
- [ ] `feat:` 필요 시 캐시 업데이트 수정
- [ ] `refactor:` 트리 보조 함수 정리
- [ ] `docs:` 지연 전파 동작 설명
- [ ] DoD: 합 일치 및 캐시 무결성 확인
- [ ] 결과 메모 업데이트
  - 테스트 로그:
  - 추가 메모:

### T1-3 | CLMSR cost/proceeds 극값·청크 경계
- [ ] `test:` 단일 vs 청크 동등성, 가드 revert 케이스 추가
- [ ] `feat:` 경계 보정 구현
- [ ] `refactor:` exp/ln 래퍼 정리
- [ ] `docs:` 비용/수익 공식 주석 보강
- [ ] DoD: 5개 α×qty 조합 통과, 가스 회귀 문제 없음
- [ ] 결과 메모 업데이트
  - 테스트 로그:
  - 가스 측정:
  - 추가 메모:

---

## 스프린트 R — 라운딩 정책 전환(Nearest + 단조성 가드) (P0)
**배경(Background)**: 기존 라운딩은 매수/매도 경로에서 편향이 존재해 `closePosition` 누적 시 Maker 손실이 발생했다. `CLMSRMarketCore`와 `LazyMulSegmentTree`, SDK, Subgraph는 모두 WAD→USDC 변환 시 상이한 라운딩을 사용한다.

**왜(Reason / Problem)**: 편향된 내림/올림 조합이 단조성을 깨고 왕복 거래 손실을 키워 사고가 발생했다. 라운딩 정책을 통일하지 않으면 재발 가능성이 높다.

**의도(Principles / Intent)**: 모든 계층(코어/세그트리/SDK/Subgraph)에서 Nearest 라운딩과 1 μUSDC 단조성 가드를 적용해 편향을 제거한다. 프로덕션 배포는 옵트인 업그레이드 이후로 미룬다.

**목표(Goals)**:
- fromWadNearest, fromWadNearestMin1 등 라운딩 유틸 도입 및 적용.
- 매수/증가 경로는 Nearest+최소 1 μUSDC 올림, 매도/감소/청산은 Nearest 유지.
- 세그먼트 트리 `_scaleNodeSum` 등 합산 로직의 라운딩을 Nearest로 통일.
- SDK와 Subgraph가 동일 라운딩으로 동형성을 유지, 랜덤 100세트에서 오차 ≤ 1 μUSDC.
- 단조성, 손실 상한, 왕복 쐐기 인바리언트를 충족.

**범위(Scope) / 비범위(Non-Goals)**:
- Scope: 수학 유틸/코어 라운딩 변경, 청크 단조 가드, SDK/SG 보정, 섀도 로깅.
- Non-Goals: 새로운 수수료 모델, 이벤트 스키마 변경, 프로덕션 업그레이드 실행.

**검수기준(Acceptance / DoD)**:
- [ ] 모든 청크에서 매수 Σ_after ≥ Σ_before, 매도 Σ_after ≤ Σ_before.
- [ ] 왕복 쐐기: 동일 범위 buy(q)→sell(q) 차이 ≤ 1 μUSDC.
- [ ] 손실 상한: Maker PnL ≤ α·ln(n) + ε.
- [ ] SDK 비용/수익/역함수 비교에서 오차 ≤ 1 μUSDC(랜덤 100세트).
- [ ] Subgraph RangeFactor 보정 후 bin 합계 = 온체인 타깃 합계.
- [ ] Incident Replay #64가 기대 결과(손실 상한·왕복 쐐기·단조성)로 통과.
- [ ] 코어/SDK/SG 변경 사항과 섀도 로깅 결과를 `WORKLOG.md`에 기록.

**리스크 & 롤백(Stats/Backout)**:
- 섀도 계산에서 Δ가 허용 범위를 벗어나면 즉시 이전 라운딩으로 롤백 후 원인 분석.
- 단조성/손실 상한 테스트 실패 시 변경 모듈(fromWadNearest 등)을 이전 버전으로 되돌리고 fixture를 강화.
- SDK/SG 파리티 실패 시 해당 계층만 롤백 가능하도록 분리 커밋/패치를 유지.

### 구체 작업(Tasks / Issues)
- [ ] **스프린트 완료 선언**
- 결과 메모:
  - 진행 요약:
  - 관련 링크/로그:

### T R-0 | Incident Replay #64 (Gate)
- [ ] `test:` 사고 당시 입력을 fixture로 복원해 신규 라운딩 결과를 검증
- [ ] `docs:` 기존 대비 변동 폭(μUSDC)과 손실 상한 충족 여부 기록
- [ ] DoD: 손실 상한·왕복 쐐기·단조성 모두 만족
- [ ] 결과 메모 업데이트
  - 테스트 로그:
  - 이론값 비교:

### T R-1 | 라운딩 유틸 확보
- [ ] `test:` fromWadNearest/Min1, wMulNearest 단위 테스트
- [ ] `feat:` FixedPointMathU에 Nearest 계열 함수 추가
- [ ] `refactor:` 기존 라운딩 호출부 교체
- [ ] `docs:` 라운딩 정책 변경 노트 작성
- [ ] 결과 메모 업데이트
  - 테스트 로그:
  - 추가 메모:

### T R-2 | 코어 거래 경로 적용
- [ ] `test:` open/increase/decrease/close/claim에 단조 가드 추가
- [ ] `feat:` 매수 Min1 μUSDC, 매도 Nearest로 라운딩 통일
- [ ] `refactor:` 청크 루프 내 라운딩 호출 정리
- [ ] `docs:` 비용/수익 수식 업데이트
- [ ] 결과 메모 업데이트
  - 테스트 로그:
  - 추가 메모:

### T R-3 | 세그먼트 트리 & 캐시
- [ ] `test:` `_scaleNodeSum` Nearest 적용 후 합계 단조성 확인
- [ ] `feat:` pendingFactor 플러시 라운딩 교체
- [ ] `refactor:` 캐시 업데이트 경로 통합
- [ ] `docs:` 라운딩 변경 영향 설명
- [ ] 결과 메모 업데이트
  - 테스트 로그:
  - 추가 메모:

### T R-4 | SDK / Subgraph 정합화
- [ ] `test:` SDK 파리티(랜덤 100세트), Subgraph RangeFactor 합계 검증
- [ ] `feat:` SDK 라운딩/역함수 보정, Subgraph 보정 로직 업데이트
- [ ] `refactor:` 중복 라운딩 코드 제거
- [ ] `docs:` 허용 오차와 검증 절차 기록
- [ ] 결과 메모 업데이트
  - 테스트 로그:
  - 추가 메모:

---

## 스프린트 2 — 거래 흐름 (P0)
**배경(Background)**: 포지션 라이프사이클은 `openPosition`, `increasePosition`, `decreasePosition`, `closePosition`, `claimPayout`으로 이어지며, 시간 게이트·활성 상태·수수료 라운딩을 모두 통과해야 한다. 관련 테스트는 `test/integration/trading/*.spec.ts`와 `test/e2e/scenarios/*.spec.ts`에 분산되어 있다.

**왜(Reason / Problem)**: 라운딩 비대칭, 최소/최대 비용·수익 가드 미적용, 시간 게이트 우회, 이벤트 페이로드 불일치 시 이용자 자산 손실이나 이중 집계 위험이 존재한다.

**의도(Principles / Intent)**: TDD로 전체 라이프사이클 happy path와 sleepy path(경계 지연)를 모두 스냅샷화하고, 음수 경로에서 정확히 revert하도록 보장한다. 컨트랙트 외부 인터페이스 변경은 하지 않는다.

**목표(Goals)**:
- 마켓 생성→활성화→OPEN→INCREASE→DECREASE→CLOSE→SETTLE→CLAIM 전체 플로우 테스트.
- 라운딩 규칙(18→6 decimal)과 잔돈 공격 방지를 스냅샷으로 확정.
- 이벤트(`PositionOpened`, `PositionIncreased`, `PositionClosed`, `PayoutClaimed`) 페이로드 스냅샷.
- 최소 비용/최소 수익 가드, 시간·활성 게이트 네거티브 케이스 추가.

**범위(Scope) / 비범위(Non-Goals)**:
- Scope: 포지션 수명주기, 비용/수익 라운딩, 이벤트 검증, 시장 시간 게이트.
- Non-Goals: 새로운 포지션 타입 도입, 수수료 구조 변경, Subgraph 검증(별도 스프린트).

**검수기준(Acceptance / DoD)**:
- [ ] Happy path와 sleepy path 테스트가 모두 그린이며 이벤트 스냅샷이 업데이트됨.
- [ ] 최소 비용/수익 가드, 시간/활성 가드 네거티브 케이스에서 예상 revert 메시지 확인.
- [ ] 상태/잔액 변화와 이벤트 로그를 `WORKLOG.md`에 첨부.
- [ ] 가스 회귀가 없거나 허용 한도 내에 있으며, 변화가 있을 경우 이유를 기록.
- [ ] 손실 상한 인바리언트: 무작위 시퀀스에서 Maker PnL ≤ α·ln(n) + ε.
- [ ] 왕복 쐐기 인바리언트: 동일 범위 buy(q)→sell(q) 차이 ≤ 1 μUSDC.

**리스크 & 롤백(Stats/Backout)**:
- 이벤트 스냅샷 변화가 예상 밖일 경우 기존 스냅샷과 diff 후 코드 변경 되돌리기.
- 라운딩 테스트 실패 시 `FixedPointMathU` 변경 여부를 확인하고, 문제 발생 전 버전으로 롤백.
- 상태 불일치 발생 시 하드햇 로컬 노드를 재시작하고 fixture 초기화 후 재테스트.

### 구체 작업(Tasks / Issues)
- [ ] **스프린트 완료 선언**
- 결과 메모:
  - 진행 요약:
  - 관련 링크/로그:

### T2-1 | open/increase/decrease/close/claim 해피·슬리피
- [ ] `test:` 전체 시나리오 (이벤트 페이로드 포함) 추가
- [ ] `feat:` 라운딩/가드 수정 필요 시 반영
- [ ] `refactor:` 테스트 픽스처/헬퍼 정리
- [ ] `docs:` 상태/잔액 스냅샷 기록
- [ ] DoD: 단계별 상태·잔액·이벤트 스냅샷 일치
- [ ] 결과 메모 업데이트
  - 테스트 로그:
  - 이벤트 스냅샷 경로:

### T2-2 | 권한/잔고/토큰 소수점 가드
- [ ] `test:` InvalidTokenDecimals, InsufficientBalance, onlyOwner 가드 케이스
- [ ] `feat:` 가드 보강
- [ ] `refactor:` 오류 메시지 상수 정리
- [ ] `docs:` 가드 조건 문서화
- [ ] DoD: 모든 revert 메시지 일치
- [ ] 결과 메모 업데이트
  - 테스트 로그:
  - 추가 메모:

---

## 스프린트 3 — 세그먼트 트리 정확성 & 배율 한계 (P0)
**배경(Background)**: `LazyMulSegmentTree.applyRangeFactor`는 `MIN_FACTOR`(0.01×)~`MAX_FACTOR`(100×) 범위를 준수하며, 지연 전파가 `_pushPendingFactor`로 처리된다. 팩터 임계치를 넘으면 자동 플러시가 발생해야 한다.

**왜(Reason / Problem)**: 임계 범위 벗어나거나 플러시가 지연되면 루트 캐시가 오염되고, 거래 비용 계산이 왜곡된다. 틱↔bin 변환에서 경계를 잘못 처리하면 범위 포지션이 잘못 설정된다.

**의도(Principles / Intent)**: 팩터 경계와 캐시 무결성을 테스트로 보증하며, 변환 규약을 property 테스트로 고정한다. 새로운 데이터 구조 도입은 제외한다.

**목표(Goals)**:
- `applyRangeFactor`가 임계 범위 밖에서 revert하며, 플러시 임계 도달 시 자동 적용된다.
- `getRangeSum`/`propagateLazy` 경로의 합계가 일치하고, 캐시가 즉시 업데이트된다.
- `_rangeToBins`와 `_validateRange`가 하한 포함/상한 배제 규칙을 지키고, out-of-bounds를 차단한다.

**범위(Scope) / 비범위(Non-Goals)**:
- Scope: 세그먼트 트리 팩터 경계, 플러시 로직, 틱↔bin 변환 property 테스트.
- Non-Goals: 새로운 캐시 구조 설계, 가스 최적화, bin 스키마 변경.

**검수기준(Acceptance / DoD)**:
- [ ] 팩터 경계/플러시 테스트가 성공·실패 케이스 모두 그린.
- [ ] 임의 구간 200개 이상에서 합계·캐시 일치성이 보장됨.
- [ ] 틱↔bin 변환 property 테스트 1000샘플 이상 통과, 경계 revert 메시지 검증.
- [ ] 테스트 결과와 캐시 업데이트 관찰 값을 `WORKLOG.md`에 기록.
- [ ] 손실 상한 인바리언트: 무작위 시퀀스에서 Maker PnL ≤ α·ln(n) + ε.
- [ ] 왕복 쐐기 인바리언트: 동일 범위 buy(q)→sell(q) 차이 ≤ 1 μUSDC.

**리스크 & 롤백(Stats/Backout)**:
- 캐시 불일치 감지 시 `LazyMulSegmentTree` 변경 이전 상태로 롤백하고 재테스트.
- 변환 테스트 실패 시 입력 범위를 로그로 남기고, 규약 위반이 발생한 함수를 이전 버전으로 복구.
- 팩터 재적용 중 오버/언더플로 발생 시 바로 revert하도록 가드 추가, 이전 수치로 되돌릴 수 있도록 fixture 유지.

### 구체 작업(Tasks / Issues)
- [ ] **스프린트 완료 선언**
- 결과 메모:
  - 진행 요약:
  - 관련 링크/로그:

### T3-1 | Factor 경계/플러시 임계
- [ ] `test:` MIN/MAX_FACTOR 및 플러시 임계 테스트
- [ ] `feat:` pendingFactor 플러시 로직 보완
- [ ] `refactor:` 상수/로직 재사용 정리
- [ ] `docs:` 임계값 설명 추가
- [ ] DoD: 엣지 구간 합/캐시 유지
- [ ] 결과 메모 업데이트
  - 테스트 로그:
  - 추가 메모:

### T3-2 | Tick↔Bin 변환·경계
- [ ] `test:` property 테스트 1000 샘플, revert 케이스
- [ ] `feat:` 변환 함수 보정
- [ ] `refactor:` 범위 검증 헬퍼 정리
- [ ] `docs:` 변환 규약 문서화
- [ ] DoD: 변환 일관성 확보
- [ ] 결과 메모 업데이트
  - 테스트 로그:
  - 추가 메모:

---

## 스프린트 4 — 업그레이드/스토리지/매니저 위임 (P0)
**배경(Background)**: `CLMSRMarketCore`와 `CLMSRPosition`은 UUPS 업그레이드 패턴을 따르며, 핵심 스토리지는 `CLMSRMarketCoreStorage`에 정의되어 있다. 시장 라이프사이클 함수는 `CLMSRMarketManager`를 통한 `delegatecall` 기반 위임으로 동작한다.

**왜(Reason / Problem)**: delegatecall 경로가 관리자 없이 호출되거나 revert를 버블링하지 않으면 상태가 손상된다. 업그레이드 시 슬롯 배치가 변경되면 시장/포지션 상태가 파괴되며, Manager 교체 이벤트 누락 시 운영 추적이 불가능하다.

**의도(Principles / Intent)**: 모든 퍼블릭 API가 Manager 경로와 동일 결과를 제공하고, 업그레이드 전/후 상태를 자동 스냅샷 비교한다. 실 네트워크 업그레이드나 ABI 변경은 다루지 않는다.

**목표(Goals)**:
- Core API vs Manager delegatecall 비교 테스트 구현.
- Proxy→Mock 업그레이드 스냅샷 비교로 스토리지 불변성 검증.
- ManagerDirectCall, ManagerNotSet 등 네거티브 케이스 강화.
- ManagerUpdated 이벤트 체인 검증 및 문서화.

**범위(Scope) / 비범위(Non-Goals)**:
- Scope: delegatecall 흐름, 업그레이드 하니스, 스토리지 슬롯 점검, 이벤트 검증.
- Non-Goals: 실환경 업그레이드, ABI/이벤트 스키마 변경, 신규 매니저 기능 추가.

**검수기준(Acceptance / DoD)**:
- [ ] Core API와 Manager 경로 비교 테스트 그린, 직접 호출 금지 revert 확인.
- [ ] 스냅샷 비교(`snapshotState`) 결과가 완전히 일치하며 `WORKLOG.md`에 로그 첨부.
- [ ] Manager 관련 이벤트/가드가 모든 시나리오에서 기대대로 동작.
- [ ] 스토리지 레이아웃 diff가 없음을 확인하고 기록.

**리스크 & 롤백(Stats/Backout)**:
- delegatecall 테스트 실패 시 최근 변경 분(diff)을 되돌리고 기본 흐름 재테스트.
- 스토리지 비교 실패 시 Layout 리포트를 추적해 변경 내역 역추적, 필요 시 구조 변경 롤백.
- 이벤트 누락 발견 시 이벤트 정의/방출 지점을 이전 상태로 복구한 뒤 재검증.

### 구체 작업(Tasks / Issues)
- [ ] **스프린트 완료 선언**
- 결과 메모:
  - 진행 요약:
  - 관련 링크/로그:

### T4-1 | Manager delegatecall 일관성
- [ ] `test:` Core 경로 vs Manager 경로 비교 테스트
- [ ] `feat:` delegatecall 경로 보강
- [ ] `refactor:` 공통 헬퍼화
- [ ] `docs:` 호출 경로 다이어그램 업데이트
- [ ] DoD: Core API 동등성 & 직접 호출 차단 확인
- [ ] 결과 메모 업데이트
  - 테스트 로그:
  - 추가 메모:

### T4-2 | UUPS/스토리지 슬롯 안전
- [ ] `test:` 업그레이드 후 스냅샷 비교
- [ ] `feat:` 스토리지 검증 유틸 추가
- [ ] `refactor:` 스토리지 구조 주석 정리
- [ ] `docs:` 업그레이드 체크리스트 업데이트
- [ ] DoD: 시장/트리/포지션/매니저 주소 유지
- [ ] 결과 메모 업데이트
  - 테스트 로그:
  - 추가 메모:

---

## 스프린트 5 — 보안(재진입/DoS/권한) (P0)
**배경(Background)**: 포지션 API는 `ReentrancyGuard`로 보호되지만, `ReentrantPositionMock`과 `ReentrantPositionAttacker` 계약을 통해 감소/종료/청구 중 재진입을 시도할 수 있다. 거래 비용 계산은 청크 반복 구조를 사용해 `NoChunkProgress`, `MAX_CHUNKS_PER_TX` 가드를 두고 있다.

**왜(Reason / Problem)**: 재진입에 실패하면 포지션 상태가 중복 변경되거나 토큰이 이중 인출될 수 있다. 청크 루프가 전진하지 않으면 DoS가 발생하고, 권한 오용 시 자금이 유출된다.

**의도(Principles / Intent)**: 모든 재진입 벡터를 테스트로 고정하고, 루프 진행성 및 상한 가드를 포괄적으로 검증한다. 컨트랙트 인터페이스 변경은 수행하지 않는다.

**목표(Goals)**:
- ReentrantPositionMock의 각 모드(Decrease/Close/Claim/EmitBatch) 재현 및 차단.
- ReentrantPositionAttacker를 통한 openPosition 중 재진입 실패 검증.
- `NoChunkProgress`, `ChunkLimitExceeded` 등 DoS 방지 가드 테스트 추가.
- onlyOwner/권한 함수 호출 경계를 재검증.

**범위(Scope) / 비범위(Non-Goals)**:
- Scope: 재진입 테스트, 루프 가드, 권한 제약, DoS 방어 로직.
- Non-Goals: 새로운 권한 체계 설계, 가스 최적화, prod 배포.

**검수기준(Acceptance / DoD)**:
- [ ] 네 가지 재진입 모드에서 모두 예상 revert 또는 상태 무결성 유지 확인.
- [ ] 청크 루프 관련 가드 테스트가 실패 케이스를 정확히 포착.
- [ ] 권한 위반 시 revert 메시지가 정확히 일치.
- [ ] `WORKLOG.md`에 공격 시나리오, 실행 로그, 방어 작동 여부 기록.

**리스크 & 롤백(Stats/Backout)**:
- 재진입 테스트가 실패하면 마지막 안전 커밋으로 카드롤백 후 Guard 적용 지점을 재검토.
- 루프 가드 실패 시 청크 계산 변경을 이전 버전으로 복구하고, 테스트 fixture를 기록.
- 권한 테스트 실패 시 접근 제어 매크로 변경 사항을 되돌리고 재검증.

### 구체 작업(Tasks / Issues)
- [ ] **스프린트 완료 선언**
- 결과 메모:
  - 진행 요약:
  - 관련 링크/로그:

### T5-1 | 재진입 방지
- [ ] `test:` ReentrantPositionAttacker & ReentrantPositionMock 모드별 테스트
- [ ] `feat:` nonReentrant 등 방어 로직 보강
- [ ] `refactor:` 재사용 가능한 방어 헬퍼 정리
- [ ] `docs:` 재진입 방어 전략 기록
- [ ] DoD: 모든 재진입 경로 차단 및 상태 무결성
- [ ] 결과 메모 업데이트
  - 테스트 로그:
  - 추가 메모:

### T5-2 | 청크 DoS·루프 전진성
- [ ] `test:` NoChunkProgress, ChunkLimitExceeded 케이스
- [ ] `feat:` 루프 진행성 체크 보강
- [ ] `refactor:` 상수/에러 정리
- [ ] `docs:` DoS 방지 전략 문서화
- [ ] DoD: DoS 유발 입력 방어 재현
- [ ] 결과 메모 업데이트
  - 테스트 로그:
  - 추가 메모:

---

## 스프린트 6 — SDK ↔ 컨트랙트 정합성 (P1)
**배경(Background)**: `clmsr-sdk`는 Big.js 기반 계산으로 온체인 정수 연산(`safeExp`, `fromWadRoundUp`, 비용/수익 역함수)을 근사한다. JS 부동소수 연산은 라운딩 차이를 야기할 수 있다.

**왜(Reason / Problem)**: SDK와 온체인 계산이 불일치하면 사용자 견적과 실제 체결 값이 달라 UX/재정 위험이 발생한다.

**의도(Principles / Intent)**: 온체인 호출과 SDK 계산을 동일 입력 세트에서 비교해 허용 오차를 명시하고 테스트로 고정한다. SDK API 스펙 변경은 하지 않는다.

**목표(Goals)**:
- 무작위 시장 파라미터 100세트 이상에서 비용/수익/역함수 비교 테스트.
- 허용 오차(예: 1 microUSDC) 정의 및 문서화.
- 포맷팅/라운딩 util(`formatUSDC`, `fromWadRoundUp`) 동형성 검증.
- ValidationError ↔ 컨트랙트 revert 메시지 매핑 테스트.

**범위(Scope) / 비범위(Non-Goals)**:
- Scope: SDK 계산 함수, 테스트 하니스, 에러 매핑, 문서화.
- Non-Goals: SDK API 개편, 새로운 기능 추가, 배포 프로세스 변경.

**검수기준(Acceptance / DoD)**:
- [ ] 비교 테스트 전체 그린, 허용 오차 이내 불일치만 존재.
- [ ] 에러/검증 매핑 테스트 스냅샷 확보.
- [ ] 문서(`WORKLOG.md` 및 SDK docs)에 허용 오차 및 벤치 경로 기록.
- [ ] SDK 빌드/테스트 파이프라인 모두 통과.
- [ ] 손실 상한 인바리언트: 무작위 시퀀스에서 Maker PnL ≤ α·ln(n) + ε.
- [ ] 왕복 쐐기 인바리언트: 동일 범위 buy(q)→sell(q) 차이 ≤ 1 μUSDC.

**리스크 & 롤백(Stats/Backout)**:
- 비교 테스트 실패 시 해당 입력을 fixture로 고정하고 원인 분석, 필요 시 SDK 계산 변경을 이전 버전으로 롤백.
- 허용 오차 갱신이 필요하면 문서와 테스트를 함께 업데이트, 불필요한 변경은 되돌린다.
- ValidationError 매핑 실패 시 컨트랙트 에러 문자열 변경 여부 확인 후 roll back.

### 구체 작업(Tasks / Issues)
- [ ] **스프린트 완료 선언**
- 결과 메모:
  - 진행 요약:
  - 관련 링크/로그:

### T6-1 | 수식 파리티(비용/수익/역함수)
- [ ] `test:` Jest 파리티 테스트 (랜덤 100세트)
- [ ] `feat:` 안전한 exp/라운딩 일치 구현
- [ ] `refactor:` SDK 수학 유틸 정리
- [ ] `docs:` 허용 오차/검증 절차 정리
- [ ] DoD: 오차 ≤ 1 microUSDC, 랜덤 케이스 통과
- [ ] 결과 메모 업데이트
  - 테스트 로그:
  - 추가 메모:

### T6-2 | 입력 검증/에러 메시지
- [ ] `test:` 검증 케이스 & 에러 메시지 매핑
- [ ] `feat:` ValidationError ↔ 컨트랙트 에러 정렬
- [ ] `refactor:` 검사 로직 재사용화
- [ ] `docs:` 검증 케이스 표 작성
- [ ] DoD: 모든 검증 케이스 문서화 및 스냅샷 확보
- [ ] 결과 메모 업데이트
  - 테스트 로그:
  - 추가 메모:

---

## 스프린트 7 — Subgraph 정확성/성능 (P1)
**배경(Background)**: 서브그래프는 RangeFactor 보정, 시장/유저 PnL, 포인트(활동/성과/리스크)를 이벤트 핸들러에서 계산한다. 온체인 라운딩과 인덱서 정수화 간 차이가 존재할 수 있다.

**왜(Reason / Problem)**: RangeFactor 보정이 온체인 합계와 불일치하면 지표가 오염되고, 포인트 누적 로직이 깨지면 리워드 시스템이 실패한다.

**의도(Principles / Intent)**: 온체인 스냅샷과 matchstick-as 테스트로 모든 지표를 고정하고, 잔차 분배 로직을 property 테스트화한다. 스키마 변경은 이번 스프린트 범위가 아니다.

**목표(Goals)**:
- RangeFactor 보정 후 bin 합계가 targetAfter와 일치함을 50개 이상 케이스로 검증.
- 포인트/Activity 제한(일 3회), Risk Bonus(≥1h 보유) 시나리오 테스트.
- MarketStats PnL 항목(totalBetReceived 등) 일치 스냅샷.
- matchstick-as를 통한 OPEN→INCREASE→DECREASE→CLOSE→SETTLE→CLAIM 흐름 재현.

**범위(Scope) / 비범위(Non-Goals)**:
- Scope: RangeFactor 보정 로직, 포인트/PNL 계산, matchstick-as 시나리오, 문서화.
- Non-Goals: 스키마 확장, 서드파티 인덱서 통합, prod 배포.

**검수기준(Acceptance / DoD)**:
- [ ] RangeFactor 보정 테스트 50세트 이상 통과, 잔차 분배 tie-break 규칙 문서화.
- [ ] 포인트/PNL 테스트 스냅샷이 온체인 데이터와 일치.
- [ ] matchstick-as 시나리오 로그 및 스냅샷을 `WORKLOG.md`에 남김.
- [ ] 성능 회귀(실행 시간) 모니터링, 급격한 증가 시 원인 보고.
- [ ] 손실 상한 인바리언트: 무작위 시퀀스에서 Maker PnL ≤ α·ln(n) + ε.
- [ ] 왕복 쐐기 인바리언트: 동일 범위 buy(q)→sell(q) 차이 ≤ 1 μUSDC.

**리스크 & 롤백(Stats/Backout)**:
- 합계 불일치 발생 시 보정 알고리즘 변경 전 버전으로 되돌리고, 실패 케이스를 fixture로 고정.
- 포인트 규칙 테스트 실패 시 rule constant를 기존 값으로 복구 후 재검증.
- matchstick-as 실패 시 cache 정리 후 재실행, 필요 시 schema revert.

### 구체 작업(Tasks / Issues)
- [ ] **스프린트 완료 선언**
- 결과 메모:
  - 진행 요약:
  - 관련 링크/로그:

### T7-1 | 포인트·PnL 계산
- [ ] `test:` matchstick-as 시나리오 & 단위 테스트
- [ ] `feat:` 포인트 계산 로직 보강
- [ ] `refactor:` 핸들러 내부 중복 제거
- [ ] `docs:` 포인트 계산 표 업데이트
- [ ] DoD: 시나리오 + 이벤트 단위 테스트 통과
- [ ] 결과 메모 업데이트
  - 테스트 로그:
  - 추가 메모:

### T7-2 | RangeFactor 보정 — 합 일치 보장
- [ ] `test:` 무작위 50세트, 잔차 분배 극단 케이스
- [ ] `feat:` 잔차 분배 tie-break 규칙 구현
- [ ] `refactor:` 보정 로직 모듈화
- [ ] `docs:` 보정 절차 문서화
- [ ] DoD: afterSum == targetAfter 항상 성립
- [ ] 결과 메모 업데이트
  - 테스트 로그:
  - 추가 메모:

---

## 스프린트 8 — Scripts(운영 자동화) (P3)
※ 라운딩 정책 전환 및 Incident Replay 안정화 이후 착수. 현재 릴리스 차단 게이트 아님.
**배경(Background)**: 운영 스크립트(`create-market.ts`, `close-market.ts`, `deploy-susd.ts`, `compensate-susd.ts` 등)는 배포/정산/보상 같은 반복 작업을 자동화한다. 잘못된 파라미터나 잔고 부족 시 실패할 수 있다.

**왜(Reason / Problem)**: 드라이런 없이 실행하거나 사전 검증이 부족하면 실환경에서 돌이킬 수 없는 트랜잭션을 발생시킬 위험이 있다.

**의도(Principles / Intent)**: 모든 스크립트에 안전한 기본값과 드라이런 경로를 추가하고, 실행 전 체크리스트를 문서화한다. 실제 프로덕션 트랜잭션은 수행하지 않는다.

**목표(Goals)**:
- create/close market 스크립트에 시간 일관성 검사(start < end < settlement) 및 드라이런 로그 추가.
- compensate-susd에 CSV 검증, 잔고/민팅 가능 여부 확인 테스트 추가.
- 각 스크립트의 “사전 점검 체크리스트”와 예시 출력 문서화.
- 로컬 노드에서 스크립트 e2e 드라이런 시나리오 실행.

**범위(Scope) / 비범위(Non-Goals)**:
- Scope: 운영 스크립트 안전성, 드라이런 로직, 테스트/문서화.
- Non-Goals: 새로운 운영 절차 정의, 프로덕션 트랜잭션 실행, 외부 API 호출.

**검수기준(Acceptance / DoD)**:
- [ ] 드라이런 모드에서 주요 시나리오 실행 로그 확보.
- [ ] 에러 처리/사전 점검 로직 테스트 그린.
- [ ] 체크리스트와 출력 예시를 문서(`WORKLOG.md` 또는 docs)에 기록.
- [ ] 실제 실행은 로컬/테스트넷 범위에서만 수행했음을 명시.

**리스크 & 롤백(Stats/Backout)**:
- 스크립트 실패 시 안전하게 중단하고, 환경 변수를 초기화한 뒤 드라이런으로 재검증.
- CSV 파싱 오류 발생 시 입력 파일을 백업 후 필요한 부분만 수정.
- 시간 검사 실패 시 기존 스케줄링 로직으로 되돌리고, 변경 이유를 기록.

### 구체 작업(Tasks / Issues)
- [ ] **스프린트 완료 선언**
- 결과 메모:
  - 진행 요약:
  - 관련 링크/로그:

### T8-1 | create-market / close-market 드라이런·실행
- [ ] `test:` 로컬 노드 시뮬레이션 및 상태 검증
- [ ] `feat:` 스크립트 파라미터/검증 보강
- [ ] `refactor:` 공통 유틸 추출
- [ ] `docs:` 실행/드라이런 절차 문서화
- [ ] DoD: 정상/예외 케이스 로그 확인
- [ ] 결과 메모 업데이트
  - 테스트 로그:
  - 추가 메모:

### T8-2 | compensate-susd 안전성
- [ ] `test:` CSV/잔액부족/민팅 실패 등 예외 테스트
- [ ] `feat:` 에러 핸들링 및 배치 로깅
- [ ] `refactor:` 파서/검증 로직 정리
- [ ] `docs:` 드라이런 결과 샘플 기록
- [ ] DoD: 드라이런 상위 5건 출력 및 실행 로그 확보
- [ ] 결과 메모 업데이트
  - 테스트 로그:
  - 추가 메모:

---

## 스프린트 9 — E2E 시나리오 (P2)
※ 차단 게이트는 아니며, 스프린트 R/G1~G5 완료 후 확대 실행한다.
**배경(Background)**: 온체인 컨트랙트, SDK, Subgraph, 운영 스크립트가 상호작용하는 전체 유저 여정은 `test/e2e/scenarios`에 부분적으로 구현되어 있으나, 포인트와 PnL 검증이 분산되어 있다.

**왜(Reason / Problem)**: 시스템 간 데이터 불일치가 발견되면 사용자 정산/포인트 계산이 어긋나고, 회귀가 늦게 감지될 수 있다.

**의도(Principles / Intent)**: 마켓 생성부터 정산/청구까지 단일 시나리오로 연결해 모든 시스템을 동시 검증한다. 프로덕션 트랜잭션은 실행하지 않는다.

**목표(Goals)**:
- 마켓 생성→활성→유저 A OPEN/INCREASE, 유저 B OPEN, A DECREASE, 정산, A/B claim 전체 흐름 구현.
- 포지션·유저/마켓 통계, 포인트 적립, Subgraph 쿼리 스냅샷 확보.
- SDK 계산 vs 온체인 결과 비교 및 허용 오차 문서화.
- 실패 케이스를 fixture로 고정하여 회귀 방지.

**범위(Scope) / 비범위(Non-Goals)**:
- Scope: e2e 하니스, Subgraph/SDK 검증, 상태/포인트 스냅샷, 문서화.
- Non-Goals: 신규 기능 개발, prod 네트워크 테스트, 외부 서비스 통합.

**검수기준(Acceptance / DoD)**:
- [ ] E2E 시나리오 테스트 그린, 모든 스냅샷·로그를 `WORKLOG.md`에 기록.
- [ ] 포지션·통계·포인트·Subgraph 쿼리 결과가 상호 일치.
- [ ] SDK 계산과 온체인 결과 오차가 허용 범위 내.
- [ ] 실패 재현/해결 절차 문서화.

**리스크 & 롤백(Stats/Backout)**:
- 테스트 실패 시 하위 모듈 테스트로 문제를 격리하고, 변경 전 상태로 롤백 후 재검증.
- 스냅샷 불일치 시 기존 스냅샷과 diff 확인, 기대 변경이 아니면 되돌림.
- 로컬 노드 상태 오염 시 재배포·재초기화 후 시나리오 재실행.

### 구체 작업(Tasks / Issues)
- [ ] **스프린트 완료 선언**
- 결과 메모:
  - 진행 요약:
  - 관련 링크/로그:

### 시나리오 | 마켓 생성→활성→OPEN/INCREASE/DECREASE/CLOSE/SETTLE/CLAIM
- [ ] `test:` E2E 시나리오 구현 (컨트랙트 + Subgraph 검증)
- [ ] `feat:` 필요 보정 구현
- [ ] `refactor:` 시나리오 헬퍼 정리
- [ ] `docs:` 상태/포인트/통계 스냅샷 기록
- [ ] DoD: 포지션·통계·Subgraph·SDK 계산 일치
- [ ] 결과 메모 업데이트
  - 테스트 로그:
  - 스냅샷 경로:
  - 추가 메모:

---

## 작업자 참고 메모
- 스프린트 진행 순서는 우선순위를 기준으로 하지만, 병렬 가능 항목은 작업자 판단에 따라 조정할 수 있다. 단, 조정했을 경우 `WORKLOG.md`와 해당 스프린트 `결과 메모`에 순서 변경 이유를 남긴다.
- 테스트 실행 시간 절감을 위해 필요 시 `pnpm test --filter ...` 등 범위를 명시하되, 최종 DoD 충족 시 전체 스위트를 다시 실행한다.
- 외부 의존성(네트워크/서버)에 영향을 주는 스크립트는 반드시 드라이런 로그를 남기고, 실제 실행 전 팀 합의를 받는다.
- 추가 발견 이슈나 새 태스크는 `추가 메모`에 먼저 기록한 뒤, 제품 오너와 협의하여 플랜 항목으로 편입한다.
- 필요한 경우 새로운 파일/테스트/스크립트를 자율적으로 작성·실행하고, 로컬 노드 배포를 포함한 E2E 검증을 적극 수행한다.
- 모든 작업을 완결 상태까지 수행한 후 사용자에게 검토를 요청한다. 사용자가 승인 및 커밋을 처리한다.
