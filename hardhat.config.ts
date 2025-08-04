import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-gas-reporter";
import dotenv from "dotenv";

dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      viaIR: true,
      optimizer: {
        enabled: true,
        runs: 200,
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
    // Base Mainnet
    base: {
      url: "https://mainnet.base.org",
      chainId: 8453,
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
      // Use environment variables for localhost accounts or let Hardhat auto-generate
      accounts: process.env.LOCALHOST_PRIVATE_KEYS
        ? process.env.LOCALHOST_PRIVATE_KEYS.split(",")
        : [], // Hardhat will use default accounts if empty
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
  },
  etherscan: {
    // Use environment variable for API key
    apiKey: process.env.ETHERSCAN_API_KEY || "",
  },
};

export default config;
