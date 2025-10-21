import { BigInt } from "@graphprotocol/graph-ts";

export const WAD_STRING = "1000000000000000000";

export function wad(): BigInt {
  return BigInt.fromString(WAD_STRING);
}

export function zero(): BigInt {
  return BigInt.fromI32(0);
}

export function one(): BigInt {
  return BigInt.fromI32(1);
}
