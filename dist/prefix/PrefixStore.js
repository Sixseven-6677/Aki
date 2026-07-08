"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prefixStore = exports.PrefixStore = void 0;
const env_1 = require("../config/env");
const LoggerManager_1 = require("../logger/LoggerManager");
const log = LoggerManager_1.LoggerManager.getLogger("PrefixStore");
class PrefixStore {
    _prefix;
    repo = null;
    constructor() {
        this._prefix = env_1.config.bot.prefix ?? "/";
    }
    get() {
        return this._prefix;
    }
    set(newPrefix) {
        this._prefix = newPrefix;
        if (this.repo) {
            this.repo.set("prefix", newPrefix).catch((err) => {
                log.warn("PrefixStore: MongoDB set failed — value updated in memory only.", {
                    error: err instanceof Error ? err.message : String(err),
                });
            });
        }
        else {
            log.debug("PrefixStore: no repo attached — prefix updated in memory only.", { prefix: newPrefix });
        }
    }
    /**
     * Wire MongoDB repository after DB connects.
     * Loads the stored prefix from DB — overrides env value if present.
     * Seeds DB with current value when no DB entry exists yet.
     */
    async loadFromDatabase(repo) {
        this.repo = repo;
        try {
            const stored = await repo.get("prefix");
            if (stored && stored.length > 0) {
                this._prefix = stored;
                log.info(`PrefixStore: prefix loaded from MongoDB: "${stored}"`);
            }
            else {
                await repo.set("prefix", this._prefix);
                log.info(`PrefixStore: prefix seeded to MongoDB: "${this._prefix}"`);
            }
        }
        catch (err) {
            log.warn("PrefixStore: MongoDB load failed — using env value.", {
                prefix: this._prefix,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }
}
exports.PrefixStore = PrefixStore;
exports.prefixStore = new PrefixStore();
