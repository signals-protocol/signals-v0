# 배포 주소

모든 컨트랙트 주소는 `deployments/environments/` 하위 manifest에 기록됩니다. 이 페이지는 Citrea 프로덕션 배포를 요약하고, 다른 버전을 확인하는 방법을 안내합니다.

## Citrea 프로덕션 (`citrea-prod.json`)

| 구성 요소 | 프록시 | 구현 (v1.15.0) |
| --- | --- | --- |
| `CLMSRMarketCore` | `0xE480ca1C63B6dd929af1EeA4D3de1073942F3cEf` | `0xb86c5f8b5b59e3f4dde9b13758ee3de3ef0f2fca` |
| `CLMSRPosition` | `0xB4c33Df898F8139D784ADE1aDCa9B5979898fE03` | `0x799c0f18c004498e10f1e47631ba48055762c972` |
| `PointsGranter` | `0x9E1265677B628A22b9C1d6f0FeCEb6241eA5268d` | `0x210fbc9b14b222bf0097f9862da0d4f8662084f4` |
| `SUSD` 토큰 | `—` | `0xE32527F8b3f142a69278f22CdA334d70644b9743` |
| `FixedPointMathU` 라이브러리 | `—` | `0x629E255320Ab520062A07F22A8a407CFbad62025` |
| `LazyMulSegmentTree` 라이브러리 | `—` | `0xEB80528a819f4729a39ff5695BecE8a63F6072ae` |

최근 버전:

| 버전 | 타임스탬프 (UTC) | 메모 |
| --- | --- | --- |
| 1.15.0 | 2025-09-17T08:22:47Z | 라운딩 수정 준비 |
| 1.14.0 | 2025-09-15T09:01:36Z | 라이브러리 업데이트 |
| 1.13.0 | 2025-09-14T11:17:07Z | 세그먼트 트리 개선 |

## Citrea 개발망 (`citrea-dev.json`)

| 구성 요소 | 프록시 | 구현 (v1.27.0) |
| --- | --- | --- |
| `CLMSRMarketCore` | `0x971F9bcE130743BB3eFb37aeAC2050cD44d7579a` | `0xe29c0d0f41eb44b90ebf4b65a908519853c07a2f` |
| `CLMSRPosition` | `0xe163497F304ad4b7482C84Bc82079d46050c6e93` | `0x53e80a00029e9f52ea2e8d03b1e9e7498a5eb7fb` |
| `PointsGranter` | `0x59eb810fa5e7c0646902C29D9e8bfdaDf25Ce274` | `0x978b7150a89dacddb9fc81294676eed3686c1ea3` |
| `SUSD` 토큰 | `—` | `0xE32527F8b3f142a69278f22CdA334d70644b9743` |
| `FixedPointMathU` 라이브러리 | `—` | `0xB4779459E2681257d6fe64105dFd05ECA93E7b82` |
| `LazyMulSegmentTree` 라이브러리 | `—` | `0x23e01A7a1e32ff146D1851e6E64B3f261dB105bE` |

개발환경은 업그레이드가 잦으므로, 목표 버전을 정확히 확인하려면 항상 manifest를 참조하세요.

## 표를 다시 생성하는 방법

1. manifest 파일을 확인합니다.
   ```bash
   jq '.' deployments/environments/citrea-prod.json
   ```
2. 프록시/구현 주소와 버전 히스토리를 복사합니다.
3. 이 페이지와 [네트워크 정보](../networks/supported-networks.md)를 함께 업데이트합니다.

manifest는 Git으로 관리되므로 커밋 간 변경을 diff해 업그레이드를 감사할 수 있습니다. 새 업그레이드를 배포할 때는 동일한 PR에서 문서를 갱신해 통합자가 오래된 데이터를 참조하지 않도록 하세요.
