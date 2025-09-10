
type hyperSyncConfig = {endpointUrl: string}
type hyperFuelConfig = {endpointUrl: string}

@genType.opaque
type rpcConfig = {
  syncConfig: InternalConfig.sourceSync,
}

@genType
type syncSource = HyperSync(hyperSyncConfig) | HyperFuel(hyperFuelConfig) | Rpc(rpcConfig)

@genType.opaque
type aliasAbi = Ethers.abi

type eventName = string

type contract = {
  name: string,
  abi: aliasAbi,
  addresses: array<string>,
  events: array<eventName>,
}

type configYaml = {
  syncSource,
  startBlock: int,
  confirmedBlockThreshold: int,
  contracts: dict<contract>,
}

let publicConfig = ChainMap.fromArrayUnsafe([
  {
    let contracts = Js.Dict.fromArray([
      (
        "CLMSRMarketCore",
        {
          name: "CLMSRMarketCore",
          abi: Types.CLMSRMarketCore.abi,
          addresses: [
            "0xE480ca1C63B6dd929af1EeA4D3de1073942F3cEf",
          ],
          events: [
            Types.CLMSRMarketCore.MarketCreated.name,
            Types.CLMSRMarketCore.MarketSettled.name,
            Types.CLMSRMarketCore.MarketReopened.name,
            Types.CLMSRMarketCore.PositionClaimed.name,
            Types.CLMSRMarketCore.PositionClosed.name,
            Types.CLMSRMarketCore.PositionDecreased.name,
            Types.CLMSRMarketCore.PositionIncreased.name,
            Types.CLMSRMarketCore.PositionOpened.name,
            Types.CLMSRMarketCore.PositionSettled.name,
            Types.CLMSRMarketCore.RangeFactorApplied.name,
            Types.CLMSRMarketCore.MarketSettlementValueSubmitted.name,
          ],
        }
      ),
      (
        "PointsGranter",
        {
          name: "PointsGranter",
          abi: Types.PointsGranter.abi,
          addresses: [
            "0x9E1265677B628A22b9C1d6f0FeCEb6241eA5268d",
          ],
          events: [
            Types.PointsGranter.PointsGranted.name,
          ],
        }
      ),
    ])
    let chain = ChainMap.Chain.makeUnsafe(~chainId=5115)
    (
      chain,
      {
        confirmedBlockThreshold: 0,
        syncSource: Rpc({syncConfig: Config.getSyncConfig({})}),
        startBlock: 14176878,
        contracts
      }
    )
  },
])

@genType
let getGeneratedByChainId: int => configYaml = chainId => {
  let chain = ChainMap.Chain.makeUnsafe(~chainId)
  if !(publicConfig->ChainMap.has(chain)) {
    Js.Exn.raiseError(
      "No chain with id " ++ chain->ChainMap.Chain.toString ++ " found in config.yaml",
    )
  }
  publicConfig->ChainMap.get(chain)
}
