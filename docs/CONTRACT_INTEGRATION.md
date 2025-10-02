# CLMSR Contract Integration Guide

This document explains how to interact with the deployed Signals contracts from an application or backend service. It covers provider setup, contract instantiation, trade flows, settlement monitoring, and operational safeguards.

## 1. Prerequisites

- Node.js 18+ and `ethers@^6`
- Access to the Citrea Testnet RPC (`https://rpc.testnet.citrea.xyz`)
- ABI files from `artifacts/` or the Citrea explorer (verified sources linked below)
- Addresses from the deployment manifests (`deployments/environments/*.json`)

```ts
export const CONTRACTS = {
  prod: {
    CLMSRMarketCore: "0xE480ca1C63B6dd929af1EeA4D3de1073942F3cEf",
    CLMSRPosition:   "0xB4c33Df898F8139D784ADE1aDCa9B5979898fE03",
    SUSD:            "0xE32527F8b3f142a69278f22CdA334d70644b9743",
  },
  dev: {
    CLMSRMarketCore: "0x971F9bcE130743BB3eFb37aeAC2050cD44d7579a",
    CLMSRPosition:   "0xe163497F304ad4b7482C84Bc82079d46050c6e93",
    SUSD:            "0xE32527F8b3f142a69278f22CdA334d70644b9743",
  },
};
```

## 2. Providers and signers

```ts
import { ethers } from "ethers";

export async function getSigner() {
  if (!window.ethereum) throw new Error("wallet required");

  const provider = new ethers.BrowserProvider(window.ethereum);
  const network = await provider.getNetwork();
  if (network.chainId !== 5115n) {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x13FB" }],
    });
  }

  return await provider.getSigner();
}

export function getJsonRpcSigner(privateKey: string) {
  const provider = new ethers.JsonRpcProvider(NETWORK.rpcUrl, 5115);
  return new ethers.Wallet(privateKey, provider);
}
```

## 3. Contract instances

```ts
import MarketCoreABI from "./abi/CLMSRMarketCore.json";
import PositionABI from "./abi/CLMSRPosition.json";
import SUSDABI from "./abi/SUSD.json";

export function createContracts(signer: ethers.Signer, env: "prod" | "dev" = "prod") {
  const cfg = CONTRACTS[env];
  return {
    core: new ethers.Contract(cfg.CLMSRMarketCore, MarketCoreABI, signer),
    position: new ethers.Contract(cfg.CLMSRPosition, PositionABI, signer),
    susd: new ethers.Contract(cfg.SUSD, SUSDABI, signer),
  };
}
```

Verified source code:

- Production [`CLMSRMarketCore`](https://explorer.testnet.citrea.xyz/address/0xE480ca1C63B6dd929af1EeA4D3de1073942F3cEf#code)
- Production [`CLMSRPosition`](https://explorer.testnet.citrea.xyz/address/0xB4c33Df898F8139D784ADE1aDCa9B5979898fE03#code)
- Production [`SUSD`](https://explorer.testnet.citrea.xyz/address/0xE32527F8b3f142a69278f22CdA334d70644b9743#code)

## 4. Trade flows

### 4.1 Estimate and open a range

```ts
import { toWad, fromWadRoundUp } from "@whworjs7946/clmsr-v0";

export async function openRange(core: ethers.Contract, susd: ethers.Contract, opts: {
  marketId: bigint;
  lowerTick: number;
  upperTick: number;
  quantity: string; // 6-decimal string e.g. "1000000" = 1 SUSD
}) {
  const qtyWad = toWad(opts.quantity);
  const maxCost = await core.getOpenCost(
    opts.marketId,
    opts.lowerTick,
    opts.upperTick,
    qtyWad,
  );

  await susd.approve(core.target, maxCost);
  const tx = await core.openPosition(
    opts.marketId,
    opts.lowerTick,
    opts.upperTick,
    qtyWad,
    maxCost,
  );

  const receipt = await tx.wait();
  return {
    hash: receipt.hash,
    quantity: fromWadRoundUp(qtyWad),
    cost: fromWadRoundUp(maxCost),
  };
}
```

### 4.2 Adjust or close

- `increasePosition(marketId, positionId, qtyWad, maxCost)` — adds exposure using the same rounding logic as open.
- `decreasePosition(positionId, qtyWad, minProceeds)` — partially exits and returns SUSD at current probabilities.
- `closePosition(positionId, minProceeds)` — exits completely before settlement and burns the position token.

Use `getIncreaseCost`, `getDecreaseProceeds`, and `getCloseProceeds` to compute slippage bounds before sending transactions.

## 5. Settlement and claims

After the operator settles a market, batches of `PositionSettled` events emit. You can:

```ts
core.on(core.filters.PositionSettled(null), (positionId, payout, won, event) => {
  if (won) {
    console.log(`Position ${positionId.toString()} won ${ethers.formatUnits(payout, 6)} SUSD`);
  }
});

core.on(core.filters.PositionEventsProgress(null), (marketId, processed, total, done) => {
  if (done) console.log(`Market ${marketId} fully settled`);
});
```

Claims are triggered on `CLMSRMarketCore.claimPayout(positionId)`. There is no deadline, but it is best practice to claim promptly once `done = true` to keep balances tidy.

## 6. Error handling patterns

```ts
async function withRetry<T>(fn: () => Promise<T>, retries = 3, backoffMs = 1000): Promise<T> {
  let attempt = 0;
  while (attempt < retries) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === retries - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, backoffMs * 2 ** attempt));
      attempt += 1;
    }
  }
  throw new Error("unreachable");
}
```

Common failure cases:

| Symptom | Likely cause | Mitigation |
| --- | --- | --- |
| `CALL_EXCEPTION` on trade | price moved between cost estimate and submission | re-estimate cost, include slippage buffer |
| `NOT_ENOUGH_ALLOWANCE` | SUSD approval too small after price change | approve fresh allowance equal to new cost |
| `POSITION_NOT_SETTLED` when claiming | settlement batches still running | wait for `PositionEventsProgress.done` |

## 7. Operational notes

- Always read addresses from manifests; never hardcode new deployments without updating documentation.
- Record transaction hashes for dispatcher jobs (create, settle, batch) so you can correlate on-chain events with off-chain logs.
- Large integrations should monitor the Goldsky subgraph for divergence using `verification/check-market-pnl.ts`.
- When automating upgrades, follow the checklist in `docs/governance/upgrades.md` and update `docs/addresses/index.md` if addresses change.

With these building blocks you can power trading clients, risk dashboards, or automated strategies on top of Signals’ CLMSR markets.
