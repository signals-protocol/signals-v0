  @genType
module CLMSRMarketCore = {
  module MarketCreated = Types.MakeRegister(Types.CLMSRMarketCore.MarketCreated)
  module MarketSettled = Types.MakeRegister(Types.CLMSRMarketCore.MarketSettled)
  module MarketReopened = Types.MakeRegister(Types.CLMSRMarketCore.MarketReopened)
  module PositionClaimed = Types.MakeRegister(Types.CLMSRMarketCore.PositionClaimed)
  module PositionClosed = Types.MakeRegister(Types.CLMSRMarketCore.PositionClosed)
  module PositionDecreased = Types.MakeRegister(Types.CLMSRMarketCore.PositionDecreased)
  module PositionIncreased = Types.MakeRegister(Types.CLMSRMarketCore.PositionIncreased)
  module PositionOpened = Types.MakeRegister(Types.CLMSRMarketCore.PositionOpened)
  module PositionSettled = Types.MakeRegister(Types.CLMSRMarketCore.PositionSettled)
  module RangeFactorApplied = Types.MakeRegister(Types.CLMSRMarketCore.RangeFactorApplied)
  module MarketSettlementValueSubmitted = Types.MakeRegister(Types.CLMSRMarketCore.MarketSettlementValueSubmitted)
}

  @genType
module PointsGranter = {
  module PointsGranted = Types.MakeRegister(Types.PointsGranter.PointsGranted)
}

