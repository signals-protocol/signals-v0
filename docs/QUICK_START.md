# CLMSR Quick Start

This guide shows how to stand up a simple integration that reads the daily market, visualises the distribution, and submits a trade against the CLMSR contracts. You only need Node.js, ethers v6, and Apollo Client.

## 1. Configure environment

```ts
// config.ts
export const NETWORK = {
  chainId: 5115,
  name: "Citrea Testnet",
  rpcUrl: "https://rpc.testnet.citrea.xyz",
};

export const CONTRACTS = {
  prod: {
    CLMSRMarketCore: "0xE480ca1C63B6dd929af1EeA4D3de1073942F3cEf",
    CLMSRPosition: "0xB4c33Df898F8139D784ADE1aDCa9B5979898fE03",
    SUSD: "0xE32527F8b3f142a69278f22CdA334d70644b9743",
    subgraph:
      "https://api.goldsky.com/api/public/project_cme6kru6aowuy01tb4c9xbdrj/subgraphs/signals-v0-citrea-prod/latest/gn",
  },
  dev: {
    CLMSRMarketCore: "0x971F9bcE130743BB3eFb37aeAC2050cD44d7579a",
    CLMSRPosition: "0xe163497F304ad4b7482C84Bc82079d46050c6e93",
    SUSD: "0xE32527F8b3f142a69278f22CdA334d70644b9743",
    subgraph:
      "https://api.goldsky.com/api/public/project_cme6kru6aowuy01tb4c9xbdrj/subgraphs/signals-v0-citrea-dev/latest/gn",
  },
};
```

Install dependencies:

```bash
npm install ethers@^6.9.0 @apollo/client graphql
```

## 2. Read the distribution

```tsx
import { ApolloClient, InMemoryCache, gql, useQuery } from "@apollo/client";

const client = new ApolloClient({
  uri: CONTRACTS.prod.subgraph,
  cache: new InMemoryCache(),
});

const GET_DISTRIBUTION = gql`
  query GetMarket($marketId: String!) {
    marketDistribution(id: $marketId) {
      tickRanges
      binFactors
    }
  }
`;

export function Distribution({ marketId }: { marketId: string }) {
  const { data, loading, error } = useQuery(GET_DISTRIBUTION, {
    variables: { marketId },
    pollInterval: 5000,
    client,
  });

  if (loading) return <p>Loading…</p>;
  if (error) return <p>Error: {error.message}</p>;

  return (
    <ul>
      {data.marketDistribution.tickRanges.map((range: string, idx: number) => (
        <li key={range}>{`${range}: ${data.marketDistribution.binFactors[idx]}`}</li>
      ))}
    </ul>
  );
}
```

## 3. Connect the contracts

```ts
import { ethers } from "ethers";
import MarketCoreABI from "./abi/CLMSRMarketCore.json";
import SUSDABI from "./abi/SUSD.json";

export async function getContracts(env: "prod" | "dev" = "prod") {
  if (!window.ethereum) throw new Error("wallet required");

  const provider = new ethers.BrowserProvider(window.ethereum);
  const network = await provider.getNetwork();
  if (network.chainId !== BigInt(NETWORK.chainId)) {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: ethers.toQuantity(NETWORK.chainId) }],
    });
  }

  const signer = await provider.getSigner();
  const cfg = CONTRACTS[env];

  return {
    core: new ethers.Contract(cfg.CLMSRMarketCore, MarketCoreABI, signer),
    susd: new ethers.Contract(cfg.SUSD, SUSDABI, signer),
    signer,
  };
}
```

## 4. Submit a trade

```ts
import { toWad, fromWadRoundUp } from "@whworjs7946/clmsr-v0";

export async function openRange(core: ethers.Contract, susd: ethers.Contract, opts: {
  marketId: bigint;
  lowerTick: number;
  upperTick: number;
  quantity: string; // 6-decimal string, e.g. "1000000" = 1 SUSD
}) {
  const quantityWad = toWad(opts.quantity); // converts 6-decimal input to 18-decimal wad

  const cost = await core.getOpenCost(
    opts.marketId,
    opts.lowerTick,
    opts.upperTick,
    quantityWad,
  );

  // Approve SUSD spend then open position
  await susd.approve(core.target, cost);
  const tx = await core.openPosition(
    opts.marketId,
    opts.lowerTick,
    opts.upperTick,
    quantityWad,
    cost,
  );

  const receipt = await tx.wait();
  console.log("Opened position", receipt.hash);

  return {
    quantity: fromWadRoundUp(quantityWad),
    cost: fromWadRoundUp(cost),
  };
}
```

## 5. Common follow-up tasks

| Task | Entry point |
| --- | --- |
| Estimate costs / proceeds | `core.getOpenCost`, `core.getCloseProceeds`, `core.getIncreaseCost` |
| Inspect positions | `CLMSRPosition.positionsByOwner`, `CLMSRPosition.positions(positionId)` |
| Watch settlements | listen for `PositionSettled` and `PositionEventsProgress` events or query the subgraph |
| Batch claims | iterate `PositionSettled` records with `won = true` and call `claimPayout(positionId)` |

## 6. Next steps

- Review the [Contract Integration guide](./CONTRACT_INTEGRATION.md) for production-grade error handling and settlement flows.
- Explore [docs/SUBGRAPH_API.md](./SUBGRAPH_API.md) for richer analytics queries.
- Run `website/docs` locally (`cd website && yarn start`) to browse the user-facing documentation.

You now have a minimal React client that reads market data and opens a position against the CLMSR AMM. Build from here with your own state management, visualisations, and trading heuristics.
