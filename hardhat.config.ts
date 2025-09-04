import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@openzeppelin/hardhat-upgrades";
import "hardhat-gas-reporter";
import "hardhat-tracer";
import "solidity-docgen";
import dotenv from "dotenv";

dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      viaIR: true,
      optimizer: {
        enabled: true,
        runs: 40, // Lowered from 200 to reduce contract size for EIP-170 compliance
      },
      metadata: {
        bytecodeHash: "none", // Remove metadata hash to save additional bytes
      },
    },
  },
  networks: {
    // Arbitrum Sepolia Testnet
    "arbitrum-sepolia": {
      url: "https://sepolia-rollup.arbitrum.io/rpc",
      chainId: 421614,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    // World Chain Sepolia Testnet
    "worldchain-sepolia": {
      url: "https://worldchain-sepolia.g.alchemy.com/public",
      chainId: 4801,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    // Base Mainnet (Production) - Alchemy RPC
    "base-prod": {
      url: "https://base-mainnet.g.allthatnode.com/archive/evm/***REMOVED***",
      chainId: 8453,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    // Base Mainnet (Development) - Alchemy RPC
    "base-dev": {
      url: "https://base-mainnet.g.allthatnode.com/archive/evm/***REMOVED***",
      chainId: 8453,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    // Citrea Testnet Tangerine (Production)
    "citrea-prod": {
      url: "https://rpc.testnet.citrea.xyz",
      chainId: 5115,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    // Citrea Testnet Tangerine (Development)
    "citrea-dev": {
      url: "https://rpc.testnet.citrea.xyz",
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
      // Base networks
      "base-prod": process.env.BASESCAN_API_KEY || "",
      "base-dev": process.env.BASESCAN_API_KEY || "",
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
  docgen: {
    outputDir: "../website/docs/contracts",
    pages: "items",
    exclude: ["mocks/**", "test/**"],
    templates: "default",
  },
};

export default config;
