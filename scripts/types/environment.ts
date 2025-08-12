/**
 * 환경 타입 정의
 */
export type Environment =
  | "localhost"
  | "base-dev"
  | "base-prod"
  | "citrea-dev"
  | "citrea-prod";

/**
 * 네트워크별 환경 체크
 */
export function isBaseEnvironment(env: Environment): boolean {
  return env === "base-dev" || env === "base-prod";
}

export function isCitreaEnvironment(env: Environment): boolean {
  return env === "citrea-dev" || env === "citrea-prod";
}

export function isDevEnvironment(env: Environment): boolean {
  return env.includes("-dev");
}

export function isProdEnvironment(env: Environment): boolean {
  return env.includes("-prod");
}

