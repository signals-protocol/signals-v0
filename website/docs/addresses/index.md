# Contract Addresses

All contracts are deployed on **Citrea Testnet** using the OpenZeppelin Proxy pattern for upgradeability.

> ⚠️ **Testnet Notice**: These are testnet addresses and may change. Contracts have no real asset value.

## Citrea Testnet (Tangerine)

| Contract Type | Contract Name   | Proxy Address                                | Implementation                               | Explorer                                                                                                  |
| ------------- | --------------- | -------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Core**      | CLMSRMarketCore | `0xE480ca1C63B6dd929af1EeA4D3de1073942F3cEf` | `0x86a7b43846bf2440c3514957766824220b260822` | [Citrea Explorer](https://explorer.testnet.citrea.xyz/address/0xE480ca1C63B6dd929af1EeA4D3de1073942F3cEf) |
| **Core**      | CLMSRPosition   | `0xB4c33Df898F8139D784ADE1aDCa9B5979898fE03` | `0x50f722d84ddfe05bc8a72394e63cf31b45863138` | [Citrea Explorer](https://explorer.testnet.citrea.xyz/address/0xB4c33Df898F8139D784ADE1aDCa9B5979898fE03) |
| **Points**    | PointsGranter   | `0x9E1265677B628A22b9C1d6f0FeCEb6241eA5268d` | `0xae0ca6d58bd38b6190c1a0fb50b6652a2792e186` | [Citrea Explorer](https://explorer.testnet.citrea.xyz/address/0x9E1265677B628A22b9C1d6f0FeCEb6241eA5268d) |
| **Token**     | SUSD            | `0xE32527F8b3f142a69278f22CdA334d70644b9743` | N/A                                          | [Citrea Explorer](https://explorer.testnet.citrea.xyz/address/0xE32527F8b3f142a69278f22CdA334d70644b9743) |

## Libraries

| Library                | Address                                      |
| ---------------------- | -------------------------------------------- |
| **FixedPointMathU**    | `0x629E255320Ab520062A07F22A8a407CFbad62025` |
| **LazyMulSegmentTree** | `0xc7DF847fD0A01f74b84d8dE5778f0CD168E39189` |

## Deployment Information

- **Current Version**: 1.1.0 (Testnet)
- **Last Updated**: August 21, 2025
- **Network**: Citrea Testnet (Chain ID 5115)
- **Deployer**: `0xe0785a8cDc92bAe49Ae7aA6C99B602e3CC43F7eD`
- **Status**: ⚠️ Test Environment - Addresses may change

## Subgraph Endpoint

| Network    | GraphQL Endpoint                                                                                                                    | Start Block |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| **Citrea** | [Goldsky Subgraph](https://api.goldsky.com/api/public/project_cme6kru6aowuy01tb4c9xbdrj/subgraphs/signals-v0-citrea-prod/latest/gn) | 14,176,879  |

## ABIs

Contract ABIs are available in the [GitHub repository](https://github.com/signals-protocol/signals-v0):

- CLMSRMarketCore ABI - Available in GitHub repository
- CLMSRPosition ABI - Available in GitHub repository
- PointsGranter ABI - Available in GitHub repository

## Verification

All contracts are verified on Citrea Testnet Explorer. You can verify the source code matches the deployed bytecode.

> **Disclaimer**: This is a testnet deployment for testing purposes only. Do not use real assets.
