"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProcessErrorHandler = void 0;
const ErrorReporter_1 = require("../ErrorReporter");
const LoggerManager_1 = require("../../logger/LoggerManager");
const BotError_1 = require("../types/BotError");
const CRASH_THRESHOLD = 5;
const CRASH_WINDOW_MS = 60_000;
/**
 * Returns true if `reason` looks like a plain FCA error object (not a real Error).
 * FCA (fca-unofficial) rejects promises with plain objects such as:
 *   { error: 1357004, errorDescription: "...", ... }
 * These are expected failures (bad account state, unsupported API calls) and
 * should NOT count toward the crash-loop threshold.
 */
function isFcaErrorObject(reason) {
    if (reason instanceof Error)
        return false;
    if (typeof reason !== "object" || reason === null)
        return false;
    // FCA error objects typically have an `error` numeric code or an `errorDescription`
    const r = reason;
    return (typeof r["error"] === "number" ||
        typeof r["errorDescription"] === "string" ||
        typeof r["errorSummary"] === "string" ||
        // Sometimes FCA wraps with { error: "string message" }
        (typeof r["error"] === "string" && Object.keys(r).length <= 5));
}
class ProcessErrorHandler {
    name = "error-handler";
    reporter;
    log = LoggerManager_1.LoggerManager.getLogger("ProcessErrorHandler");
    errorTimestamps = [];
    onCritical;
    /**
     * Bound handler references stored so that removeListener() receives the
     * exact same function object that was passed to process.on() in initialize().
     * Using .bind() inline would create new references each time, making
     * removeListener a no-op and causing listener accumulation across restarts.
     */
    boundUncaughtException;
    boundUnhandledRejection;
    constructor(reporter) {
        this.reporter = reporter ?? new ErrorReporter_1.ErrorReporter(this.log);
    }
    onCriticalError(handler) {
        this.onCritical = handler;
        return this;
    }
    async initialize() {
        this.boundUncaughtException = this.handleUncaughtException.bind(this);
        this.boundUnhandledRejection = this.handleUnhandledRejection.bind(this);
        process.on("uncaughtException", this.boundUncaughtException);
        process.on("unhandledRejection", this.boundUnhandledRejection);
        this.log.info("Process error handlers registered.");
    }
    async destroy() {
        process.removeListener("uncaughtException", this.boundUncaughtException);
        process.removeListener("unhandledRejection", this.boundUnhandledRejection);
        this.log.info("Process error handlers removed.");
    }
    handleUncaughtException(error) {
        const report = this.reporter.report(error, { source: "uncaughtException" });
        const isBotError = error instanceof BotError_1.BotError;
        const isRecoverable = isBotError && error.recoverable;
        if (!isRecoverable) {
            this.log.error("Unrecoverable uncaught exception — shutting down.", error);
            this.triggerCritical();
            return;
        }
        this.recordError();
        if (this.isCrashLooping()) {
            this.log.error(`Crash loop detected: ${CRASH_THRESHOLD} errors in ${CRASH_WINDOW_MS / 1000}s — shutting down.`, undefined, { reportId: report.id });
            this.triggerCritical();
        }
    }
    handleUnhandledRejection(reason) {
        // FCA (fca-unofficial) internally creates unhandled promise rejections with
        // plain error objects (e.g. { error: 1357004, errorDescription: "..." }).
        // These are expected failures from unsupported Facebook API calls and should
        // NOT count toward the crash-loop threshold — only log them at WARN level.
        if (isFcaErrorObject(reason)) {
            const detail = (() => {
                try {
                    return JSON.stringify(reason);
                }
                catch {
                    return String(reason);
                }
            })();
            this.log.warn("Unhandled rejection from FCA (non-fatal, not counted toward crash loop).", { detail });
            return;
        }
        this.reporter.report(reason, { source: "unhandledRejection" });
        this.recordError();
        if (this.isCrashLooping()) {
            this.log.error("Crash loop detected via unhandledRejection — shutting down.");
            this.triggerCritical();
        }
    }
    recordError() {
        const now = Date.now();
        this.errorTimestamps.push(now);
        this.errorTimestamps = this.errorTimestamps.filter((t) => now - t < CRASH_WINDOW_MS);
    }
    isCrashLooping() {
        return this.errorTimestamps.length >= CRASH_THRESHOLD;
    }
    triggerCritical() {
        if (this.onCritical) {
            this.onCritical()
                .catch(() => { })
                .finally(() => process.exit(1));
        }
        else {
            process.exit(1);
        }
    }
}
exports.ProcessErrorHandler = ProcessErrorHandler;
