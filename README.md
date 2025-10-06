# 🚀 CLMSR Market System

[![Tests](https://img.shields.io/badge/tests-686%20passing-brightgreen)](./test/)
[![Security](https://img.shields.io/badge/security-hardened-green)](./README.md#security-enhancements)
[![Coverage](https://img.shields.io/badge/coverage-%E2%89%A580%25-brightgreen)](./test/)
[![Status](https://img.shields.io/badge/status-in%20development-yellow)](./README.md)

> **CLMSR (Continuous Logarithmic Market Scoring Rule) implementation with comprehensive security hardening and 686 passing tests.**

---

## 🎯 Quick Start

```bash
# Install dependencies
npm install

# Run tests (686 tests)
npm test

# Enforce coverage thresholds
npm run coverage && npm run coverage:check

# Compile contracts
npm run compile

# Generate complete codebase documentation
./combine_all_files.sh
```

---

## 📊 Project Status

| Metric                 | Status                  | Details                                   |
| ---------------------- | ----------------------- | ----------------------------------------- |
| **Tests**              | ✅ **686 passing**      | Full hardhat suite + subgraph matchstick  |
| **Security**           | ✅ **Hardened**         | Critical vulnerabilities fixed            |
| **Documentation**      | ✅ **Complete**         | Auto-generated comprehensive docs         |
| **Gas Optimization**   | ✅ **Optimized**        | Efficient chunk-split algorithms          |
| **Coverage**           | ✅ **≥80% gated**       | Enforced via `npm run coverage:check`     |
| **Development Status** | ✅ **Production Ready** | Deployed on Base Mainnet                  |

---

## 🏗️ Architecture Overview

### 🎯 Core Concept: CLMSR (Continuous Logarithmic Market Scoring Rule)

CLMSR is an automated market maker algorithm for prediction markets:

- **Price Formula**: `P_i = exp(q_i/α) / Σ_j exp(q_j/α)`
- **Cost Formula**: `C = α * ln(Σ_after / Σ_before)`
- **Liquidity Parameter**: `α` (configurable per market)

### 🧩 System Components

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   CLMSRRouter   │    │ CLMSRMarketCore │    │ CLMSRPosition   │
│   (UX Layer)    │───▶│ (Core Logic)    │───▶│   (NFT Mgmt)    │
│  📅 PLANNED     │    │   ✅ ACTIVE     │    │   ✅ ACTIVE     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ CLMSRManager    │    │ LazyMulSegTree  │    │ FixedPointMath  │
│ (Governance)    │    │ (Efficient DS)  │    │ (Math Library)  │
│  📅 PLANNED     │    │   ✅ ACTIVE     │    │   ✅ ACTIVE     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

> **📅 Implementation Status**: Core contracts (CLMSRMarketCore, CLMSRPosition) and libraries are fully implemented and tested. Manager and Router contracts are planned for future implementation.

---

## 📁 Project Structure

```
signals-v0/
├── 📄 contracts/
│   ├── 🎯 core/CLMSRMarketCore.sol          # Core trading logic (1,031 lines)
│   ├── 🔌 interfaces/                       # Contract interfaces (4 files)
│   ├── 📚 libraries/                        # Math libraries (2 files)
│   ├── 🧪 test/                            # Solidity test helpers (2 files)
│   └── 🎭 mocks/                           # Testing mocks (2 files)
├── 🧪 test/
│   ├── 📊 core/                            # Core functionality tests (7 files)
│   ├── 🔢 FixedPointMath.test.ts           # Math library tests (52 tests)
│   └── 🌳 LazyMulSegmentTree.test.ts       # Segment tree tests (79 tests)
├── ⚙️  hardhat.config.ts                   # Build configuration
├── 📦 package.json                         # Dependencies
└── 🚀 combine_all_files.sh                 # Auto documentation generator
```

---

## 🛡️ Security Enhancements

### 🔒 Critical Security Fixes Applied

| Issue                   | Severity    | Description                                      | Status       |
| ----------------------- | ----------- | ------------------------------------------------ | ------------ |
| **Zero-Cost Attack**    | 🔴 Critical | `fromWad()` truncation allowing free positions   | ✅ **FIXED** |
| **Gas DoS Attack**      | 🔴 Critical | Unlimited chunk splitting causing gas exhaustion | ✅ **FIXED** |
| **Time Validation**     | 🟡 Medium   | Trading in expired markets                       | ✅ **FIXED** |
| **Overflow Protection** | 🟡 Medium   | Mathematical overflow in large trades            | ✅ **FIXED** |

### 🛡️ Security Mechanisms

1. **Round-Up Cost Calculation**

   ```solidity
   // Before: fromWad() - truncation allows 0 cost
   uint256 cost6 = costWad.fromWad();

   // After: fromWadRoundUp() - guarantees minimum 1 micro USDC
   uint256 cost6 = costWad.fromWadRoundUp();
   ```

2. **Gas DoS Protection**

   ```solidity
   uint256 private constant MAX_CHUNKS_PER_TX = 100;

   uint256 requiredChunks = (quantity + maxSafeQuantityPerChunk - 1) / maxSafeQuantityPerChunk;
   if (requiredChunks > MAX_CHUNKS_PER_TX) {
       revert InvalidQuantity(uint128(quantity));
   }
   ```

3. **Time Boundary Validation**
   ```solidity
   if (block.timestamp < market.startTimestamp) {
       revert InvalidMarketParameters("Market not started");
   }
   if (block.timestamp > market.endTimestamp) {
       market.isActive = false;
       revert InvalidMarketParameters("Market expired");
   }
   ```

---

## 🧪 Testing Excellence

### 📊 Test Coverage Breakdown

| Category               | Tests   | Coverage | Description                           |
| ---------------------- | ------- | -------- | ------------------------------------- |
| **FixedPointMath**     | 52      | 100%     | Mathematical operations & precision   |
| **LazyMulSegmentTree** | 79      | 100%     | Segment tree operations               |
| **Core Boundaries**    | 42      | 100%     | Edge cases & boundary conditions      |
| **Core Deployment**    | 15      | 100%     | Deployment & configuration            |
| **Core Events**        | 25      | 100%     | Event emission & authorization        |
| **Core Execution**     | 67      | 100%     | Trade execution & position management |
| **Core Invariants**    | 12      | 100%     | Mathematical invariants               |
| **Core Markets**       | 32      | 100%     | Market creation & management          |
| **Total**              | **324** | **100%** | **Complete test coverage**            |

### 🎯 Special Test Scenarios

- **Security Attack Prevention**: Zero-cost positions, gas DoS attacks
- **Boundary Testing**: Min/max quantities, time boundaries, tick boundaries
- **Mathematical Accuracy**: CLMSR formulas, chunk splitting, precision
- **Gas Optimization**: Large trades, complex operation scenarios
- **Error Handling**: All revert conditions and edge cases

---

## 🚀 Key Features

### 🎯 Core Functionality

1. **Complete CLMSR Implementation**

   - Continuous logarithmic market scoring rule
   - Chunk-split support for large trades
   - Per-market liquidity parameter configuration

2. **NFT-Based Position Management**

   - ERC721 compatible position tokens
   - Range-based positions (lowerTick ~ upperTick)
   - Complete position lifecycle management

3. **High-Performance Data Structures**
   - Lazy Multiplication Segment Tree
   - O(log N) updates and queries
   - Memory-efficient sparse arrays

### 🛡️ Security Features

1. **Attack Prevention Mechanisms**

   - Zero-cost attack prevention
   - Gas DoS attack prevention
   - Time-based validation

2. **Mathematical Stability**

   - Overflow protection
   - Precision maintenance
   - Safe exponential operations

3. **Access Control**
   - Role-based permission management
   - Emergency pause mechanism
   - Authorized callers only

---

## 🔧 Development Tools

### 📋 Available Scripts

```bash
# Testing
npm test                    # Run all tests (324 tests)
npm run test:core          # Core functionality tests only
npm run test:math          # Math library tests only

# Build & Compilation
npm run compile            # Compile smart contracts
npm run clean              # Clean build artifacts

# Documentation
./combine_all_files.sh     # Generate complete codebase documentation
npm run docs               # Generate API documentation

# Code Quality
npm run lint               # Code style checks
npm run format             # Code formatting
```

### 🛠️ Advanced Build Script

The new `combine_all_files.sh` provides:

- ✅ **Automatic File Detection**: Auto-recognizes new files
- ✅ **Live Test Results**: Runs tests during script execution
- ✅ **Project Statistics**: Auto-calculates file counts, sizes, lines
- ✅ **Git Integration**: Extracts commit counts and contributors
- ✅ **Security Tracking**: Auto-counts security fixes from README
- ✅ **Beautiful Output**: Colorized output with emojis

---

## 📈 Performance Metrics

### ⚡ Gas Optimization

| Operation                   | Gas Cost  | Optimization            |
| --------------------------- | --------- | ----------------------- |
| **Position Open**           | ~150K gas | Optimized segment tree  |
| **Position Increase**       | ~80K gas  | Cached calculations     |
| **Position Decrease**       | ~90K gas  | Efficient state updates |
| **Large Trade (10x chunk)** | ~800K gas | Chunk-split algorithm   |

### 🏃‍♂️ Execution Performance

- **Test Suite**: 324 tests in ~4 seconds
- **Compilation**: Full build in ~10 seconds
- **Documentation**: Complete docs in ~5 seconds

---

## 🎯 Development Roadmap

### ✅ Completed (v0.1)

- [x] Core CLMSR implementation
- [x] Security hardening
- [x] Comprehensive testing
- [x] Documentation automation
- [x] Gas optimization

### 🚧 In Progress (v0.2)

- [ ] Frontend integration
- [ ] Gas optimization improvements
- [ ] Enhanced error handling

### 📅 Planned (v0.3)

- [ ] Manager contract implementation
- [ ] Router contract with permit support
- [ ] Oracle integration (price feeds for automatic settlement)

---

## 🤝 Contributing

### 🔧 Development Setup

```bash
# Clone repository
git clone https://github.com/your-org/signals-v0.git
cd signals-v0

# Install dependencies
npm install

# Run tests to verify setup
npm test

# Start developing!
```

### 📝 Code Standards

- **Solidity**: 0.8.24, via-IR optimization
- **TypeScript**: Strict mode, comprehensive typing
- **Testing**: 100% coverage requirement
- **Documentation**: Auto-generated, always up-to-date

### 🐛 Bug Reports

When reporting bugs:

1. Write reproducible test case
2. Describe expected vs actual behavior
3. Include environment info (Node.js, npm versions)

---

## 📄 License

MIT License - see [LICENSE](./LICENSE) for details.

---

## 🏆 Current Achievements

- 🎯 **324 Tests Passing** - Complete test coverage
- 🛡️ **Security Hardened** - Critical vulnerabilities fixed
- ⚡ **Gas Optimized** - Efficient chunk-split algorithms
- 📚 **Well Documented** - Auto-generated comprehensive docs
- 🌐 **Production Deployed** - Live on Base Mainnet

---

## 🌐 Live Deployments

**✅ PRODUCTION READY** - Successfully deployed on multiple networks!

### 🔷 Base Mainnet

Successfully deployed and operational on Base Mainnet:

### 📋 Contract Addresses

| Contract               | Address                                                                                                                      | Verified |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------- |
| **CLMSRMarketCore**    | [`0x4424687a25302db5d1D3A9f7504e4710b0ab17E9`](https://basescan.org/address/0x4424687a25302db5d1D3A9f7504e4710b0ab17E9#code) | ✅       |
| **CLMSRPosition**      | [`0x93E61D408456D27d5AB3fC4281B56Eb69A8296e7`](https://basescan.org/address/0x93E61D408456D27d5AB3fC4281B56Eb69A8296e7#code) | ✅       |
| **SUSD Token**         | [`0x19593B3AF55ad58Ce74514924a2F253FDF89CA34`](https://basescan.org/address/0x19593B3AF55ad58Ce74514924a2F253FDF89CA34#code) | ✅       |
| **FixedPointMathU**    | [`0xA8Af982597D7A17c651c801B801EC86C92171A5d`](https://basescan.org/address/0xA8Af982597D7A17c651c801B801EC86C92171A5d#code) | ✅       |
| **LazyMulSegmentTree** | [`0x1Ba59a311Fb42D475dBC55C9bc780e3883E25A53`](https://basescan.org/address/0x1Ba59a311Fb42D475dBC55C9bc780e3883E25A53#code) | ✅       |

### 📊 Subgraph API

- **Studio**: https://thegraph.com/studio/subgraph/signals-v-0
- **Query Endpoint**: `https://api.studio.thegraph.com/query/116469/signals-v-0/1.0.2`

### 🎯 Active Market (Base)

- **Market ID**: 1
- **Network**: Base Mainnet (Chain ID: 8453)
- **Tick Range**: 100,000 - 140,000 (400 bins)
- **Liquidity Parameter**: 1000.0
- **Payment Token**: SUSD (Signals USD)

### 🟠 Citrea Testnet Tangerine

**🚀 READY FOR DEPLOYMENT** - Configured for Citrea Testnet:

```
Network: Citrea Testnet Tangerine
Chain ID: 5115
RPC: https://rpc.testnet.citrea.xyz
Explorer: https://explorer.testnet.citrea.xyz
```

**Deployment Commands:**

```bash
# Deploy to Citrea Development
yarn deploy:citrea:dev

# Deploy to Citrea Production
yarn deploy:citrea:prod
```

**Indexer:** GoldSky (TheGraph not supported on Citrea)

```bash
cd clmsr-subgraph
npm run deploy:goldsky:citrea:dev
npm run deploy:goldsky:citrea:prod
```

📖 **Full Guide**: [CITREA_DEPLOYMENT.md](./CITREA_DEPLOYMENT.md)

## 🚨 Development Status

The core CLMSR functionality is **production ready** and successfully deployed on Base Mainnet. All contracts are verified and operational.

---

_This project is continuously improving. Run `./combine_all_files.sh` for the latest documentation._
