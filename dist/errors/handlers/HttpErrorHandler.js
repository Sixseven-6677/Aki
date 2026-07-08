"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.httpErrorHandler = void 0;
exports.notFoundHandler = notFoundHandler;
const BotError_1 = require("../types/BotError");
const ErrorReporter_1 = require("../ErrorReporter");
const LoggerManager_1 = require("../../logger/LoggerManager");
const log = LoggerManager_1.LoggerManager.getLogger("HttpErrorHandler");
const STATUS_MAP = {
    ERR_VALIDATION: 400,
    ERR_PERMISSION: 403,
    ERR_NOT_FOUND: 404,
    ERR_FACEBOOK_API: 502,
    ERR_NETWORK: 503,
};
function resolveStatus(error) {
    return STATUS_MAP[error.code] ?? 500;
}
const httpErrorHandler = (err, _req, res, _next) => {
    const report = ErrorReporter_1.errorReporter.report(err);
    if (err instanceof BotError_1.BotError) {
        const status = resolveStatus(err);
        res.status(status).json({
            error: {
                code: err.code,
                message: err.message,
                reportId: report.id,
            },
        });
        return;
    }
    log.error("Unexpected HTTP error.", err instanceof Error ? err : undefined, {
        reportId: report.id,
    });
    res.status(500).json({
        error: {
            code: "ERR_INTERNAL",
            message: "Internal server error.",
            reportId: report.id,
        },
    });
};
exports.httpErrorHandler = httpErrorHandler;
function notFoundHandler(req, res) {
    res.status(404).json({
        error: {
            code: "ERR_NOT_FOUND",
            message: `Route not found: ${req.method} ${req.path}`,
        },
    });
}
