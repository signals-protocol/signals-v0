import { expect } from "chai";
import fs from "fs";
import path from "path";
import { UNIT_TAG } from "../../helpers/tags";

describe(`${UNIT_TAG} MockPosition - ABI Golden Snapshot`, function () {
  const workspaceRoot = process.cwd();
  const artifactPath = path.join(
    workspaceRoot,
    "artifacts",
    "contracts",
    "mocks",
    "MockPosition.sol",
    "MockPosition.json"
  );
  const goldenPath = path.join(
    workspaceRoot,
    "test",
    "abi",
    "mock-position.abi.json"
  );

  const formatType = (param: any): string => {
    if (!param) {
      return "";
    }
    const base = param.type as string;
    if (base.startsWith("tuple")) {
      const suffix = base.slice("tuple".length);
      const inner = (param.components || []).map(formatType).join(",");
      return `(${inner})${suffix}`;
    }
    return base;
  };

  const formatInputs = (inputs: any[] | undefined, forEvent = false): string => {
    if (!inputs || inputs.length === 0) {
      return "";
    }
    return inputs
      .map((input) => {
        const type = formatType(input);
        if (forEvent && input.indexed) {
          return `indexed ${type}`;
        }
        return type;
      })
      .join(",");
  };

  const signatureForItem = (item: any): string => {
    switch (item.type) {
      case "function": {
        const inputs = formatInputs(item.inputs);
        const outputs = formatInputs(item.outputs);
        const mutability =
          item.stateMutability && item.stateMutability !== "nonpayable"
            ? ` ${item.stateMutability}`
            : "";
        const returnsClause = outputs ? ` returns (${outputs})` : "";
        return `function ${item.name}${mutability}(${inputs})${returnsClause}`.trim();
      }
      case "event": {
        const inputs = formatInputs(item.inputs, true);
        const anon = item.anonymous ? " anonymous" : "";
        return `event${anon} ${item.name}(${inputs})`.trim();
      }
      case "error": {
        const inputs = formatInputs(item.inputs);
        return `error ${item.name}(${inputs})`;
      }
      case "constructor": {
        const inputs = formatInputs(item.inputs);
        const mutability =
          item.stateMutability && item.stateMutability !== "nonpayable"
            ? ` ${item.stateMutability}`
            : "";
        return `constructor${mutability}(${inputs})`.trim();
      }
      case "fallback":
        return "fallback";
      case "receive":
        return "receive";
      default:
        return `${item.type}`;
    }
  };

  it("matches the golden snapshot", function () {
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    const current = (artifact.abi as any[])
      .map(signatureForItem)
      .sort();
    const golden = JSON.parse(fs.readFileSync(goldenPath, "utf8"));

    expect(current).to.deep.equal(golden);
  });
});
