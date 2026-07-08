"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskScheduler = void 0;
const DelayedTask_1 = require("./DelayedTask");
const RecurringTask_1 = require("./RecurringTask");
const LoggerManager_1 = require("../logger/LoggerManager");
const log = LoggerManager_1.LoggerManager.getLogger("TaskScheduler");
class TaskScheduler {
    name = "scheduler";
    tasks = new Map();
    async initialize() {
        log.info("TaskScheduler initialized.");
    }
    async destroy() {
        let cancelled = 0;
        for (const task of this.tasks.values()) {
            if (task.isActive()) {
                task.cancel();
                cancelled++;
            }
        }
        this.tasks.clear();
        log.info(`TaskScheduler destroyed. Cancelled ${cancelled} active task(s).`);
    }
    delay(options) {
        const task = new DelayedTask_1.DelayedTask(options, () => this.evict(task.id));
        this.register(task);
        task.start();
        return task;
    }
    /**
     * Schedule a recurring task.
     *
     * Idempotent by name: if an active task with the same name already exists,
     * it is cancelled before the new one is registered. This prevents duplicate
     * recurring tasks when a plugin is re-enabled after a reconnect.
     */
    recur(options) {
        // Deduplication: cancel any existing active task with the same name.
        const fullName = options.name;
        for (const [, existing] of this.tasks) {
            if (existing.name === fullName && existing.isActive()) {
                log.info(`TaskScheduler: task "${fullName}" already active — ` +
                    `cancelling [${existing.id}] before re-scheduling.`);
                existing.cancel();
                this.tasks.delete(existing.id);
                break;
            }
        }
        const task = new RecurringTask_1.RecurringTask(options, () => this.evict(task.id));
        this.register(task);
        task.start();
        return task;
    }
    cancel(id) {
        const task = this.tasks.get(id);
        if (!task) {
            log.warn(`Cancel called for unknown task id: ${id}`);
            return false;
        }
        task.cancel();
        this.tasks.delete(id);
        return true;
    }
    get(id) {
        return this.tasks.get(id);
    }
    list() {
        return Array.from(this.tasks.values()).map((t) => ({ ...t.meta }));
    }
    active() {
        return this.list().filter((m) => m.status !== "cancelled" && m.status !== "completed");
    }
    stats() {
        const all = this.list();
        return {
            total: all.length,
            active: all.filter((m) => m.status === "idle" || m.status === "running").length,
            failed: all.filter((m) => m.status === "failed").length,
        };
    }
    evict(id) {
        if (this.tasks.delete(id)) {
            log.info(`Task [${id}] completed and evicted from registry.`);
        }
    }
    register(task) {
        if (this.tasks.has(task.id)) {
            throw new Error(`Task with id "${task.id}" is already registered.`);
        }
        this.tasks.set(task.id, task);
        log.info(`Task registered: "${task.name}" [${task.id}]`);
    }
}
exports.TaskScheduler = TaskScheduler;
