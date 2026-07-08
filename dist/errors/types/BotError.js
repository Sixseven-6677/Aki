"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BotError = void 0;
class BotError extends Error {
    code;
    severity;
    recoverable;
    context;
    timestamp;
    cause;
    constructor(message, options) {
        super(message);
        this.name = this.constructor.name;
        this.code = options.code;
        this.severity = options.severity ?? "medium";
        this.recoverable = options.recoverable ?? true;
        this.context = options.context;
        this.cause = options.cause;
        this.timestamp = new Date();
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }
    toJSON() {
        return {
            name: this.name,
            code: this.code,
            message: this.message,
            severity: this.severity,
            recoverable: this.recoverable,
            context: this.context,
            timestamp: this.timestamp.toISOString(),
            stack: this.stack,
            cause: this.cause?.message,
        };
    }
}
exports.BotError = BotError;
