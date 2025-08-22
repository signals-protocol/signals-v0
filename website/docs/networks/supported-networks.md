# Network Information

signals-v0 is deployed and operational on Citrea.

## Citrea

**Network Details:**

- **Chain ID**: 5115
- **RPC URL**: `https://rpc.testnet.citrea.xyz`
- **Block Explorer**: [Citrea Explorer](https://explorer.testnet.citrea.xyz/)
- **Native Token**: cBTC
- **Status**: ✅ Operational

**Contract Addresses:**

- **CLMSRMarketCore**: `0xE480ca1C63B6dd929af1EeA4D3de1073942F3cEf`
- **CLMSRPosition**: `0xB4c33Df898F8139D784ADE1aDCa9B5979898fE03`
- **PointsGranter**: `0x9E1265677B628A22b9C1d6f0FeCEb6241eA5268d`
- **SUSD Token**: `0xE32527F8b3f142a69278f22CdA334d70644b9743`

**Getting Test Tokens:**

1. Visit [Citrea Faucet](https://faucet.testnet.citrea.xyz/)
2. Connect wallet
3. Request cBTC tokens

## Network Requirements

### Network Requirements

- **Minimum Balance**: 0.01 cBTC
- **Recommended**: 0.1 cBTC
- **Block Time**: ~3 seconds

### RPC Configuration

For optimal performance, use these RPC endpoints:

```typescript
const rpcUrl = "https://rpc.testnet.citrea.xyz";
```

## Switching Networks

### MetaMask Setup

1. Open MetaMask
2. Click network dropdown
3. Select "Add Network"
4. Enter network details:

**Citrea Testnet:**

```
Network Name: Citrea Testnet
RPC URL: https://rpc.testnet.citrea.xyz
Chain ID: 5115
Currency Symbol: cBTC
Block Explorer: https://explorer.testnet.citrea.xyz/
```

### WalletConnect

Most Web3 wallets support these networks natively. Check your wallet's network settings.

## Performance Comparison

Citrea provides high throughput (1,000+ TPS) with fast finality (3-5 seconds) and very low transaction costs.

## Troubleshooting

### Common Issues

1. **Network Not Found**: Add network manually using RPC details above
2. **Transaction Stuck**: Check gas price and network congestion
3. **Insufficient Funds**: Use appropriate faucet for test tokens
4. **Contract Not Found**: Verify you're on the correct network
