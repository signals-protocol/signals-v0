# 이벤트 레퍼런스

Signals는 시장 라이프사이클의 모든 단계에서 구조화된 이벤트를 발생시킵니다. 인덱서나 분석 파이프라인을 구축할 때 각 이벤트가 의미하는 바와 안전하게 소비하는 방법을 이해하기 위해 이 가이드를 활용하세요.

## 핵심 시장 이벤트

- **`MarketCreated(uint256 marketId, int256 minTick, int256 maxTick, int256 tickSpacing, uint256 alpha, uint64 startTimestamp, uint64 endTimestamp)`** — 일일 시장이 생성될 때 발생합니다. 결과 그리드와 거래 창을 기록하므로, 인덱서는 거래가 도착하기 전에 파생 엔티티를 준비할 수 있습니다.
- **`MarketSettled(uint256 marketId, int256 settlementTick, uint256 settlementValue)`** — 지정된 기준 가격이 검증돼 제출된 직후 발생합니다. 값은 설정된 틱 범위로 클램프되며, 다운스트림 서비스는 틱만으로도 페이아웃을 재계산할 수 있습니다.

## 포지션 라이프사이클 이벤트

- **`PositionOpened(uint256 positionId, address owner, uint256 marketId, int256 lowerTick, int256 upperTick, uint256 quantity, uint256 cost)`** — 새로운 ERC 721 포지션 토큰이 발행될 때 한 번 발생합니다. 비용은 CLMSR 규칙에 따라 올림 처리되어 모든 포지션에 실질적인 자본이 남습니다.
- **`PositionIncreased(uint256 positionId, uint256 quantity, uint256 cost)`** — 현재 확률 표면에서 노출을 추가합니다. 수량과 비용은 오픈 이벤트와 동일한 라운딩 규칙을 따릅니다.
- **`PositionDecreased(uint256 positionId, uint256 quantity, uint256 proceeds)`** — 일부 노출을 줄이고 현재 확률에 따라 SUSD를 반환합니다. 향후 릴리스에서는 수익을 내림 라운딩해 백서와 일치시킬 예정입니다.
- **`PositionClosed(uint256 positionId, uint256 proceeds)`** — 정산 전에 완전히 종료할 때 발생하며, 수량이 0이 되면 토큰이 소각됩니다.
- **`PositionSettled(uint256 positionId, uint256 payout, bool won)`** — 정산이 완료될 때 발생합니다. 밴드가 승리했는지와 청구 가능한 금액을 기록합니다.
- **`PositionClaimed(uint256 positionId, address owner, uint256 payout)`** — 사용자가 `claimPayout`을 호출할 때 발생하며, SUSD가 반환되고 토큰이 소각됩니다.

## 포인트 및 인센티브

- **`PointsGranted(address account, uint8 reason, uint128 amount)`** — `PointsGranter`가 발행합니다. `reason` 코드: 1 = Activity, 2 = Performance, 3 = Risk Bonus. 오프체인 프로그램은 이 이벤트를 집계해 리더보드나 보상을 운영할 수 있습니다.

## 서브그래프와의 연동

Goldsky가 호스팅하는 서브그래프는 위 이벤트를 모두 인덱싱합니다. 주목할 엔티티는 다음과 같습니다.
- `Market`, `BinState`, `MarketStats` — 시장 구성과 헬스 메트릭.
- `UserPosition`, `Trade`, `UserStats` — 트레이더 단위 분석.
- `PositionSettled`, `PositionClaimed` — 미청구 포지션 모니터링. `MarketStats.unclaimedPayout`과 함께 사용하면 의무 금액을 추적할 수 있습니다.

엔드포인트와 쿼리 예시는 [서브그래프 API 가이드](./subgraph.md)에서 확인하세요. 과거 데이터를 재생할 때는 `marketId`, `positionId` 기준으로 페이지네이션해 이벤트 누락 없이 히스토리를 확보하세요.

## 처리 팁

- 확률이나 페이아웃을 계산할 때는 SDK 헬퍼(`clmsr-sdk/src/utils/math.ts`)를 사용해 온체인 라운딩과 일관성을 유지하세요.
- 분석 데이터 저장 시 블록 타임스탬프와 번호를 함께 기록하면 manifest, Dispatcher 로그와의 대조가 쉬워집니다.

관련 수식은 [핵심 공식 치트시트](../mechanism/key-formulas.md)에서 확인할 수 있고, 트레이더 관점의 설명은 [정산 & 청구](../user/settlement.md) 문서를 참고하세요.
