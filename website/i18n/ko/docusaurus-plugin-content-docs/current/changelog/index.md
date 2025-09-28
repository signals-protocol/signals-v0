# 변경 이력

Signals는 컨트랙트 업그레이드와 문서 개정을 투명하게 기록합니다. 아래 기록은 사용자에 영향을 주는 주요 변경 사항과 운영 메모를 요약한 것입니다. 실제 주소 이력은 `deployments/environments/*.json` manifest에서 확인하세요.

## 1.1.0 — 2025-08-21

**변경 사항**
- `LazyMulSegmentTree` 라이브러리를 업그레이드해 가스 사용량을 줄이고 추가 가드를 도입했습니다.
- `CLMSRMarketCore` 구현을 교체해 정산 배치가 더 안정적으로 실행되도록 했습니다.
- `CLMSRPosition` 이벤트를 정리해 서브그래프 동기화 속도를 개선했습니다.
- `PointsGranter`의 포인트 산정 로직을 조정했습니다.

**영향**
- 대규모 시장에서도 정산 배치가 실패 없이 완료될 가능성이 높아졌습니다.
- 서브그래프 데이터가 더 빠르게 업데이트돼 대시보드 지연이 줄었습니다.

**Citrea 프로덕션 주소**
- `CLMSRMarketCore` 프록시 `0xE480ca1C63B6dd929af1EeA4D3de1073942F3cEf` → 구현 `0xb86c5f8b5b59e3f4dde9b13758ee3de3ef0f2fca`
- `CLMSRPosition` 프록시 `0xB4c33Df898F8139D784ADE1aDCa9B5979898fE03` → 구현 `0x799c0f18c004498e10f1e47631ba48055762c972`
- `PointsGranter` 프록시 `0x9E1265677B628A22b9C1d6f0FeCEb6241eA5268d` → 구현 `0x210fbc9b14b222bf0097f9862da0d4f8662084f4`

## 1.0.0 — 2025-08-14

**초기 출시**
- Citrea Testnet(체인 ID 5115)에 CLMSR 범위 시장을 최초 배포했습니다.
- Lazy Multiplicative Segment Tree 기반의 ERC 721 포지션 시스템과 포인트 프로그램을 도입했습니다.

**특징**
- 연속 Outcome 시장: 가격 범위에 베팅할 수 있으며, 메이커 손실은 $\alpha \ln n$으로 제한됩니다.
- UUPS 프록시 패턴을 사용해 업그레이드 가능하며, Pause/Unpause 같은 비상 제어를 지원합니다.

**배포 정보**
- 배포 계정: `0xe0785a8cDc92bAe49Ae7aA6C99B602e3CC43F7eD`
- 시작 블록: 14,176,879

---

자세한 변경 이력을 확인하려면 manifest diff를 함께 살펴보고, 업그레이드 절차는 [거버넌스 & 업그레이드](../governance/upgrades.md) 문서에서 확인하세요.
