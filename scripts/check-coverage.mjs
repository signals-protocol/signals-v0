#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const summaryPath = resolve("coverage/coverage-final.json");

if (!existsSync(summaryPath)) {
  console.error("Coverage summary not found. Run `npm run coverage` before checking thresholds.");
  process.exit(1);
}

const data = JSON.parse(readFileSync(summaryPath, "utf-8"));

const totals = {
  statements: { covered: 0, total: 0 },
  branches: { covered: 0, total: 0 },
  functions: { covered: 0, total: 0 },
  lines: { covered: 0, total: 0 },
};

for (const contract of Object.values(data)) {
  if (!contract || typeof contract !== "object") continue;

  const statements = contract.s ?? {};
  totals.statements.total += Object.keys(statements).length;
  totals.statements.covered += Object.values(statements).filter((hit) => hit > 0).length;

  const branches = contract.b ?? {};
  for (const hits of Object.values(branches)) {
    if (!Array.isArray(hits)) continue;
    totals.branches.total += hits.length;
    totals.branches.covered += hits.filter((hit) => hit > 0).length;
  }

  const functions = contract.f ?? {};
  totals.functions.total += Object.keys(functions).length;
  totals.functions.covered += Object.values(functions).filter((hit) => hit > 0).length;

  const lines = contract.l ?? {};
  totals.lines.total += Object.keys(lines).length;
  totals.lines.covered += Object.values(lines).filter((hit) => hit > 0).length;
}

const thresholds = {
  statements: process.env.COVERAGE_THRESHOLD_STATEMENTS
    ? Number(process.env.COVERAGE_THRESHOLD_STATEMENTS)
    : 0.8,
  branches: process.env.COVERAGE_THRESHOLD_BRANCHES
    ? Number(process.env.COVERAGE_THRESHOLD_BRANCHES)
    : 0.55,
  functions: process.env.COVERAGE_THRESHOLD_FUNCTIONS
    ? Number(process.env.COVERAGE_THRESHOLD_FUNCTIONS)
    : 0.75,
  lines: process.env.COVERAGE_THRESHOLD_LINES
    ? Number(process.env.COVERAGE_THRESHOLD_LINES)
    : 0.8,
};
let hasFailure = false;

for (const [metric, info] of Object.entries(totals)) {
  if (info.total === 0) continue;
  const ratio = info.covered / info.total;
  const percent = (ratio * 100).toFixed(2);
  const threshold = thresholds[metric] ?? thresholds.statements;
  if (ratio < threshold) {
    console.error(`❌ Coverage for ${metric} is ${percent}% (required ≥ ${threshold * 100}%)`);
    hasFailure = true;
  } else {
    console.log(`✅ Coverage for ${metric} is ${percent}%`);
  }
}

if (hasFailure) {
  process.exit(1);
}

console.log("Coverage thresholds satisfied.");
