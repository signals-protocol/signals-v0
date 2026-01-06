import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@openzeppelin/hardhat-upgrades";
import "hardhat-gas-reporter";
import "hardhat-tracer";
import "solidity-docgen";
import "solidity-coverage";
import dotenv from "dotenv";

dotenv.config();

const isCoverage = process.env.COVERAGE === "1";

const config: HardhatUserConfig = {
  solidity: {
    // 기본 설정 (테스트/기타 컨트랙트)
    compilers: [
      {
        version: "0.8.30",
        settings: {
          viaIR: true,
          evmVersion: "paris",
          optimizer: {
            enabled: true,
            runs: 200,
          },
          metadata: {
            bytecodeHash: "none", // Remove metadata hash to save additional bytes
            useLiteralContent: true,
          },
        },
      },
    ],
    // 코어만 코드 사이즈 우선 설정으로 별도 컴파일
    overrides: {
      "contracts/core/CLMSRMarketCore.sol": {
        version: "0.8.30",
        settings: {
          viaIR: true,
          evmVersion: "paris",
          optimizer: {
            enabled: true,
            runs: 0, // 사이즈 우선 (인라이닝 최소화)
          },
          debug: {
            revertStrings: "strip",
          },
          metadata: {
            bytecodeHash: "none",
            useLiteralContent: false,
          },
        },
      },
      // 세그먼트 트리는 IR 경로 유지 (stack too deep 방지)
      "contracts/libraries/LazyMulSegmentTree.sol": {
        version: "0.8.30",
        settings: {
          viaIR: true,
          evmVersion: "paris",
          optimizer: {
            enabled: true,
            runs: 200,
          },
          metadata: {
            bytecodeHash: "none",
            useLiteralContent: true,
          },
        },
      },
      "contracts/managers/CLMSRMarketManager.sol": {
        version: "0.8.30",
        settings: {
          viaIR: true,
          evmVersion: "paris",
          optimizer: {
            enabled: true,
            runs: 200,
            // Keep default optimizer details
          },
          metadata: {
            bytecodeHash: "none",
            useLiteralContent: true,
          },
        },
      },
    },
  },
  networks: {
    // Citrea Testnet Tangerine (Production)
    "citrea-prod": {
      url: process.env.CITREA_RPC_URL || "https://rpc.testnet.citrea.xyz",
      chainId: 5115,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    // Citrea Testnet Tangerine (Development)
    "citrea-dev": {
      url: process.env.CITREA_RPC_URL || "https://rpc.testnet.citrea.xyz",
      chainId: 5115,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },

    // Hardhat local network
    hardhat: {
      chainId: 31337,
      allowUnlimitedContractSize: true,
      blockGasLimit: 30000000,
      gas: 30000000,
      gasPrice: 1000000000,
      initialBaseFeePerGas: 0,
      accounts: {
        count: 20,
        accountsBalance: "10000000000000000000000", // 10,000 ETH
      },
      mining: {
        auto: true,
        interval: 0,
      },
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      // Use default Hardhat accounts
      accounts: [
        "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // Account #0
        "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", // Account #1
      ],
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
  },
  etherscan: {
    apiKey: {
      // Citrea networks (Blockscout doesn't require API key)
      "citrea-dev": "dummy",
      "citrea-prod": "dummy",
    },
    customChains: [
      {
        network: "citrea-dev",
        chainId: 5115,
        urls: {
          apiURL: "https://explorer.testnet.citrea.xyz/api",
          browserURL: "https://explorer.testnet.citrea.xyz",
        },
      },
      {
        network: "citrea-prod",
        chainId: 5115,
        urls: {
          apiURL: "https://explorer.testnet.citrea.xyz/api",
          browserURL: "https://explorer.testnet.citrea.xyz",
        },
      },
    ],
  },
  sourcify: {
    enabled: true,
  },
  docgen: {
    outputDir: "../website/docs/contracts",
    pages: "items",
    exclude: ["mocks/**", "test/**"],
    theme: "markdown",
  },
};

export default config;
