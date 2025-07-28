"use strict";
/**
 * @signals/clmsr-v0 - CLMSR SDK for TypeScript
 *
 * 컨트랙트 뷰함수들과 역함수 제공
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.VERSION = exports.toUSDC = exports.toWAD = exports.MathUtils = exports.CalculationError = exports.ValidationError = exports.mapDistribution = exports.mapMarket = exports.CLMSRSDK = void 0;
// Export main SDK class
var clmsr_sdk_1 = require("./clmsr-sdk");
Object.defineProperty(exports, "CLMSRSDK", { enumerable: true, get: function () { return clmsr_sdk_1.CLMSRSDK; } });
// Export types
var types_1 = require("./types");
// Data adapters
Object.defineProperty(exports, "mapMarket", { enumerable: true, get: function () { return types_1.mapMarket; } });
Object.defineProperty(exports, "mapDistribution", { enumerable: true, get: function () { return types_1.mapDistribution; } });
// Errors
Object.defineProperty(exports, "ValidationError", { enumerable: true, get: function () { return types_1.ValidationError; } });
Object.defineProperty(exports, "CalculationError", { enumerable: true, get: function () { return types_1.CalculationError; } });
// Export utility functions
exports.MathUtils = __importStar(require("./utils/math"));
// Convenience functions
var clmsr_sdk_2 = require("./clmsr-sdk");
Object.defineProperty(exports, "toWAD", { enumerable: true, get: function () { return clmsr_sdk_2.toWAD; } });
Object.defineProperty(exports, "toUSDC", { enumerable: true, get: function () { return clmsr_sdk_2.toUSDC; } });
// Version
exports.VERSION = "1.2.0";
