"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CalculationError = exports.ValidationError = exports.CLMSRError = void 0;
// ============================================================================
// ERROR TYPES
// ============================================================================
class CLMSRError extends Error {
    constructor(message) {
        super(message);
        this.name = "CLMSRError";
    }
}
exports.CLMSRError = CLMSRError;
class ValidationError extends CLMSRError {
    constructor(message) {
        super(message);
        this.name = "ValidationError";
    }
}
exports.ValidationError = ValidationError;
class CalculationError extends CLMSRError {
    constructor(message) {
        super(message);
        this.name = "CalculationError";
    }
}
exports.CalculationError = CalculationError;
