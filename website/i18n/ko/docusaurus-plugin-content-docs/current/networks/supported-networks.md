# 네트워크 정보

Signals는 현재 Citrea Tangerine 테스트넷에서 운영됩니다. 이 페이지는 네트워크 접근과 도구를 정리하며, 전체 컨트랙트 표는 `deployments/environments/*.json`을 기반으로 한 [배포 주소](../addresses/index.md) 문서에서 확인할 수 있습니다.

## Citrea Tangerine (Chain ID 5115)

| 항목 | 값 |
| --- | --- |
| RPC | `https://rpc.testnet.citrea.xyz` |
| 익스플로러 | [explorer.testnet.citrea.xyz](https://explorer.testnet.citrea.xyz/) |
| 기본 토큰 | cBTC |
| 상태 | ✅ 운영 중 |

**Manifest**: 공식 주소와 버전 히스토리는 `deployments/environments/citrea-*.json`에 기록되어 있습니다. 트랜잭션을 전송하기 전에 `scripts/manage-manifest.ts`와 같은 헬퍼 스크립트로 최신 파일을 받아 두세요.

## 지갑 설정

```text
Network Name: Citrea Testnet
RPC URL:     https://rpc.testnet.citrea.xyz
Chain ID:    5115
Currency:    cBTC
Explorer:    https://explorer.testnet.citrea.xyz/
```

컨트랙트와 상호작용하기 전에 [공식 퍼셋](https://faucet.testnet.citrea.xyz/)에서 cBTC를 수령하세요.
