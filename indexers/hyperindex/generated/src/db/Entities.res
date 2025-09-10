open Table
open Enums.EntityType
type id = string

type internalEntity = Internal.entity
module type Entity = {
  type t
  let name: string
  let schema: S.t<t>
  let rowsSchema: S.t<array<t>>
  let table: Table.table
  let entityHistory: EntityHistory.t<t>
}
external entityModToInternal: module(Entity with type t = 'a) => Internal.entityConfig = "%identity"
external entityModsToInternal: array<module(Entity)> => array<Internal.entityConfig> = "%identity"
external entitiesToInternal: array<'a> => array<Internal.entity> = "%identity"

@get
external getEntityId: internalEntity => string = "id"

exception UnexpectedIdNotDefinedOnEntity
let getEntityIdUnsafe = (entity: 'entity): id =>
  switch Utils.magic(entity)["id"] {
  | Some(id) => id
  | None =>
    UnexpectedIdNotDefinedOnEntity->ErrorHandling.mkLogAndRaise(
      ~msg="Property 'id' does not exist on expected entity object",
    )
  }

//shorthand for punning
let isPrimaryKey = true
let isNullable = true
let isArray = true
let isIndex = true

@genType
type whereOperations<'entity, 'fieldType> = {
  eq: 'fieldType => promise<array<'entity>>,
  gt: 'fieldType => promise<array<'entity>>
}

module BinState = {
  let name = (BinState :> string)
  @genType
  type t = {
    binIndex: bigint,
    currentFactor: bigint,
    id: id,
    lastUpdated: bigint,
    lowerTick: bigint,
    market_id: id,
    totalVolume: bigint,
    updateCount: bigint,
    upperTick: bigint,
  }

  let schema = S.object((s): t => {
    binIndex: s.field("binIndex", BigInt.schema),
    currentFactor: s.field("currentFactor", BigInt.schema),
    id: s.field("id", S.string),
    lastUpdated: s.field("lastUpdated", BigInt.schema),
    lowerTick: s.field("lowerTick", BigInt.schema),
    market_id: s.field("market_id", S.string),
    totalVolume: s.field("totalVolume", BigInt.schema),
    updateCount: s.field("updateCount", BigInt.schema),
    upperTick: s.field("upperTick", BigInt.schema),
  })

  let rowsSchema = S.array(schema)

  @genType
  type indexedFieldOperations = {
    
  }

  let table = mkTable(
    (name :> string),
    ~fields=[
      mkField(
      "binIndex", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "currentFactor", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "id", 
      Text,
      ~fieldSchema=S.string,
      ~isPrimaryKey,
      
      
      
      
      ),
      mkField(
      "lastUpdated", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "lowerTick", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "market", 
      Text,
      ~fieldSchema=S.string,
      
      
      
      
      ~linkedEntity="Market",
      ),
      mkField(
      "totalVolume", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "updateCount", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "upperTick", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField("db_write_timestamp", TimestampWithoutTimezone, ~fieldSchema=Utils.Schema.dbDate, ~default="CURRENT_TIMESTAMP"),
    ],
  )

  let entityHistory = table->EntityHistory.fromTable(~schema)

  external castToInternal: t => Internal.entity = "%identity"
}

module Market = {
  let name = (Market :> string)
  @genType
  type t = {
    endTimestamp: bigint,
    id: id,
    isSettled: bool,
    lastUpdated: bigint,
    liquidityParameter: bigint,
    marketId: bigint,
    maxTick: bigint,
    minTick: bigint,
    numBins: bigint,
    settlementTick: option<bigint>,
    settlementValue: option<bigint>,
    startTimestamp: bigint,
    tickSpacing: bigint,
  }

  let schema = S.object((s): t => {
    endTimestamp: s.field("endTimestamp", BigInt.schema),
    id: s.field("id", S.string),
    isSettled: s.field("isSettled", S.bool),
    lastUpdated: s.field("lastUpdated", BigInt.schema),
    liquidityParameter: s.field("liquidityParameter", BigInt.schema),
    marketId: s.field("marketId", BigInt.schema),
    maxTick: s.field("maxTick", BigInt.schema),
    minTick: s.field("minTick", BigInt.schema),
    numBins: s.field("numBins", BigInt.schema),
    settlementTick: s.field("settlementTick", S.null(BigInt.schema)),
    settlementValue: s.field("settlementValue", S.null(BigInt.schema)),
    startTimestamp: s.field("startTimestamp", BigInt.schema),
    tickSpacing: s.field("tickSpacing", BigInt.schema),
  })

  let rowsSchema = S.array(schema)

  @genType
  type indexedFieldOperations = {
    
  }

  let table = mkTable(
    (name :> string),
    ~fields=[
      mkField(
      "endTimestamp", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "id", 
      Text,
      ~fieldSchema=S.string,
      ~isPrimaryKey,
      
      
      
      
      ),
      mkField(
      "isSettled", 
      Boolean,
      ~fieldSchema=S.bool,
      
      
      
      
      
      ),
      mkField(
      "lastUpdated", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "liquidityParameter", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "marketId", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "maxTick", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "minTick", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "numBins", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "settlementTick", 
      Numeric,
      ~fieldSchema=S.null(BigInt.schema),
      
      ~isNullable,
      
      
      
      ),
      mkField(
      "settlementValue", 
      Numeric,
      ~fieldSchema=S.null(BigInt.schema),
      
      ~isNullable,
      
      
      
      ),
      mkField(
      "startTimestamp", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "tickSpacing", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField("db_write_timestamp", TimestampWithoutTimezone, ~fieldSchema=Utils.Schema.dbDate, ~default="CURRENT_TIMESTAMP"),
    ],
  )

  let entityHistory = table->EntityHistory.fromTable(~schema)

  external castToInternal: t => Internal.entity = "%identity"
}

module MarketDistribution = {
  let name = (MarketDistribution :> string)
  @genType
  type t = {
    avgFactor: BigDecimal.t,
    binFactors: array<bigint>,
    binVolumes: array<bigint>,
    id: string,
    lastSnapshotAt: bigint,
    maxFactor: bigint,
    minFactor: bigint,
    totalSum: bigint,
    version: string,
  }

  let schema = S.object((s): t => {
    avgFactor: s.field("avgFactor", BigDecimal.schema),
    binFactors: s.field("binFactors", S.array(BigInt.schema)),
    binVolumes: s.field("binVolumes", S.array(BigInt.schema)),
    id: s.field("id", S.string),
    lastSnapshotAt: s.field("lastSnapshotAt", BigInt.schema),
    maxFactor: s.field("maxFactor", BigInt.schema),
    minFactor: s.field("minFactor", BigInt.schema),
    totalSum: s.field("totalSum", BigInt.schema),
    version: s.field("version", S.string),
  })

  let rowsSchema = S.array(schema)

  @genType
  type indexedFieldOperations = {
    
  }

  let table = mkTable(
    (name :> string),
    ~fields=[
      mkField(
      "avgFactor", 
      Numeric,
      ~fieldSchema=BigDecimal.schema,
      
      
      
      
      
      ),
      mkField(
      "binFactors", 
      Numeric,
      ~fieldSchema=S.array(BigInt.schema),
      
      
      ~isArray,
      
      
      ),
      mkField(
      "binVolumes", 
      Numeric,
      ~fieldSchema=S.array(BigInt.schema),
      
      
      ~isArray,
      
      
      ),
      mkField(
      "id", 
      Text,
      ~fieldSchema=S.string,
      ~isPrimaryKey,
      
      
      
      
      ),
      mkField(
      "lastSnapshotAt", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "maxFactor", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "minFactor", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "totalSum", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "version", 
      Text,
      ~fieldSchema=S.string,
      
      
      
      
      
      ),
      mkField("db_write_timestamp", TimestampWithoutTimezone, ~fieldSchema=Utils.Schema.dbDate, ~default="CURRENT_TIMESTAMP"),
    ],
  )

  let entityHistory = table->EntityHistory.fromTable(~schema)

  external castToInternal: t => Internal.entity = "%identity"
}

module MarketStats = {
  let name = (MarketStats :> string)
  @genType
  type t = {
    bettingNetIncome: bigint,
    currentPrice: bigint,
    highestPrice: bigint,
    id: string,
    lastUpdated: bigint,
    lowestPrice: bigint,
    market_id: id,
    priceChange24h: BigDecimal.t,
    realizedMarketPnL: bigint,
    totalBetPaidOut: bigint,
    totalBetReceived: bigint,
    totalClaimedPayout: bigint,
    totalFees: bigint,
    totalMarketPnL: bigint,
    totalSettlementPayout: bigint,
    totalTrades: bigint,
    totalVolume: bigint,
    unclaimedPayout: bigint,
    volume24h: bigint,
  }

  let schema = S.object((s): t => {
    bettingNetIncome: s.field("bettingNetIncome", BigInt.schema),
    currentPrice: s.field("currentPrice", BigInt.schema),
    highestPrice: s.field("highestPrice", BigInt.schema),
    id: s.field("id", S.string),
    lastUpdated: s.field("lastUpdated", BigInt.schema),
    lowestPrice: s.field("lowestPrice", BigInt.schema),
    market_id: s.field("market_id", S.string),
    priceChange24h: s.field("priceChange24h", BigDecimal.schema),
    realizedMarketPnL: s.field("realizedMarketPnL", BigInt.schema),
    totalBetPaidOut: s.field("totalBetPaidOut", BigInt.schema),
    totalBetReceived: s.field("totalBetReceived", BigInt.schema),
    totalClaimedPayout: s.field("totalClaimedPayout", BigInt.schema),
    totalFees: s.field("totalFees", BigInt.schema),
    totalMarketPnL: s.field("totalMarketPnL", BigInt.schema),
    totalSettlementPayout: s.field("totalSettlementPayout", BigInt.schema),
    totalTrades: s.field("totalTrades", BigInt.schema),
    totalVolume: s.field("totalVolume", BigInt.schema),
    unclaimedPayout: s.field("unclaimedPayout", BigInt.schema),
    volume24h: s.field("volume24h", BigInt.schema),
  })

  let rowsSchema = S.array(schema)

  @genType
  type indexedFieldOperations = {
    
  }

  let table = mkTable(
    (name :> string),
    ~fields=[
      mkField(
      "bettingNetIncome", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "currentPrice", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "highestPrice", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "id", 
      Text,
      ~fieldSchema=S.string,
      ~isPrimaryKey,
      
      
      
      
      ),
      mkField(
      "lastUpdated", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "lowestPrice", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "market", 
      Text,
      ~fieldSchema=S.string,
      
      
      
      
      ~linkedEntity="Market",
      ),
      mkField(
      "priceChange24h", 
      Numeric,
      ~fieldSchema=BigDecimal.schema,
      
      
      
      
      
      ),
      mkField(
      "realizedMarketPnL", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "totalBetPaidOut", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "totalBetReceived", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "totalClaimedPayout", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "totalFees", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "totalMarketPnL", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "totalSettlementPayout", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "totalTrades", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "totalVolume", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "unclaimedPayout", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "volume24h", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField("db_write_timestamp", TimestampWithoutTimezone, ~fieldSchema=Utils.Schema.dbDate, ~default="CURRENT_TIMESTAMP"),
    ],
  )

  let entityHistory = table->EntityHistory.fromTable(~schema)

  external castToInternal: t => Internal.entity = "%identity"
}

module Trade = {
  let name = (Trade :> string)
  @genType
  type t = {
    activityPt: bigint,
    blockNumber: bigint,
    costOrProceeds: bigint,
    gasPrice: bigint,
    gasUsed: bigint,
    id: id,
    lowerTick: bigint,
    market_id: id,
    performancePt: bigint,
    positionId: bigint,
    price: bigint,
    quantity: bigint,
    riskBonusPt: bigint,
    timestamp: bigint,
    tradeType: Enums.TradeType.t,
    transactionHash: string,
    upperTick: bigint,
    user: string,
    userPosition: string,
  }

  let schema = S.object((s): t => {
    activityPt: s.field("activityPt", BigInt.schema),
    blockNumber: s.field("blockNumber", BigInt.schema),
    costOrProceeds: s.field("costOrProceeds", BigInt.schema),
    gasPrice: s.field("gasPrice", BigInt.schema),
    gasUsed: s.field("gasUsed", BigInt.schema),
    id: s.field("id", S.string),
    lowerTick: s.field("lowerTick", BigInt.schema),
    market_id: s.field("market_id", S.string),
    performancePt: s.field("performancePt", BigInt.schema),
    positionId: s.field("positionId", BigInt.schema),
    price: s.field("price", BigInt.schema),
    quantity: s.field("quantity", BigInt.schema),
    riskBonusPt: s.field("riskBonusPt", BigInt.schema),
    timestamp: s.field("timestamp", BigInt.schema),
    tradeType: s.field("tradeType", Enums.TradeType.config.schema),
    transactionHash: s.field("transactionHash", S.string),
    upperTick: s.field("upperTick", BigInt.schema),
    user: s.field("user", S.string),
    userPosition: s.field("userPosition", S.string),
  })

  let rowsSchema = S.array(schema)

  @genType
  type indexedFieldOperations = {
    
  }

  let table = mkTable(
    (name :> string),
    ~fields=[
      mkField(
      "activityPt", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "blockNumber", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "costOrProceeds", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "gasPrice", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "gasUsed", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "id", 
      Text,
      ~fieldSchema=S.string,
      ~isPrimaryKey,
      
      
      
      
      ),
      mkField(
      "lowerTick", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "market", 
      Text,
      ~fieldSchema=S.string,
      
      
      
      
      ~linkedEntity="Market",
      ),
      mkField(
      "performancePt", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "positionId", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "price", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "quantity", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "riskBonusPt", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "timestamp", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "tradeType", 
      Custom(Enums.TradeType.config.name),
      ~fieldSchema=Enums.TradeType.config.schema,
      
      
      
      
      
      ),
      mkField(
      "transactionHash", 
      Text,
      ~fieldSchema=S.string,
      
      
      
      
      
      ),
      mkField(
      "upperTick", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "user", 
      Text,
      ~fieldSchema=S.string,
      
      
      
      
      
      ),
      mkField(
      "userPosition", 
      Text,
      ~fieldSchema=S.string,
      
      
      
      
      
      ),
      mkField("db_write_timestamp", TimestampWithoutTimezone, ~fieldSchema=Utils.Schema.dbDate, ~default="CURRENT_TIMESTAMP"),
    ],
  )

  let entityHistory = table->EntityHistory.fromTable(~schema)

  external castToInternal: t => Internal.entity = "%identity"
}

module UserPosition = {
  let name = (UserPosition :> string)
  @genType
  type t = {
    activityRemaining: bigint,
    averageEntryPrice: bigint,
    createdAt: bigint,
    currentQuantity: bigint,
    id: id,
    isClaimed: bool,
    lastUpdated: bigint,
    lowerTick: bigint,
    market_id: id,
    outcome: Enums.PositionOutcome.t,
    positionId: bigint,
    realizedPnL: bigint,
    stats_id: id,
    totalCostBasis: bigint,
    totalProceeds: bigint,
    totalQuantityBought: bigint,
    totalQuantitySold: bigint,
    upperTick: bigint,
    user: string,
    weightedEntryTime: bigint,
  }

  let schema = S.object((s): t => {
    activityRemaining: s.field("activityRemaining", BigInt.schema),
    averageEntryPrice: s.field("averageEntryPrice", BigInt.schema),
    createdAt: s.field("createdAt", BigInt.schema),
    currentQuantity: s.field("currentQuantity", BigInt.schema),
    id: s.field("id", S.string),
    isClaimed: s.field("isClaimed", S.bool),
    lastUpdated: s.field("lastUpdated", BigInt.schema),
    lowerTick: s.field("lowerTick", BigInt.schema),
    market_id: s.field("market_id", S.string),
    outcome: s.field("outcome", Enums.PositionOutcome.config.schema),
    positionId: s.field("positionId", BigInt.schema),
    realizedPnL: s.field("realizedPnL", BigInt.schema),
    stats_id: s.field("stats_id", S.string),
    totalCostBasis: s.field("totalCostBasis", BigInt.schema),
    totalProceeds: s.field("totalProceeds", BigInt.schema),
    totalQuantityBought: s.field("totalQuantityBought", BigInt.schema),
    totalQuantitySold: s.field("totalQuantitySold", BigInt.schema),
    upperTick: s.field("upperTick", BigInt.schema),
    user: s.field("user", S.string),
    weightedEntryTime: s.field("weightedEntryTime", BigInt.schema),
  })

  let rowsSchema = S.array(schema)

  @genType
  type indexedFieldOperations = {
    
  }

  let table = mkTable(
    (name :> string),
    ~fields=[
      mkField(
      "activityRemaining", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "averageEntryPrice", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "createdAt", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "currentQuantity", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "id", 
      Text,
      ~fieldSchema=S.string,
      ~isPrimaryKey,
      
      
      
      
      ),
      mkField(
      "isClaimed", 
      Boolean,
      ~fieldSchema=S.bool,
      
      
      
      
      
      ),
      mkField(
      "lastUpdated", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "lowerTick", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "market", 
      Text,
      ~fieldSchema=S.string,
      
      
      
      
      ~linkedEntity="Market",
      ),
      mkField(
      "outcome", 
      Custom(Enums.PositionOutcome.config.name),
      ~fieldSchema=Enums.PositionOutcome.config.schema,
      
      
      
      
      
      ),
      mkField(
      "positionId", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "realizedPnL", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "stats", 
      Text,
      ~fieldSchema=S.string,
      
      
      
      
      ~linkedEntity="UserStats",
      ),
      mkField(
      "totalCostBasis", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "totalProceeds", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "totalQuantityBought", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "totalQuantitySold", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "upperTick", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "user", 
      Text,
      ~fieldSchema=S.string,
      
      
      
      
      
      ),
      mkField(
      "weightedEntryTime", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField("db_write_timestamp", TimestampWithoutTimezone, ~fieldSchema=Utils.Schema.dbDate, ~default="CURRENT_TIMESTAMP"),
    ],
  )

  let entityHistory = table->EntityHistory.fromTable(~schema)

  external castToInternal: t => Internal.entity = "%identity"
}

module UserStats = {
  let name = (UserStats :> string)
  @genType
  type t = {
    activePositionsCount: bigint,
    activityPoints: bigint,
    activityPointsToday: bigint,
    avgTradeSize: bigint,
    firstTradeAt: bigint,
    id: id,
    lastActivityDay: bigint,
    lastTradeAt: bigint,
    losingTrades: bigint,
    netPnL: bigint,
    performancePoints: bigint,
    riskBonusPoints: bigint,
    totalCosts: bigint,
    totalGasFees: bigint,
    totalPoints: bigint,
    totalProceeds: bigint,
    totalRealizedPnL: bigint,
    totalTrades: bigint,
    totalVolume: bigint,
    user: string,
    winRate: BigDecimal.t,
    winningTrades: bigint,
  }

  let schema = S.object((s): t => {
    activePositionsCount: s.field("activePositionsCount", BigInt.schema),
    activityPoints: s.field("activityPoints", BigInt.schema),
    activityPointsToday: s.field("activityPointsToday", BigInt.schema),
    avgTradeSize: s.field("avgTradeSize", BigInt.schema),
    firstTradeAt: s.field("firstTradeAt", BigInt.schema),
    id: s.field("id", S.string),
    lastActivityDay: s.field("lastActivityDay", BigInt.schema),
    lastTradeAt: s.field("lastTradeAt", BigInt.schema),
    losingTrades: s.field("losingTrades", BigInt.schema),
    netPnL: s.field("netPnL", BigInt.schema),
    performancePoints: s.field("performancePoints", BigInt.schema),
    riskBonusPoints: s.field("riskBonusPoints", BigInt.schema),
    totalCosts: s.field("totalCosts", BigInt.schema),
    totalGasFees: s.field("totalGasFees", BigInt.schema),
    totalPoints: s.field("totalPoints", BigInt.schema),
    totalProceeds: s.field("totalProceeds", BigInt.schema),
    totalRealizedPnL: s.field("totalRealizedPnL", BigInt.schema),
    totalTrades: s.field("totalTrades", BigInt.schema),
    totalVolume: s.field("totalVolume", BigInt.schema),
    user: s.field("user", S.string),
    winRate: s.field("winRate", BigDecimal.schema),
    winningTrades: s.field("winningTrades", BigInt.schema),
  })

  let rowsSchema = S.array(schema)

  @genType
  type indexedFieldOperations = {
    
  }

  let table = mkTable(
    (name :> string),
    ~fields=[
      mkField(
      "activePositionsCount", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "activityPoints", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "activityPointsToday", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "avgTradeSize", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "firstTradeAt", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "id", 
      Text,
      ~fieldSchema=S.string,
      ~isPrimaryKey,
      
      
      
      
      ),
      mkField(
      "lastActivityDay", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "lastTradeAt", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "losingTrades", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "netPnL", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "performancePoints", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "riskBonusPoints", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "totalCosts", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "totalGasFees", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "totalPoints", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "totalProceeds", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "totalRealizedPnL", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "totalTrades", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "totalVolume", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField(
      "user", 
      Text,
      ~fieldSchema=S.string,
      
      
      
      
      
      ),
      mkField(
      "winRate", 
      Numeric,
      ~fieldSchema=BigDecimal.schema,
      
      
      
      
      
      ),
      mkField(
      "winningTrades", 
      Numeric,
      ~fieldSchema=BigInt.schema,
      
      
      
      
      
      ),
      mkField("db_write_timestamp", TimestampWithoutTimezone, ~fieldSchema=Utils.Schema.dbDate, ~default="CURRENT_TIMESTAMP"),
    ],
  )

  let entityHistory = table->EntityHistory.fromTable(~schema)

  external castToInternal: t => Internal.entity = "%identity"
}

let userEntities = [
  module(BinState),
  module(Market),
  module(MarketDistribution),
  module(MarketStats),
  module(Trade),
  module(UserPosition),
  module(UserStats),
]->entityModsToInternal

let allEntities =
  userEntities->Js.Array2.concat(
    [module(InternalTable.DynamicContractRegistry)]->entityModsToInternal,
  )

let byName =
  allEntities
  ->Js.Array2.map(entityConfig => {
    (entityConfig.name, entityConfig)
  })
  ->Js.Dict.fromArray
