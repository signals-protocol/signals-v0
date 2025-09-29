# Network Information

Signals currently operates on the Citrea Tangerine testnet. This page explains how to connect, where to find canonical addresses, and what tooling we use to monitor the network. For contract tables see [Deployment Addresses](../addresses/index.md); for upgrade procedures see [Governance & Upgrades](../governance/upgrades.md).

## Citrea Tangerine (chain id 5115)

| Item | Value |
| --- | --- |
| RPC endpoint | `https://rpc.testnet.citrea.xyz` |
| Explorer | [explorer.testnet.citrea.xyz](https://explorer.testnet.citrea.xyz/) |
| Native token | cBTC (8 decimals) |
| Status | ✅ Active and monitored by Signals operations |

**Manifests** — The authoritative addresses and version history reside under `deployments/environments/citrea-*.json`. Pull fresh manifests with `yarn workspace scripts run manage:manifest` (or `scripts/manage-manifest.ts`) before broadcasting transactions.

## Wallet configuration

Add the network to MetaMask or any EVM wallet:

```text
Network Name: Citrea Testnet
RPC URL:     https://rpc.testnet.citrea.xyz
Chain ID:    5115
Currency:    cBTC
Explorer:    https://explorer.testnet.citrea.xyz/
```

Request cBTC from the [official faucet](https://faucet.testnet.citrea.xyz/) to cover gas. Signals does not subsidise gas usage.

## Hardhat / Foundry setup

Add the network to your tooling configuration so scripts reference the correct RPC and chain id.

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

## Operational notes

- RPC latency can spike during chain upgrades. Dispatcher scripts retry automatically, but interactive sessions should plan for transient failures.
- Keep a buffer of cBTC in the operations wallet so settlement runs can proceed even during congestion.
- Use the Goldsky subgraph to detect network divergence—if RPC responses stall, compare subgraph block heights to the explorer.

Signals will announce major Citrea maintenance windows in the community channels. If you plan to automate settlement or trading, subscribe to those updates so you can pause jobs proactively.
