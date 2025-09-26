# 변경 이력

signals-v0에 가해진 주요 변경 사항을 정리합니다.

## [1.1.0] - 2025-08-21

### 변경

- 가스 효율 개선을 위해 `LazyMulSegmentTree` 라이브러리를 업그레이드했습니다.
- 성능 향상을 위해 `CLMSRMarketCore` 구현을 갱신했습니다.
- 사용자 경험을 개선하도록 `CLMSRPosition` 컨트랙트를 최적화했습니다.
- `PointsGranter` 구현을 강화했습니다.

### 컨트랙트 주소 (Citrea)

- `CLMSRMarketCore`: `0xE480ca1C63B6dd929af1EeA4D3de1073942F3cEf`
- `CLMSRPosition`: `0xB4c33Df898F8139D784ADE1aDCa9B5979898fE03`
- `PointsGranter`: `0x9E1265677B628A22b9C1d6f0FeCEb6241eA5268d`

## [1.0.0] - 2025-08-14

### 추가

- signals-v0 프로토콜을 Citrea에 최초 배포했습니다.
- CLMSR(Continuous Logarithmic Market Scoring Rule) 구현을 도입했습니다.
- 범위 기반 예측 시장을 런칭했습니다.
- ERC-721 포지션 토큰을 발행했습니다.
- 사용자 참여 포인트 시스템을 추가했습니다.
- 범위 연산 최적화를 위한 Lazy multiplicative segment tree를 적용했습니다.

### 기능

- **연속 Outcome 시장**: 이진 베팅 대신 가격 범위에 베팅할 수 있습니다.
- **한정된 위험**: 이론적으로 보장된 최대 손실 한계를 제공합니다.
- **가스 효율**: 범위 업데이트가 $O(\log n)$ 복잡도로 수행됩니다.
- **업그레이드 가능**: OpenZeppelin UUPS 프록시 패턴을 사용합니다.
- **비상 제어**: Pause/Unpause 기능을 지원합니다.

### 초기 배포 정보

- 네트워크: Citrea (Chain ID: 5115)
- 배포 계정: `0xe0785a8cDc92bAe49Ae7aA6C99B602e3CC43F7eD`
- 시작 블록: 14,176,879
