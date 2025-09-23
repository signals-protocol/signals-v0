# 일일 시장 흐름 요약

시그널스는 매일 하나의 비트코인 종가 시장을 운영합니다. 아래 타임라인을 따라가면 하루가 어떻게 흘러가는지 빠르게 파악할 수 있습니다.

## 하루 일정

1. **시장 개설** – 운영자가 새로운 날짜, 틱 범위, 유동성 파라미터를 온체인에 게시하면 즉시 거래가 열립니다.
2. **거래 구간** – UTC 23:59:59까지 범위를 열고(OPEN), 늘리고(INCREASE), 줄이고(DECREASE), 닫을(CLOSE) 수 있습니다. 모든 거래는 CLMSR 잠재함수를 통해 즉시 가격을 반영합니다.
3. **정산 준비** – 하루가 끝나면 운영자가 CoinMarketCap BTC/USD 종가를 검증해 `settleMarket`을 호출합니다.
4. **배치 이벤트** – `emitPositionSettledBatch` 호출로 모든 포지션이 순차적으로 표시되어 대규모 시장도 가스 한도 안에서 완료됩니다.
5. **청구 무기한** – 승리한 포지션은 즉시 청구할 수 있으며 만료 기한이 없습니다.

더 상세한 진행 과정은 [How Signals Works](/docs/start/how-it-works) 문서에서 확인할 수 있고, 정산 파이프라인은 [Settlement Pipeline](/docs/market/settlement-pipeline)에서 심층적으로 설명합니다.
