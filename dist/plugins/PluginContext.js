"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PluginContext = void 0;
const PluginErrors_1 = require("./errors/PluginErrors");
function toDisposable(fn) {
    let disposed = false;
    return {
        dispose() {
            if (disposed)
                return;
            disposed = true;
            fn();
        },
    };
}
/**
 * Sandboxed API surface given to each plugin.
 *
 * Every registration (command, event listener, service, task) is tracked.
 * Calling dispose() — done automatically by PluginManager on disable/unload —
 * removes everything the plugin registered with zero manual cleanup needed.
 */
class PluginContext {
    commandRegistry;
    scheduler;
    eventBus;
    serviceRegistry;
    configStore;
    pluginName;
    logger;
    disposables = [];
    ownedHandlers = new Set();
    disposed = false;
    constructor(pluginName, logger, commandRegistry, scheduler, eventBus, serviceRegistry, configStore) {
        this.commandRegistry = commandRegistry;
        this.scheduler = scheduler;
        this.eventBus = eventBus;
        this.serviceRegistry = serviceRegistry;
        this.configStore = configStore;
        this.pluginName = pluginName;
        this.logger = logger;
    }
    // ── Config ─────────────────────────────────────────────────────────────
    getConfig(key, fallback) {
        return this.configStore.get(this.pluginName, key, fallback);
    }
    // ── Commands ───────────────────────────────────────────────────────────
    registerCommand(command) {
        this.guard();
        this.commandRegistry.register(command);
        const d = toDisposable(() => this.commandRegistry.unregister(command.name));
        this.disposables.push(d);
        return d;
    }
    // ── Events ─────────────────────────────────────────────────────────────
    emit(event, data) {
        void this.eventBus.emit(event, data);
    }
    on(event, handler) {
        this.guard();
        this.ownedHandlers.add(handler);
        const off = this.eventBus.on(event, handler);
        const d = toDisposable(() => {
            off();
            this.ownedHandlers.delete(handler);
        });
        this.disposables.push(d);
        return d;
    }
    // ── Services ────────────────────────────────────────────────────────────
    provideService(name, service) {
        this.guard();
        const unregister = this.serviceRegistry.provide(name, service, this.pluginName);
        const d = toDisposable(unregister);
        this.disposables.push(d);
        return d;
    }
    consumeService(name) {
        return this.serviceRegistry.consume(name);
    }
    requireService(name) {
        const svc = this.serviceRegistry.consume(name);
        if (svc === undefined)
            throw new PluginErrors_1.PluginServiceError(this.pluginName, name);
        return svc;
    }
    // ── Scheduling ──────────────────────────────────────────────────────────
    scheduleRecurring(options) {
        this.guard();
        const task = this.scheduler.recur({
            ...options,
            name: `[${this.pluginName}] ${options.name}`,
        });
        const d = toDisposable(() => {
            if (task.isActive())
                this.scheduler.cancel(task.id);
        });
        this.disposables.push(d);
        return d;
    }
    scheduleDelayed(options) {
        this.guard();
        const task = this.scheduler.delay({
            ...options,
            name: `[${this.pluginName}] ${options.name}`,
        });
        const d = toDisposable(() => {
            if (task.isActive())
                this.scheduler.cancel(task.id);
        });
        this.disposables.push(d);
        return d;
    }
    // ── Lifecycle ────────────────────────────────────────────────────────────
    /**
     * Dispose all tracked resources.
     * Called by PluginManager after onDisable() / onUnload().
     */
    dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        for (const d of this.disposables) {
            try {
                d.dispose();
            }
            catch (err) {
                // Log disposal errors instead of silently swallowing them.
                // A failing disposable should not prevent other disposables from running.
                this.logger.warn(`[${this.pluginName}] Error during resource disposal — continuing cleanup.`, { error: err instanceof Error ? err.message : String(err) });
            }
        }
        this.disposables.length = 0;
        this.ownedHandlers.clear();
    }
    guard() {
        if (this.disposed) {
            throw new Error(`PluginContext for "${this.pluginName}" has already been disposed.`);
        }
    }
}
exports.PluginContext = PluginContext;
