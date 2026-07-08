"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PluginManager = void 0;
const path_1 = __importDefault(require("path"));
const PluginStatus_1 = require("./types/PluginStatus");
const PluginRegistry_1 = require("./PluginRegistry");
const PluginLoader_1 = require("./PluginLoader");
const PluginEventBus_1 = require("./PluginEventBus");
const PluginServiceRegistry_1 = require("./PluginServiceRegistry");
const PluginConfigStore_1 = require("./PluginConfigStore");
const PluginContext_1 = require("./PluginContext");
const PluginErrors_1 = require("./errors/PluginErrors");
const LoggerManager_1 = require("../logger/LoggerManager");
const log = LoggerManager_1.LoggerManager.getLogger("PluginManager");
/**
 * Orchestrates the full plugin lifecycle:
 *   discover → load → enable → (running) → disable → unload
 *
 * Implements ISystem so Bot manages its startup/shutdown order.
 * Depends on "scheduler" being ready before plugins are enabled.
 */
class PluginManager {
    name = "plugin-manager";
    dependencies = ["scheduler"];
    registry;
    loader;
    eventBus;
    serviceRegistry;
    configStore;
    commandRegistry;
    scheduler;
    pluginsDir;
    enableWatch;
    constructor(opts) {
        this.commandRegistry = opts.commandRegistry;
        this.scheduler = opts.scheduler;
        this.pluginsDir = path_1.default.resolve(opts.pluginsDir);
        this.enableWatch = opts.watch ?? true;
        const configsDir = opts.configsDir
            ? path_1.default.resolve(opts.configsDir)
            : this.pluginsDir;
        this.eventBus = new PluginEventBus_1.PluginEventBus();
        this.serviceRegistry = new PluginServiceRegistry_1.PluginServiceRegistry();
        this.configStore = new PluginConfigStore_1.PluginConfigStore(configsDir);
        this.registry = new PluginRegistry_1.PluginRegistry();
        this.loader = new PluginLoader_1.PluginLoader();
        this.loader.setHandlers((plugin, fp) => this.loadPlugin(plugin, fp), (name) => this.unloadPlugin(name));
    }
    // ── ISystem ───────────────────────────────────────────────────────────────
    async initialize() {
        log.info(`Loading plugins from: "${this.pluginsDir}"`);
        await this.loader.loadFromDir(this.pluginsDir);
        const enableOrder = this.resolveEnableOrder();
        for (const name of enableOrder) {
            await this.enablePlugin(name);
        }
        if (this.enableWatch) {
            this.loader.watch(this.pluginsDir);
        }
        const enabled = this.registry.getEnabled();
        log.info(`PluginManager ready. ` +
            `${enabled.length} plugin(s) enabled` +
            (enabled.length > 0 ? `: [${enabled.join(", ")}]` : "."));
    }
    async destroy() {
        await this.loader.stopWatching();
        const enabled = [...this.registry.getEnabled()].reverse();
        for (const name of enabled) {
            await this.safeDisable(name);
            await this.safeUnload(name);
        }
        this.eventBus.clear();
        log.info("PluginManager destroyed.");
    }
    // ── Public Plugin Control ─────────────────────────────────────────────────
    async loadPlugin(plugin, filePath) {
        const { name, version, defaultConfig } = plugin.manifest;
        if (this.registry.has(name)) {
            log.warn(`Plugin "${name}" is already registered — skipping.`);
            return;
        }
        log.info(`Loading plugin: ${name} v${version}`);
        this.registry.add(plugin, filePath);
        this.registry.transition(name, PluginStatus_1.PluginStatus.LOADING);
        try {
            this.configStore.load(name, defaultConfig ?? {});
            const ctx = new PluginContext_1.PluginContext(name, LoggerManager_1.LoggerManager.getLogger(`Plugin:${name}`), this.commandRegistry, this.scheduler, this.eventBus, this.serviceRegistry, this.configStore);
            await plugin.onLoad(ctx);
            this.registry.setContext(name, ctx);
            this.registry.transition(name, PluginStatus_1.PluginStatus.LOADED);
            log.info(`Plugin loaded: ${name} v${version}`);
        }
        catch (err) {
            this.registry.markFailed(name, err instanceof Error ? err : new Error(String(err)));
            log.error(`Failed to load plugin "${name}".`, err);
        }
    }
    async enablePlugin(name) {
        const status = this.registry.getStatus(name);
        if (status !== PluginStatus_1.PluginStatus.LOADED && status !== PluginStatus_1.PluginStatus.DISABLED) {
            log.warn(`Cannot enable "${name}": current status is "${status ?? "unknown"}".`);
            return;
        }
        const plugin = this.registry.getPlugin(name);
        for (const dep of plugin.manifest.dependencies ?? []) {
            if (this.registry.getStatus(dep) !== PluginStatus_1.PluginStatus.ENABLED) {
                throw new PluginErrors_1.PluginDependencyError(name, dep);
            }
        }
        this.registry.transition(name, PluginStatus_1.PluginStatus.ENABLING);
        try {
            await plugin.onEnable?.();
            this.registry.transition(name, PluginStatus_1.PluginStatus.ENABLED);
            log.info(`Plugin enabled: ${name}`);
        }
        catch (err) {
            this.registry.markFailed(name, err instanceof Error ? err : new Error(String(err)));
            log.error(`Failed to enable plugin "${name}".`, err);
        }
    }
    async disablePlugin(name) {
        if (this.registry.getStatus(name) !== PluginStatus_1.PluginStatus.ENABLED)
            return;
        this.registry.transition(name, PluginStatus_1.PluginStatus.DISABLING);
        const plugin = this.registry.getPlugin(name);
        try {
            await plugin.onDisable?.();
            // Dispose context — removes all commands, events, services, tasks
            this.registry.getContext(name)?.dispose();
            this.registry.transition(name, PluginStatus_1.PluginStatus.DISABLED);
            log.info(`Plugin disabled: ${name}`);
        }
        catch (err) {
            this.registry.markFailed(name, err instanceof Error ? err : new Error(String(err)));
            log.error(`Failed to disable plugin "${name}".`, err);
        }
    }
    async unloadPlugin(name) {
        const status = this.registry.getStatus(name);
        if (!status || status === PluginStatus_1.PluginStatus.UNLOADED)
            return;
        if (status === PluginStatus_1.PluginStatus.ENABLED) {
            await this.disablePlugin(name);
        }
        this.registry.transition(name, PluginStatus_1.PluginStatus.UNLOADING);
        const plugin = this.registry.getPlugin(name);
        try {
            await plugin.onUnload();
            this.configStore.evict(name);
            this.registry.transition(name, PluginStatus_1.PluginStatus.UNLOADED);
            this.registry.remove(name);
            log.info(`Plugin unloaded: ${name}`);
        }
        catch (err) {
            this.registry.markFailed(name, err instanceof Error ? err : new Error(String(err)));
            log.error(`Failed to unload plugin "${name}".`, err);
        }
    }
    // ── Status ────────────────────────────────────────────────────────────────
    getPluginStatus() {
        return this.registry.getAll();
    }
    getEnabledPlugins() {
        return this.registry.getEnabled();
    }
    getEventBus() {
        return this.eventBus;
    }
    getServiceRegistry() {
        return this.serviceRegistry;
    }
    // ── Internal ──────────────────────────────────────────────────────────────
    async safeDisable(name) {
        await this.disablePlugin(name).catch((err) => {
            log.error(`Error disabling plugin "${name}" during shutdown.`, err);
        });
    }
    async safeUnload(name) {
        await this.unloadPlugin(name).catch((err) => {
            log.error(`Error unloading plugin "${name}" during shutdown.`, err);
        });
    }
    /**
     * Topologically sorts loaded plugins by declared dependencies.
     * Returns names in the order they should be enabled (dependencies first).
     * Throws PluginCircularDependencyError on cycles.
     */
    resolveEnableOrder() {
        const loaded = this.registry
            .getAll()
            .filter((e) => e.status === PluginStatus_1.PluginStatus.LOADED)
            .map((e) => e.pluginName);
        const visited = new Set();
        const result = [];
        const visit = (name, chain) => {
            if (visited.has(name))
                return;
            if (chain.includes(name)) {
                throw new PluginErrors_1.PluginCircularDependencyError(name, [...chain, name]);
            }
            const plugin = this.registry.getPlugin(name);
            for (const dep of plugin.manifest.dependencies ?? []) {
                if (!this.registry.has(dep)) {
                    log.warn(`Plugin "${name}" declares dependency on "${dep}" which is not loaded. ` +
                        `"${name}" will be skipped.`);
                    return;
                }
                visit(dep, [...chain, name]);
            }
            visited.add(name);
            result.push(name);
        };
        for (const name of loaded) {
            visit(name, []);
        }
        return result;
    }
}
exports.PluginManager = PluginManager;
