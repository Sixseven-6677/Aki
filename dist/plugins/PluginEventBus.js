"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PluginEventBus = void 0;
const LoggerManager_1 = require("../logger/LoggerManager");
const log = LoggerManager_1.LoggerManager.getLogger("PluginEventBus");
/**
 * Typed pub/sub event bus for inter-plugin communication.
 * All handler errors are caught and logged — one failing handler
 * never blocks others from running.
 */
class PluginEventBus {
    listeners = new Map();
    on(event, handler) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(handler);
        return () => this.off(event, handler);
    }
    off(event, handler) {
        this.listeners.get(event)?.delete(handler);
    }
    async emit(event, data) {
        const set = this.listeners.get(event);
        if (!set || set.size === 0)
            return;
        for (const handler of set) {
            try {
                await handler(data);
            }
            catch (err) {
                log.error(`Error in handler for event "${event}".`, err);
            }
        }
    }
    removeHandlers(handlers) {
        for (const [, set] of this.listeners) {
            for (const h of handlers) {
                set.delete(h);
            }
        }
    }
    listenerCount(event) {
        return this.listeners.get(event)?.size ?? 0;
    }
    clear() {
        this.listeners.clear();
    }
}
exports.PluginEventBus = PluginEventBus;
