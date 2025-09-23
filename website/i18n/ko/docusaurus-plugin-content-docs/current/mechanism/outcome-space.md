# 결과 공간과 단위

> 참고: Signals CLMSR 백서 v1.0 — §3 (Units and Ticks)

## OutcomeSpec

각 시장은 `OutcomeSpec = (L, U, s, d)`를 선언합니다.

- `L`, `U`: 오라클 원시 단위에서의 하한과 상한.
- `s`: 틱 간격(양수). 밴드 수는 `n = ceil((U - L) / s)`.
- `d`: 오라클 소수 자릿수 등 메타데이터.

오라클에서 받은 원시 값 `OutcomeRaw`를 틱 인덱스로 변환할 때는 다음과 같이 범위를 자릅니다.

$$
\displaystyle b = \mathrm{clamp}\left( \left\lfloor \frac{\text{OutcomeRaw} - L}{s} \right\rfloor , 0, n - 1 \right)
$$

모든 밴드는 반열린 구간 `[L + bs, L + (b+1)s)`로 정의되어 겹침 없이 나뉩니다.

## 단위 분리

프로토콜은 두 단위를 사용합니다.

- **CurrencyUnit (`U6`)**: 거래·정산 단위(6 decimals, SUSD).
- **OutcomeUnit**: 오라클 원시 단위(예: 8 decimals BTC 가격).

내부 연산은 WAD(18 decimals)로 수행하며, 다음과 같이 변환합니다.

```solidity
uint256 constant SCALE_DIFF = 1e12;
wad = amount6 * SCALE_DIFF;
amount6 = wad / SCALE_DIFF;
```

단위를 엄격히 분리하면 LMSR 계산이 안정적이고, 프런트엔드는 익숙한 6자리 소수로 값을 보여줄 수 있습니다.

## 최소 범위 조건

유효한 포지션은 다음 조건을 만족해야 합니다.

1. $\text{lowerTick} < \text{upperTick}$
2. $\text{upperTick} - \text{lowerTick}$이 `tickSpacing`으로 나누어떨어질 것

백서는 최소 주문 `δ_min = 0.01\ \text{SUSD}`를 권장합니다. 현재 컨트랙트는 아직 강제하지 않으므로 UI에서 경고를 표시합니다.

## 구현 상태

| 항목 | 백서 | 컨트랙트 |
| --- | --- | --- |
| 틱 맵핑 | `[L + b·s, L + (b+1)·s)` | ✅ 일치 |
| 최소 주문 | `δ_min = 0.01 SUSD` | ⚠️ 아직 미적용 |
| 단위 변환 | `× / ÷ 10^{12}` | ✅ 일치 |

최소 주문 제한이 온체인에 도입되기 전까지는 UI에서 권장 값을 안내하고, 사용자가 그보다 작게 입력하면 경고를 띄우는 것이 좋습니다.
