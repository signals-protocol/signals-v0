## signals-v0 – **CLMSR Daily-Market System**

_one single document every engineer can implement from_

---

### 0. Conceptual model (why the pieces exist)

| Topic                       | Explanation (1-sentence summary)                                                                                                                                                                                             |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Continuous LMSR (cLMSR)** | Price per tick _i_ is ![exp(qᵢ/α)/Σᵢ exp(qᵢ/α)](https://latex.codecogs.com/svg.image?%5Cfrac%7Be%5E%7Bq_i/%5Calpha%7D%7D%7B%5Csum_j%20e%5E%7Bq_j/%5Calpha%7D%7D) ; cost of trade Δq is `α·ln(Σafter/Σbefore)` (all UD60×18). |
| **Sparse segment-tree**     | Instead of pre-allocating 65 k leaves (gas-bomb), we store only the nodes actually touched; each trade modifies ≤ log₂N ≈ 17 nodes.                                                                                          |
| **Market life-cycle**       | _Open_ 14 days in advance → users trade 24 h → keeper pushes oracle price → **close** & settle → after claim, positions stay for reference.                                                                                  |
| **Per-market α**            | Liquidity can differ by day, so `alpha` lives inside `Market` struct, not as a global immutable.                                                                                                                             |
| **Short selling disabled**  | A user cannot drive any tick position below 0; checking is `oldPos + dq < 0 ⇒ revert`.                                                                                                                                       |
| **Separation of concerns**  | Core = irreversible money/math; Manager = changeable governance/keeper logic; Router = UX; View = lightweight read only.                                                                                                     |

---

### 1. Repository tree _(no scripts, no tests yet)_

```
signals-v0/
├─ hardhat.config.ts          # Solidity 0.8.24, via-IR on
├─ package.json               # hardhat, typechain, ethers
├─ tsconfig.json
│
├─ contracts/
│   ├─ core/CLMSRMarketCore.sol
│   ├─ manager/
│   │     ├─ CLMSRMarketManager.sol
│   │     └─ CLMSRMarketManagerProxy.sol
│   ├─ periphery/
│   │     ├─ CLMSRMarketRouter.sol
│   │     ├─ CLMSRMarketOracleAdapter.sol
│   │     └─ CLMSRMarketView.sol
│   ├─ libraries/
│   │     ├─ SparseSegmentTree.sol
│   │     └─ FixedPointMath.sol
│   └─ interfaces/
│         ICLMSRMarketCore.sol
│         ICLMSRMarketManager.sol
│         ICLMSRMarketRouter.sol
│         ICLMSRMarketView.sol
└─ README.md   <-- copy this file
```

---

### 2. Shared data structures

```solidity
/// @dev UD60x18 fixed-point; 1e18 = 1.0
struct Node {
    uint256 sum;     // subtree Σexp(q/α)
    uint256 lazy;    // pending multiplicative factor
}

struct Market {
    /* period */
    uint64  startTs;       // epoch start (UTC)
    uint64  endTs;         // start + 24 h
    bool    settled;
    uint32  settleTick;    // winning tick after oracle

    /* immutable per market */
    uint32  nLeaves;       // 32 768 recommended
    uint256 alpha;         // liquidity parameter (1e18 scale)

    /* dynamic state */
    uint256 rootSumExp;    // Σ exp(q/α)
    uint256 volume;        // Σ |ΔC|  (optional analytics)
    mapping(uint => Node) tree;                       // sparse seg-tree
    mapping(address => mapping(uint32 => int128)) pos;// user positions
}
```

---

### 3. Contract-level API / internal checks

_(no events / no errors listed – those are implementation details)_

| Contract                        | Public functions (✔ write, 🔍 view)                     | Key checks & actions                                                                                                                                                                                                                                                                   |     |     |
| ------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | --- |
| **CLMSRMarketCore** (immutable) | ✔ `coreOpenMarket(day,nLeaves,start,end,alpha,initExp)` | - day must not exist; initialize `Market`, `rootSumExp = initExp*nLeaves`.                                                                                                                                                                                                             |     |     |
|                                 | ✔ `coreCloseMarket(day,settleTick)`                     | - must not be settled; flag `settled=true`.                                                                                                                                                                                                                                            |     |     |
|                                 | ✔ `coreTradeRange(day,trader,lo,hi,dq,maxCost)`         | 1. `lo ≤ hi` 2. if `dq < 0` loop all ticks: `old+ dq ≥0` (no short) 3. compute f = `exp(dq/α)`; `tree.mulRange(lo,hi,f)`; update `rootSumExp` 4. ΔC = `alpha * ln(new/root)` ; ensure `ΔC ≤ maxCost` 5. ERC-20 `transferFrom(trader, core, ΔC)` 6. loop ticks `pos += dq`; \`volume += | ΔC  | \`. |
|                                 | ✔ `coreClaim(day,trader,ticks[])`                       | allowed only if market `settled`; pay out only tick = `settleTick`; zero the pos.                                                                                                                                                                                                      |     |     |
|                                 | 🔍 `metaOf(day)`                                        | returns settled flag, times, settleTick, alpha, rootSumExp, volume.                                                                                                                                                                                                                    |     |     |
|                                 | 🔍 `rawLeaf(day,tick)`                                  | missing node → returns `1e18`.                                                                                                                                                                                                                                                         |     |     |
| **CLMSRMarketManager** (UUPS)   | ✔ `openMarket(...)` _(onlyKeeper, notPaused)_           | calls `coreOpenMarket`; push day into `_active`; if > 14 → `_autoClose(oldest)`.                                                                                                                                                                                                       |     |     |
|                                 | ✔ `closeMarket(...)` _(onlyKeeper)_                     | calls `coreCloseMarket`; remove from `_active`.                                                                                                                                                                                                                                        |     |     |
|                                 | ✔ `pause/unpause`, ✔ `setKeeper(addr)`                  | flip flags / update keeper.                                                                                                                                                                                                                                                            |     |     |
|                                 | 🔍 `activeEpochs()`                                     | copy of `_active`.                                                                                                                                                                                                                                                                     |     |     |
| **CLMSRMarketRouter**           | ✔ `tradeRange(day,lo,hi,dq,maxCost)`                    | passthrough to `coreTradeRange`; single tick = lo==hi.                                                                                                                                                                                                                                 |     |     |
|                                 | ✔ `tradeRangeWithPermit(...)`                           | permit + approve + `tradeRange`.                                                                                                                                                                                                                                                       |     |     |
|                                 | ✔ `claim(day,ticks[])`                                  | passthrough to `coreClaim`.                                                                                                                                                                                                                                                            |     |     |
| **CLMSRMarketOracleAdapter**    | ✔ `pushPriceAndSettle(day,price)` _(onlyKeeper)_        | translate price→tick; call `manager.closeMarket`.                                                                                                                                                                                                                                      |     |     |
| **CLMSRMarketView**             | 🔍 `activeMarkets()`                                    | return `manager.activeEpochs()`.                                                                                                                                                                                                                                                       |     |     |
|                                 | 🔍 `snapshot(day)` / `snapshotMany(days[])`             | wrap `core.metaOf`.                                                                                                                                                                                                                                                                    |     |     |
|                                 | 🔍 `getAllLeaf(day)` _(optional)_                       | returns 32 768 × `exp(q/α)` array (for full on-chain dump).                                                                                                                                                                                                                            |     |     |

---

### 4. External interaction flow

```
          ┌─ USER ─ tradeRange ───────────────────┐
          │                                       │
ERC-20 → Router --> Core.coreTradeRange           │
                event TradeRange ───────────► Front-end chart
          │                                       │
Keeper → OracleAdapter.pushPrice ──► Manager.closeMarket ─► Core.coreCloseMarket
                                          event MarketClosed ─► Front-end list
```

_Data rendering_ – Front-end calls `View.snapshotMany` once per page load, then listens to events for real-time deltas.

---

### 5. Repository roles & todo

| File/Folder                          | Engineer role                                                |
| ------------------------------------ | ------------------------------------------------------------ |
| `contracts/libraries/*.sol`          | implement math + seg-tree (gas target: mulRange ≤ 30 SSTORE) |
| `contracts/core/CLMSRMarketCore.sol` | implement open/close/trade/claim logic & anti-short check    |
| `contracts/manager/*.sol`            | implement keeper gating, UUPS upgrade, 14-slot active array  |
| `contracts/periphery/*.sol`          | thin wrappers: Router UX, Oracle adapter, View               |
| **Hardhat config**                   | already supplied; just compile `npx hardhat compile`.        |
| **Tests / deploy scripts**           | **not delivered – write later.**                             |

---

With this document every backend, solidity, and front-end engineer has:

1. **Folder map** – know where each file lives.
2. **Precise state & function spec** – know what to code & validate.
3. **Lifecycle & math description** – understand how the market works.

No further clarifications are required to start implementing **signals-v0**.
