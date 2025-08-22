# Changelog

All notable changes to signals-v0 will be documented in this file.

## [1.1.0] - 2025-08-21

### Changed

- Upgraded LazyMulSegmentTree library for improved gas efficiency
- Updated CLMSRMarketCore implementation for enhanced performance
- Optimized CLMSRPosition contract for better user experience
- Enhanced PointsGranter implementation

### Contract Addresses (Citrea)

- CLMSRMarketCore: `0xE480ca1C63B6dd929af1EeA4D3de1073942F3cEf`
- CLMSRPosition: `0xB4c33Df898F8139D784ADE1aDCa9B5979898fE03`
- PointsGranter: `0x9E1265677B628A22b9C1d6f0FeCEb6241eA5268d`

## [1.0.0] - 2025-08-14

### Added

- Initial deployment of signals-v0 protocol on Citrea
- CLMSR (Continuous Logarithmic Market Scoring Rule) implementation
- Range-based prediction markets
- ERC-721 position tokens
- Points system for user engagement
- Lazy multiplicative segment tree for efficient range operations

### Features

- **Continuous Outcome Markets**: Bet on price ranges instead of binary outcomes
- **Bounded Risk**: Mathematical guarantees on maximum losses
- **Gas Efficient**: O(log n) complexity for range updates
- **Upgradeability**: OpenZeppelin UUPS proxy pattern
- **Emergency Controls**: Pause/unpause functionality

### Initial Deployment

- Network: Citrea (Chain ID: 5115)
- Deployer: `0xe0785a8cDc92bAe49Ae7aA6C99B602e3CC43F7eD`
- Start Block: 14,176,879
