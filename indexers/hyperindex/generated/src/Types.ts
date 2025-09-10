// This file is to dynamically generate TS types
// which we can't get using GenType
// Use @genType.import to link the types back to ReScript code

import type { Logger, EffectCaller } from "envio";
import type * as Entities from "./db/Entities.gen.ts";

export type HandlerContext = {
  /**
   * Access the logger instance with event as a context. The logs will be displayed in the console and Envio Hosted Service.
   */
  readonly log: Logger;
  /**
   * Call the provided Effect with the given input.
   * Effects are the best for external calls with automatic deduplication, error handling and caching.
   * Define a new Effect using createEffect outside of the handler.
   */
  readonly effect: EffectCaller;
  /**
   * True when the handlers run in preload mode - in parallel for the whole batch.
   * Handlers run twice per batch of events, and the first time is the "preload" run
   * During preload entities aren't set, logs are ignored and exceptions are silently swallowed.
   * Preload mode is the best time to populate data to in-memory cache.
   * After preload the handler will run for the second time in sequential order of events.
   */
  readonly isPreload: boolean;
  readonly BinState: {
    /**
     * Load the entity BinState from the storage by ID.
     * If the entity is not found, returns undefined.
     */
    readonly get: (id: string) => Promise<Entities.BinState_t | undefined>,
    /**
     * Load the entity BinState from the storage by ID.
     * If the entity is not found, throws an error.
     */
    readonly getOrThrow: (id: string, message?: string) => Promise<Entities.BinState_t>,
    readonly getWhere: Entities.BinState_indexedFieldOperations,
    /**
     * Returns the entity BinState from the storage by ID.
     * If the entity is not found, creates it using provided parameters and returns it.
     */
    readonly getOrCreate: (entity: Entities.BinState_t) => Promise<Entities.BinState_t>,
    /**
     * Set the entity BinState in the storage.
     */
    readonly set: (entity: Entities.BinState_t) => void,
    /**
     * Delete the entity BinState from the storage.
     *
     * The 'deleteUnsafe' method is experimental and unsafe. You should manually handle all entity references after deletion to maintain database consistency.
     */
    readonly deleteUnsafe: (id: string) => void,
  }
  readonly Market: {
    /**
     * Load the entity Market from the storage by ID.
     * If the entity is not found, returns undefined.
     */
    readonly get: (id: string) => Promise<Entities.Market_t | undefined>,
    /**
     * Load the entity Market from the storage by ID.
     * If the entity is not found, throws an error.
     */
    readonly getOrThrow: (id: string, message?: string) => Promise<Entities.Market_t>,
    readonly getWhere: Entities.Market_indexedFieldOperations,
    /**
     * Returns the entity Market from the storage by ID.
     * If the entity is not found, creates it using provided parameters and returns it.
     */
    readonly getOrCreate: (entity: Entities.Market_t) => Promise<Entities.Market_t>,
    /**
     * Set the entity Market in the storage.
     */
    readonly set: (entity: Entities.Market_t) => void,
    /**
     * Delete the entity Market from the storage.
     *
     * The 'deleteUnsafe' method is experimental and unsafe. You should manually handle all entity references after deletion to maintain database consistency.
     */
    readonly deleteUnsafe: (id: string) => void,
  }
  readonly MarketDistribution: {
    /**
     * Load the entity MarketDistribution from the storage by ID.
     * If the entity is not found, returns undefined.
     */
    readonly get: (id: string) => Promise<Entities.MarketDistribution_t | undefined>,
    /**
     * Load the entity MarketDistribution from the storage by ID.
     * If the entity is not found, throws an error.
     */
    readonly getOrThrow: (id: string, message?: string) => Promise<Entities.MarketDistribution_t>,
    readonly getWhere: Entities.MarketDistribution_indexedFieldOperations,
    /**
     * Returns the entity MarketDistribution from the storage by ID.
     * If the entity is not found, creates it using provided parameters and returns it.
     */
    readonly getOrCreate: (entity: Entities.MarketDistribution_t) => Promise<Entities.MarketDistribution_t>,
    /**
     * Set the entity MarketDistribution in the storage.
     */
    readonly set: (entity: Entities.MarketDistribution_t) => void,
    /**
     * Delete the entity MarketDistribution from the storage.
     *
     * The 'deleteUnsafe' method is experimental and unsafe. You should manually handle all entity references after deletion to maintain database consistency.
     */
    readonly deleteUnsafe: (id: string) => void,
  }
  readonly MarketStats: {
    /**
     * Load the entity MarketStats from the storage by ID.
     * If the entity is not found, returns undefined.
     */
    readonly get: (id: string) => Promise<Entities.MarketStats_t | undefined>,
    /**
     * Load the entity MarketStats from the storage by ID.
     * If the entity is not found, throws an error.
     */
    readonly getOrThrow: (id: string, message?: string) => Promise<Entities.MarketStats_t>,
    readonly getWhere: Entities.MarketStats_indexedFieldOperations,
    /**
     * Returns the entity MarketStats from the storage by ID.
     * If the entity is not found, creates it using provided parameters and returns it.
     */
    readonly getOrCreate: (entity: Entities.MarketStats_t) => Promise<Entities.MarketStats_t>,
    /**
     * Set the entity MarketStats in the storage.
     */
    readonly set: (entity: Entities.MarketStats_t) => void,
    /**
     * Delete the entity MarketStats from the storage.
     *
     * The 'deleteUnsafe' method is experimental and unsafe. You should manually handle all entity references after deletion to maintain database consistency.
     */
    readonly deleteUnsafe: (id: string) => void,
  }
  readonly Trade: {
    /**
     * Load the entity Trade from the storage by ID.
     * If the entity is not found, returns undefined.
     */
    readonly get: (id: string) => Promise<Entities.Trade_t | undefined>,
    /**
     * Load the entity Trade from the storage by ID.
     * If the entity is not found, throws an error.
     */
    readonly getOrThrow: (id: string, message?: string) => Promise<Entities.Trade_t>,
    readonly getWhere: Entities.Trade_indexedFieldOperations,
    /**
     * Returns the entity Trade from the storage by ID.
     * If the entity is not found, creates it using provided parameters and returns it.
     */
    readonly getOrCreate: (entity: Entities.Trade_t) => Promise<Entities.Trade_t>,
    /**
     * Set the entity Trade in the storage.
     */
    readonly set: (entity: Entities.Trade_t) => void,
    /**
     * Delete the entity Trade from the storage.
     *
     * The 'deleteUnsafe' method is experimental and unsafe. You should manually handle all entity references after deletion to maintain database consistency.
     */
    readonly deleteUnsafe: (id: string) => void,
  }
  readonly UserPosition: {
    /**
     * Load the entity UserPosition from the storage by ID.
     * If the entity is not found, returns undefined.
     */
    readonly get: (id: string) => Promise<Entities.UserPosition_t | undefined>,
    /**
     * Load the entity UserPosition from the storage by ID.
     * If the entity is not found, throws an error.
     */
    readonly getOrThrow: (id: string, message?: string) => Promise<Entities.UserPosition_t>,
    readonly getWhere: Entities.UserPosition_indexedFieldOperations,
    /**
     * Returns the entity UserPosition from the storage by ID.
     * If the entity is not found, creates it using provided parameters and returns it.
     */
    readonly getOrCreate: (entity: Entities.UserPosition_t) => Promise<Entities.UserPosition_t>,
    /**
     * Set the entity UserPosition in the storage.
     */
    readonly set: (entity: Entities.UserPosition_t) => void,
    /**
     * Delete the entity UserPosition from the storage.
     *
     * The 'deleteUnsafe' method is experimental and unsafe. You should manually handle all entity references after deletion to maintain database consistency.
     */
    readonly deleteUnsafe: (id: string) => void,
  }
  readonly UserStats: {
    /**
     * Load the entity UserStats from the storage by ID.
     * If the entity is not found, returns undefined.
     */
    readonly get: (id: string) => Promise<Entities.UserStats_t | undefined>,
    /**
     * Load the entity UserStats from the storage by ID.
     * If the entity is not found, throws an error.
     */
    readonly getOrThrow: (id: string, message?: string) => Promise<Entities.UserStats_t>,
    readonly getWhere: Entities.UserStats_indexedFieldOperations,
    /**
     * Returns the entity UserStats from the storage by ID.
     * If the entity is not found, creates it using provided parameters and returns it.
     */
    readonly getOrCreate: (entity: Entities.UserStats_t) => Promise<Entities.UserStats_t>,
    /**
     * Set the entity UserStats in the storage.
     */
    readonly set: (entity: Entities.UserStats_t) => void,
    /**
     * Delete the entity UserStats from the storage.
     *
     * The 'deleteUnsafe' method is experimental and unsafe. You should manually handle all entity references after deletion to maintain database consistency.
     */
    readonly deleteUnsafe: (id: string) => void,
  }
};

