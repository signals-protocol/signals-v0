#!/usr/bin/env node

const { spawnSync } = require("node:child_process");

const result = spawnSync("npx", ["hardhat", "test", "--grep", "@replay"], {
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    RUN_REPLAY: "1",
  },
});

if (typeof result.status === "number") {
  process.exit(result.status);
}

process.exit(1);
