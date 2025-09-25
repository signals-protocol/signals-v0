# 이벤트 레퍼런스

Signals 컨트랙트는 시장 라이프사이클 전 과정에 걸쳐 구조화된 이벤트를 방출합니다. 인덱서나 모니터링 잡을 구축할 때 아래 테이블을 참고하세요.

## 핵심 시장 이벤트

| 이벤트 | 발생 컨트랙트 | 목적 |
| --- | --- | --- |
| `MarketCreated(uint256 marketId, int256 minTick, int256 maxTick, int256 tickSpacing, uint256 alpha, uint64 startTimestamp, uint64 endTimestamp)` | `CLMSRMarketCore` | 새 일일 시장과 파라미터를 공지합니다. |
| `MarketSettled(uint256 marketId, int256 settlementTick, uint256 settlementValue)` | `CLMSRMarketCore` | CoinMarketCap 종가를 기반으로 시장을 정산합니다. |
| `PositionEventsProgress(uint256 marketId, uint256 processed, uint256 total, bool done)` | `CLMSRMarketCore` | 배치 정산 이벤트 진행 상황을 리포트합니다. |

## 포지션 라이프사이클 이벤트

| 이벤트 | 트리거 | 메모 |
| --- | --- | --- |
| `PositionOpened(uint256 positionId, address owner, uint256 marketId, int256 lowerTick, int256 upperTick, uint256 quantity, uint256 cost)` | `openPosition` | 포지션 NFT가 처음 발행될 때 발생하며, 비용은 CLMSR 규칙에 따라 올림 처리됩니다. |
| `PositionIncreased(uint256 positionId, uint256 quantity, uint256 cost)` | `increasePosition` | 현재 확률로 수량을 추가합니다. |
| `PositionDecreased(uint256 positionId, uint256 quantity, uint256 proceeds)` | `decreasePosition` | 현재 확률로 감소시키며, 향후 업데이트에서 내림 라운딩으로 변환될 예정입니다. |
| `PositionClosed(uint256 positionId, uint256 proceeds)` | `closePosition` | 정산 전 최종 종료이며 수량이 0이 되면 NFT를 소각합니다. |
| `PositionSettled(uint256 positionId, uint256 payout, bool won)` | `emitPositionSettledBatch` | 포지션 승패와 청구 금액을 기록합니다(현 버전은 올림, 향후 내림으로 변경 예정). |
| `PositionClaimed(uint256 positionId, address owner, uint256 payout)` | `claimPosition` | 승리 포지션이 SUSD를 돌려받고 NFT를 소각합니다. |

## 포인트 레이어 이벤트

| 이벤트 | 의미 |
| --- | --- |
| `PointsGranted(address account, uint8 reason, uint128 amount)` | `PointsGranter`가 방출하며, `reason` 코드는 1 Activity, 2 Performance, 3 Risk Bonus 입니다. |

## 서브그래프와 함께 사용하기

Goldsky에서 호스팅하는 서브그래프는 위 이벤트를 모두 미러링합니다.

- 엔드포인트는 [서브그래프 API 가이드](./subgraph)에 정리되어 있습니다.
- 주요 엔티티: `Market`, `BinState`, `UserPosition`, `Trade`, `PositionSettled`, `PositionClaimed`, `MarketStats`, `UserStats`.
- `MarketStats.unclaimedPayout` 값으로 정산 후 미청구 잔액을 추적하고, `PositionSettled` + `PositionClaimed` 조합으로 청구 상태를 파악할 수 있습니다.

추가 수식이 필요하면 [핵심 공식 치트시트](../mechanism/key-formulas)를, 트레이더 관점 설명은 [정산 & 청구](../user/settlement)를 참고하세요.
