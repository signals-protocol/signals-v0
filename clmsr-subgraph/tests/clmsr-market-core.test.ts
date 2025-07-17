import {
  assert,
  describe,
  test,
  clearStore,
  beforeAll,
  afterAll
} from "matchstick-as/assembly/index"
import { Address, BigInt } from "@graphprotocol/graph-ts"
import { EmergencyPaused } from "../generated/schema"
import { EmergencyPaused as EmergencyPausedEvent } from "../generated/CLMSRMarketCore/CLMSRMarketCore"
import { handleEmergencyPaused } from "../src/clmsr-market-core"
import { createEmergencyPausedEvent } from "./clmsr-market-core-utils"

// Tests structure (matchstick-as >=0.5.0)
// https://thegraph.com/docs/en/subgraphs/developing/creating/unit-testing-framework/#tests-structure

describe("Describe entity assertions", () => {
  beforeAll(() => {
    let by = Address.fromString("0x0000000000000000000000000000000000000001")
    let reason = "Example string value"
    let newEmergencyPausedEvent = createEmergencyPausedEvent(by, reason)
    handleEmergencyPaused(newEmergencyPausedEvent)
  })

  afterAll(() => {
    clearStore()
  })

  // For more test scenarios, see:
  // https://thegraph.com/docs/en/subgraphs/developing/creating/unit-testing-framework/#write-a-unit-test

  test("EmergencyPaused created and stored", () => {
    assert.entityCount("EmergencyPaused", 1)

    // 0xa16081f360e3847006db660bae1c6d1b2e17ec2a is the default address used in newMockEvent() function
    assert.fieldEquals(
      "EmergencyPaused",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "by",
      "0x0000000000000000000000000000000000000001"
    )
    assert.fieldEquals(
      "EmergencyPaused",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "reason",
      "Example string value"
    )

    // More assert options:
    // https://thegraph.com/docs/en/subgraphs/developing/creating/unit-testing-framework/#asserts
  })
})
