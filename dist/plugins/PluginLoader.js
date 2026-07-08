"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PluginLoader = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const chokidar_1 = __importDefault(require("chokidar"));
const IPlugin_1 = require("./types/IPlugin");
const LoggerManager_1 = require("../logger/LoggerManager");
const log = LoggerManager_1.LoggerManager.getLogger("PluginLoader");
const isTsNode = Boolean(process.env["TS_NODE_DEV"] ??
    process[Symbol.for("ts-node.register.instance")]);
const FILE_EXT = isTsNode ? ".ts" : ".js";
/**
 * A file is considered a plugin entry-point when it matches either pattern:
 *   index.ts / index.js          — standard directory-plugin (recommended)
 *   *.plugin.ts / *.plugin.js    — flat single-file plugin
 *
 * All other files inside the plugin directory (commands, services, models …)
 * are intentionally skipped to avoid noisy "no valid plugin export" warnings.
 */
function isPluginFile(name) {
    const bare = FILE_EXT === ".ts" ? ".ts" : ".js";
    return (name === `index${bare}` ||
        name.endsWith(`.plugin${bare}`));
}
/**
 * Discovers, loads, and hot-reloads plugin entry-point files from a directory.
 *
 * Supports two export styles:
 *   export default class MyPlugin implements IPlugin { ... }   (class — instantiated)
 *   export default new MyPlugin()                              (instance — used as-is)
 *   export const plugin = new MyPlugin()                       (named instance)
 */
class PluginLoader {
    fileToName = new Map();
    watcher;
    onLoadHandler;
    onUnloadHandler;
    setHandlers(onLoad, onUnload) {
        this.onLoadHandler = onLoad;
        this.onUnloadHandler = onUnload;
    }
    async loadFromDir(directory) {
        const absDir = path_1.default.resolve(directory);
        if (!fs_1.default.existsSync(absDir)) {
            log.warn(`Plugins directory not found: "${absDir}" — ` +
                `no plugins auto-loaded. Create the directory to use plugins.`);
            return;
        }
        const files = this.collectFiles(absDir);
        for (const file of files) {
            await this.loadFile(file);
        }
        log.info(`Loaded ${this.fileToName.size} plugin(s) from "${absDir}".`);
    }
    watch(directory) {
        const absDir = path_1.default.resolve(directory);
        // Watch only plugin entry-points, not every file in the directory.
        const patterns = [
            path_1.default.join(absDir, "**", `index${FILE_EXT}`),
            path_1.default.join(absDir, "**", `*.plugin${FILE_EXT}`),
        ];
        this.watcher = chokidar_1.default.watch(patterns, {
            ignoreInitial: true,
            persistent: true,
        });
        this.watcher
            .on("add", async (fp) => {
            log.info(`New plugin file detected: ${path_1.default.relative(absDir, fp)}`);
            await this.loadFile(fp);
        })
            .on("change", async (fp) => {
            log.info(`Plugin changed — hot-reloading: ${path_1.default.relative(absDir, fp)}`);
            await this.reloadFile(fp);
        })
            .on("unlink", async (fp) => {
            log.info(`Plugin file removed: ${path_1.default.relative(absDir, fp)}`);
            await this.unloadFile(fp);
        });
        log.info(`Watching for plugin hot-reload in "${absDir}".`);
    }
    async stopWatching() {
        await this.watcher?.close();
        this.watcher = undefined;
    }
    // ── Private ──────────────────────────────────────────────────────────────
    async loadFile(filePath) {
        try {
            const mod = this.requireFresh(filePath);
            const raw = mod.default ?? mod.plugin;
            const plugin = this.resolvePlugin(raw, filePath);
            if (!plugin)
                return;
            this.fileToName.set(filePath, plugin.manifest.name);
            await this.onLoadHandler?.(plugin, filePath);
        }
        catch (err) {
            log.error(`Failed to load plugin from "${path_1.default.basename(filePath)}": ` +
                `${err.message}`);
        }
    }
    async reloadFile(filePath) {
        await this.unloadFile(filePath);
        await this.loadFile(filePath);
    }
    async unloadFile(filePath) {
        const name = this.fileToName.get(filePath);
        if (name) {
            await this.onUnloadHandler?.(name);
            this.fileToName.delete(filePath);
        }
        this.invalidateCache(filePath);
    }
    resolvePlugin(raw, filePath) {
        const base = path_1.default.basename(filePath);
        if (typeof raw === "function") {
            try {
                const instance = new raw();
                if ((0, IPlugin_1.isValidPlugin)(instance))
                    return instance;
            }
            catch {
                // not a no-arg constructor — fall through
            }
        }
        if ((0, IPlugin_1.isValidPlugin)(raw))
            return raw;
        log.warn(`Skipping "${base}": no valid default/plugin export found. ` +
            `Export a class (default export) or an IPlugin instance.`);
        return null;
    }
    requireFresh(filePath) {
        this.invalidateCache(filePath);
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        return require(filePath);
    }
    invalidateCache(filePath) {
        try {
            const resolved = require.resolve(filePath);
            delete require.cache[resolved];
        }
        catch {
            /* not yet required */
        }
    }
    /**
     * Recursively collect only plugin entry-point files:
     *   index.ts / index.js         — directory-based plugins
     *   *.plugin.ts / *.plugin.js   — flat single-file plugins
     *
     * Files prefixed with "_" are always skipped (e.g. _template.plugin.ts).
     */
    collectFiles(dir) {
        const result = [];
        let entries;
        try {
            entries = fs_1.default.readdirSync(dir, { withFileTypes: true });
        }
        catch {
            log.warn(`Cannot read plugins directory: "${dir}".`);
            return result;
        }
        for (const entry of entries) {
            const full = path_1.default.join(dir, entry.name);
            if (entry.isDirectory()) {
                result.push(...this.collectFiles(full));
            }
            else if (entry.isFile() &&
                !entry.name.startsWith("_") &&
                isPluginFile(entry.name)) {
                result.push(full);
            }
        }
        return result;
    }
}
exports.PluginLoader = PluginLoader;
