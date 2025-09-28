# 안전 한계와 파라미터

> 참고: Signals CLMSR 백서 v1.0 -- §7-§11, Appendix B

이 장은 시그널스를 예측 가능한 상태로 유지하는 안전장치를 정리합니다. 운영자는 새 시장을 설정할 때 체크리스트로 활용하고, 감사자는 각 상수가 온체인에서 어떻게 강제되는지 확인할 수 있습니다.

## 메이커 손실 한계

CLMSR 메이커의 최악 손실은 다음과 같습니다.

$$
\text{Loss}_{\max} = \alpha \ln(n)
$$

여기서 $\alpha$는 유동성 파라미터, $n$은 밴드 수입니다. 틱 간격을 좁혀 밴드를 늘리면 한계가 커지므로, 운영자는 `alpha = Loss_target / ln(n)` 값을 선택해 재무 한도에 맞춰야 합니다. 손실 공식이 $\alpha$와 $n$만 바라보므로 시장을 배포하기 전에 상한선을 예측할 수 있습니다.

## Lazy segment tree 내부 가드

지수 연산을 다루는 lazy 곱셈은 다음과 같은 보수적 상수로 보호됩니다.

| 상수 | 목적 | 값 |
| --- | --- | --- |
| `MAX_EXP_INPUT_WAD` | 청크당 지수 입력 한도 | `1.0e18` |
| `MIN_FACTOR` | 업데이트 시 허용되는 최소 곱셈 계수 | `0.01e18` |
| `MAX_FACTOR` | 업데이트 시 허용되는 최대 곱셈 계수 | `100e18` |
| `FLUSH_THRESHOLD` | 대기 중 계수를 강제 전파하는 임계치 | `1e21` |
| `MAX_TICK_COUNT` | 지원 가능한 최대 밴드 수 | `1,000,000` |
| `MAX_CHUNKS_PER_TX` | 호출당 지수 청크 상한 | `1,000` |

`LazyMulSegmentTree.sol`은 백서와 동일한 값을 강제합니다. 범위를 벗어나면 `CE.InvalidFactor`, `CE.BinCountExceedsLimit` 같은 명시적 오류와 함께 즉시 revert되므로 문제를 추적하기 쉽습니다.

## 정산 규율

- `settleMarket`는 `block.timestamp`가 설정된 `settlementTimestamp`(또는 별도 지정이 없다면 `endTimestamp`)에 도달하기 전에는 실행되지 않습니다.
- 제출된 정산 값은 `[minTick, maxTick]` 범위로 클램프돼 이상값에서 풀을 보호합니다.
- 포지션 정산은 `emitPositionSettledBatch`를 통해 진행되어 수천 개의 밴드가 남아 있어도 가스 한도를 유지합니다.

## 구현 현황

| 항목 | 백서 | 컨트랙트 |
| --- | --- | --- |
| 위 상수들 | 규범값 | ✅ `LazyMulSegmentTree.sol`, `CLMSRMarketCore.sol`과 일치 |
| 청구 기한 | 명시 없음 | 기한 없음 (예전 “90일” 안내 제거) |
| 타임락·멀티시그 | 범위 외 | 현재는 `Ownable`; 향후 거버넌스 래퍼는 별도 문서로 안내 |

새로운 거버넌스 제어나 오라클 소스가 도입되면 기본 스펙 위에 확장 형태로 문서화됩니다. 손실 한계, 청크 한도, 라운딩 규칙 등 CLMSR 메커니즘 자체는 변하지 않습니다.
