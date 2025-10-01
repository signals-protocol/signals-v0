# Citrea 배포 메모

Signals는 현재 Citrea Tangerine 테스트넷에서 운영됩니다. 이 페이지는 네트워크 구성과 변경이 적은 주소를 빠르게 참고하기 위한 자료입니다. 트랜잭션을 전송하기 전에는 항상 운영팀이 공유한 최신 정보를 다시 확인하세요.

## 네트워크 설정

| 항목 | 값 |
| --- | --- |
| RPC 엔드포인트 | `https://rpc.testnet.citrea.xyz` |
| 체인 ID | 5115 |
| 기본 토큰 | cBTC (소수 8자리) |
| 익스플로러 | [explorer.testnet.citrea.xyz](https://explorer.testnet.citrea.xyz/) |

위 정보를 MetaMask 등 EVM 지갑에 추가하면 바로 연결할 수 있습니다. 가스는 [Citrea 퍼싯](https://faucet.testnet.citrea.xyz/)에서 cBTC를 수령해 충당하세요. Signals는 가스를 보조하지 않으므로 정산이나 청구 전에 충분한 잔액을 확보해 두는 것이 안전합니다.

## 핵심 컨트랙트 주소

| 구성 요소 | 프록시 주소 | 비고 |
| --- | --- | --- |
| `CLMSRMarketCore` | `0xE480ca1C63B6dd929af1EeA4D3de1073942F3cEf` | 시장 생성·거래·정산 |
| `CLMSRPosition` | `0xB4c33Df898F8139D784ADE1aDCa9B5979898fE03` | ERC-721 범위 포지션 |
| `SUSD` 토큰 | `0xE32527F8b3f142a69278f22CdA334d70644b9743` | 소수 6자리 정산 토큰 |
| `FixedPointMathU` 라이브러리 | `0x629E255320Ab520062A07F22A8a407CFbad62025` | 공용 수학 헬퍼 |
| `LazyMulSegmentTree` 라이브러리 | `0xEB80528a819f4729a39ff5695BecE8a63F6072ae` | 지수 가중치 트리 |

구현 주소는 수시로 바뀌므로, 배포 현황은 운영팀이 안내하는 manifest나 공지를 통해 확인하세요.

## 운영 메모

- 네트워크 지연이 발생하면 자동화가 재시도합니다. 수동으로 상호작용할 때는 일시적인 RPC 오류를 감안하세요.
- 정산이 몰릴 때를 대비해 운영 지갑에 충분한 cBTC를 유지하세요.
- Citrea 점검 일정은 커뮤니티 채널에서 공지되니, 자체 자동화를 운영한다면 해당 시간 동안 중지하는 것이 안전합니다.
