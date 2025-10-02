# 핵심 공식 치트시트

CLMSR 수식을 한눈에 확인하고 싶을 때 이 페이지를 참고하세요. 각 블록은 어떤 상황에서 쓰이는지와 관련 컨트랙트 위치까지 함께 정리했습니다.

## 잠재함수, 가격, 손실 한계

- **잠재함수**: $C(q) = \alpha \ln \left( \sum_b e^{q_b / \alpha} \right)$ 가 전체 표면을 결정합니다. 보유량 $q_b$와 유동성 파라미터 $\alpha$는 WAD 정밀도로 저장됩니다.
- **빈 가격**: $p_b = e^{q_b / \alpha} / \sum_j e^{q_j / \alpha}$ 입니다. 하나의 잠재함수를 공유하므로 모든 빈 가격의 합은 항상 1입니다.
- **메이커 손실 상한**: $\text{Loss}_{\max} = \alpha \ln(n)$ (n은 빈의 수). 틱 간격이나 유동성을 조정하면 예측 가능한 방식으로 상한이 변합니다.

## 범위 거래

- **가중치 업데이트**: 범위를 $\delta$만큼 매수하면 해당 범위에 포함된 빈의 가중치가 $\varphi = e^{\delta / \alpha}$ 배가 됩니다. 매도는 $\delta$ 부호만 바꾸면 됩니다.
- **비용**: $\Delta C = \alpha \ln(\Sigma_{\text{after}} / \Sigma_{\text{before}})$ 로 계산되며, 두 시그마는 업데이트 전후의 가중치 합입니다.
- **청크 규칙**: 지수 계산은 `MAX_EXP_INPUT_WAD = 1e18`보다 작은 청크로 나눠 `(chunk/alpha) <= 1`을 유지합니다.

## 결과와 틱 매핑

- **틱 인덱스**: $b = \mathrm{clamp}(\lfloor (\text{OutcomeRaw} - L)/s \rfloor, 0, n-1)$.
- **빈 구간**: `[L + b s, L + (b+1) s)` 형태로 상단을 열어 겹침을 방지합니다.

## 정밀도와 라운딩

- **통화-WAD 변환**: SUSD 금액에 `10^12`를 곱하거나 나눠 6자리와 18자리 사이를 오갑니다.
- **라운딩 정책**:
  - 매수·증액: 올림 (`fromWadRoundUp`).
  - 매도·감액·종료·지급: 내림 (`fromWadFloor`).
  - 권장 최소 주문: $\delta_{\min} = 0.01$ SUSD (Solidity에 가드가 추가될 때까지 UI에서 enforce).

## 안전 장치

- `MAX_EXP_INPUT_WAD = 1.0e18`
- `MIN_FACTOR = 0.01e18`, `MAX_FACTOR = 100e18`
- `MAX_TICK_COUNT = 1_000_000`
- `MAX_CHUNKS_PER_TX = 1_000`

더 자세한 맥락이 필요하다면 [메커니즘 개요](overview.md), [비용 함수와 라운딩](cost-rounding.md), [안전 한계와 파라미터](safety-parameters.md)를 참고하세요.
