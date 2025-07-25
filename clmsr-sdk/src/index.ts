/**
 * @signals/clmsr-v0 - CLMSR SDK for TypeScript
 *
 * 컨트랙트 뷰함수들과 역함수 제공
 */

// Main SDK class
export { CLMSRSDK, createCLMSRSDK } from "./clmsr-sdk";

// Re-export all types
export * from "./types";

// Math utilities only
export * as MathUtils from "./utils/math";

// Convenience functions
export { toWAD, toUSDC } from "./clmsr-sdk";

// Version
export const VERSION = "1.2.0";
