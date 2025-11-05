import { BigNumberish, toBigInt as toEthersBigInt } from "ethers";

export type TradeSide = "BUY" | "SELL";

export type Bytes32Like = `0x${string}`;

const ZERO_CONTEXT: Bytes32Like = `0x${"00".repeat(32)}`;

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function toBigInt(value: BigNumberish): bigint {
  return toEthersBigInt(value);
}

function normalizeContext(context?: Bytes32Like): Bytes32Like {
  return (context ?? ZERO_CONTEXT) as Bytes32Like;
}

function normalizeTrader(trader?: string): string {
  if (!trader) {
    return ZERO_ADDRESS;
  }
  return trader;
}

function normalizeMarketId(marketId?: BigNumberish): bigint {
  if (marketId === undefined || marketId === null) {
    return 0n;
  }
  return toBigInt(marketId);
}

interface FeeQuoteParams {
  trader: string;
  marketId: bigint;
  lowerTick: bigint;
  upperTick: bigint;
  quantity6: bigint;
  baseAmount6: bigint;
  side: TradeSide;
  context: Bytes32Like;
}

export interface FeePolicy {
  quote(params: FeeQuoteParams): bigint;
  name?: string;
}

export const NullFeePolicy: FeePolicy = Object.freeze({
  quote: () => 0n,
  name: "NullFeePolicy",
});

export interface PercentageFeePolicyConfig {
  bps: BigNumberish;
  name?: string;
}

export function createPercentageFeePolicy(
  config: PercentageFeePolicyConfig
): FeePolicy {
  const bps = toBigInt(config.bps);
  const policyName = config.name ?? "PercentageFeePolicy";

  return {
    name: policyName,
    quote: ({ baseAmount6 }) => {
      return (baseAmount6 * bps) / 10_000n;
    },
  };
}

const FeePolicies = Object.freeze({
  Null: NullFeePolicy,
  Percentage: (config: PercentageFeePolicyConfig) =>
    createPercentageFeePolicy(config),
});

export type FeePolicyName = "Null" | "Percentage";

export function getFeePolicy(
  name: "Null"
): FeePolicy;
export function getFeePolicy(
  name: "Percentage",
  config: PercentageFeePolicyConfig
): FeePolicy;
export function getFeePolicy(
  name: FeePolicyName,
  config?: PercentageFeePolicyConfig
): FeePolicy {
  if (name === "Null") {
    return FeePolicies.Null;
  }
  if (name === "Percentage") {
    if (!config) {
      throw new Error("Percentage fee policy requires configuration");
    }
    return createPercentageFeePolicy(config);
  }
  throw new Error(`Unsupported fee policy: ${name as string}`);
}

export interface PreviewOpenFeeArgs {
  trader: string;
  marketId: BigNumberish;
  lowerTick: BigNumberish;
  upperTick: BigNumberish;
  quantity6: BigNumberish;
  cost6: BigNumberish;
  context?: Bytes32Like;
}

export interface PreviewSellFeeArgs {
  trader: string;
  marketId: BigNumberish;
  lowerTick: BigNumberish;
  upperTick: BigNumberish;
  sellQuantity6: BigNumberish;
  proceeds6: BigNumberish;
  context?: Bytes32Like;
}

function buildQuoteParams(
  side: TradeSide,
  args: PreviewOpenFeeArgs | PreviewSellFeeArgs
): FeeQuoteParams {
  return {
    trader: normalizeTrader(args.trader),
    marketId: normalizeMarketId(
      (args as PreviewOpenFeeArgs | PreviewSellFeeArgs).marketId
    ),
    lowerTick: toBigInt(args.lowerTick),
    upperTick: toBigInt(args.upperTick),
    quantity6:
      side === "BUY"
        ? toBigInt((args as PreviewOpenFeeArgs).quantity6)
        : toBigInt((args as PreviewSellFeeArgs).sellQuantity6),
    baseAmount6:
      side === "BUY"
        ? toBigInt((args as PreviewOpenFeeArgs).cost6)
        : toBigInt((args as PreviewSellFeeArgs).proceeds6),
    side,
    context: normalizeContext(args.context),
  };
}

interface ParsedFeePolicyDescriptor {
  policy: "null" | "percentage";
  name?: string;
  bps?: bigint;
  descriptor: string;
}

export interface EncodePercentageFeePolicyDescriptorParams {
  bps: BigNumberish;
  name?: string;
}

function parseBigIntParam(
  value: unknown,
  field: string,
  options?: { required?: boolean }
): bigint | undefined {
  if (value === undefined || value === null) {
    if (options?.required) {
      throw new Error(
        `Missing required parameter '${field}' in fee policy descriptor`
      );
    }
    return undefined;
  }
  try {
    return toBigInt(value as BigNumberish);
  } catch {
    throw new Error(
      `Invalid value for '${field}' in fee policy descriptor: ${value as string}`
    );
  }
}

function parseFeePolicyDescriptor(descriptor: string): ParsedFeePolicyDescriptor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(descriptor);
  } catch (error) {
    throw new Error(
      `Invalid fee policy descriptor: ${descriptor}. ${String(error)}`
    );
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Fee policy descriptor must be a JSON object");
  }

  const { policy, params } = parsed as {
    policy?: string;
    params?: Record<string, unknown>;
    name?: string;
  };

  if (!policy || typeof policy !== "string") {
    throw new Error(
      "Fee policy descriptor must include a string 'policy' field"
    );
  }

  const normalizedPolicy = policy.toLowerCase();
  const paramBag = params ?? {};

  if (normalizedPolicy === "null") {
    return {
      policy: "null",
      name:
        typeof paramBag.name === "string"
          ? paramBag.name
          : parsed && typeof (parsed as any).name === "string"
          ? (parsed as any).name
          : undefined,
      descriptor,
    };
  }

  if (normalizedPolicy === "percentage") {
    const bps = parseBigIntParam(paramBag.bps, "bps", {
      required: true,
    })!;
    const name =
      typeof paramBag.name === "string"
        ? paramBag.name
        : typeof (parsed as any).name === "string"
        ? (parsed as any).name
        : undefined;

    return {
      policy: "percentage",
      name,
      bps,
      descriptor,
    };
  }

  throw new Error(`Unsupported fee policy '${policy}' in descriptor`);
}

export interface ResolvedFeePolicy {
  policy: FeePolicy;
  descriptor?: ParsedFeePolicyDescriptor;
}

export function resolveFeePolicyWithMetadata(
  input: FeePolicy | string
): ResolvedFeePolicy {
  if (typeof input !== "string") {
    return { policy: input };
  }

  const parsed = parseFeePolicyDescriptor(input);

  if (parsed.policy === "null") {
    if (parsed.name && parsed.name !== NullFeePolicy.name) {
      return {
        policy: {
          quote: NullFeePolicy.quote,
          name: parsed.name,
        },
        descriptor: parsed,
      };
    }
    return { policy: NullFeePolicy, descriptor: parsed };
  }

  const percentagePolicy = createPercentageFeePolicy({
    bps: parsed.bps!,
    name: parsed.name,
  });

  return {
    policy: percentagePolicy,
    descriptor: parsed,
  };
}

function quoteOpenFee(
  policyInput: FeePolicy | string,
  args: PreviewOpenFeeArgs
): bigint {
  const { policy } = resolveFeePolicyWithMetadata(policyInput);
  return policy.quote(buildQuoteParams("BUY", args));
}

function quoteSellFee(
  policyInput: FeePolicy | string,
  args: PreviewSellFeeArgs
): bigint {
  const { policy } = resolveFeePolicyWithMetadata(policyInput);
  return policy.quote(buildQuoteParams("SELL", args));
}

export function encodePercentageFeePolicyDescriptor(
  params: EncodePercentageFeePolicyDescriptorParams
): string {
  const bps = toBigInt(params.bps);
  if (bps < 0n) {
    throw new Error("Fee bps must be non-negative");
  }

  const descriptor = {
    policy: "percentage",
    params: {
      bps: bps.toString(),
      ...(params.name ? { name: params.name } : {}),
    },
    ...(params.name ? { name: params.name } : {}),
  };

  return JSON.stringify(descriptor);
}

export { quoteOpenFee, quoteSellFee };
