# 안전 한계와 파라미터

> 참고: Signals CLMSR 백서 v1.0 — §7–§11, Appendix B

## 손실 한계

메이커의 최악 손실은 다음과 같습니다.

$$
\text{Loss}_{\max} = \alpha \ln(n)
$$

여기서 $\alpha$는 유동성 파라미터, $n$은 밴드 수입니다. 틱 간격을 좁힐수록 $n$이 늘어나 손실 한계도 커지므로, 위험 허용 범위에 맞게 $\alpha = \text{Loss}_{\text{target}} / \ln(n)$을 선택해야 합니다.

## 세그먼트 트리 가드

Lazy 곱셈은 보수적인 상수로 안전 장치를 적용합니다.

| 상수 | 목적 | 값 |
| --- | --- | --- |
| `MAX_EXP_INPUT_WAD` | 지수 계산 입력 한도 | `1.0e18` |
| `MIN_FACTOR` | 허용되는 최소 곱셈 계수 | `0.01e18` |
| `MAX_FACTOR` | 허용되는 최대 곱셈 계수 | `100e18` |
| `FLUSH_THRESHOLD` | 대기 중인 계수를 강제 전파 | `1e21` |
| `MAX_TICK_COUNT` | 밴드 최대 개수 | `1,000,000` |
| `MAX_CHUNKS_PER_TX` | 한 트랜잭션당 최대 청크 수 | `1,000` |

Solidity 라이브러리도 동일한 상수를 강제하며, 범위를 벗어나면 명시적인 오류(`CE.InvalidFactor`, `CE.BinCountExceedsLimit` 등)와 함께 트랜잭션이 revert됩니다.

## 정산 규율

- `block.timestamp ≥ settlementTimestamp`(또는 지정하지 않았다면 `endTimestamp`)가 되기 전에는 정산할 수 없습니다.
- 정산 틱은 `[minTick, maxTick]` 범위 안으로 클램프됩니다.
- `emitPositionSettledBatch`를 사용해 포지션을 배치로 처리하므로 큰 시장도 가스 한도 내에서 정리됩니다.

## 구현 현황

| 항목 | 백서 | 컨트랙트 |
| --- | --- | --- |
| 위 상수들 | 규범값 | ✅ `LazyMulSegmentTree.sol`, `CLMSRMarketCore.sol`과 일치 |
| 청구 기한 | 명시 없음 | 가용 기한 없음 (예전 문서의 “90일” 표현은 제거) |
| 멀티시그·타임락 | 명시 없음 | 현재는 `Ownable` 단일 운영자 |

추후 거버넌스 레이어(타임락, 멀티시그 등)가 추가되면 CLMSR 메커니즘 변경이 아닌 확장 문서로 별도 안내할 예정입니다.
