"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecurringTask = void 0;
const uuid_1 = require("uuid");
const TaskRunner_1 = require("./TaskRunner");
const LoggerManager_1 = require("../logger/LoggerManager");
const log = LoggerManager_1.LoggerManager.getLogger("RecurringTask");
class RecurringTask {
    id;
    name;
    meta;
    timer = null;
    options;
    onComplete;
    /**
     * @param options   Task configuration.
     * @param onComplete  Called once when the task reaches maxRuns and stops
     *                    naturally. Used by TaskScheduler to evict the task
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
            nextRunAt: options.runImmediately
                ? now
                : new Date(Date.now() + options.intervalMs),
            runCount: 0,
            errorCount: 0,
            lastError: null,
        };
    }
    start() {
        if (this.timer !== null)
            return;
        log.info(`Starting recurring task "${this.name}" every ${this.options.intervalMs}ms.` +
            (this.options.maxRuns !== undefined
                ? ` Max runs: ${this.options.maxRuns}.`
                : ""));
        if (this.options.runImmediately) {
            void this.tick();
        }
        this.timer = setInterval(() => {
            void this.tick();
        }, this.options.intervalMs);
    }
    cancel() {
        if (this.timer !== null) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.meta.status = "cancelled";
        this.meta.nextRunAt = null;
        log.info(`Recurring task "${this.name}" [${this.id}] cancelled.`);
    }
    isActive() {
        return this.timer !== null;
    }
    async tick() {
        if (this.meta.status === "cancelled")
            return;
        await (0, TaskRunner_1.safeRun)(this.meta, this.options.fn, this.options.onError);
        const { maxRuns } = this.options;
        if (maxRuns !== undefined && this.meta.runCount >= maxRuns) {
            log.info(`Recurring task "${this.name}" reached maxRuns (${maxRuns}). Stopping.`);
            this.cancel();
            this.meta.status = "completed";
            // Notify scheduler so it can remove this task from its registry.
            this.onComplete?.();
            return;
        }
        if (this.timer !== null) {
            this.meta.nextRunAt = new Date(Date.now() + this.options.intervalMs);
            this.meta.status = "idle";
        }
    }
}
exports.RecurringTask = RecurringTask;
