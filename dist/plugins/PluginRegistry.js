"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PluginRegistry = void 0;
const PluginStatus_1 = require("./types/PluginStatus");
const PluginErrors_1 = require("./errors/PluginErrors");
const VALID_TRANSITIONS = {
    [PluginStatus_1.PluginStatus.UNLOADED]: [PluginStatus_1.PluginStatus.LOADING],
    [PluginStatus_1.PluginStatus.LOADING]: [PluginStatus_1.PluginStatus.LOADED, PluginStatus_1.PluginStatus.FAILED],
    [PluginStatus_1.PluginStatus.LOADED]: [PluginStatus_1.PluginStatus.ENABLING, PluginStatus_1.PluginStatus.UNLOADING],
    [PluginStatus_1.PluginStatus.ENABLING]: [PluginStatus_1.PluginStatus.ENABLED, PluginStatus_1.PluginStatus.FAILED],
    [PluginStatus_1.PluginStatus.ENABLED]: [PluginStatus_1.PluginStatus.DISABLING],
    [PluginStatus_1.PluginStatus.DISABLING]: [PluginStatus_1.PluginStatus.DISABLED, PluginStatus_1.PluginStatus.FAILED],
    [PluginStatus_1.PluginStatus.DISABLED]: [PluginStatus_1.PluginStatus.ENABLING, PluginStatus_1.PluginStatus.UNLOADING],
    [PluginStatus_1.PluginStatus.UNLOADING]: [PluginStatus_1.PluginStatus.UNLOADED, PluginStatus_1.PluginStatus.FAILED],
    [PluginStatus_1.PluginStatus.FAILED]: [PluginStatus_1.PluginStatus.UNLOADING, PluginStatus_1.PluginStatus.LOADING],
};
/**
 * Central store for all plugin entries.
 * Enforces valid state transitions and exposes read-only snapshots.
 */
class PluginRegistry {
    entries = new Map();
    add(plugin, filePath) {
        const { name } = plugin.manifest;
        this.entries.set(name, {
            pluginName: name,
            plugin,
            status: PluginStatus_1.PluginStatus.UNLOADED,
            filePath,
        });
    }
    remove(name) {
        this.entries.delete(name);
    }
    transition(name, to) {
        const entry = this.demand(name);
        const allowed = VALID_TRANSITIONS[entry.status] ?? [];
        if (!allowed.includes(to)) {
            throw new PluginErrors_1.PluginStateError(name, entry.status, to);
        }
        entry.status = to;
        if (to === PluginStatus_1.PluginStatus.LOADED)
            entry.loadedAt = Date.now();
        if (to === PluginStatus_1.PluginStatus.ENABLED)
            entry.enabledAt = Date.now();
        if (to === PluginStatus_1.PluginStatus.UNLOADED) {
            delete entry.loadedAt;
            delete entry.enabledAt;
            delete entry.error;
        }
    }
    markFailed(name, error) {
        const entry = this.entries.get(name);
        if (!entry)
            return;
        entry.status = PluginStatus_1.PluginStatus.FAILED;
        entry.error = error;
    }
    setContext(name, ctx) {
        this.demand(name).ctx = ctx;
    }
    getContext(name) {
        return this.entries.get(name)?.ctx;
    }
    getPlugin(name) {
        return this.demand(name).plugin;
    }
    getStatus(name) {
        return this.entries.get(name)?.status;
    }
    has(name) {
        return this.entries.has(name);
    }
    /** Public snapshot — does NOT expose internal plugin instances or contexts. */
    getAll() {
        return Array.from(this.entries.values()).map((e) => ({
            pluginName: e.pluginName,
            status: e.status,
            error: e.error,
            filePath: e.filePath,
            loadedAt: e.loadedAt,
            enabledAt: e.enabledAt,
        }));
    }
    getEnabled() {
        return Array.from(this.entries.values())
            .filter((e) => e.status === PluginStatus_1.PluginStatus.ENABLED)
            .map((e) => e.pluginName);
    }
    demand(name) {
        const entry = this.entries.get(name);
        if (!entry)
            throw new PluginErrors_1.PluginNotFoundError(name);
        return entry;
    }
}
exports.PluginRegistry = PluginRegistry;
