// src/_safeload.ts
import { log } from "@graphprotocol/graph-ts";
import { Market, UserPosition, BinState } from "../generated/schema";

export function loadMarketOrSkip(id: string, where: string): Market | null {
  const m = Market.load(id);
  if (m == null) {
    log.warning("[{}] Market {} not found. Skip.", [where, id]);
  }
  return m;
}

export function loadPosOrSkip(id: string, where: string): UserPosition | null {
  const p = UserPosition.load(id);
  if (p == null) {
    log.warning("[{}] UserPosition {} not found. Skip.", [where, id]);
  }
  return p;
}

export function loadBinOrSkip(id: string, where: string): BinState | null {
  const b = BinState.load(id);
  if (b == null) {
    log.warning("[{}] BinState {} not found. Continue.", [where, id]);
  }
  return b;
}
