"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = void 0;
const ILogger_1 = require("./types/ILogger");
function toError(value) {
    if (value instanceof Error)
        return value;
    if (value !== undefined && value !== null) {
        return new Error(String(value));
    }
    return undefined;
}
class Logger {
    transports;
    minPriority;
    ctx;
    constructor(transports, minLevel = ILogger_1.LogLevel.INFO, context) {
        this.transports = transports;
        this.minPriority = ILogger_1.LOG_LEVEL_PRIORITY[minLevel];
        this.ctx = context;
    }
    debug(message, meta) {
        this.write(ILogger_1.LogLevel.DEBUG, message, undefined, meta);
    }
    info(message, meta) {
        this.write(ILogger_1.LogLevel.INFO, message, undefined, meta);
    }
    warn(message, meta) {
        this.write(ILogger_1.LogLevel.WARN, message, undefined, meta);
    }
    error(message, error, meta) {
        this.write(ILogger_1.LogLevel.ERROR, message, toError(error), meta);
    }
    child(context) {
        return new Logger(this.transports, this.resolveLevel(), context);
    }
    close() {
        for (const transport of this.transports) {
            transport.close?.();
        }
    }
    write(level, message, error, meta) {
        if (ILogger_1.LOG_LEVEL_PRIORITY[level] < this.minPriority)
            return;
        const entry = {
            level,
            message,
            timestamp: new Date(),
            context: this.ctx,
            meta,
            error,
        };
        for (const transport of this.transports) {
            try {
                transport.write(entry);
            }
            catch {
                /* transport failures must never crash the app */
            }
        }
    }
    resolveLevel() {
        for (const [level, priority] of Object.entries(ILogger_1.LOG_LEVEL_PRIORITY)) {
            if (priority === this.minPriority)
                return level;
        }
        return ILogger_1.LogLevel.INFO;
    }
}
exports.Logger = Logger;
