# Citrea Deployment Notes

Signals currently operates on the Citrea Tangerine testnet. Use this page as a quick reference for network configuration and the addresses that remain stable across releases. Always confirm the latest details shared by the operations team before broadcasting transactions.

## Network setup

| Item | Value |
| --- | --- |
| RPC endpoint | `https://rpc.testnet.citrea.xyz` |
| Chain ID | 5115 |
| Native token | cBTC (8 decimals) |
| Explorer | [explorer.testnet.citrea.xyz](https://explorer.testnet.citrea.xyz/) |

Add the network to any EVM-compatible wallet (for example MetaMask) using the table above. Request cBTC for gas from the [Citrea faucet](https://faucet.testnet.citrea.xyz/). Signals does not subsidise gas usage, so keep a small buffer before settling markets or claiming payouts.

## Core contract addresses

| Component | Proxy address | Notes |
| --- | --- | --- |
| `CLMSRMarketCore` | `0xE480ca1C63B6dd929af1EeA4D3de1073942F3cEf` | Market creation, trading, settlement |
| `CLMSRPosition` | `0xB4c33Df898F8139D784ADE1aDCa9B5979898fE03` | ERC-721 range positions |
| `SUSD` token | `0xE32527F8b3f142a69278f22CdA334d70644b9743` | 6-decimal settlement token |
| `FixedPointMathU` library | `0x629E255320Ab520062A07F22A8a407CFbad62025` | Shared math helpers |
| `LazyMulSegmentTree` library | `0xEB80528a819f4729a39ff5695BecE8a63F6072ae` | Exponential weight tree |

Implementation addresses rotate frequently. Rely on the manifest or announcements distributed by the operations team when cross-checking deployments.

## Operational reminders

- Automation may retry transactions during network hiccups. If you are interacting manually, expect occasional RPC latency and plan for transient failures.
- Keep the operations wallet funded with enough cBTC to cover settlement bursts.
- Major Citrea maintenance windows are announced in community channels—pause any custom automation until the chain stabilises.
