# 빠른 시작

하루 만에 시그널스 비트코인 시장을 체험해 보세요. 이 가이드는 지갑 연결부터 첫 번째 범위를 거래하고 정산하는 순간까지 순서대로 안내합니다.

## 1. 지갑과 네트워크 연결하기

1. MetaMask 등 EVM 지갑을 설치합니다.
2. **Citrea Tangerine Testnet**을 추가합니다.
   ```text
   Network Name: Citrea Testnet
   RPC URL:      https://rpc.testnet.citrea.xyz
   Chain ID:     5115
   Currency:     cBTC
   Explorer:     https://explorer.testnet.citrea.xyz/
   ```
3. 지갑 네트워크를 Citrea로 전환합니다.

## 2. 테스트 토큰 받기

- 가스비용용 cBTC는 [Citrea 공식 퍼싯](https://faucet.testnet.citrea.xyz/)에서 요청합니다.
- SUSD 테스트 토큰은 시그널스 퍼싯(커뮤니티 Discord)을 이용하거나 CLI에서 아래 명령을 실행해 민팅할 수 있습니다.
  ```bash
  npx hardhat run scripts/mint-susd.ts --network <env>
  ```
  - `citrea-dev`는 개발 배포본, `citrea-prod`는 프로덕션 테스트 시장을 의미합니다.

## 3. 오늘의 시장 입장하기

1. 시그널스 앱을 열면 “Bitcoin Closing Price on …” 카드가 보입니다. 타이머, 차트, 리더보드가 함께 표시됩니다.
2. 지갑을 연결하면 거래 패널에 SUSD 잔액이 나타납니다.

## 4. 범위와 스테이크 선택하기

1. $100 단위 입력 또는 슬라이더로 하한·상한을 설정합니다.
2. 베팅할 SUSD 수량을 입력합니다.
3. 현재 승률과 예상 페이백을 확인합니다.
4. 트랜잭션을 승인하면 즉시 SUSD가 풀에 잠깁니다.

## 5. 정산 전까지 관리하기

- 마감 전에는 언제든지 범위를 늘리거나 줄이거나 포지션을 닫을 수 있습니다.
- 확률 곡선과 최근 체결을 참고해 시장 변화를 읽어 보세요.

## 6. 정산 및 청구하기

1. UTC 23:59:59 이후 운영자가 CoinMarketCap 종가로 시장을 정산합니다.
2. “Settlement events complete” 배너가 표시되면 각 포지션 옆 **Claim** 버튼으로 즉시 수령할 수 있습니다.
3. 청구 기한은 없지만, 잊지 않도록 정산 직후 청구하는 것을 권장합니다.

## 다음 단계

- [트레이더 가이드](/docs/user/positions-lifecycle)에서 포지션 관리 전략을 더 배워 보세요.
- [정산 & 청구](/docs/user/settlement) 문서로 백엔드 절차를 이해할 수 있습니다.
- CLMSR 수학이 궁금하다면 [Mechanism](/docs/mechanism/overview) 섹션을 탐색해 보세요.
