# Test & Coverage Pipeline

이 문서는 `signals-v0` 리포지토리에서 테스트/커버리지 파이프라인을 수동 혹은 CI에서 실행할 때 필요한 명령과 산출물을 정리합니다.

## 실행 명령 요약

- 빠른 회귀 테스트 (리플레이 자동 제외): `npm run test:fast`
- 리플레이 회귀 (대용량 데이터 재생): `npm run test:replay`
- 전체 커버리지 파이프라인: `npm run coverage:all`

> `coverage:all`은 아래 순서를 따릅니다.
> 1. 루트 컨트랙트 테스트 커버리지 수집 (`npm run coverage`)
> 2. 커버리지 임계치 확인 (`npm run coverage:check`)
> 3. SDK 커버리지 (`npm --prefix clmsr-sdk test -- --coverage`)
> 4. Subgraph Matchstick 테스트 (`npm --prefix clmsr-subgraph run test:citrea:dev`)

## 산출물 경로

- 컨트랙트: `coverage/index.html`, `coverage/coverage-final.json`
- SDK: `clmsr-sdk/coverage/lcov-report/index.html`
- Subgraph: `clmsr-subgraph/tests/.latest.json`

## 참고 메모

- `@integration @replay` 태그가 붙은 테스트는 실행 시간이 길어 기본적으로 건너뜁니다. `test:fast`는 `RUN_REPLAY` 환경 변수를 설정하지 않으므로 해당 스위트가 자동 skip 됩니다.
- `test:replay`는 `scripts/test-replay.js`를 통해 `RUN_REPLAY=1`을 설정한 뒤 `npx hardhat test --grep @replay`를 실행합니다.
- 커버리지 실행에는 시간이 오래 걸릴 수 있으므로 CI에서는 `test:fast` → `coverage:all` 순서를 권장하며, 리플레이는 야간 혹은 전용 스텝에서 실행합니다.
- GitHub Actions 워크플로(`.github/workflows/tests.yml`)는 모든 브랜치의 push마다 `test-fast` job을 먼저 실행한 뒤, 성공 시 `test-replay`와 `coverage` job을 병렬로 실행합니다.

## 업그레이드 회귀 스냅샷

- 명령:
  - `npx hardhat test test/upgrade/core.upgrade.spec.ts`
  - `npx hardhat test test/upgrade/position.upgrade.spec.ts`
- 검증 범위:
  - UUPS 업그레이드 전후 `manager`, `_nextMarketId`, 마켓 파라미터, 세그먼트 트리 합계가 유지되는지 스냅샷 비교
  - `calculateOpenCost / IncreaseCost / DecreaseProceeds / CloseProceeds` 등 핵심 뷰 함수 결과가 동일하게 유지되는지 확인
  - 업그레이드 이후 신규 포지션 생성 등 주요 이벤트 흐름이 정상 동작하는지 확인
- 포지션 컨트랙트 업그레이드 테스트는 기존 포지션 데이터(토큰URI, 틱 범위, 수량, 소유자, 마켓 인덱스)가 동일하게 유지되는지 검증하고, 업그레이드 이후에도 `mintPosition`/`updateQuantity`/`burn` 흐름이 정상 동작하는지 확인한다.

- 테스트 성공 시 `WORKLOG.md`에 실행 시각과 로그 요약을 함께 기록한다.
