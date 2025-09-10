module ContractType = {
  @genType
  type t = 
    | @as("CLMSRMarketCore") CLMSRMarketCore
    | @as("PointsGranter") PointsGranter

  let name = "CONTRACT_TYPE"
  let variants = [
    CLMSRMarketCore,
    PointsGranter,
  ]
  let config = Internal.makeEnumConfig(~name, ~variants)
}

module EntityType = {
  @genType
  type t = 
    | @as("BinState") BinState
    | @as("Market") Market
    | @as("MarketDistribution") MarketDistribution
    | @as("MarketStats") MarketStats
    | @as("Trade") Trade
    | @as("UserPosition") UserPosition
    | @as("UserStats") UserStats
    | @as("dynamic_contract_registry") DynamicContractRegistry

  let name = "ENTITY_TYPE"
  let variants = [
    BinState,
    Market,
    MarketDistribution,
    MarketStats,
    Trade,
    UserPosition,
    UserStats,
    DynamicContractRegistry,
  ]
  let config = Internal.makeEnumConfig(~name, ~variants)
}

module PositionOutcome = {
  @genType
  type t = 
    | @as("OPEN") OPEN
    | @as("CLOSED") CLOSED
    | @as("WIN") WIN
    | @as("LOSS") LOSS

  let name = "PositionOutcome"
  let variants = [
    OPEN,
    CLOSED,
    WIN,
    LOSS,
  ]
  let config = Internal.makeEnumConfig(~name, ~variants)
}

module TradeType = {
  @genType
  type t = 
    | @as("OPEN") OPEN
    | @as("INCREASE") INCREASE
    | @as("DECREASE") DECREASE
    | @as("CLOSE") CLOSE
    | @as("SETTLE") SETTLE

  let name = "TradeType"
  let variants = [
    OPEN,
    INCREASE,
    DECREASE,
    CLOSE,
    SETTLE,
  ]
  let config = Internal.makeEnumConfig(~name, ~variants)
}

let allEnums = ([
  ContractType.config->Internal.fromGenericEnumConfig,
  EntityType.config->Internal.fromGenericEnumConfig,
  PositionOutcome.config->Internal.fromGenericEnumConfig,
  TradeType.config->Internal.fromGenericEnumConfig,
])
