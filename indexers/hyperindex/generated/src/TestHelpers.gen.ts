/* TypeScript file generated from TestHelpers.res by genType. */

/* eslint-disable */
/* tslint:disable */

const TestHelpersJS = require('./TestHelpers.res.js');

import type {CLMSRMarketCore_MarketCreated_event as Types_CLMSRMarketCore_MarketCreated_event} from './Types.gen';

import type {CLMSRMarketCore_MarketReopened_event as Types_CLMSRMarketCore_MarketReopened_event} from './Types.gen';

import type {CLMSRMarketCore_MarketSettled_event as Types_CLMSRMarketCore_MarketSettled_event} from './Types.gen';

import type {CLMSRMarketCore_MarketSettlementValueSubmitted_event as Types_CLMSRMarketCore_MarketSettlementValueSubmitted_event} from './Types.gen';

import type {CLMSRMarketCore_PositionClaimed_event as Types_CLMSRMarketCore_PositionClaimed_event} from './Types.gen';

import type {CLMSRMarketCore_PositionClosed_event as Types_CLMSRMarketCore_PositionClosed_event} from './Types.gen';

import type {CLMSRMarketCore_PositionDecreased_event as Types_CLMSRMarketCore_PositionDecreased_event} from './Types.gen';

import type {CLMSRMarketCore_PositionIncreased_event as Types_CLMSRMarketCore_PositionIncreased_event} from './Types.gen';

import type {CLMSRMarketCore_PositionOpened_event as Types_CLMSRMarketCore_PositionOpened_event} from './Types.gen';

import type {CLMSRMarketCore_PositionSettled_event as Types_CLMSRMarketCore_PositionSettled_event} from './Types.gen';

import type {CLMSRMarketCore_RangeFactorApplied_event as Types_CLMSRMarketCore_RangeFactorApplied_event} from './Types.gen';

import type {PointsGranter_PointsGranted_event as Types_PointsGranter_PointsGranted_event} from './Types.gen';

import type {t as Address_t} from 'envio/src/Address.gen';

import type {t as TestHelpers_MockDb_t} from './TestHelpers_MockDb.gen';

/** The arguements that get passed to a "processEvent" helper function */
export type EventFunctions_eventProcessorArgs<event> = {
  readonly event: event; 
  readonly mockDb: TestHelpers_MockDb_t; 
  readonly chainId?: number
};

export type EventFunctions_eventProcessor<event> = (_1:EventFunctions_eventProcessorArgs<event>) => Promise<TestHelpers_MockDb_t>;

export type EventFunctions_MockBlock_t = {
  readonly hash?: string; 
  readonly number?: number; 
  readonly timestamp?: number
};

export type EventFunctions_MockTransaction_t = { readonly hash?: string };

export type EventFunctions_mockEventData = {
  readonly chainId?: number; 
  readonly srcAddress?: Address_t; 
  readonly logIndex?: number; 
  readonly block?: EventFunctions_MockBlock_t; 
  readonly transaction?: EventFunctions_MockTransaction_t
};

export type CLMSRMarketCore_MarketCreated_createMockArgs = {
  readonly marketId?: bigint; 
  readonly startTimestamp?: bigint; 
  readonly endTimestamp?: bigint; 
  readonly minTick?: bigint; 
  readonly maxTick?: bigint; 
  readonly tickSpacing?: bigint; 
  readonly numBins?: bigint; 
  readonly liquidityParameter?: bigint; 
  readonly mockEventData?: EventFunctions_mockEventData
};

export type CLMSRMarketCore_MarketSettled_createMockArgs = {
  readonly marketId?: bigint; 
  readonly settlementTick?: bigint; 
  readonly mockEventData?: EventFunctions_mockEventData
};

export type CLMSRMarketCore_MarketReopened_createMockArgs = { readonly marketId?: bigint; readonly mockEventData?: EventFunctions_mockEventData };

export type CLMSRMarketCore_PositionClaimed_createMockArgs = {
  readonly positionId?: bigint; 
  readonly trader?: Address_t; 
  readonly payout?: bigint; 
  readonly mockEventData?: EventFunctions_mockEventData
};

export type CLMSRMarketCore_PositionClosed_createMockArgs = {
  readonly positionId?: bigint; 
  readonly trader?: Address_t; 
  readonly proceeds?: bigint; 
  readonly mockEventData?: EventFunctions_mockEventData
};

export type CLMSRMarketCore_PositionDecreased_createMockArgs = {
  readonly positionId?: bigint; 
  readonly trader?: Address_t; 
  readonly sellQuantity?: bigint; 
  readonly newQuantity?: bigint; 
  readonly proceeds?: bigint; 
  readonly mockEventData?: EventFunctions_mockEventData
};

export type CLMSRMarketCore_PositionIncreased_createMockArgs = {
  readonly positionId?: bigint; 
  readonly trader?: Address_t; 
  readonly additionalQuantity?: bigint; 
  readonly newQuantity?: bigint; 
  readonly cost?: bigint; 
  readonly mockEventData?: EventFunctions_mockEventData
};

export type CLMSRMarketCore_PositionOpened_createMockArgs = {
  readonly positionId?: bigint; 
  readonly trader?: Address_t; 
  readonly marketId?: bigint; 
  readonly lowerTick?: bigint; 
  readonly upperTick?: bigint; 
  readonly quantity?: bigint; 
  readonly cost?: bigint; 
  readonly mockEventData?: EventFunctions_mockEventData
};

export type CLMSRMarketCore_PositionSettled_createMockArgs = {
  readonly positionId?: bigint; 
  readonly trader?: Address_t; 
  readonly payout?: bigint; 
  readonly isWin?: boolean; 
  readonly mockEventData?: EventFunctions_mockEventData
};

export type CLMSRMarketCore_RangeFactorApplied_createMockArgs = {
  readonly marketId?: bigint; 
  readonly lo?: bigint; 
  readonly hi?: bigint; 
  readonly factor?: bigint; 
  readonly mockEventData?: EventFunctions_mockEventData
};

export type CLMSRMarketCore_MarketSettlementValueSubmitted_createMockArgs = {
  readonly marketId?: bigint; 
  readonly settlementValue?: bigint; 
  readonly mockEventData?: EventFunctions_mockEventData
};

export type PointsGranter_PointsGranted_createMockArgs = {
  readonly user?: Address_t; 
  readonly amount?: bigint; 
  readonly reason?: bigint; 
  readonly contextTs?: bigint; 
  readonly mockEventData?: EventFunctions_mockEventData
};

export const MockDb_createMockDb: () => TestHelpers_MockDb_t = TestHelpersJS.MockDb.createMockDb as any;

export const Addresses_mockAddresses: Address_t[] = TestHelpersJS.Addresses.mockAddresses as any;

export const Addresses_defaultAddress: Address_t = TestHelpersJS.Addresses.defaultAddress as any;

export const CLMSRMarketCore_MarketCreated_processEvent: EventFunctions_eventProcessor<Types_CLMSRMarketCore_MarketCreated_event> = TestHelpersJS.CLMSRMarketCore.MarketCreated.processEvent as any;

export const CLMSRMarketCore_MarketCreated_createMockEvent: (args:CLMSRMarketCore_MarketCreated_createMockArgs) => Types_CLMSRMarketCore_MarketCreated_event = TestHelpersJS.CLMSRMarketCore.MarketCreated.createMockEvent as any;

export const CLMSRMarketCore_MarketSettled_processEvent: EventFunctions_eventProcessor<Types_CLMSRMarketCore_MarketSettled_event> = TestHelpersJS.CLMSRMarketCore.MarketSettled.processEvent as any;

export const CLMSRMarketCore_MarketSettled_createMockEvent: (args:CLMSRMarketCore_MarketSettled_createMockArgs) => Types_CLMSRMarketCore_MarketSettled_event = TestHelpersJS.CLMSRMarketCore.MarketSettled.createMockEvent as any;

export const CLMSRMarketCore_MarketReopened_processEvent: EventFunctions_eventProcessor<Types_CLMSRMarketCore_MarketReopened_event> = TestHelpersJS.CLMSRMarketCore.MarketReopened.processEvent as any;

export const CLMSRMarketCore_MarketReopened_createMockEvent: (args:CLMSRMarketCore_MarketReopened_createMockArgs) => Types_CLMSRMarketCore_MarketReopened_event = TestHelpersJS.CLMSRMarketCore.MarketReopened.createMockEvent as any;

export const CLMSRMarketCore_PositionClaimed_processEvent: EventFunctions_eventProcessor<Types_CLMSRMarketCore_PositionClaimed_event> = TestHelpersJS.CLMSRMarketCore.PositionClaimed.processEvent as any;

export const CLMSRMarketCore_PositionClaimed_createMockEvent: (args:CLMSRMarketCore_PositionClaimed_createMockArgs) => Types_CLMSRMarketCore_PositionClaimed_event = TestHelpersJS.CLMSRMarketCore.PositionClaimed.createMockEvent as any;

export const CLMSRMarketCore_PositionClosed_processEvent: EventFunctions_eventProcessor<Types_CLMSRMarketCore_PositionClosed_event> = TestHelpersJS.CLMSRMarketCore.PositionClosed.processEvent as any;

export const CLMSRMarketCore_PositionClosed_createMockEvent: (args:CLMSRMarketCore_PositionClosed_createMockArgs) => Types_CLMSRMarketCore_PositionClosed_event = TestHelpersJS.CLMSRMarketCore.PositionClosed.createMockEvent as any;

export const CLMSRMarketCore_PositionDecreased_processEvent: EventFunctions_eventProcessor<Types_CLMSRMarketCore_PositionDecreased_event> = TestHelpersJS.CLMSRMarketCore.PositionDecreased.processEvent as any;

export const CLMSRMarketCore_PositionDecreased_createMockEvent: (args:CLMSRMarketCore_PositionDecreased_createMockArgs) => Types_CLMSRMarketCore_PositionDecreased_event = TestHelpersJS.CLMSRMarketCore.PositionDecreased.createMockEvent as any;

export const CLMSRMarketCore_PositionIncreased_processEvent: EventFunctions_eventProcessor<Types_CLMSRMarketCore_PositionIncreased_event> = TestHelpersJS.CLMSRMarketCore.PositionIncreased.processEvent as any;

export const CLMSRMarketCore_PositionIncreased_createMockEvent: (args:CLMSRMarketCore_PositionIncreased_createMockArgs) => Types_CLMSRMarketCore_PositionIncreased_event = TestHelpersJS.CLMSRMarketCore.PositionIncreased.createMockEvent as any;

export const CLMSRMarketCore_PositionOpened_processEvent: EventFunctions_eventProcessor<Types_CLMSRMarketCore_PositionOpened_event> = TestHelpersJS.CLMSRMarketCore.PositionOpened.processEvent as any;

export const CLMSRMarketCore_PositionOpened_createMockEvent: (args:CLMSRMarketCore_PositionOpened_createMockArgs) => Types_CLMSRMarketCore_PositionOpened_event = TestHelpersJS.CLMSRMarketCore.PositionOpened.createMockEvent as any;

export const CLMSRMarketCore_PositionSettled_processEvent: EventFunctions_eventProcessor<Types_CLMSRMarketCore_PositionSettled_event> = TestHelpersJS.CLMSRMarketCore.PositionSettled.processEvent as any;

export const CLMSRMarketCore_PositionSettled_createMockEvent: (args:CLMSRMarketCore_PositionSettled_createMockArgs) => Types_CLMSRMarketCore_PositionSettled_event = TestHelpersJS.CLMSRMarketCore.PositionSettled.createMockEvent as any;

export const CLMSRMarketCore_RangeFactorApplied_processEvent: EventFunctions_eventProcessor<Types_CLMSRMarketCore_RangeFactorApplied_event> = TestHelpersJS.CLMSRMarketCore.RangeFactorApplied.processEvent as any;

export const CLMSRMarketCore_RangeFactorApplied_createMockEvent: (args:CLMSRMarketCore_RangeFactorApplied_createMockArgs) => Types_CLMSRMarketCore_RangeFactorApplied_event = TestHelpersJS.CLMSRMarketCore.RangeFactorApplied.createMockEvent as any;

export const CLMSRMarketCore_MarketSettlementValueSubmitted_processEvent: EventFunctions_eventProcessor<Types_CLMSRMarketCore_MarketSettlementValueSubmitted_event> = TestHelpersJS.CLMSRMarketCore.MarketSettlementValueSubmitted.processEvent as any;

export const CLMSRMarketCore_MarketSettlementValueSubmitted_createMockEvent: (args:CLMSRMarketCore_MarketSettlementValueSubmitted_createMockArgs) => Types_CLMSRMarketCore_MarketSettlementValueSubmitted_event = TestHelpersJS.CLMSRMarketCore.MarketSettlementValueSubmitted.createMockEvent as any;

export const PointsGranter_PointsGranted_processEvent: EventFunctions_eventProcessor<Types_PointsGranter_PointsGranted_event> = TestHelpersJS.PointsGranter.PointsGranted.processEvent as any;

export const PointsGranter_PointsGranted_createMockEvent: (args:PointsGranter_PointsGranted_createMockArgs) => Types_PointsGranter_PointsGranted_event = TestHelpersJS.PointsGranter.PointsGranted.createMockEvent as any;

export const CLMSRMarketCore: {
  MarketSettled: {
    processEvent: EventFunctions_eventProcessor<Types_CLMSRMarketCore_MarketSettled_event>; 
    createMockEvent: (args:CLMSRMarketCore_MarketSettled_createMockArgs) => Types_CLMSRMarketCore_MarketSettled_event
  }; 
  PositionIncreased: {
    processEvent: EventFunctions_eventProcessor<Types_CLMSRMarketCore_PositionIncreased_event>; 
    createMockEvent: (args:CLMSRMarketCore_PositionIncreased_createMockArgs) => Types_CLMSRMarketCore_PositionIncreased_event
  }; 
  MarketCreated: {
    processEvent: EventFunctions_eventProcessor<Types_CLMSRMarketCore_MarketCreated_event>; 
    createMockEvent: (args:CLMSRMarketCore_MarketCreated_createMockArgs) => Types_CLMSRMarketCore_MarketCreated_event
  }; 
  MarketReopened: {
    processEvent: EventFunctions_eventProcessor<Types_CLMSRMarketCore_MarketReopened_event>; 
    createMockEvent: (args:CLMSRMarketCore_MarketReopened_createMockArgs) => Types_CLMSRMarketCore_MarketReopened_event
  }; 
  PositionOpened: {
    processEvent: EventFunctions_eventProcessor<Types_CLMSRMarketCore_PositionOpened_event>; 
    createMockEvent: (args:CLMSRMarketCore_PositionOpened_createMockArgs) => Types_CLMSRMarketCore_PositionOpened_event
  }; 
  RangeFactorApplied: {
    processEvent: EventFunctions_eventProcessor<Types_CLMSRMarketCore_RangeFactorApplied_event>; 
    createMockEvent: (args:CLMSRMarketCore_RangeFactorApplied_createMockArgs) => Types_CLMSRMarketCore_RangeFactorApplied_event
  }; 
  PositionClosed: {
    processEvent: EventFunctions_eventProcessor<Types_CLMSRMarketCore_PositionClosed_event>; 
    createMockEvent: (args:CLMSRMarketCore_PositionClosed_createMockArgs) => Types_CLMSRMarketCore_PositionClosed_event
  }; 
  PositionDecreased: {
    processEvent: EventFunctions_eventProcessor<Types_CLMSRMarketCore_PositionDecreased_event>; 
    createMockEvent: (args:CLMSRMarketCore_PositionDecreased_createMockArgs) => Types_CLMSRMarketCore_PositionDecreased_event
  }; 
  MarketSettlementValueSubmitted: {
    processEvent: EventFunctions_eventProcessor<Types_CLMSRMarketCore_MarketSettlementValueSubmitted_event>; 
    createMockEvent: (args:CLMSRMarketCore_MarketSettlementValueSubmitted_createMockArgs) => Types_CLMSRMarketCore_MarketSettlementValueSubmitted_event
  }; 
  PositionSettled: {
    processEvent: EventFunctions_eventProcessor<Types_CLMSRMarketCore_PositionSettled_event>; 
    createMockEvent: (args:CLMSRMarketCore_PositionSettled_createMockArgs) => Types_CLMSRMarketCore_PositionSettled_event
  }; 
  PositionClaimed: {
    processEvent: EventFunctions_eventProcessor<Types_CLMSRMarketCore_PositionClaimed_event>; 
    createMockEvent: (args:CLMSRMarketCore_PositionClaimed_createMockArgs) => Types_CLMSRMarketCore_PositionClaimed_event
  }
} = TestHelpersJS.CLMSRMarketCore as any;

export const PointsGranter: { PointsGranted: { processEvent: EventFunctions_eventProcessor<Types_PointsGranter_PointsGranted_event>; createMockEvent: (args:PointsGranter_PointsGranted_createMockArgs) => Types_PointsGranter_PointsGranted_event } } = TestHelpersJS.PointsGranter as any;

export const Addresses: { mockAddresses: Address_t[]; defaultAddress: Address_t } = TestHelpersJS.Addresses as any;

export const MockDb: { createMockDb: () => TestHelpers_MockDb_t } = TestHelpersJS.MockDb as any;
