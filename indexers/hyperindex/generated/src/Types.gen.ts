/* TypeScript file generated from Types.res by genType. */

/* eslint-disable */
/* tslint:disable */

import type {BinState_t as Entities_BinState_t} from '../src/db/Entities.gen';

import type {HandlerContext as $$handlerContext} from './Types.ts';

import type {HandlerWithOptions as $$fnWithEventConfig} from './bindings/OpaqueTypes.ts';

import type {MarketDistribution_t as Entities_MarketDistribution_t} from '../src/db/Entities.gen';

import type {MarketStats_t as Entities_MarketStats_t} from '../src/db/Entities.gen';

import type {Market_t as Entities_Market_t} from '../src/db/Entities.gen';

import type {SingleOrMultiple as $$SingleOrMultiple_t} from './bindings/OpaqueTypes';

import type {Trade_t as Entities_Trade_t} from '../src/db/Entities.gen';

import type {UserPosition_t as Entities_UserPosition_t} from '../src/db/Entities.gen';

import type {UserStats_t as Entities_UserStats_t} from '../src/db/Entities.gen';

import type {eventOptions as Internal_eventOptions} from 'envio/src/Internal.gen';

import type {genericContractRegisterArgs as Internal_genericContractRegisterArgs} from 'envio/src/Internal.gen';

import type {genericContractRegister as Internal_genericContractRegister} from 'envio/src/Internal.gen';

import type {genericEvent as Internal_genericEvent} from 'envio/src/Internal.gen';

import type {genericHandlerArgs as Internal_genericHandlerArgs} from 'envio/src/Internal.gen';

import type {genericHandler as Internal_genericHandler} from 'envio/src/Internal.gen';

import type {logger as Envio_logger} from 'envio/src/Envio.gen';

import type {noEventFilters as Internal_noEventFilters} from 'envio/src/Internal.gen';

import type {t as Address_t} from 'envio/src/Address.gen';

export type id = string;
export type Id = id;

export type contractRegistrations = {
  readonly log: Envio_logger; 
  readonly addCLMSRMarketCore: (_1:Address_t) => void; 
  readonly addPointsGranter: (_1:Address_t) => void
};

export type entityHandlerContext<entity,indexedFieldOperations> = {
  readonly get: (_1:id) => Promise<(undefined | entity)>; 
  readonly getOrThrow: (_1:id, message:(undefined | string)) => Promise<entity>; 
  readonly getWhere: indexedFieldOperations; 
  readonly getOrCreate: (_1:entity) => Promise<entity>; 
  readonly set: (_1:entity) => void; 
  readonly deleteUnsafe: (_1:id) => void
};

export type handlerContext = $$handlerContext;

export type binState = Entities_BinState_t;
export type BinState = binState;

export type market = Entities_Market_t;
export type Market = market;

export type marketDistribution = Entities_MarketDistribution_t;
export type MarketDistribution = marketDistribution;

export type marketStats = Entities_MarketStats_t;
export type MarketStats = marketStats;

export type trade = Entities_Trade_t;
export type Trade = trade;

export type userPosition = Entities_UserPosition_t;
export type UserPosition = userPosition;

export type userStats = Entities_UserStats_t;
export type UserStats = userStats;

export type eventIdentifier = {
  readonly chainId: number; 
  readonly blockTimestamp: number; 
  readonly blockNumber: number; 
  readonly logIndex: number
};

export type entityUpdateAction<entityType> = "Delete" | { TAG: "Set"; _0: entityType };

export type entityUpdate<entityType> = {
  readonly eventIdentifier: eventIdentifier; 
  readonly entityId: id; 
  readonly entityUpdateAction: entityUpdateAction<entityType>
};

export type entityValueAtStartOfBatch<entityType> = 
    "NotSet"
  | { TAG: "AlreadySet"; _0: entityType };

export type updatedValue<entityType> = {
  readonly latest: entityUpdate<entityType>; 
  readonly history: entityUpdate<entityType>[]; 
  readonly containsRollbackDiffChange: boolean
};

export type inMemoryStoreRowEntity<entityType> = 
    { TAG: "Updated"; _0: updatedValue<entityType> }
  | { TAG: "InitialReadFromDb"; _0: entityValueAtStartOfBatch<entityType> };

export type Transaction_t = { readonly hash: string };

export type Block_t = {
  readonly number: number; 
  readonly timestamp: number; 
  readonly hash: string
};

export type AggregatedBlock_t = {
  readonly hash: string; 
  readonly number: number; 
  readonly timestamp: number
};

export type AggregatedTransaction_t = { readonly hash: string };

export type eventLog<params> = Internal_genericEvent<params,Block_t,Transaction_t>;
export type EventLog<params> = eventLog<params>;

export type SingleOrMultiple_t<a> = $$SingleOrMultiple_t<a>;

export type HandlerTypes_args<eventArgs,context> = { readonly event: eventLog<eventArgs>; readonly context: context };

export type HandlerTypes_contractRegisterArgs<eventArgs> = Internal_genericContractRegisterArgs<eventLog<eventArgs>,contractRegistrations>;

export type HandlerTypes_contractRegister<eventArgs> = Internal_genericContractRegister<HandlerTypes_contractRegisterArgs<eventArgs>>;

export type HandlerTypes_eventConfig<eventFilters> = Internal_eventOptions<eventFilters>;

export type fnWithEventConfig<fn,eventConfig> = $$fnWithEventConfig<fn,eventConfig>;

export type contractRegisterWithOptions<eventArgs,eventFilters> = fnWithEventConfig<HandlerTypes_contractRegister<eventArgs>,HandlerTypes_eventConfig<eventFilters>>;

export type CLMSRMarketCore_chainId = 5115;

export type CLMSRMarketCore_MarketCreated_eventArgs = {
  readonly marketId: bigint; 
  readonly startTimestamp: bigint; 
  readonly endTimestamp: bigint; 
  readonly minTick: bigint; 
  readonly maxTick: bigint; 
  readonly tickSpacing: bigint; 
  readonly numBins: bigint; 
  readonly liquidityParameter: bigint
};

export type CLMSRMarketCore_MarketCreated_block = Block_t;

export type CLMSRMarketCore_MarketCreated_transaction = Transaction_t;

export type CLMSRMarketCore_MarketCreated_event = {
  /** The parameters or arguments associated with this event. */
  readonly params: CLMSRMarketCore_MarketCreated_eventArgs; 
  /** The unique identifier of the blockchain network where this event occurred. */
  readonly chainId: CLMSRMarketCore_chainId; 
  /** The address of the contract that emitted this event. */
  readonly srcAddress: Address_t; 
  /** The index of this event's log within the block. */
  readonly logIndex: number; 
  /** The transaction that triggered this event. Configurable in `config.yaml` via the `field_selection` option. */
  readonly transaction: CLMSRMarketCore_MarketCreated_transaction; 
  /** The block in which this event was recorded. Configurable in `config.yaml` via the `field_selection` option. */
  readonly block: CLMSRMarketCore_MarketCreated_block
};

export type CLMSRMarketCore_MarketCreated_handlerArgs = Internal_genericHandlerArgs<CLMSRMarketCore_MarketCreated_event,handlerContext,void>;

export type CLMSRMarketCore_MarketCreated_handler = Internal_genericHandler<CLMSRMarketCore_MarketCreated_handlerArgs>;

export type CLMSRMarketCore_MarketCreated_contractRegister = Internal_genericContractRegister<Internal_genericContractRegisterArgs<CLMSRMarketCore_MarketCreated_event,contractRegistrations>>;

export type CLMSRMarketCore_MarketCreated_eventFilter = {};

export type CLMSRMarketCore_MarketCreated_eventFilters = Internal_noEventFilters;

export type CLMSRMarketCore_MarketSettled_eventArgs = { readonly marketId: bigint; readonly settlementTick: bigint };

export type CLMSRMarketCore_MarketSettled_block = Block_t;

export type CLMSRMarketCore_MarketSettled_transaction = Transaction_t;

export type CLMSRMarketCore_MarketSettled_event = {
  /** The parameters or arguments associated with this event. */
  readonly params: CLMSRMarketCore_MarketSettled_eventArgs; 
  /** The unique identifier of the blockchain network where this event occurred. */
  readonly chainId: CLMSRMarketCore_chainId; 
  /** The address of the contract that emitted this event. */
  readonly srcAddress: Address_t; 
  /** The index of this event's log within the block. */
  readonly logIndex: number; 
  /** The transaction that triggered this event. Configurable in `config.yaml` via the `field_selection` option. */
  readonly transaction: CLMSRMarketCore_MarketSettled_transaction; 
  /** The block in which this event was recorded. Configurable in `config.yaml` via the `field_selection` option. */
  readonly block: CLMSRMarketCore_MarketSettled_block
};

export type CLMSRMarketCore_MarketSettled_handlerArgs = Internal_genericHandlerArgs<CLMSRMarketCore_MarketSettled_event,handlerContext,void>;

export type CLMSRMarketCore_MarketSettled_handler = Internal_genericHandler<CLMSRMarketCore_MarketSettled_handlerArgs>;

export type CLMSRMarketCore_MarketSettled_contractRegister = Internal_genericContractRegister<Internal_genericContractRegisterArgs<CLMSRMarketCore_MarketSettled_event,contractRegistrations>>;

export type CLMSRMarketCore_MarketSettled_eventFilter = { readonly marketId?: SingleOrMultiple_t<bigint> };

export type CLMSRMarketCore_MarketSettled_eventFiltersArgs = { 
/** The unique identifier of the blockchain network where this event occurred. */
readonly chainId: CLMSRMarketCore_chainId; 
/** Addresses of the contracts indexing the event. */
readonly addresses: Address_t[] };

export type CLMSRMarketCore_MarketSettled_eventFiltersDefinition = 
    CLMSRMarketCore_MarketSettled_eventFilter
  | CLMSRMarketCore_MarketSettled_eventFilter[];

export type CLMSRMarketCore_MarketSettled_eventFilters = 
    CLMSRMarketCore_MarketSettled_eventFilter
  | CLMSRMarketCore_MarketSettled_eventFilter[]
  | ((_1:CLMSRMarketCore_MarketSettled_eventFiltersArgs) => CLMSRMarketCore_MarketSettled_eventFiltersDefinition);

export type CLMSRMarketCore_MarketReopened_eventArgs = { readonly marketId: bigint };

export type CLMSRMarketCore_MarketReopened_block = Block_t;

export type CLMSRMarketCore_MarketReopened_transaction = Transaction_t;

export type CLMSRMarketCore_MarketReopened_event = {
  /** The parameters or arguments associated with this event. */
  readonly params: CLMSRMarketCore_MarketReopened_eventArgs; 
  /** The unique identifier of the blockchain network where this event occurred. */
  readonly chainId: CLMSRMarketCore_chainId; 
  /** The address of the contract that emitted this event. */
  readonly srcAddress: Address_t; 
  /** The index of this event's log within the block. */
  readonly logIndex: number; 
  /** The transaction that triggered this event. Configurable in `config.yaml` via the `field_selection` option. */
  readonly transaction: CLMSRMarketCore_MarketReopened_transaction; 
  /** The block in which this event was recorded. Configurable in `config.yaml` via the `field_selection` option. */
  readonly block: CLMSRMarketCore_MarketReopened_block
};

export type CLMSRMarketCore_MarketReopened_handlerArgs = Internal_genericHandlerArgs<CLMSRMarketCore_MarketReopened_event,handlerContext,void>;

export type CLMSRMarketCore_MarketReopened_handler = Internal_genericHandler<CLMSRMarketCore_MarketReopened_handlerArgs>;

export type CLMSRMarketCore_MarketReopened_contractRegister = Internal_genericContractRegister<Internal_genericContractRegisterArgs<CLMSRMarketCore_MarketReopened_event,contractRegistrations>>;

export type CLMSRMarketCore_MarketReopened_eventFilter = { readonly marketId?: SingleOrMultiple_t<bigint> };

export type CLMSRMarketCore_MarketReopened_eventFiltersArgs = { 
/** The unique identifier of the blockchain network where this event occurred. */
readonly chainId: CLMSRMarketCore_chainId; 
/** Addresses of the contracts indexing the event. */
readonly addresses: Address_t[] };

export type CLMSRMarketCore_MarketReopened_eventFiltersDefinition = 
    CLMSRMarketCore_MarketReopened_eventFilter
  | CLMSRMarketCore_MarketReopened_eventFilter[];

export type CLMSRMarketCore_MarketReopened_eventFilters = 
    CLMSRMarketCore_MarketReopened_eventFilter
  | CLMSRMarketCore_MarketReopened_eventFilter[]
  | ((_1:CLMSRMarketCore_MarketReopened_eventFiltersArgs) => CLMSRMarketCore_MarketReopened_eventFiltersDefinition);

export type CLMSRMarketCore_PositionClaimed_eventArgs = {
  readonly positionId: bigint; 
  readonly trader: Address_t; 
  readonly payout: bigint
};

export type CLMSRMarketCore_PositionClaimed_block = Block_t;

export type CLMSRMarketCore_PositionClaimed_transaction = Transaction_t;

export type CLMSRMarketCore_PositionClaimed_event = {
  /** The parameters or arguments associated with this event. */
  readonly params: CLMSRMarketCore_PositionClaimed_eventArgs; 
  /** The unique identifier of the blockchain network where this event occurred. */
  readonly chainId: CLMSRMarketCore_chainId; 
  /** The address of the contract that emitted this event. */
  readonly srcAddress: Address_t; 
  /** The index of this event's log within the block. */
  readonly logIndex: number; 
  /** The transaction that triggered this event. Configurable in `config.yaml` via the `field_selection` option. */
  readonly transaction: CLMSRMarketCore_PositionClaimed_transaction; 
  /** The block in which this event was recorded. Configurable in `config.yaml` via the `field_selection` option. */
  readonly block: CLMSRMarketCore_PositionClaimed_block
};

export type CLMSRMarketCore_PositionClaimed_handlerArgs = Internal_genericHandlerArgs<CLMSRMarketCore_PositionClaimed_event,handlerContext,void>;

export type CLMSRMarketCore_PositionClaimed_handler = Internal_genericHandler<CLMSRMarketCore_PositionClaimed_handlerArgs>;

export type CLMSRMarketCore_PositionClaimed_contractRegister = Internal_genericContractRegister<Internal_genericContractRegisterArgs<CLMSRMarketCore_PositionClaimed_event,contractRegistrations>>;

export type CLMSRMarketCore_PositionClaimed_eventFilter = { readonly positionId?: SingleOrMultiple_t<bigint>; readonly trader?: SingleOrMultiple_t<Address_t> };

export type CLMSRMarketCore_PositionClaimed_eventFiltersArgs = { 
/** The unique identifier of the blockchain network where this event occurred. */
readonly chainId: CLMSRMarketCore_chainId; 
/** Addresses of the contracts indexing the event. */
readonly addresses: Address_t[] };

export type CLMSRMarketCore_PositionClaimed_eventFiltersDefinition = 
    CLMSRMarketCore_PositionClaimed_eventFilter
  | CLMSRMarketCore_PositionClaimed_eventFilter[];

export type CLMSRMarketCore_PositionClaimed_eventFilters = 
    CLMSRMarketCore_PositionClaimed_eventFilter
  | CLMSRMarketCore_PositionClaimed_eventFilter[]
  | ((_1:CLMSRMarketCore_PositionClaimed_eventFiltersArgs) => CLMSRMarketCore_PositionClaimed_eventFiltersDefinition);

export type CLMSRMarketCore_PositionClosed_eventArgs = {
  readonly positionId: bigint; 
  readonly trader: Address_t; 
  readonly proceeds: bigint
};

export type CLMSRMarketCore_PositionClosed_block = Block_t;

export type CLMSRMarketCore_PositionClosed_transaction = Transaction_t;

export type CLMSRMarketCore_PositionClosed_event = {
  /** The parameters or arguments associated with this event. */
  readonly params: CLMSRMarketCore_PositionClosed_eventArgs; 
  /** The unique identifier of the blockchain network where this event occurred. */
  readonly chainId: CLMSRMarketCore_chainId; 
  /** The address of the contract that emitted this event. */
  readonly srcAddress: Address_t; 
  /** The index of this event's log within the block. */
  readonly logIndex: number; 
  /** The transaction that triggered this event. Configurable in `config.yaml` via the `field_selection` option. */
  readonly transaction: CLMSRMarketCore_PositionClosed_transaction; 
  /** The block in which this event was recorded. Configurable in `config.yaml` via the `field_selection` option. */
  readonly block: CLMSRMarketCore_PositionClosed_block
};

export type CLMSRMarketCore_PositionClosed_handlerArgs = Internal_genericHandlerArgs<CLMSRMarketCore_PositionClosed_event,handlerContext,void>;

export type CLMSRMarketCore_PositionClosed_handler = Internal_genericHandler<CLMSRMarketCore_PositionClosed_handlerArgs>;

export type CLMSRMarketCore_PositionClosed_contractRegister = Internal_genericContractRegister<Internal_genericContractRegisterArgs<CLMSRMarketCore_PositionClosed_event,contractRegistrations>>;

export type CLMSRMarketCore_PositionClosed_eventFilter = { readonly positionId?: SingleOrMultiple_t<bigint>; readonly trader?: SingleOrMultiple_t<Address_t> };

export type CLMSRMarketCore_PositionClosed_eventFiltersArgs = { 
/** The unique identifier of the blockchain network where this event occurred. */
readonly chainId: CLMSRMarketCore_chainId; 
/** Addresses of the contracts indexing the event. */
readonly addresses: Address_t[] };

export type CLMSRMarketCore_PositionClosed_eventFiltersDefinition = 
    CLMSRMarketCore_PositionClosed_eventFilter
  | CLMSRMarketCore_PositionClosed_eventFilter[];

export type CLMSRMarketCore_PositionClosed_eventFilters = 
    CLMSRMarketCore_PositionClosed_eventFilter
  | CLMSRMarketCore_PositionClosed_eventFilter[]
  | ((_1:CLMSRMarketCore_PositionClosed_eventFiltersArgs) => CLMSRMarketCore_PositionClosed_eventFiltersDefinition);

export type CLMSRMarketCore_PositionDecreased_eventArgs = {
  readonly positionId: bigint; 
  readonly trader: Address_t; 
  readonly sellQuantity: bigint; 
  readonly newQuantity: bigint; 
  readonly proceeds: bigint
};

export type CLMSRMarketCore_PositionDecreased_block = Block_t;

export type CLMSRMarketCore_PositionDecreased_transaction = Transaction_t;

export type CLMSRMarketCore_PositionDecreased_event = {
  /** The parameters or arguments associated with this event. */
  readonly params: CLMSRMarketCore_PositionDecreased_eventArgs; 
  /** The unique identifier of the blockchain network where this event occurred. */
  readonly chainId: CLMSRMarketCore_chainId; 
  /** The address of the contract that emitted this event. */
  readonly srcAddress: Address_t; 
  /** The index of this event's log within the block. */
  readonly logIndex: number; 
  /** The transaction that triggered this event. Configurable in `config.yaml` via the `field_selection` option. */
  readonly transaction: CLMSRMarketCore_PositionDecreased_transaction; 
  /** The block in which this event was recorded. Configurable in `config.yaml` via the `field_selection` option. */
  readonly block: CLMSRMarketCore_PositionDecreased_block
};

export type CLMSRMarketCore_PositionDecreased_handlerArgs = Internal_genericHandlerArgs<CLMSRMarketCore_PositionDecreased_event,handlerContext,void>;

export type CLMSRMarketCore_PositionDecreased_handler = Internal_genericHandler<CLMSRMarketCore_PositionDecreased_handlerArgs>;

export type CLMSRMarketCore_PositionDecreased_contractRegister = Internal_genericContractRegister<Internal_genericContractRegisterArgs<CLMSRMarketCore_PositionDecreased_event,contractRegistrations>>;

export type CLMSRMarketCore_PositionDecreased_eventFilter = { readonly positionId?: SingleOrMultiple_t<bigint>; readonly trader?: SingleOrMultiple_t<Address_t> };

export type CLMSRMarketCore_PositionDecreased_eventFiltersArgs = { 
/** The unique identifier of the blockchain network where this event occurred. */
readonly chainId: CLMSRMarketCore_chainId; 
/** Addresses of the contracts indexing the event. */
readonly addresses: Address_t[] };

export type CLMSRMarketCore_PositionDecreased_eventFiltersDefinition = 
    CLMSRMarketCore_PositionDecreased_eventFilter
  | CLMSRMarketCore_PositionDecreased_eventFilter[];

export type CLMSRMarketCore_PositionDecreased_eventFilters = 
    CLMSRMarketCore_PositionDecreased_eventFilter
  | CLMSRMarketCore_PositionDecreased_eventFilter[]
  | ((_1:CLMSRMarketCore_PositionDecreased_eventFiltersArgs) => CLMSRMarketCore_PositionDecreased_eventFiltersDefinition);

export type CLMSRMarketCore_PositionIncreased_eventArgs = {
  readonly positionId: bigint; 
  readonly trader: Address_t; 
  readonly additionalQuantity: bigint; 
  readonly newQuantity: bigint; 
  readonly cost: bigint
};

export type CLMSRMarketCore_PositionIncreased_block = Block_t;

export type CLMSRMarketCore_PositionIncreased_transaction = Transaction_t;

export type CLMSRMarketCore_PositionIncreased_event = {
  /** The parameters or arguments associated with this event. */
  readonly params: CLMSRMarketCore_PositionIncreased_eventArgs; 
  /** The unique identifier of the blockchain network where this event occurred. */
  readonly chainId: CLMSRMarketCore_chainId; 
  /** The address of the contract that emitted this event. */
  readonly srcAddress: Address_t; 
  /** The index of this event's log within the block. */
  readonly logIndex: number; 
  /** The transaction that triggered this event. Configurable in `config.yaml` via the `field_selection` option. */
  readonly transaction: CLMSRMarketCore_PositionIncreased_transaction; 
  /** The block in which this event was recorded. Configurable in `config.yaml` via the `field_selection` option. */
  readonly block: CLMSRMarketCore_PositionIncreased_block
};

export type CLMSRMarketCore_PositionIncreased_handlerArgs = Internal_genericHandlerArgs<CLMSRMarketCore_PositionIncreased_event,handlerContext,void>;

export type CLMSRMarketCore_PositionIncreased_handler = Internal_genericHandler<CLMSRMarketCore_PositionIncreased_handlerArgs>;

export type CLMSRMarketCore_PositionIncreased_contractRegister = Internal_genericContractRegister<Internal_genericContractRegisterArgs<CLMSRMarketCore_PositionIncreased_event,contractRegistrations>>;

export type CLMSRMarketCore_PositionIncreased_eventFilter = { readonly positionId?: SingleOrMultiple_t<bigint>; readonly trader?: SingleOrMultiple_t<Address_t> };

export type CLMSRMarketCore_PositionIncreased_eventFiltersArgs = { 
/** The unique identifier of the blockchain network where this event occurred. */
readonly chainId: CLMSRMarketCore_chainId; 
/** Addresses of the contracts indexing the event. */
readonly addresses: Address_t[] };

export type CLMSRMarketCore_PositionIncreased_eventFiltersDefinition = 
    CLMSRMarketCore_PositionIncreased_eventFilter
  | CLMSRMarketCore_PositionIncreased_eventFilter[];

export type CLMSRMarketCore_PositionIncreased_eventFilters = 
    CLMSRMarketCore_PositionIncreased_eventFilter
  | CLMSRMarketCore_PositionIncreased_eventFilter[]
  | ((_1:CLMSRMarketCore_PositionIncreased_eventFiltersArgs) => CLMSRMarketCore_PositionIncreased_eventFiltersDefinition);

export type CLMSRMarketCore_PositionOpened_eventArgs = {
  readonly positionId: bigint; 
  readonly trader: Address_t; 
  readonly marketId: bigint; 
  readonly lowerTick: bigint; 
  readonly upperTick: bigint; 
  readonly quantity: bigint; 
  readonly cost: bigint
};

export type CLMSRMarketCore_PositionOpened_block = Block_t;

export type CLMSRMarketCore_PositionOpened_transaction = Transaction_t;

export type CLMSRMarketCore_PositionOpened_event = {
  /** The parameters or arguments associated with this event. */
  readonly params: CLMSRMarketCore_PositionOpened_eventArgs; 
  /** The unique identifier of the blockchain network where this event occurred. */
  readonly chainId: CLMSRMarketCore_chainId; 
  /** The address of the contract that emitted this event. */
  readonly srcAddress: Address_t; 
  /** The index of this event's log within the block. */
  readonly logIndex: number; 
  /** The transaction that triggered this event. Configurable in `config.yaml` via the `field_selection` option. */
  readonly transaction: CLMSRMarketCore_PositionOpened_transaction; 
  /** The block in which this event was recorded. Configurable in `config.yaml` via the `field_selection` option. */
  readonly block: CLMSRMarketCore_PositionOpened_block
};

export type CLMSRMarketCore_PositionOpened_handlerArgs = Internal_genericHandlerArgs<CLMSRMarketCore_PositionOpened_event,handlerContext,void>;

export type CLMSRMarketCore_PositionOpened_handler = Internal_genericHandler<CLMSRMarketCore_PositionOpened_handlerArgs>;

export type CLMSRMarketCore_PositionOpened_contractRegister = Internal_genericContractRegister<Internal_genericContractRegisterArgs<CLMSRMarketCore_PositionOpened_event,contractRegistrations>>;

export type CLMSRMarketCore_PositionOpened_eventFilter = {
  readonly positionId?: SingleOrMultiple_t<bigint>; 
  readonly trader?: SingleOrMultiple_t<Address_t>; 
  readonly marketId?: SingleOrMultiple_t<bigint>
};

export type CLMSRMarketCore_PositionOpened_eventFiltersArgs = { 
/** The unique identifier of the blockchain network where this event occurred. */
readonly chainId: CLMSRMarketCore_chainId; 
/** Addresses of the contracts indexing the event. */
readonly addresses: Address_t[] };

export type CLMSRMarketCore_PositionOpened_eventFiltersDefinition = 
    CLMSRMarketCore_PositionOpened_eventFilter
  | CLMSRMarketCore_PositionOpened_eventFilter[];

export type CLMSRMarketCore_PositionOpened_eventFilters = 
    CLMSRMarketCore_PositionOpened_eventFilter
  | CLMSRMarketCore_PositionOpened_eventFilter[]
  | ((_1:CLMSRMarketCore_PositionOpened_eventFiltersArgs) => CLMSRMarketCore_PositionOpened_eventFiltersDefinition);

export type CLMSRMarketCore_PositionSettled_eventArgs = {
  readonly positionId: bigint; 
  readonly trader: Address_t; 
  readonly payout: bigint; 
  readonly isWin: boolean
};

export type CLMSRMarketCore_PositionSettled_block = Block_t;

export type CLMSRMarketCore_PositionSettled_transaction = Transaction_t;

export type CLMSRMarketCore_PositionSettled_event = {
  /** The parameters or arguments associated with this event. */
  readonly params: CLMSRMarketCore_PositionSettled_eventArgs; 
  /** The unique identifier of the blockchain network where this event occurred. */
  readonly chainId: CLMSRMarketCore_chainId; 
  /** The address of the contract that emitted this event. */
  readonly srcAddress: Address_t; 
  /** The index of this event's log within the block. */
  readonly logIndex: number; 
  /** The transaction that triggered this event. Configurable in `config.yaml` via the `field_selection` option. */
  readonly transaction: CLMSRMarketCore_PositionSettled_transaction; 
  /** The block in which this event was recorded. Configurable in `config.yaml` via the `field_selection` option. */
  readonly block: CLMSRMarketCore_PositionSettled_block
};

export type CLMSRMarketCore_PositionSettled_handlerArgs = Internal_genericHandlerArgs<CLMSRMarketCore_PositionSettled_event,handlerContext,void>;

export type CLMSRMarketCore_PositionSettled_handler = Internal_genericHandler<CLMSRMarketCore_PositionSettled_handlerArgs>;

export type CLMSRMarketCore_PositionSettled_contractRegister = Internal_genericContractRegister<Internal_genericContractRegisterArgs<CLMSRMarketCore_PositionSettled_event,contractRegistrations>>;

export type CLMSRMarketCore_PositionSettled_eventFilter = { readonly positionId?: SingleOrMultiple_t<bigint>; readonly trader?: SingleOrMultiple_t<Address_t> };

export type CLMSRMarketCore_PositionSettled_eventFiltersArgs = { 
/** The unique identifier of the blockchain network where this event occurred. */
readonly chainId: CLMSRMarketCore_chainId; 
/** Addresses of the contracts indexing the event. */
readonly addresses: Address_t[] };

export type CLMSRMarketCore_PositionSettled_eventFiltersDefinition = 
    CLMSRMarketCore_PositionSettled_eventFilter
  | CLMSRMarketCore_PositionSettled_eventFilter[];

export type CLMSRMarketCore_PositionSettled_eventFilters = 
    CLMSRMarketCore_PositionSettled_eventFilter
  | CLMSRMarketCore_PositionSettled_eventFilter[]
  | ((_1:CLMSRMarketCore_PositionSettled_eventFiltersArgs) => CLMSRMarketCore_PositionSettled_eventFiltersDefinition);

export type CLMSRMarketCore_RangeFactorApplied_eventArgs = {
  readonly marketId: bigint; 
  readonly lo: bigint; 
  readonly hi: bigint; 
  readonly factor: bigint
};

export type CLMSRMarketCore_RangeFactorApplied_block = Block_t;

export type CLMSRMarketCore_RangeFactorApplied_transaction = Transaction_t;

export type CLMSRMarketCore_RangeFactorApplied_event = {
  /** The parameters or arguments associated with this event. */
  readonly params: CLMSRMarketCore_RangeFactorApplied_eventArgs; 
  /** The unique identifier of the blockchain network where this event occurred. */
  readonly chainId: CLMSRMarketCore_chainId; 
  /** The address of the contract that emitted this event. */
  readonly srcAddress: Address_t; 
  /** The index of this event's log within the block. */
  readonly logIndex: number; 
  /** The transaction that triggered this event. Configurable in `config.yaml` via the `field_selection` option. */
  readonly transaction: CLMSRMarketCore_RangeFactorApplied_transaction; 
  /** The block in which this event was recorded. Configurable in `config.yaml` via the `field_selection` option. */
  readonly block: CLMSRMarketCore_RangeFactorApplied_block
};

export type CLMSRMarketCore_RangeFactorApplied_handlerArgs = Internal_genericHandlerArgs<CLMSRMarketCore_RangeFactorApplied_event,handlerContext,void>;

export type CLMSRMarketCore_RangeFactorApplied_handler = Internal_genericHandler<CLMSRMarketCore_RangeFactorApplied_handlerArgs>;

export type CLMSRMarketCore_RangeFactorApplied_contractRegister = Internal_genericContractRegister<Internal_genericContractRegisterArgs<CLMSRMarketCore_RangeFactorApplied_event,contractRegistrations>>;

export type CLMSRMarketCore_RangeFactorApplied_eventFilter = {
  readonly marketId?: SingleOrMultiple_t<bigint>; 
  readonly lo?: SingleOrMultiple_t<bigint>; 
  readonly hi?: SingleOrMultiple_t<bigint>
};

export type CLMSRMarketCore_RangeFactorApplied_eventFiltersArgs = { 
/** The unique identifier of the blockchain network where this event occurred. */
readonly chainId: CLMSRMarketCore_chainId; 
/** Addresses of the contracts indexing the event. */
readonly addresses: Address_t[] };

export type CLMSRMarketCore_RangeFactorApplied_eventFiltersDefinition = 
    CLMSRMarketCore_RangeFactorApplied_eventFilter
  | CLMSRMarketCore_RangeFactorApplied_eventFilter[];

export type CLMSRMarketCore_RangeFactorApplied_eventFilters = 
    CLMSRMarketCore_RangeFactorApplied_eventFilter
  | CLMSRMarketCore_RangeFactorApplied_eventFilter[]
  | ((_1:CLMSRMarketCore_RangeFactorApplied_eventFiltersArgs) => CLMSRMarketCore_RangeFactorApplied_eventFiltersDefinition);

export type CLMSRMarketCore_MarketSettlementValueSubmitted_eventArgs = { readonly marketId: bigint; readonly settlementValue: bigint };

export type CLMSRMarketCore_MarketSettlementValueSubmitted_block = Block_t;

export type CLMSRMarketCore_MarketSettlementValueSubmitted_transaction = Transaction_t;

export type CLMSRMarketCore_MarketSettlementValueSubmitted_event = {
  /** The parameters or arguments associated with this event. */
  readonly params: CLMSRMarketCore_MarketSettlementValueSubmitted_eventArgs; 
  /** The unique identifier of the blockchain network where this event occurred. */
  readonly chainId: CLMSRMarketCore_chainId; 
  /** The address of the contract that emitted this event. */
  readonly srcAddress: Address_t; 
  /** The index of this event's log within the block. */
  readonly logIndex: number; 
  /** The transaction that triggered this event. Configurable in `config.yaml` via the `field_selection` option. */
  readonly transaction: CLMSRMarketCore_MarketSettlementValueSubmitted_transaction; 
  /** The block in which this event was recorded. Configurable in `config.yaml` via the `field_selection` option. */
  readonly block: CLMSRMarketCore_MarketSettlementValueSubmitted_block
};

export type CLMSRMarketCore_MarketSettlementValueSubmitted_handlerArgs = Internal_genericHandlerArgs<CLMSRMarketCore_MarketSettlementValueSubmitted_event,handlerContext,void>;

export type CLMSRMarketCore_MarketSettlementValueSubmitted_handler = Internal_genericHandler<CLMSRMarketCore_MarketSettlementValueSubmitted_handlerArgs>;

export type CLMSRMarketCore_MarketSettlementValueSubmitted_contractRegister = Internal_genericContractRegister<Internal_genericContractRegisterArgs<CLMSRMarketCore_MarketSettlementValueSubmitted_event,contractRegistrations>>;

export type CLMSRMarketCore_MarketSettlementValueSubmitted_eventFilter = { readonly marketId?: SingleOrMultiple_t<bigint> };

export type CLMSRMarketCore_MarketSettlementValueSubmitted_eventFiltersArgs = { 
/** The unique identifier of the blockchain network where this event occurred. */
readonly chainId: CLMSRMarketCore_chainId; 
/** Addresses of the contracts indexing the event. */
readonly addresses: Address_t[] };

export type CLMSRMarketCore_MarketSettlementValueSubmitted_eventFiltersDefinition = 
    CLMSRMarketCore_MarketSettlementValueSubmitted_eventFilter
  | CLMSRMarketCore_MarketSettlementValueSubmitted_eventFilter[];

export type CLMSRMarketCore_MarketSettlementValueSubmitted_eventFilters = 
    CLMSRMarketCore_MarketSettlementValueSubmitted_eventFilter
  | CLMSRMarketCore_MarketSettlementValueSubmitted_eventFilter[]
  | ((_1:CLMSRMarketCore_MarketSettlementValueSubmitted_eventFiltersArgs) => CLMSRMarketCore_MarketSettlementValueSubmitted_eventFiltersDefinition);

export type PointsGranter_chainId = 5115;

export type PointsGranter_PointsGranted_eventArgs = {
  readonly user: Address_t; 
  readonly amount: bigint; 
  readonly reason: bigint; 
  readonly contextTs: bigint
};

export type PointsGranter_PointsGranted_block = Block_t;

export type PointsGranter_PointsGranted_transaction = Transaction_t;

export type PointsGranter_PointsGranted_event = {
  /** The parameters or arguments associated with this event. */
  readonly params: PointsGranter_PointsGranted_eventArgs; 
  /** The unique identifier of the blockchain network where this event occurred. */
  readonly chainId: PointsGranter_chainId; 
  /** The address of the contract that emitted this event. */
  readonly srcAddress: Address_t; 
  /** The index of this event's log within the block. */
  readonly logIndex: number; 
  /** The transaction that triggered this event. Configurable in `config.yaml` via the `field_selection` option. */
  readonly transaction: PointsGranter_PointsGranted_transaction; 
  /** The block in which this event was recorded. Configurable in `config.yaml` via the `field_selection` option. */
  readonly block: PointsGranter_PointsGranted_block
};

export type PointsGranter_PointsGranted_handlerArgs = Internal_genericHandlerArgs<PointsGranter_PointsGranted_event,handlerContext,void>;

export type PointsGranter_PointsGranted_handler = Internal_genericHandler<PointsGranter_PointsGranted_handlerArgs>;

export type PointsGranter_PointsGranted_contractRegister = Internal_genericContractRegister<Internal_genericContractRegisterArgs<PointsGranter_PointsGranted_event,contractRegistrations>>;

export type PointsGranter_PointsGranted_eventFilter = { readonly user?: SingleOrMultiple_t<Address_t> };

export type PointsGranter_PointsGranted_eventFiltersArgs = { 
/** The unique identifier of the blockchain network where this event occurred. */
readonly chainId: PointsGranter_chainId; 
/** Addresses of the contracts indexing the event. */
readonly addresses: Address_t[] };

export type PointsGranter_PointsGranted_eventFiltersDefinition = 
    PointsGranter_PointsGranted_eventFilter
  | PointsGranter_PointsGranted_eventFilter[];

export type PointsGranter_PointsGranted_eventFilters = 
    PointsGranter_PointsGranted_eventFilter
  | PointsGranter_PointsGranted_eventFilter[]
  | ((_1:PointsGranter_PointsGranted_eventFiltersArgs) => PointsGranter_PointsGranted_eventFiltersDefinition);

export type chainId = number;
