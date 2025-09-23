# 시그널스 개요

시그널스는 Continuous LMSR(CLMSR)로 구동되는 비트코인 일일 범위 시장입니다. 기존 예측시장의 단편화 문제를 해결하고 하나의 잠재함수로 모든 확률을 유지합니다. 이 문서 모음에서는 시그널스 설계 배경, 수학적 정의, 프로토콜 보증, 그리고 트레이딩 흐름을 단계적으로 설명합니다.

## 이 문서로 할 수 있는 일

- CLMSR 메커니즘이 어떻게 가격을 정상화하고 메이커 손실을 제한하는지 이해합니다.
- 하루 시장이 생성되고 정산되는 전체 파이프라인을 살펴봅니다.
- Citrea 테스트넷에서 지갑을 연결하고 안전하게 거래하는 방법을 익힙니다.

## 추천 학습 순서

1. [왜 시그널스인가](./start/why-signals.md)에서 시장 설계 배경을 읽고, [일일 시장 흐름](./start/market-flow-overview.md)을 통해 하루 주기를 익히세요.
2. [Mechanism](./mechanism/overview.md) 섹션으로 이동해 OutcomeSpec, 비용 함수, 안전 파라미터, 핵심 수식을 순서대로 살펴보세요.
3. [Protocol](./protocol/architecture.md)과 [Security](./security/audits.md) 문서에서 상태/불변 조건과 운영 신뢰 모델을 확인하세요.
4. [Quick Start](./quickstart/index.md)와 [Trading Guides](./user/positions-lifecycle.md)를 따라 직접 시장에 참여해 보세요.

보다 자세한 수식과 증명은 [Signals CLMSR 백서](/docs/references/whitepaper)에서 확인할 수 있습니다.
