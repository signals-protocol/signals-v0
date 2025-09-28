# 네트워크 정보

Signals는 현재 Citrea Tangerine 테스트넷에서 운영됩니다. 이 문서는 연결 방법, 주소 확인 위치, 운영 모니터링 팁을 정리합니다. 컨트랙트 표는 [배포 주소](../addresses/index.md), 업그레이드 절차는 [거버넌스 & 업그레이드](../governance/upgrades.md) 문서를 참고하세요.

## Citrea Tangerine (체인 ID 5115)

| 항목 | 값 |
| --- | --- |
| RPC | `https://rpc.testnet.citrea.xyz` |
| 익스플로러 | [explorer.testnet.citrea.xyz](https://explorer.testnet.citrea.xyz/) |
| 기본 토큰 | cBTC (소수 8자리) |
| 상태 | ✅ Signals 운영팀이 상시 모니터링 |

**Manifest** — 공식 주소와 버전 이력은 `deployments/environments/citrea-*.json`에 기록됩니다. 트랜잭션을 전송하기 전에 `scripts/manage-manifest.ts` 또는 dispatcher 스크립트로 최신 파일을 내려받으세요.

## 지갑 설정

아래 정보를 MetaMask 등 EVM 지갑에 추가합니다.

```text
Network Name: Citrea Testnet
RPC URL:     https://rpc.testnet.citrea.xyz
Chain ID:    5115
Currency:    cBTC
Explorer:    https://explorer.testnet.citrea.xyz/
```

가스비용은 [공식 퍼싯](https://faucet.testnet.citrea.xyz/)에서 cBTC를 수령해 충당하세요. Signals는 가스를 보조하지 않습니다.

## Hardhat / Foundry 설정

스크립트가 올바른 RPC와 체인 ID를 사용하도록 도구 설정을 추가합니다.

```ts
// hardhat.config.ts
networks: {
  citrea: {
    chainId: 5115,
    url: "https://rpc.testnet.citrea.xyz",
    accounts: [process.env.PRIVATE_KEY!],
  },
}
```

```toml
# foundry.toml
[rpc_endpoints]
citrea = "https://rpc.testnet.citrea.xyz"

[profiles.default]
chain_id = 5115
```

## 운영 메모

- 체인 업그레이드 시 RPC 지연이 발생할 수 있습니다. Dispatcher 스크립트는 자동으로 재시도하지만, 수동 작업 시에는 일시적인 실패를 감안하세요.
- 정산 배치를 원활히 실행하려면 운영 지갑에 충분한 cBTC를 확보해 두세요.
- RPC 응답이 지연될 때는 Goldsky 서브그래프의 블록 높이와 익스플로러를 비교해 네트워크가 정상인지 확인할 수 있습니다.

Signals는 Citrea 주요 점검 일정을 커뮤니티 채널에 미리 공지합니다. 정산이나 트레이딩을 자동화하는 경우 알림을 구독해 작업을 선제적으로 중지할 수 있도록 하세요.
