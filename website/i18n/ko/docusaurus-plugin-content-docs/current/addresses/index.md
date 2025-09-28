# 배포 주소

Signals는 환경별 주소와 버전 이력을 `deployments/environments/` 아래 manifest로 관리합니다. 이 문서는 Citrea 배포본을 빠르게 참조하기 위한 요약이며, 실제 트랜잭션을 보내기 전에 항상 manifest를 확인하세요.

## Citrea 프로덕션 (`citrea-prod.json`)

| 컴포넌트 | 프록시 | 최신 구현 | 비고 |
| --- | --- | --- | --- |
| `CLMSRMarketCore` | `0xE480ca1C63B6dd929af1EeA4D3de1073942F3cEf` | `0xb86c5f8b5b59e3f4dde9b13758ee3de3ef0f2fca` | 시장 정산 및 거래 엔트리포인트 |
| `CLMSRPosition` | `0xB4c33Df898F8139D784ADE1aDCa9B5979898fE03` | `0x799c0f18c004498e10f1e47631ba48055762c972` | ERC 721 범위 포지션 |
| `PointsGranter` | `0x9E1265677B628A22b9C1d6f0FeCEb6241eA5268d` | `0x210fbc9b14b222bf0097f9862da0d4f8662084f4` | Activity/Performance/Risk 포인트 |
| `SUSD` 토큰 | — | `0xE32527F8b3f142a69278f22CdA334d70644b9743` | 6자리 정산 토큰 |
| `FixedPointMathU` 라이브러리 | — | `0x629E255320Ab520062A07F22A8a407CFbad62025` | 공통 수학 라이브러리 |
| `LazyMulSegmentTree` 라이브러리 | — | `0xEB80528a819f4729a39ff5695BecE8a63F6072ae` | 지수 가중치 트리 |

최근 프로덕션 릴리스:

| 버전 | UTC 타임스탬프 | 요약 |
| --- | --- | --- |
| 1.15.0 | 2025-09-17T08:22:47Z | 라운딩 업데이트 준비, 가스 최적화 |
| 1.14.0 | 2025-09-15T09:01:36Z | 라이브러리 리프레시 |
| 1.13.0 | 2025-09-14T11:17:07Z | 세그먼트 트리 유지보수 |

## Citrea 개발 (`citrea-dev.json`)

| 컴포넌트 | 프록시 | 최신 구현 | 비고 |
| --- | --- | --- | --- |
| `CLMSRMarketCore` | `0x971F9bcE130743BB3eFb37aeAC2050cD44d7579a` | `0xe29c0d0f41eb44b90ebf4b65a908519853c07a2f` | 배포 전 기능 검증 환경 |
| `CLMSRPosition` | `0xe163497F304ad4b7482C84Bc82079d46050c6e93` | `0x53e80a00029e9f52ea2e8d03b1e9e7498a5eb7fb` | 프로덕션 릴리스 전 기능 미러링 |
| `PointsGranter` | `0x59eb810fa5e7c0646902C29D9e8bfdaDf25Ce274` | `0x978b7150a89dacddb9fc81294676eed3686c1ea3` | 테스트 포인트 프로그램 |
| `SUSD` 토큰 | — | `0xE32527F8b3f142a69278f22CdA334d70644b9743` | 환경 공통 |
| `FixedPointMathU` 라이브러리 | — | `0xB4779459E2681257d6fe64105dFd05ECA93E7b82` | |
| `LazyMulSegmentTree` 라이브러리 | — | `0x23e01A7a1e32ff146D1851e6E64B3f261dB105bE` | |

개발 배포는 수시로 변경되므로 항상 최신 manifest를 확인해 구현 해시가 기대값과 일치하는지 확인하세요.

## 주소 관리 팁

1. 트랜잭션을 보내기 전 manifest를 확인합니다:
   ```bash
   jq '.' deployments/environments/citrea-prod.json
   ```
2. Dispatcher 스크립트로 프록시를 업그레이드했다면 manifest와 이 페이지를 같은 PR에서 업데이트합니다.
3. 새로운 환경을 추가할 경우 (예: staging) 별도의 manifest를 만들고 동일한 형식으로 정리합니다.

네트워크 정보는 [Network Information](../networks/supported-networks.md)에서, 업그레이드 절차는 [거버넌스 & 업그레이드](../governance/upgrades.md) 문서에서 확인할 수 있습니다.
