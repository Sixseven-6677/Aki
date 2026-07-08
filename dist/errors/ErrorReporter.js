"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorReporter = exports.ErrorReporter = void 0;
const crypto_1 = require("crypto");
const BotError_1 = require("./types/BotError");
const LoggerManager_1 = require("../logger/LoggerManager");
class ErrorReporter {
    log;
    constructor(log) {
        this.log = log ?? LoggerManager_1.LoggerManager.getLogger("ErrorReporter");
    }
    report(error, extra) {
        const report = this.build(error, extra);
        this.emit(report);
        return report;
    }
    build(error, extra) {
        const id = (0, crypto_1.randomUUID)().slice(0, 8).toUpperCase();
        const timestamp = new Date().toISOString();
        if (error instanceof BotError_1.BotError) {
            return {
                id,
                timestamp,
                code: error.code,
                name: error.name,
                message: error.message,
                severity: error.severity,
                recoverable: error.recoverable,
                context: extra ? { ...error.context, ...extra } : error.context,
                stack: error.stack,
                cause: error.cause?.message,
                process: this.processInfo(),
            };
        }
        const err = error instanceof Error ? error : new Error(String(error));
        return {
            id,
            timestamp,
            code: "ERR_UNKNOWN",
            name: err.name,
            message: err.message,
            severity: "high",
            recoverable: false,
            context: extra,
            stack: err.stack,
            process: this.processInfo(),
        };
    }
    emit(report) {
        const meta = {
            reportId: report.id,
            code: report.code,
            severity: report.severity,
            recoverable: report.recoverable,
        };
        if (report.context)
            meta["context"] = report.context;
        switch (report.severity) {
            case "low":
            case "medium":
                this.log.warn(`[${report.id}] ${report.name}: ${report.message}`, meta);
                break;
            case "high":
            case "critical":
                this.log.error(`[${report.id}] ${report.name}: ${report.message}`, report.stack ? Object.assign(new Error(report.message), { stack: report.stack }) : undefined, meta);
                break;
        }
    }
    processInfo() {
        return {
            pid: process.pid,
            uptime: Math.floor(process.uptime()),
            memory: process.memoryUsage(),
        };
    }
}
exports.ErrorReporter = ErrorReporter;
exports.errorReporter = new ErrorReporter();
