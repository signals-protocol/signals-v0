/***** TAKE NOTE ******
This is a hack to get genType to work!

In order for genType to produce recursive types, it needs to be at the 
root module of a file. If it's defined in a nested module it does not 
work. So all the MockDb types and internal functions are defined in TestHelpers_MockDb
and only public functions are recreated and exported from this module.

the following module:
```rescript
module MyModule = {
  @genType
  type rec a = {fieldB: b}
  @genType and b = {fieldA: a}
}
```

produces the following in ts:
```ts
// tslint:disable-next-line:interface-over-type-literal
export type MyModule_a = { readonly fieldB: b };

// tslint:disable-next-line:interface-over-type-literal
export type MyModule_b = { readonly fieldA: MyModule_a };
```

fieldB references type b which doesn't exist because it's defined
as MyModule_b
*/

module MockDb = {
  @genType
  let createMockDb = TestHelpers_MockDb.createMockDb
}

@genType
module Addresses = {
  include TestHelpers_MockAddresses
}

module EventFunctions = {
  //Note these are made into a record to make operate in the same way
  //for Res, JS and TS.

  /**
  The arguements that get passed to a "processEvent" helper function
  */
  @genType
  type eventProcessorArgs<'event> = {
    event: 'event,
    mockDb: TestHelpers_MockDb.t,
    @deprecated("Set the chainId for the event instead")
    chainId?: int,
  }

  @genType
  type eventProcessor<'event> = eventProcessorArgs<'event> => promise<TestHelpers_MockDb.t>

  /**
  A function composer to help create individual processEvent functions
  */
  let makeEventProcessor = (~register) => args => {
    let {event, mockDb, ?chainId} =
      args->(Utils.magic: eventProcessorArgs<'event> => eventProcessorArgs<Internal.event>)

    // Have the line here, just in case the function is called with
    // a manually created event. We don't want to break the existing tests here.
    let _ =
      TestHelpers_MockDb.mockEventRegisters->Utils.WeakMap.set(event, register)
    TestHelpers_MockDb.makeProcessEvents(mockDb, ~chainId=?chainId)([event->(Utils.magic: Internal.event => Types.eventLog<unknown>)])
  }

  module MockBlock = {
    @genType
    type t = {
      hash?: string,
      number?: int,
      timestamp?: int,
    }

    let toBlock = (_mock: t) => {
      hash: _mock.hash->Belt.Option.getWithDefault("foo"),
      number: _mock.number->Belt.Option.getWithDefault(0),
      timestamp: _mock.timestamp->Belt.Option.getWithDefault(0),
    }->(Utils.magic: Types.AggregatedBlock.t => Internal.eventBlock)
  }

  module MockTransaction = {
    @genType
    type t = {
      hash?: string,
    }

    let toTransaction = (_mock: t) => {
      hash: _mock.hash->Belt.Option.getWithDefault("foo"),
    }->(Utils.magic: Types.AggregatedTransaction.t => Internal.eventTransaction)
  }

  @genType
  type mockEventData = {
    chainId?: int,
    srcAddress?: Address.t,
    logIndex?: int,
    block?: MockBlock.t,
    transaction?: MockTransaction.t,
  }

  /**
  Applies optional paramters with defaults for all common eventLog field
  */
  let makeEventMocker = (
    ~params: Internal.eventParams,
    ~mockEventData: option<mockEventData>,
    ~register: unit => Internal.eventConfig,
  ): Internal.event => {
    let {?block, ?transaction, ?srcAddress, ?chainId, ?logIndex} =
      mockEventData->Belt.Option.getWithDefault({})
    let block = block->Belt.Option.getWithDefault({})->MockBlock.toBlock
    let transaction = transaction->Belt.Option.getWithDefault({})->MockTransaction.toTransaction
    let config = RegisterHandlers.getConfig()
    let event: Internal.event = {
      params,
      transaction,
      chainId: switch chainId {
      | Some(chainId) => chainId
      | None =>
        switch config.defaultChain {
        | Some(chainConfig) => chainConfig.id
        | None =>
          Js.Exn.raiseError(
            "No default chain Id found, please add at least 1 chain to your config.yaml",
          )
        }
      },
      block,
      srcAddress: srcAddress->Belt.Option.getWithDefault(Addresses.defaultAddress),
      logIndex: logIndex->Belt.Option.getWithDefault(0),
    }
    // Since currently it's not possible to figure out the event config from the event
    // we store a reference to the register function by event in a weak map
    let _ = TestHelpers_MockDb.mockEventRegisters->Utils.WeakMap.set(event, register)
    event
  }
}


module CLMSRMarketCore = {
  module MarketCreated = {
    @genType
    let processEvent: EventFunctions.eventProcessor<Types.CLMSRMarketCore.MarketCreated.event> = EventFunctions.makeEventProcessor(
      ~register=(Types.CLMSRMarketCore.MarketCreated.register :> unit => Internal.eventConfig),
    )

    @genType
    type createMockArgs = {
      @as("marketId")
      marketId?: bigint,
      @as("startTimestamp")
      startTimestamp?: bigint,
      @as("endTimestamp")
      endTimestamp?: bigint,
      @as("minTick")
      minTick?: bigint,
      @as("maxTick")
      maxTick?: bigint,
      @as("tickSpacing")
      tickSpacing?: bigint,
      @as("numBins")
      numBins?: bigint,
      @as("liquidityParameter")
      liquidityParameter?: bigint,
      mockEventData?: EventFunctions.mockEventData,
    }

    @genType
    let createMockEvent = args => {
      let {
        ?marketId,
        ?startTimestamp,
        ?endTimestamp,
        ?minTick,
        ?maxTick,
        ?tickSpacing,
        ?numBins,
        ?liquidityParameter,
        ?mockEventData,
      } = args

      let params = 
      {
       marketId: marketId->Belt.Option.getWithDefault(0n),
       startTimestamp: startTimestamp->Belt.Option.getWithDefault(0n),
       endTimestamp: endTimestamp->Belt.Option.getWithDefault(0n),
       minTick: minTick->Belt.Option.getWithDefault(0n),
       maxTick: maxTick->Belt.Option.getWithDefault(0n),
       tickSpacing: tickSpacing->Belt.Option.getWithDefault(0n),
       numBins: numBins->Belt.Option.getWithDefault(0n),
       liquidityParameter: liquidityParameter->Belt.Option.getWithDefault(0n),
      }
->(Utils.magic: Types.CLMSRMarketCore.MarketCreated.eventArgs => Internal.eventParams)

      EventFunctions.makeEventMocker(
        ~params,
        ~mockEventData,
        ~register=(Types.CLMSRMarketCore.MarketCreated.register :> unit => Internal.eventConfig),
      )->(Utils.magic: Internal.event => Types.CLMSRMarketCore.MarketCreated.event)
    }
  }

  module MarketSettled = {
    @genType
    let processEvent: EventFunctions.eventProcessor<Types.CLMSRMarketCore.MarketSettled.event> = EventFunctions.makeEventProcessor(
      ~register=(Types.CLMSRMarketCore.MarketSettled.register :> unit => Internal.eventConfig),
    )

    @genType
    type createMockArgs = {
      @as("marketId")
      marketId?: bigint,
      @as("settlementTick")
      settlementTick?: bigint,
      mockEventData?: EventFunctions.mockEventData,
    }

    @genType
    let createMockEvent = args => {
      let {
        ?marketId,
        ?settlementTick,
        ?mockEventData,
      } = args

      let params = 
      {
       marketId: marketId->Belt.Option.getWithDefault(0n),
       settlementTick: settlementTick->Belt.Option.getWithDefault(0n),
      }
->(Utils.magic: Types.CLMSRMarketCore.MarketSettled.eventArgs => Internal.eventParams)

      EventFunctions.makeEventMocker(
        ~params,
        ~mockEventData,
        ~register=(Types.CLMSRMarketCore.MarketSettled.register :> unit => Internal.eventConfig),
      )->(Utils.magic: Internal.event => Types.CLMSRMarketCore.MarketSettled.event)
    }
  }

  module MarketReopened = {
    @genType
    let processEvent: EventFunctions.eventProcessor<Types.CLMSRMarketCore.MarketReopened.event> = EventFunctions.makeEventProcessor(
      ~register=(Types.CLMSRMarketCore.MarketReopened.register :> unit => Internal.eventConfig),
    )

    @genType
    type createMockArgs = {
      @as("marketId")
      marketId?: bigint,
      mockEventData?: EventFunctions.mockEventData,
    }

    @genType
    let createMockEvent = args => {
      let {
        ?marketId,
        ?mockEventData,
      } = args

      let params = 
      {
       marketId: marketId->Belt.Option.getWithDefault(0n),
      }
->(Utils.magic: Types.CLMSRMarketCore.MarketReopened.eventArgs => Internal.eventParams)

      EventFunctions.makeEventMocker(
        ~params,
        ~mockEventData,
        ~register=(Types.CLMSRMarketCore.MarketReopened.register :> unit => Internal.eventConfig),
      )->(Utils.magic: Internal.event => Types.CLMSRMarketCore.MarketReopened.event)
    }
  }

  module PositionClaimed = {
    @genType
    let processEvent: EventFunctions.eventProcessor<Types.CLMSRMarketCore.PositionClaimed.event> = EventFunctions.makeEventProcessor(
      ~register=(Types.CLMSRMarketCore.PositionClaimed.register :> unit => Internal.eventConfig),
    )

    @genType
    type createMockArgs = {
      @as("positionId")
      positionId?: bigint,
      @as("trader")
      trader?: Address.t,
      @as("payout")
      payout?: bigint,
      mockEventData?: EventFunctions.mockEventData,
    }

    @genType
    let createMockEvent = args => {
      let {
        ?positionId,
        ?trader,
        ?payout,
        ?mockEventData,
      } = args

      let params = 
      {
       positionId: positionId->Belt.Option.getWithDefault(0n),
       trader: trader->Belt.Option.getWithDefault(TestHelpers_MockAddresses.defaultAddress),
       payout: payout->Belt.Option.getWithDefault(0n),
      }
->(Utils.magic: Types.CLMSRMarketCore.PositionClaimed.eventArgs => Internal.eventParams)

      EventFunctions.makeEventMocker(
        ~params,
        ~mockEventData,
        ~register=(Types.CLMSRMarketCore.PositionClaimed.register :> unit => Internal.eventConfig),
      )->(Utils.magic: Internal.event => Types.CLMSRMarketCore.PositionClaimed.event)
    }
  }

  module PositionClosed = {
    @genType
    let processEvent: EventFunctions.eventProcessor<Types.CLMSRMarketCore.PositionClosed.event> = EventFunctions.makeEventProcessor(
      ~register=(Types.CLMSRMarketCore.PositionClosed.register :> unit => Internal.eventConfig),
    )

    @genType
    type createMockArgs = {
      @as("positionId")
      positionId?: bigint,
      @as("trader")
      trader?: Address.t,
      @as("proceeds")
      proceeds?: bigint,
      mockEventData?: EventFunctions.mockEventData,
    }

    @genType
    let createMockEvent = args => {
      let {
        ?positionId,
        ?trader,
        ?proceeds,
        ?mockEventData,
      } = args

      let params = 
      {
       positionId: positionId->Belt.Option.getWithDefault(0n),
       trader: trader->Belt.Option.getWithDefault(TestHelpers_MockAddresses.defaultAddress),
       proceeds: proceeds->Belt.Option.getWithDefault(0n),
      }
->(Utils.magic: Types.CLMSRMarketCore.PositionClosed.eventArgs => Internal.eventParams)

      EventFunctions.makeEventMocker(
        ~params,
        ~mockEventData,
        ~register=(Types.CLMSRMarketCore.PositionClosed.register :> unit => Internal.eventConfig),
      )->(Utils.magic: Internal.event => Types.CLMSRMarketCore.PositionClosed.event)
    }
  }

  module PositionDecreased = {
    @genType
    let processEvent: EventFunctions.eventProcessor<Types.CLMSRMarketCore.PositionDecreased.event> = EventFunctions.makeEventProcessor(
      ~register=(Types.CLMSRMarketCore.PositionDecreased.register :> unit => Internal.eventConfig),
    )

    @genType
    type createMockArgs = {
      @as("positionId")
      positionId?: bigint,
      @as("trader")
      trader?: Address.t,
      @as("sellQuantity")
      sellQuantity?: bigint,
      @as("newQuantity")
      newQuantity?: bigint,
      @as("proceeds")
      proceeds?: bigint,
      mockEventData?: EventFunctions.mockEventData,
    }

    @genType
    let createMockEvent = args => {
      let {
        ?positionId,
        ?trader,
        ?sellQuantity,
        ?newQuantity,
        ?proceeds,
        ?mockEventData,
      } = args

      let params = 
      {
       positionId: positionId->Belt.Option.getWithDefault(0n),
       trader: trader->Belt.Option.getWithDefault(TestHelpers_MockAddresses.defaultAddress),
       sellQuantity: sellQuantity->Belt.Option.getWithDefault(0n),
       newQuantity: newQuantity->Belt.Option.getWithDefault(0n),
       proceeds: proceeds->Belt.Option.getWithDefault(0n),
      }
->(Utils.magic: Types.CLMSRMarketCore.PositionDecreased.eventArgs => Internal.eventParams)

      EventFunctions.makeEventMocker(
        ~params,
        ~mockEventData,
        ~register=(Types.CLMSRMarketCore.PositionDecreased.register :> unit => Internal.eventConfig),
      )->(Utils.magic: Internal.event => Types.CLMSRMarketCore.PositionDecreased.event)
    }
  }

  module PositionIncreased = {
    @genType
    let processEvent: EventFunctions.eventProcessor<Types.CLMSRMarketCore.PositionIncreased.event> = EventFunctions.makeEventProcessor(
      ~register=(Types.CLMSRMarketCore.PositionIncreased.register :> unit => Internal.eventConfig),
    )

    @genType
    type createMockArgs = {
      @as("positionId")
      positionId?: bigint,
      @as("trader")
      trader?: Address.t,
      @as("additionalQuantity")
      additionalQuantity?: bigint,
      @as("newQuantity")
      newQuantity?: bigint,
      @as("cost")
      cost?: bigint,
      mockEventData?: EventFunctions.mockEventData,
    }

    @genType
    let createMockEvent = args => {
      let {
        ?positionId,
        ?trader,
        ?additionalQuantity,
        ?newQuantity,
        ?cost,
        ?mockEventData,
      } = args

      let params = 
      {
       positionId: positionId->Belt.Option.getWithDefault(0n),
       trader: trader->Belt.Option.getWithDefault(TestHelpers_MockAddresses.defaultAddress),
       additionalQuantity: additionalQuantity->Belt.Option.getWithDefault(0n),
       newQuantity: newQuantity->Belt.Option.getWithDefault(0n),
       cost: cost->Belt.Option.getWithDefault(0n),
      }
->(Utils.magic: Types.CLMSRMarketCore.PositionIncreased.eventArgs => Internal.eventParams)

      EventFunctions.makeEventMocker(
        ~params,
        ~mockEventData,
        ~register=(Types.CLMSRMarketCore.PositionIncreased.register :> unit => Internal.eventConfig),
      )->(Utils.magic: Internal.event => Types.CLMSRMarketCore.PositionIncreased.event)
    }
  }

  module PositionOpened = {
    @genType
    let processEvent: EventFunctions.eventProcessor<Types.CLMSRMarketCore.PositionOpened.event> = EventFunctions.makeEventProcessor(
      ~register=(Types.CLMSRMarketCore.PositionOpened.register :> unit => Internal.eventConfig),
    )

    @genType
    type createMockArgs = {
      @as("positionId")
      positionId?: bigint,
      @as("trader")
      trader?: Address.t,
      @as("marketId")
      marketId?: bigint,
      @as("lowerTick")
      lowerTick?: bigint,
      @as("upperTick")
      upperTick?: bigint,
      @as("quantity")
      quantity?: bigint,
      @as("cost")
      cost?: bigint,
      mockEventData?: EventFunctions.mockEventData,
    }

    @genType
    let createMockEvent = args => {
      let {
        ?positionId,
        ?trader,
        ?marketId,
        ?lowerTick,
        ?upperTick,
        ?quantity,
        ?cost,
        ?mockEventData,
      } = args

      let params = 
      {
       positionId: positionId->Belt.Option.getWithDefault(0n),
       trader: trader->Belt.Option.getWithDefault(TestHelpers_MockAddresses.defaultAddress),
       marketId: marketId->Belt.Option.getWithDefault(0n),
       lowerTick: lowerTick->Belt.Option.getWithDefault(0n),
       upperTick: upperTick->Belt.Option.getWithDefault(0n),
       quantity: quantity->Belt.Option.getWithDefault(0n),
       cost: cost->Belt.Option.getWithDefault(0n),
      }
->(Utils.magic: Types.CLMSRMarketCore.PositionOpened.eventArgs => Internal.eventParams)

      EventFunctions.makeEventMocker(
        ~params,
        ~mockEventData,
        ~register=(Types.CLMSRMarketCore.PositionOpened.register :> unit => Internal.eventConfig),
      )->(Utils.magic: Internal.event => Types.CLMSRMarketCore.PositionOpened.event)
    }
  }

  module PositionSettled = {
    @genType
    let processEvent: EventFunctions.eventProcessor<Types.CLMSRMarketCore.PositionSettled.event> = EventFunctions.makeEventProcessor(
      ~register=(Types.CLMSRMarketCore.PositionSettled.register :> unit => Internal.eventConfig),
    )

    @genType
    type createMockArgs = {
      @as("positionId")
      positionId?: bigint,
      @as("trader")
      trader?: Address.t,
      @as("payout")
      payout?: bigint,
      @as("isWin")
      isWin?: bool,
      mockEventData?: EventFunctions.mockEventData,
    }

    @genType
    let createMockEvent = args => {
      let {
        ?positionId,
        ?trader,
        ?payout,
        ?isWin,
        ?mockEventData,
      } = args

      let params = 
      {
       positionId: positionId->Belt.Option.getWithDefault(0n),
       trader: trader->Belt.Option.getWithDefault(TestHelpers_MockAddresses.defaultAddress),
       payout: payout->Belt.Option.getWithDefault(0n),
       isWin: isWin->Belt.Option.getWithDefault(false),
      }
->(Utils.magic: Types.CLMSRMarketCore.PositionSettled.eventArgs => Internal.eventParams)

      EventFunctions.makeEventMocker(
        ~params,
        ~mockEventData,
        ~register=(Types.CLMSRMarketCore.PositionSettled.register :> unit => Internal.eventConfig),
      )->(Utils.magic: Internal.event => Types.CLMSRMarketCore.PositionSettled.event)
    }
  }

  module RangeFactorApplied = {
    @genType
    let processEvent: EventFunctions.eventProcessor<Types.CLMSRMarketCore.RangeFactorApplied.event> = EventFunctions.makeEventProcessor(
      ~register=(Types.CLMSRMarketCore.RangeFactorApplied.register :> unit => Internal.eventConfig),
    )

    @genType
    type createMockArgs = {
      @as("marketId")
      marketId?: bigint,
      @as("lo")
      lo?: bigint,
      @as("hi")
      hi?: bigint,
      @as("factor")
      factor?: bigint,
      mockEventData?: EventFunctions.mockEventData,
    }

    @genType
    let createMockEvent = args => {
      let {
        ?marketId,
        ?lo,
        ?hi,
        ?factor,
        ?mockEventData,
      } = args

      let params = 
      {
       marketId: marketId->Belt.Option.getWithDefault(0n),
       lo: lo->Belt.Option.getWithDefault(0n),
       hi: hi->Belt.Option.getWithDefault(0n),
       factor: factor->Belt.Option.getWithDefault(0n),
      }
->(Utils.magic: Types.CLMSRMarketCore.RangeFactorApplied.eventArgs => Internal.eventParams)

      EventFunctions.makeEventMocker(
        ~params,
        ~mockEventData,
        ~register=(Types.CLMSRMarketCore.RangeFactorApplied.register :> unit => Internal.eventConfig),
      )->(Utils.magic: Internal.event => Types.CLMSRMarketCore.RangeFactorApplied.event)
    }
  }

  module MarketSettlementValueSubmitted = {
    @genType
    let processEvent: EventFunctions.eventProcessor<Types.CLMSRMarketCore.MarketSettlementValueSubmitted.event> = EventFunctions.makeEventProcessor(
      ~register=(Types.CLMSRMarketCore.MarketSettlementValueSubmitted.register :> unit => Internal.eventConfig),
    )

    @genType
    type createMockArgs = {
      @as("marketId")
      marketId?: bigint,
      @as("settlementValue")
      settlementValue?: bigint,
      mockEventData?: EventFunctions.mockEventData,
    }

    @genType
    let createMockEvent = args => {
      let {
        ?marketId,
        ?settlementValue,
        ?mockEventData,
      } = args

      let params = 
      {
       marketId: marketId->Belt.Option.getWithDefault(0n),
       settlementValue: settlementValue->Belt.Option.getWithDefault(0n),
      }
->(Utils.magic: Types.CLMSRMarketCore.MarketSettlementValueSubmitted.eventArgs => Internal.eventParams)

      EventFunctions.makeEventMocker(
        ~params,
        ~mockEventData,
        ~register=(Types.CLMSRMarketCore.MarketSettlementValueSubmitted.register :> unit => Internal.eventConfig),
      )->(Utils.magic: Internal.event => Types.CLMSRMarketCore.MarketSettlementValueSubmitted.event)
    }
  }

}


module PointsGranter = {
  module PointsGranted = {
    @genType
    let processEvent: EventFunctions.eventProcessor<Types.PointsGranter.PointsGranted.event> = EventFunctions.makeEventProcessor(
      ~register=(Types.PointsGranter.PointsGranted.register :> unit => Internal.eventConfig),
    )

    @genType
    type createMockArgs = {
      @as("user")
      user?: Address.t,
      @as("amount")
      amount?: bigint,
      @as("reason")
      reason?: bigint,
      @as("contextTs")
      contextTs?: bigint,
      mockEventData?: EventFunctions.mockEventData,
    }

    @genType
    let createMockEvent = args => {
      let {
        ?user,
        ?amount,
        ?reason,
        ?contextTs,
        ?mockEventData,
      } = args

      let params = 
      {
       user: user->Belt.Option.getWithDefault(TestHelpers_MockAddresses.defaultAddress),
       amount: amount->Belt.Option.getWithDefault(0n),
       reason: reason->Belt.Option.getWithDefault(0n),
       contextTs: contextTs->Belt.Option.getWithDefault(0n),
      }
->(Utils.magic: Types.PointsGranter.PointsGranted.eventArgs => Internal.eventParams)

      EventFunctions.makeEventMocker(
        ~params,
        ~mockEventData,
        ~register=(Types.PointsGranter.PointsGranted.register :> unit => Internal.eventConfig),
      )->(Utils.magic: Internal.event => Types.PointsGranter.PointsGranted.event)
    }
  }

}

