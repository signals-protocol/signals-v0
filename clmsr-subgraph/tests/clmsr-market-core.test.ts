import "./_bootstrap";

import {
  assert,
  describe,
  test,
  clearStore,
  createMockedFunction,
} from "matchstick-as/assembly/index";
import { Address, BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts";

import {
  handleMarketCreated,
  handleMarketFeePolicySet,
  handleTradeFeeCharged,
  handlePositionOpened,
  handlePositionIncreased,
  handlePositionDecreased,
  handlePositionClosed,
} from "../src/clmsr-market-core";
import {
  createMarketCreatedEvent,
  createMarketFeePolicySetEvent,
  createTradeFeeChargedEvent,
  createPositionOpenedEvent,
  createPositionIncreasedEvent,
  createPositionDecreasedEvent,
  createPositionClosedEvent,
} from "./clmsr-market-core-utils";

describe("CLMSR Market Core minimal tests", () => {
  test("handleMarketCreated initialises market and bins", () => {
    clearStore();

    const marketId = BigInt.fromI32(1);
    handleMarketCreated(
      createMarketCreatedEvent(
        marketId,
        BigInt.fromI32(1000),
        BigInt.fromI32(2000),
        BigInt.fromI32(100),
        BigInt.fromI32(200),
        BigInt.fromI32(10),
        BigInt.fromI32(10),
        BigInt.fromString("1000000000000000000")
      )
    );

    assert.entityCount("Market", 1);
    assert.fieldEquals("Market", "1", "marketId", "1");
    assert.fieldEquals("Market", "1", "isActive", "false");
    assert.fieldEquals("Market", "1", "feePolicyAddress", "0x0000000000000000000000000000000000000000");
    assert.entityCount("BinState", 10);
    assert.entityCount("MarketStats", 1);
  });

  test("handleMarketFeePolicySet updates fee policy address", () => {
    clearStore();

    const marketId = BigInt.fromI32(2);
    handleMarketCreated(
      createMarketCreatedEvent(
        marketId,
        BigInt.fromI32(0),
        BigInt.fromI32(1),
        BigInt.fromI32(0),
        BigInt.fromI32(10),
        BigInt.fromI32(5),
        BigInt.fromI32(2),
        BigInt.fromString("1000000000000000000")
      )
    );

    const policy = Address.fromString(
      "0x00000000000000000000000000000000000000F1"
    );

    handleMarketFeePolicySet(
      createMarketFeePolicySetEvent(
        marketId,
        Address.zero(),
        policy,
        BigInt.fromI32(10)
      )
    );

    assert.fieldEquals(
      "Market",
      "2",
      "feePolicyAddress",
      "0x00000000000000000000000000000000000000f1"
    );
    // 성능 최적화로 descriptor는 항상 null (RPC 호출 제거)
    assert.fieldEquals("Market", "2", "feePolicyDescriptor", "null");

    handleMarketFeePolicySet(
      createMarketFeePolicySetEvent(
        marketId,
        policy,
        Address.zero(),
        BigInt.fromI32(20)
      )
    );

    assert.fieldEquals(
      "Market",
      "2",
      "feePolicyAddress",
      "0x0000000000000000000000000000000000000000"
    );
    assert.fieldEquals("Market", "2", "feePolicyDescriptor", "null");
  });

  test("handleTradeFeeCharged attaches fee data to latest trade", () => {
    clearStore();

    const marketId = BigInt.fromI32(3);
    handleMarketCreated(
      createMarketCreatedEvent(
        marketId,
        BigInt.fromI32(1),
        BigInt.fromI32(2),
        BigInt.fromI32(10),
        BigInt.fromI32(20),
        BigInt.fromI32(5),
        BigInt.fromI32(2),
        BigInt.fromString("1000000000000000000")
      )
    );

    const trader = Address.fromString(
      "0x0000000000000000000000000000000000000AAA"
    );
    const positionId = BigInt.fromI32(77);

    const openEvent = createPositionOpenedEvent(
      positionId,
      trader,
      marketId,
      BigInt.fromI32(10),
      BigInt.fromI32(15),
      BigInt.fromI32(5),
      BigInt.fromI32(5000)
    );
    // ensure deterministic id
    openEvent.logIndex = BigInt.fromI32(1);
    handlePositionOpened(openEvent);

    const policy = Address.fromString(
      "0x0000000000000000000000000000000000000BB0"
    );
    createMockedFunction(policy, "descriptor", "descriptor():(string)").returns([
      ethereum.Value.fromString("policy:mock"),
    ]);

    const feeEvent = createTradeFeeChargedEvent(
      trader,
      marketId,
      positionId,
      true,
      BigInt.fromI32(5000),
      BigInt.fromI32(250),
      policy,
      openEvent.block.timestamp.plus(BigInt.fromI32(5))
    );
    feeEvent.transaction.hash = openEvent.transaction.hash;
    feeEvent.logIndex = openEvent.logIndex.plus(BigInt.fromI32(1));

    handleTradeFeeCharged(feeEvent);

    const tradeId = openEvent.transaction.hash
      .concatI32(openEvent.logIndex.toI32())
      .toHexString();

    assert.fieldEquals("Trade", tradeId, "feeAmount", "250");
    assert.fieldEquals(
      "Trade",
      tradeId,
      "feePolicyAddress",
      "0x0000000000000000000000000000000000000bb0"
    );
    assert.fieldEquals("MarketStats", "3", "totalFees", "250");
    assert.fieldEquals("UserPosition", "77", "totalFeesPaid", "250");
    assert.fieldEquals(
      "UserStats",
      trader.toHexString(),
      "totalFeesPaid",
      "250"
    );
  });

  test("handleTradeFeeCharged matches fees across trade lifecycle", () => {
    clearStore();

    const marketId = BigInt.fromI32(9);
    handleMarketCreated(
      createMarketCreatedEvent(
        marketId,
        BigInt.fromI32(0),
        BigInt.fromI32(1000),
        BigInt.fromI32(10),
        BigInt.fromI32(50),
        BigInt.fromI32(5),
        BigInt.fromI32(8),
        BigInt.fromString("1000000000000000000")
      )
    );

    const trader = Address.fromString(
      "0x0000000000000000000000000000000000000CCC"
    );
    const positionId = BigInt.fromI32(1234);

    const openTx = Bytes.fromHexString(
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    ) as Bytes;
    const openEvent = createPositionOpenedEvent(
      positionId,
      trader,
      marketId,
      BigInt.fromI32(15),
      BigInt.fromI32(25),
      BigInt.fromI32(10),
      BigInt.fromI32(1000)
    );
    openEvent.transaction.hash = openTx;
    openEvent.logIndex = BigInt.fromI32(1);
    handlePositionOpened(openEvent);

    const openPolicy = Address.fromString(
      "0x0000000000000000000000000000000000000D01"
    );
    createMockedFunction(
      openPolicy,
      "descriptor",
      "descriptor():(string)"
    ).returns([ethereum.Value.fromString("policy:open")]);

    const openFee = createTradeFeeChargedEvent(
      trader,
      marketId,
      positionId,
      true,
      BigInt.fromI32(1000),
      BigInt.fromI32(50),
      openPolicy,
      openEvent.block.timestamp.plus(BigInt.fromI32(1))
    );
    openFee.transaction.hash = openTx;
    openFee.logIndex = openEvent.logIndex.plus(BigInt.fromI32(1));
    handleTradeFeeCharged(openFee);

    const openTradeId = openTx.concatI32(openEvent.logIndex.toI32()).toHexString();
    assert.fieldEquals("Trade", openTradeId, "feeAmount", "50");

    const increaseTx = Bytes.fromHexString(
      "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    ) as Bytes;
    const increaseEvent = createPositionIncreasedEvent(
      positionId,
      trader,
      BigInt.fromI32(5),
      BigInt.fromI32(15),
      BigInt.fromI32(600)
    );
    increaseEvent.transaction.hash = increaseTx;
    increaseEvent.logIndex = BigInt.fromI32(3);
    handlePositionIncreased(increaseEvent);

    const incPolicy = Address.fromString(
      "0x0000000000000000000000000000000000000D02"
    );
    createMockedFunction(
      incPolicy,
      "descriptor",
      "descriptor():(string)"
    ).returns([ethereum.Value.fromString("policy:increase")]);

    const incFee = createTradeFeeChargedEvent(
      trader,
      marketId,
      positionId,
      true,
      BigInt.fromI32(600),
      BigInt.fromI32(30),
      incPolicy,
      increaseEvent.block.timestamp.plus(BigInt.fromI32(1))
    );
    incFee.transaction.hash = increaseTx;
    incFee.logIndex = increaseEvent.logIndex.plus(BigInt.fromI32(1));
    handleTradeFeeCharged(incFee);

    const incTradeId = increaseTx
      .concatI32(increaseEvent.logIndex.toI32())
      .toHexString();
    assert.fieldEquals("Trade", incTradeId, "feeAmount", "30");

    const decreaseTx = Bytes.fromHexString(
      "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    ) as Bytes;
    const decreaseEvent = createPositionDecreasedEvent(
      positionId,
      trader,
      BigInt.fromI32(4),
      BigInt.fromI32(11),
      BigInt.fromI32(700)
    );
    decreaseEvent.transaction.hash = decreaseTx;
    decreaseEvent.logIndex = BigInt.fromI32(5);
    handlePositionDecreased(decreaseEvent);

    const decPolicy = Address.fromString(
      "0x0000000000000000000000000000000000000D03"
    );
    createMockedFunction(
      decPolicy,
      "descriptor",
      "descriptor():(string)"
    ).returns([ethereum.Value.fromString("policy:decrease")]);

    const decFee = createTradeFeeChargedEvent(
      trader,
      marketId,
      positionId,
      false,
      BigInt.fromI32(700),
      BigInt.fromI32(35),
      decPolicy,
      decreaseEvent.block.timestamp.plus(BigInt.fromI32(1))
    );
    decFee.transaction.hash = decreaseTx;
    decFee.logIndex = decreaseEvent.logIndex.plus(BigInt.fromI32(1));
    handleTradeFeeCharged(decFee);

    const decTradeId = decreaseTx
      .concatI32(decreaseEvent.logIndex.toI32())
      .toHexString();
    assert.fieldEquals("Trade", decTradeId, "feeAmount", "35");

    const closeTx = Bytes.fromHexString(
      "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    ) as Bytes;
    const closeEvent = createPositionClosedEvent(
      positionId,
      trader,
      BigInt.fromI32(1200)
    );
    closeEvent.transaction.hash = closeTx;
    closeEvent.logIndex = BigInt.fromI32(7);
    handlePositionClosed(closeEvent);

    const closePolicy = Address.fromString(
      "0x0000000000000000000000000000000000000D04"
    );
    createMockedFunction(
      closePolicy,
      "descriptor",
      "descriptor():(string)"
    ).returns([ethereum.Value.fromString("policy:close")]);

    const closeFee = createTradeFeeChargedEvent(
      trader,
      marketId,
      positionId,
      false,
      BigInt.fromI32(1200),
      BigInt.fromI32(60),
      closePolicy,
      closeEvent.block.timestamp.plus(BigInt.fromI32(1))
    );
    closeFee.transaction.hash = closeTx;
    closeFee.logIndex = closeEvent.logIndex.plus(BigInt.fromI32(1));
    handleTradeFeeCharged(closeFee);

    const closeTradeId = closeTx
      .concatI32(closeEvent.logIndex.toI32())
      .toHexString();
    assert.fieldEquals("Trade", closeTradeId, "feeAmount", "60");

    const totalFees = BigInt.fromI32(50 + 30 + 35 + 60).toString();
    assert.fieldEquals("MarketStats", "9", "totalFees", totalFees);
    assert.fieldEquals("UserPosition", positionId.toString(), "totalFeesPaid", totalFees);
    assert.fieldEquals(
      "UserStats",
      trader.toHexString(),
      "totalFeesPaid",
      totalFees
    );
    assert.fieldEquals(
      "UserPosition",
      positionId.toString(),
      "tradeCount",
      "4"
    );
  });
});
