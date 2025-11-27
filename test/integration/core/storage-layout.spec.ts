import { expect } from "chai";
import { artifacts } from "hardhat";
import { COMPONENT_TAG } from "../../helpers/tags";

describe(`${COMPONENT_TAG} CLMSRMarketCoreStorage - Storage layout`, function () {
  let layout: any;

  before(async function () {
    const buildInfo = await artifacts.getBuildInfo(
      "contracts/core/storage/CLMSRMarketCoreStorage.sol:CLMSRMarketCoreStorage"
    );

    if (!buildInfo) {
      throw new Error("Missing build info for CLMSRMarketCoreStorage");
    }

    const contracts =
      buildInfo.output.contracts["contracts/core/storage/CLMSRMarketCoreStorage.sol"];
    layout = contracts.CLMSRMarketCoreStorage.storageLayout;
  });

  it("includes settlement oracle state mapping with expected members", function () {
    const mappingEntry = layout.storage.find(
      (slot: any) => slot.label === "settlementOracleState"
    );
    expect(mappingEntry, "settlementOracleState mapping not found").to.exist;

    const mappingType = layout.types[mappingEntry.type];
    expect(mappingType?.encoding).to.equal("mapping");
    expect(String(mappingType?.value)).to.contain("SettlementOracleState");

    const structType = layout.types[mappingType.value];
    expect(structType, "SettlementOracleState struct missing from layout").to.exist;

    const memberLabels = (structType.members || []).map((m: any) => m.label);
    expect(memberLabels).to.include.members([
      "candidateValue",
      "candidatePriceTimestamp",
    ]);

    const candidateValueType = structType.members.find(
      (m: any) => m.label === "candidateValue"
    )?.type;
    const candidateTimestampType = structType.members.find(
      (m: any) => m.label === "candidatePriceTimestamp"
    )?.type;

    expect(candidateValueType).to.match(/^t_int256$/);
    expect(candidateTimestampType).to.match(/^t_uint64$/);
  });

  it("shrinks the gap after inserting the settlement oracle mapping", function () {
    const gapEntry = layout.storage.find((slot: any) => slot.label === "__gap");
    expect(gapEntry, "__gap slot missing").to.exist;

    const match = /t_array\(t_uint256\)(\d+)_storage/.exec(gapEntry.type);
    expect(match?.[1]).to.equal("44");
  });
});
