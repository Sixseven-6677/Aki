"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommandLoader = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const chokidar_1 = __importDefault(require("chokidar"));
const ICommand_1 = require("./types/ICommand");
const LoggerManager_1 = require("../logger/LoggerManager");
const log = LoggerManager_1.LoggerManager.getLogger("CommandLoader");
const isTsNode = Boolean(process.env["TS_NODE_DEV"] ??
    process[Symbol.for("ts-node.register.instance")]);
const FILE_EXT = isTsNode ? ".ts" : ".js";
class CommandLoader {
    registry;
    recursive;
    fileMap = new Map();
    watcher;
    constructor(registry, opts = {}) {
        this.registry = registry;
        this.recursive = opts.recursive ?? true;
    }
    async load(directory) {
        const absDir = path_1.default.resolve(directory);
        if (!fs_1.default.existsSync(absDir)) {
            throw new Error(`[CommandLoader] Directory not found: ${absDir}`);
        }
        const files = this.collectFiles(absDir);
        for (const file of files) {
            this.loadFile(file);
        }
        log.info(`Loaded ${this.fileMap.size} command(s) from ${absDir}` +
            (this.recursive ? " (recursive)" : ""));
    }
    watch(directory) {
        const absDir = path_1.default.resolve(directory);
        const pattern = this.recursive
            ? path_1.default.join(absDir, "**", `*${FILE_EXT}`)
            : path_1.default.join(absDir, `*${FILE_EXT}`);
        this.watcher = chokidar_1.default.watch(pattern, {
            ignoreInitial: true,
            persistent: true,
        });
        this.watcher
            .on("add", (filePath) => {
            log.info(`New command file: ${this.relName(filePath, absDir)}`);
            this.loadFile(filePath);
        })
            .on("change", (filePath) => {
            log.info(`Command changed — hot-reloading: ${this.relName(filePath, absDir)}`);
            this.reloadFile(filePath);
        })
            .on("unlink", (filePath) => {
            log.info(`Command removed: ${this.relName(filePath, absDir)}`);
            this.unloadFile(filePath);
        });
        log.info(`Watching for hot-reload in ${absDir}`);
    }
    async stopWatching() {
        await this.watcher?.close();
        this.watcher = undefined;
    }
    getLoadedFiles() {
        return Array.from(this.fileMap.keys());
    }
    // ─── Private ───────────────────────────────────────────────────────────────
    collectFiles(dir) {
        const result = [];
        let entries;
        try {
            entries = fs_1.default.readdirSync(dir, { withFileTypes: true });
        }
        catch {
            log.warn(`Cannot read directory: ${dir}`);
            return result;
        }
        for (const entry of entries) {
            const full = path_1.default.join(dir, entry.name);
            if (entry.isDirectory() && this.recursive) {
                result.push(...this.collectFiles(full));
            }
            else if (entry.isFile() &&
                entry.name.endsWith(FILE_EXT) &&
                !entry.name.startsWith("_")) {
                result.push(full);
            }
        }
        return result;
    }
    loadFile(filePath) {
        try {
            const mod = this.requireFresh(filePath);
            const command = mod.command;
            if (!(0, ICommand_1.isValidCommand)(command)) {
                log.warn(`Skipping ${path_1.default.basename(filePath)}: no valid "command" export found.`);
                return;
            }
            this.registry.register(command);
            this.fileMap.set(filePath, command.name);
        }
        catch (err) {
            log.error(`Failed to load ${path_1.default.basename(filePath)}: ${err.message}`);
        }
    }
    reloadFile(filePath) {
        this.unloadFile(filePath);
        this.loadFile(filePath);
    }
    unloadFile(filePath) {
        const name = this.fileMap.get(filePath);
        if (name) {
            this.registry.unregister(name);
            this.fileMap.delete(filePath);
        }
        this.invalidateCache(filePath);
    }
    requireFresh(filePath) {
        this.invalidateCache(filePath);
        return require(filePath);
    }
    invalidateCache(filePath) {
        try {
            const resolved = require.resolve(filePath);
            delete require.cache[resolved];
        }
        catch {
            // file may not have been required yet
        }
    }
    relName(filePath, baseDir) {
        return path_1.default.relative(baseDir, filePath);
    }
}
exports.CommandLoader = CommandLoader;
