# 시그널스 프로토콜 구조

시그널스는 단순한 트레이딩 UI가 아니라 CLMSR 기반 온체인 마켓, 일일 운영 파이프라인, 그리고 서브그래프·대시보드로 구성된 데이터 레이어가 결합된 서비스입니다. 이 문서는 각 구성 요소가 어떻게 맞물려 돌아가는지 설명합니다.

## 구성 요소 한눈에 보기

| 레이어 | 역할 | 비고 |
| --- | --- | --- |
| 스마트 컨트랙트 | CLMSR 거래 실행, 범위 NFT 발행/소각, 시장 정산, 배치 이벤트 발생 | 핵심 코드는 `contracts/core/`, 포인트 시스템은 `contracts/points/`에 위치합니다. |
| 운영 파이프라인 | 일일 시장 생성, 정산 가격 제출, 정산 배치 실행, 상태 점검 | 현재는 CLI 스크립트로 컨트랙트 메서드를 호출하며, 추후 오라클 자동화가 예정되어 있습니다. |
| 가격 수집 | CoinMarketCap BTC/USD 종가를 가져와 `settleMarket`에 전달 | 운영자가 값을 검증 후 트랜잭션을 전송하며, 타임스탬프가 온체인에 남습니다. |
| 데이터 & 분석 | 온체인 이벤트 미러링, 유저 통계·포인트·PnL 계산 | Goldsky 호스팅 서브그래프와 검증 스크립트가 체인 상태와 동기화됩니다. |
| 프런트엔드 | 실시간 시장(차트, 범위 선택, 규칙, 리더보드, 지갑 인터랙션) 제공 | Signals 앱은 ethers.js로 컨트랙트 호출, 서브그래프로 상태를 조회합니다. |

## 시장과 틱

- 매일 하나의 비트코인 종가 시장을 개설합니다.
- 틱 설정: `minTick = 100_000`, `maxTick = 140_000`, `tickSpacing = 100` → $100 범위 400개.
- 유동성 파라미터 $\alpha$는 기본 1이며, 메이커 손실은 $\alpha \times \ln n$으로 제한됩니다. 여기서 $n$은 `numberOfBins`입니다.
- 포지션은 ERC‑721 토큰으로 `marketId`, `lowerTick`, `upperTick`, `quantity`, `timestamps`를 저장합니다.

## 거래 라이프사이클

1. **Open / Increase** – `openPosition`, `increasePosition`은 `fromWadRoundUp`으로 비용을 계산해 “0원 공격”을 차단합니다.
2. **Decrease / Close** – 현재 가중치에 따라 SUSD를 돌려주며, 향후 릴리스에서 내림 라운딩으로 전환될 예정입니다.
3. **데이터 구조** – Lazy multiplicative segment tree가 각 밴드의 지수 가중치를 유지합니다(`LazyMulSegmentTree.sol`).
4. **이벤트** – 모든 거래가 서브그래프에서 사용하는 이벤트(`PositionOpened`, `PositionIncreased`, …)를 발생시킵니다.

## 일일 운영

- **시장 생성** – 운영자가 틱 범위·타임스탬프·유동성 파라미터를 제출하면 코어 컨트랙트가 `marketId`를 증가시키고 트리를 초기화합니다.
- **모니터링** – 상태 점검 스크립트가 트리 합계, 일시정지 상태, 불변 조건을 확인해 시장이 안전한지 검증합니다.
- **정산** – 종가 확인 후 `settleMarket`을 호출하고, 가격은 마이크로 SUSD 단위로 입력합니다.
- **배치 이벤트** – 이후 `emitPositionSettledBatch(limit)`를 반복 호출해 `done = true`가 될 때까지 모든 포지션을 표시합니다.

(로드맵: CMC 데이터 수집을 자동화하고 오라클을 연동해 신뢰를 최소화할 계획입니다.)

## 데이터 서피스

- **서브그래프** – `clmsr-subgraph`는 dev/prod 배포본을 유지하며, 주요 엔티티는 `Market`, `BinState`, `MarketStats`, `UserPosition`, `Trade`, `UserStats`, `PositionSettled`, `PositionClaimed`입니다.
- **포인트 시스템** – `PointsGranter`가 Activity/Performance/Risk Bonus 이유 코드를 가진 이벤트를 발생시키고, 서브그래프는 하루 Activity 포인트(최대 3회)와 보유 시간 기반 보너스를 계산합니다.

## 프런트엔드 상태 흐름

- `signals-app/src/components/features/main`의 `MainProvider`는 `useBTCState`, `useChart`, `usePrediction`, `useAction` 훅을 조합해 범위 선택·차트·모달이 동일한 상태를 공유합니다.
- 레이아웃은 앱과 동일하게 제목·카운트다운, 차트, 규칙, 범위 카드, 입력 위젯, 리더보드, My Positions 순서를 따릅니다.
- 거래가 완료되면 `PredictionSuccessModal`이 컨트랙트와 동일한 수학을 기반으로 페이백 정보를 표시합니다.

## 상호 작용 흐름 요약

1. 사용자는 웹 앱을 통해 ethers.js로 코어 컨트랙트를 호출하고, 서브그래프에서 잔액·포지션을 조회합니다.
2. 운영 스크립트는 시장 생성 및 정산을 담당해 온체인 상태를 최신으로 유지합니다.
3. 서브그래프는 거래 및 운영 이벤트를 수집해 리더보드, 포인트, 분석 지표를 계산합니다.
4. 앱의 리더보드와 포인트 UI는 이 데이터를 실시간으로 반영합니다.

## 추가 문서

- [Mechanism](../mechanism/overview.md) – CLMSR 수학과 라운딩 규칙.
- [Security & Testing](../security/audits.md) – 안전 장치, 테스트 커버리지, 로드맵.
- [Governance](../governance/parameters.md) – 현재 권한 구조와 업그레이드 절차.

추가 질문이 있다면 시그널스 팀에 문의해주세요. 스크립트, 컨트랙트, 서브그래프를 단계별로 가이드해 드립니다.
