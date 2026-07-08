"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheManager = void 0;
const MemoryProvider_1 = require("./providers/MemoryProvider");
const CacheStore_1 = require("./CacheStore");
const LoggerManager_1 = require("../logger/LoggerManager");
class CacheManager {
    name = "cache";
    provider;
    stores = new Map();
    log = LoggerManager_1.LoggerManager.getLogger("CacheManager");
    constructor(options = {}) {
        this.provider = options.provider ?? new MemoryProvider_1.MemoryProvider();
    }
    async initialize() {
        this.provider.start?.();
        this.log.info("Cache initialized.", { provider: this.provider.constructor.name });
    }
    async destroy() {
        this.provider.stop?.();
        this.stores.clear();
        this.log.info("Cache destroyed.");
    }
    /**
     * Swap the underlying provider at runtime (e.g. switch to Redis).
     *
     * Existing CacheStore instances (already returned by store()) are updated
     * in-place via setProvider(), so any external code holding a reference to
     * a CacheStore will automatically use the new provider without needing to
     * call store() again.  This makes the switch transparent to callers.
     */
    useProvider(provider) {
        this.provider.stop?.();
        this.provider = provider;
        this.provider.start?.();
        // Update all existing CacheStore instances in-place so external references
        // continue to work.  Previously this created new CacheStore objects which
        // broke any caller that had cached the old store reference.
        for (const store of this.stores.values()) {
            store.setProvider(this.provider);
        }
        this.log.info("Cache provider swapped.", { provider: provider.constructor.name });
    }
    /**
     * Returns a namespaced CacheStore. Creates it once and reuses it.
     */
    store(namespace) {
        if (!this.stores.has(namespace)) {
            this.stores.set(namespace, new CacheStore_1.CacheStore(this.provider, namespace));
        }
        return this.stores.get(namespace);
    }
    stats() {
        return this.provider.stats();
    }
    async clear() {
        await this.provider.clear();
        this.log.warn("All cache entries cleared.");
    }
}
exports.CacheManager = CacheManager;
