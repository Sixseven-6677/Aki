"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.safeRun = safeRun;
const LoggerManager_1 = require("../logger/LoggerManager");
const log = LoggerManager_1.LoggerManager.getLogger("TaskRunner");
async function safeRun(meta, fn, onError) {
    meta.status = "running";
    meta.lastRunAt = new Date();
    meta.runCount += 1;
    try {
        await fn();
        meta.status = "idle";
    }
    catch (err) {
        meta.errorCount += 1;
        meta.lastError = err instanceof Error ? err.message : String(err);
        meta.status = "failed";
        log.error(`Task "${meta.name}" [${meta.id}] failed.`, err);
        try {
            onError?.(err);
        }
        catch (handlerErr) {
            log.error(`Task "${meta.name}" onError handler itself threw.`, handlerErr);
        }
    }
}
