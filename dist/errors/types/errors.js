"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShutdownError = exports.NetworkError = exports.PermissionError = exports.ValidationError = exports.CommandError = exports.FacebookApiError = exports.DatabaseError = exports.ConfigurationError = void 0;
const BotError_1 = require("./BotError");
class ConfigurationError extends BotError_1.BotError {
    constructor(message, opts = {}) {
        super(message, {
            ...opts,
            code: opts.code ?? "ERR_CONFIGURATION",
            severity: opts.severity ?? "critical",
            recoverable: opts.recoverable ?? false,
        });
    }
}
exports.ConfigurationError = ConfigurationError;
class DatabaseError extends BotError_1.BotError {
    constructor(message, opts = {}) {
        super(message, {
            ...opts,
            code: opts.code ?? "ERR_DATABASE",
            severity: opts.severity ?? "high",
            recoverable: opts.recoverable ?? true,
        });
    }
}
exports.DatabaseError = DatabaseError;
class FacebookApiError extends BotError_1.BotError {
    constructor(message, opts = {}) {
        super(message, {
            ...opts,
            code: opts.code ?? "ERR_FACEBOOK_API",
            severity: opts.severity ?? "medium",
            recoverable: opts.recoverable ?? true,
        });
    }
}
exports.FacebookApiError = FacebookApiError;
class CommandError extends BotError_1.BotError {
    constructor(message, opts = {}) {
        super(message, {
            ...opts,
            code: opts.code ?? "ERR_COMMAND",
            severity: opts.severity ?? "low",
            recoverable: opts.recoverable ?? true,
        });
    }
}
exports.CommandError = CommandError;
class ValidationError extends BotError_1.BotError {
    constructor(message, opts = {}) {
        super(message, {
            ...opts,
            code: opts.code ?? "ERR_VALIDATION",
            severity: opts.severity ?? "low",
            recoverable: opts.recoverable ?? true,
        });
    }
}
exports.ValidationError = ValidationError;
class PermissionError extends BotError_1.BotError {
    constructor(message, opts = {}) {
        super(message, {
            ...opts,
            code: opts.code ?? "ERR_PERMISSION",
            severity: opts.severity ?? "low",
            recoverable: opts.recoverable ?? true,
        });
    }
}
exports.PermissionError = PermissionError;
class NetworkError extends BotError_1.BotError {
    constructor(message, opts = {}) {
        super(message, {
            ...opts,
            code: opts.code ?? "ERR_NETWORK",
            severity: opts.severity ?? "medium",
            recoverable: opts.recoverable ?? true,
        });
    }
}
exports.NetworkError = NetworkError;
class ShutdownError extends BotError_1.BotError {
    constructor(message, opts = {}) {
        super(message, {
            ...opts,
            code: opts.code ?? "ERR_SHUTDOWN",
            severity: opts.severity ?? "high",
            recoverable: opts.recoverable ?? false,
        });
    }
}
exports.ShutdownError = ShutdownError;
