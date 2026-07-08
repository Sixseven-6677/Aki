"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLoggingMiddleware = createLoggingMiddleware;
const LoggerManager_1 = require("../../logger/LoggerManager");
const log = LoggerManager_1.LoggerManager.getLogger("Middleware/Log");
function createLoggingMiddleware(opts = {}) {
    return {
        name: "logging",
        description: "Logs command execution time and result",
        handle: async (ctx, command, next) => {
            const cmdName = command?.name ?? "(no-command)";
            const userId = ctx.user.id;
            const start = Date.now();
            if (opts.logEntry) {
                log.debug(`→ [${cmdName}] user:${userId} args:[${ctx.args.join(", ")}]`);
            }
            try {
                await next();
            }
            catch (err) {
                const ms = Date.now() - start;
                const msg = err instanceof Error ? err.message : String(err);
                log.error(`✗ [${cmdName}] user:${userId} | ${ms}ms | error: ${msg}`);
                throw err;
            }
            const ms = Date.now() - start;
            log.info(`✓ [${cmdName}] user:${userId} args:[${ctx.args.join(", ")}] | ${ms}ms`);
        },
    };
}
