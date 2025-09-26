# 핵심 공식 치트시트

이 페이지는 CLMSR 핵심 공식을 빠르게 확인하기 위한 요약입니다. 세부 맥락은 [메커니즘 개요](overview)와 [안전 한계 & 파라미터](safety-parameters)를 참고하세요.

## 잠재함수와 가격

- 잠재함수: $C(q) = \alpha \ln \left( \sum_b e^{q_b / \alpha} \right)$, 여기서 $\alpha$는 유동성 파라미터, $q_b$는 밴드 $b$의 재고입니다.
- 밴드 가격: $p_b = \frac{e^{q_b / \alpha}}{\sum_j e^{q_j / \alpha}}$.
- 최대 손실: $\text{Loss}_{\max} = \alpha \ln(n)$ (`n`은 시장의 밴드 수).

## 체결 시 업데이트

- 밴드에 $\delta$만큼 매수: 모든 가중치에 $\varphi = e^{\delta / \alpha}$를 곱합니다.
- 비용: $\Delta C = \alpha \ln\left(\Sigma_{\text{after}} / \Sigma_{\text{before}}\right)$.
- 매도는 $\delta$ 부호만 반대입니다.

## 틱 매핑

- 결과 틱: $b = \mathrm{clamp}(\lfloor (\text{OutcomeRaw} - L)/s \rfloor, 0, n-1)$.
- 밴드는 반개구간 $[L + b s, L + (b+1)s)$를 사용해 겹치지 않습니다.

## 정밀도와 라운딩

- 통화 변환: 6소수 SUSD ↔ 18소수 WAD 간에는 `10^12`를 곱하거나 나눕니다.
- 라운딩 규칙:
  - 매수/증액: 올림(`fromWadRoundUp`).
  - 매도/청구: 내림(`fromWadFloor`).
  - 최소 주문 크기: $\delta_{\min} = 0.01\ \text{SUSD}$ (UI에서 enforcing 중, 컨트랙트 가드 예정).

## 세그먼트 트리 가드

- `MAX_EXP_INPUT_WAD = 1.0e18`
- `MIN_FACTOR = 0.01e18`, `MAX_FACTOR = 100e18`
- `MAX_TICK_COUNT = 1_000_000`
- `MAX_CHUNKS_PER_TX = 1_000`

보다 자세한 설명은 [메커니즘 개요](overview) 또는 [안전 한계 & 파라미터](safety-parameters)를 다시 확인하세요.
