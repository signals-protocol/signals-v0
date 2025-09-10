@val external require: string => unit = "require"

let registerContractHandlers = (
  ~contractName,
  ~handlerPathRelativeToRoot,
  ~handlerPathRelativeToConfig,
) => {
  try {
    require(`../${Path.relativePathToRootFromGenerated}/${handlerPathRelativeToRoot}`)
  } catch {
  | exn =>
    let params = {
      "Contract Name": contractName,
      "Expected Handler Path": handlerPathRelativeToConfig,
      "Code": "EE500",
    }
    let logger = Logging.createChild(~params)

    let errHandler = exn->ErrorHandling.make(~msg="Failed to import handler file", ~logger)
    errHandler->ErrorHandling.log
    errHandler->ErrorHandling.raiseExn
  }
}

%%private(
  let makeGeneratedConfig = () => {
    let chains = [
      {
        let contracts = [
          {
            InternalConfig.name: "CLMSRMarketCore",
            abi: Types.CLMSRMarketCore.abi,
            addresses: [
              "0xE480ca1C63B6dd929af1EeA4D3de1073942F3cEf"->Address.Evm.fromStringOrThrow
,
            ],
            events: [
              (Types.CLMSRMarketCore.MarketCreated.register() :> Internal.eventConfig),
              (Types.CLMSRMarketCore.MarketSettled.register() :> Internal.eventConfig),
              (Types.CLMSRMarketCore.MarketReopened.register() :> Internal.eventConfig),
              (Types.CLMSRMarketCore.PositionClaimed.register() :> Internal.eventConfig),
              (Types.CLMSRMarketCore.PositionClosed.register() :> Internal.eventConfig),
              (Types.CLMSRMarketCore.PositionDecreased.register() :> Internal.eventConfig),
              (Types.CLMSRMarketCore.PositionIncreased.register() :> Internal.eventConfig),
              (Types.CLMSRMarketCore.PositionOpened.register() :> Internal.eventConfig),
              (Types.CLMSRMarketCore.PositionSettled.register() :> Internal.eventConfig),
              (Types.CLMSRMarketCore.RangeFactorApplied.register() :> Internal.eventConfig),
              (Types.CLMSRMarketCore.MarketSettlementValueSubmitted.register() :> Internal.eventConfig),
            ],
            startBlock: None,
          },
          {
            InternalConfig.name: "PointsGranter",
            abi: Types.PointsGranter.abi,
            addresses: [
              "0x9E1265677B628A22b9C1d6f0FeCEb6241eA5268d"->Address.Evm.fromStringOrThrow
,
            ],
            events: [
              (Types.PointsGranter.PointsGranted.register() :> Internal.eventConfig),
            ],
            startBlock: None,
          },
        ]
        let chain = ChainMap.Chain.makeUnsafe(~chainId=5115)
        {
          InternalConfig.confirmedBlockThreshold: 0,
          startBlock: 14176878,
          id: 5115,
          contracts,
          sources: NetworkSources.evm(~chain, ~contracts=[{name: "CLMSRMarketCore",events: [Types.CLMSRMarketCore.MarketCreated.register(), Types.CLMSRMarketCore.MarketSettled.register(), Types.CLMSRMarketCore.MarketReopened.register(), Types.CLMSRMarketCore.PositionClaimed.register(), Types.CLMSRMarketCore.PositionClosed.register(), Types.CLMSRMarketCore.PositionDecreased.register(), Types.CLMSRMarketCore.PositionIncreased.register(), Types.CLMSRMarketCore.PositionOpened.register(), Types.CLMSRMarketCore.PositionSettled.register(), Types.CLMSRMarketCore.RangeFactorApplied.register(), Types.CLMSRMarketCore.MarketSettlementValueSubmitted.register()],abi: Types.CLMSRMarketCore.abi}, {name: "PointsGranter",events: [Types.PointsGranter.PointsGranted.register()],abi: Types.PointsGranter.abi}], ~hyperSync=None, ~allEventSignatures=[Types.CLMSRMarketCore.eventSignatures, Types.PointsGranter.eventSignatures]->Belt.Array.concatMany, ~shouldUseHypersyncClientDecoder=true, ~rpcs=[{url: "https://rpc.testnet.citrea.xyz", sourceFor: Sync, syncConfig: {}}])
        }
      },
    ]

    Config.make(
      ~shouldRollbackOnReorg=true,
      ~shouldSaveFullHistory=false,
      ~isUnorderedMultichainMode=false,
      ~chains,
      ~enableRawEvents=false,
    )
  }

  let config: ref<option<Config.t>> = ref(None)
)

let registerAllHandlers = () => {
  registerContractHandlers(
    ~contractName="CLMSRMarketCore",
    ~handlerPathRelativeToRoot="src/EventHandlers.ts",
    ~handlerPathRelativeToConfig="src/EventHandlers.ts",
  )
  registerContractHandlers(
    ~contractName="PointsGranter",
    ~handlerPathRelativeToRoot="src/EventHandlers.ts",
    ~handlerPathRelativeToConfig="src/EventHandlers.ts",
  )

  let generatedConfig = makeGeneratedConfig()
  config := Some(generatedConfig)
  generatedConfig
}

let getConfig = () => {
  switch config.contents {
  | Some(config) => config
  | None => registerAllHandlers()
  }
}

let getConfigWithoutRegisteringHandlers = makeGeneratedConfig
