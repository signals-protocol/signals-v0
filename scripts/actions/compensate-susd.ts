import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import type { Environment } from "../types/environment";
import { envManager } from "../utils/environment";

interface CsvRow {
  user: string;
  total_cost_microUSDC: string;
  total_proceeds_microUSDC: string;
  net_microUSDC: string;
  total_cost_USDC: string;
  total_proceeds_USDC: string;
  net_USDC: string;
  trades_count: string;
}

function parseCsv(filePath: string): CsvRow[] {
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((h) => h.trim());
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const row: any = {};
    for (let j = 0; j < header.length && j < cols.length; j++) {
      row[header[j]] = cols[j].trim();
    }
    rows.push(row as CsvRow);
  }
  return rows;
}

export async function compensateSUSDAction(
  environment: Environment
): Promise<void> {
  const marketId = process.env.MARKET_ID || "24";
  const csvPathArg =
    process.env.CSV ||
    path.resolve(
      __dirname,
      `../../verification/investors-market-${marketId}.csv`
    );
  const batch = parseInt(process.env.BATCH || "50");
  const dryRun = (process.env.DRY_RUN || "false").toLowerCase() === "true";

  console.log(`💸 Compensate SUSD - environment=${environment}`);
  console.log(`📄 CSV: ${csvPathArg}`);
  console.log(`🧪 DryRun: ${dryRun}`);
  console.log(`📦 Batch size: ${batch}`);

  const [signer] = await ethers.getSigners();
  console.log("👤 Sender:", signer.address);

  // Load SUSD address from environment file
  const susdAddress = envManager.getSUSDAddress(environment);
  if (!susdAddress) {
    throw new Error(`SUSD address not set in ${environment} environment`);
  }
  console.log("🪙 SUSD:", susdAddress);

  const token = await ethers.getContractAt("MockERC20", susdAddress);

  // Load CSV
  if (!fs.existsSync(csvPathArg)) {
    throw new Error(`CSV not found: ${csvPathArg}`);
  }
  const records = parseCsv(csvPathArg);
  if (records.length === 0) {
    console.log("⚠️  No records to process.");
    return;
  }

  // Compute totals
  const payouts = records.map((r) => ({
    user: r.user,
    amountMicro: BigInt(r.total_cost_microUSDC) * 2n,
  }));
  const totalMicro = payouts.reduce((s, p) => s + p.amountMicro, 0n);

  const toUsdc = (micro: bigint) => {
    const sign = micro < 0n ? "-" : "";
    const abs = micro < 0n ? -micro : micro;
    const intPart = abs / 1000000n;
    const frac = (abs % 1000000n).toString().padStart(6, "0");
    return `${sign}${intPart.toString()}.${frac}`;
  };

  console.log(`📊 Recipients: ${payouts.length}`);
  console.log(
    `Σ payout: ${totalMicro.toString()} micro (${toUsdc(totalMicro)} SUSD)`
  );

  // Balance / mint guard
  const balance = await token.balanceOf(signer.address);
  const balanceMicro = BigInt(balance.toString());
  console.log(
    `💳 Sender balance: ${balanceMicro.toString()} micro (${toUsdc(
      balanceMicro
    )} SUSD)`
  );

  if (balanceMicro < totalMicro) {
    console.log("⚠️  Insufficient SUSD. Attempting mint by owner...");
    try {
      const mintTx = await token.mint(
        signer.address,
        totalMicro - balanceMicro
      );
      await mintTx.wait();
      console.log("✅ Minted:", toUsdc(totalMicro - balanceMicro), "SUSD");
    } catch (e) {
      console.log(
        "⚠️  Mint failed or not owner. You must fund the wallet before sending."
      );
    }
  }

  if (dryRun) {
    console.log(
      "🧪 Dry run only - Not sending transfers. Showing first 5 rows:"
    );
    payouts.slice(0, 5).forEach((p, i) => {
      console.log(`#${i + 1}`, p.user, toUsdc(p.amountMicro));
    });
    return;
  }

  // Execute transfers in batches
  let sent = 0;
  for (let i = 0; i < payouts.length; i += batch) {
    const slice = payouts.slice(i, i + batch);
    console.log(
      `\n📦 Sending batch ${i / batch + 1} (${slice.length} transfers)...`
    );
    for (const p of slice) {
      try {
        const tx = await token.transfer(p.user, p.amountMicro);
        const rcpt = await tx.wait();
        sent += 1;
        console.log(
          `✅ Sent ${toUsdc(p.amountMicro)} to ${p.user} (tx: ${rcpt?.hash})`
        );
      } catch (err) {
        console.error(`❌ Failed to send to ${p.user}:`, err);
      }
    }
  }

  console.log(
    `\n🎉 Completed. Successful transfers: ${sent}/${payouts.length}`
  );
}

export async function compensateSUSDCLI(
  environment: Environment
): Promise<void> {
  await compensateSUSDAction(environment);
}
