"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PluginConfigStore = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const LoggerManager_1 = require("../logger/LoggerManager");
const log = LoggerManager_1.LoggerManager.getLogger("PluginConfigStore");
/**
 * Per-plugin configuration storage.
 *
 * Config resolution order (highest wins):
 *   1. File config  — <configsDir>/<pluginName>/config.json
 *   2. Default config — PluginManifest.defaultConfig
 *
 * Example file path: src/plugins/definitions/my-plugin/config.json
 */
class PluginConfigStore {
    configsDir;
    cache = new Map();
    constructor(configsDir) {
        this.configsDir = configsDir;
    }
    load(pluginName, defaults = {}) {
        const filePath = path_1.default.join(this.configsDir, pluginName, "config.json");
        let fileConfig = {};
        if (fs_1.default.existsSync(filePath)) {
            try {
                const raw = fs_1.default.readFileSync(filePath, "utf8");
                fileConfig = JSON.parse(raw);
                log.info(`Config loaded for plugin "${pluginName}" from ${filePath}.`);
            }
            catch (err) {
                log.warn(`Failed to parse config for plugin "${pluginName}": ` +
                    `${err.message}`);
            }
        }
        const merged = { ...defaults, ...fileConfig };
        this.cache.set(pluginName, merged);
        return merged;
    }
    get(pluginName, key, fallback) {
        const config = this.cache.get(pluginName) ?? {};
        const value = config[key];
        return (value !== undefined ? value : fallback);
    }
    getAll(pluginName) {
        return { ...(this.cache.get(pluginName) ?? {}) };
    }
    evict(pluginName) {
        this.cache.delete(pluginName);
    }
}
exports.PluginConfigStore = PluginConfigStore;
