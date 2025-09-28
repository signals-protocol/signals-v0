# 빠른 시작

아래 단계를 따르면 시그널스에서 첫 번째 범위를 개설하고 청구하는 순간까지 바로 따라갈 수 있습니다. 지갑을 준비하고, 테스트 유동성을 확보하고, 실제 시장에 밴드를 배치한 뒤 정산을 체험해 보세요.

## 1단계 - 지갑 준비하기

MetaMask 등 EVM 호환 지갑을 설치한 뒤 **Citrea Tangerine Testnet** 설정을 추가합니다. 현재 배포에 맞춘 값은 다음과 같습니다.

```text
Network Name: Citrea Testnet
RPC URL:      https://rpc.testnet.citrea.xyz
Chain ID:     5115
Currency:     cBTC
Explorer:     https://explorer.testnet.citrea.xyz/
```

네트워크를 추가했다면 지갑을 Citrea로 전환해 트랜잭션이 올바른 체인으로 전송되도록 합니다.

## 2단계 - 테스트 자산 확보하기

가스용 cBTC와 스테이킹용 SUSD가 필요합니다. cBTC는 [Citrea 퍼싯](https://faucet.testnet.citrea.xyz/)에서 요청하고, SUSD는 커뮤니티 Discord에 안내된 시그널스 퍼싯을 이용하거나 Hardhat으로 직접 민팅할 수 있습니다.

```bash
npx hardhat run scripts/mint-susd.ts --network <env>
```

개발 배포본을 대상으로 하려면 `citrea-dev`, 프로덕션 테스트 시장을 쓰려면 `citrea-prod`를 선택하세요. 지갑에 두 자산이 모두 들어왔는지 확인한 뒤 다음 단계로 이동합니다.

## 3단계 - 오늘의 시장 열기

시그널스 앱을 열면 카운트다운, 차트, 리더보드가 포함된 “Bitcoin Closing Price on …” 카드가 메인 화면에 표시됩니다. 지갑을 연결하면 거래 패널에 SUSD 잔액과 시장의 틱 범위가 즉시 반영됩니다.

## 4단계 - 첫 번째 범위 배치하기

$100 단위 입력을 이용해 하한과 상한 틱을 선택해 온체인 간격과 맞춥니다. 베팅할 SUSD 수량을 입력하고 표시된 승률과 페이아웃을 확인한 뒤 트랜잭션을 승인하세요. 트랜잭션이 완료되면 CLMSR 풀이 스테이크를 차감하고 ERC-721 포지션 토큰을 지갑에 발행합니다.

## 5단계 - 정산까지 관리하기

카운트다운이 끝나기 전까지는 클릭 몇 번으로 포지션을 늘리거나 줄이거나 닫을 수 있습니다. 확률 차트와 최근 체결 스트림이 다른 참가자의 움직임을 보여 주므로, 보유를 이어갈지 범위를 회전할지 판단하는 데 도움을 줍니다. 운영 측에서 시장을 일시 중지하면 UI에 상태가 노출되고 컨트랙트가 신규 거래를 차단합니다.

## 6단계 - 페이아웃 청구하기

UTC 23:59:59 이후 운영자가 CoinMarketCap BTC/USD 종가로 시장을 정산하고 배치 정산 이벤트를 발행합니다. 인터페이스에 “Settlement events complete”가 표시되면 “My Positions” 탭에서 승리한 범위 옆 **Claim** 버튼을 눌러 즉시 수령하세요. 청구 기한은 없지만, 바로 정리하면 잔액 관리가 수월합니다.

## 다음 단계

- 더 깊은 전략은 [트레이더 가이드](../user/positions-lifecycle.md)에서 확인하세요.
- 백엔드 절차는 [정산 & 청구](../user/settlement.md) 문서에서 살펴볼 수 있습니다.
- 메커니즘 세부 사항은 [CLMSR 스펙](../mechanism/overview.md)을 통해 학습할 수 있습니다.
