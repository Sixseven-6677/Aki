"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DelayedTask = void 0;
const uuid_1 = require("uuid");
const TaskRunner_1 = require("./TaskRunner");
const LoggerManager_1 = require("../logger/LoggerManager");
const log = LoggerManager_1.LoggerManager.getLogger("DelayedTask");
class DelayedTask {
    id;
    name;
    meta;
    timer = null;
    options;
    onComplete;
    /**
     * @param options     Task configuration.
     * @param onComplete  Called once the delayed task finishes executing naturally
     *                    (not via cancel). Used by TaskScheduler to evict the task
     *                    from its registry, preventing memory accumulation.
     */
    constructor(options, onComplete) {
        this.id = options.id ?? (0, uuid_1.v4)();
        this.name = options.name;
        this.options = options;
        this.onComplete = onComplete;
        const now = new Date();
        this.meta = {
            id: this.id,
            name: this.name,
            status: "idle",
            createdAt: now,
            lastRunAt: null,
            nextRunAt: new Date(Date.now() + options.delayMs),
            runCount: 0,
            errorCount: 0,
            lastError: null,
        };
    }
    start() {
        if (this.timer !== null)
            return;
        log.info(`Scheduling delayed task "${this.name}" in ${this.options.delayMs}ms.`);
        this.timer = setTimeout(async () => {
            this.meta.nextRunAt = null;
            await (0, TaskRunner_1.safeRun)(this.meta, this.options.fn, this.options.onError);
            if (this.meta.status !== "cancelled") {
                this.meta.status = "completed";
                // Notify scheduler so it can remove this task from its registry.
                this.onComplete?.();
            }
            this.timer = null;
            log.info(`Delayed task "${this.name}" [${this.id}] completed.`);
        }, this.options.delayMs);
    }
    cancel() {
        if (this.timer !== null) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        this.meta.status = "cancelled";
        this.meta.nextRunAt = null;
        log.info(`Delayed task "${this.name}" [${this.id}] cancelled.`);
    }
    isActive() {
        return this.timer !== null;
    }
}
exports.DelayedTask = DelayedTask;
