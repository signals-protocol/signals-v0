# Security & Testing

Signals prioritizes the security of user funds and smart contract integrity.

## Smart Contract Security

### Design Principles

- **Proven Architecture**: Based on established LMSR mathematical foundations
- **Bounded Risk**: Mathematical guarantees on maximum losses (α × ln n)
- **Upgradeability**: OpenZeppelin UUPS proxy pattern for secure upgrades
- **Access Control**: Strict role-based permissions for sensitive operations

### Security Features

- **Reentrancy Protection**: All external calls use reentrancy guards
- **Pause Mechanism**: Emergency pause functionality for critical situations
- **Input Validation**: Comprehensive bounds checking on all parameters
- **Overflow Protection**: Safe math operations throughout

### Testing

- **Unit Tests**: Comprehensive test coverage for all contract functions
- **Integration Tests**: End-to-end testing of complete user flows
- **Invariant Tests**: Property-based testing of mathematical invariants
- **Gas Analysis**: Optimization to prevent DoS through gas limit attacks

## Operational Security

### Access Controls

- **Market Creation**: Restricted to authorized operators only
- **Settlement**: Multi-signature authorization for market resolution
- **Upgrades**: Timelock and multi-signature requirements
- **Emergency Actions**: Limited to pause/unpause functionality

### Risk Management

- **Position Limits**: Maximum position sizes to prevent system abuse
- **Market Limits**: Caps on total market exposure
- **Liquidity Requirements**: Minimum liquidity parameters for market health

## Reporting Security Issues

If you discover a security vulnerability, please report it responsibly:

- **Contact**: security@signals-protocol.com
- **Response Time**: We aim to respond within 24 hours
- **Disclosure**: Coordinated disclosure after fixes are deployed

**Please do not report security issues through public GitHub issues.**

## Security Considerations for Users

### Wallet Security

- Use hardware wallets when possible
- Verify contract addresses before interacting
- Double-check transaction details before signing

### Trading Risks

- **Market Risk**: Prediction markets involve inherent price volatility
- **Settlement Risk**: Markets are settled by operators (trusted third party)
- **Liquidity Risk**: Position exit depends on market liquidity
- **Smart Contract Risk**: While tested, smart contracts may contain unknown bugs
- **Testnet Risk**: Currently running on testnet - addresses and parameters may change
- **MEV Risk**: Despite cost function path-independence, on-chain execution may face front-running/sandwich attacks

### Best Practices

- Start with small amounts to learn the interface
- Understand the market resolution criteria before trading
- Keep track of market settlement dates
- Never invest more than you can afford to lose
