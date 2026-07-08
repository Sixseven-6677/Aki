"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheStore = void 0;
class CacheStore {
    provider;
    ns;
    constructor(provider, namespace) {
        this.provider = provider;
        this.ns = namespace + ":";
    }
    get namespace() {
        return this.ns.slice(0, -1);
    }
    /**
     * Swap the underlying provider.
     * Called by CacheManager.useProvider() to propagate a provider change to
     * all existing CacheStore instances without breaking external references.
     */
    setProvider(provider) {
        this.provider = provider;
    }
    async get(key) {
        return this.provider.get(this.ns + key);
    }
    async set(key, value, options) {
        return this.provider.set(this.ns + key, value, options);
    }
    async delete(key) {
        return this.provider.delete(this.ns + key);
    }
    async exists(key) {
        return this.provider.exists(this.ns + key);
    }
    async clear() {
        return this.provider.clear(this.ns);
    }
    async size() {
        return this.provider.size(this.ns);
    }
    /**
     * Cache-aside pattern:
     * Returns cached value if present, otherwise calls `fn`, caches the result, and returns it.
     */
    async getOrSet(key, fn, options) {
        const cached = await this.get(key);
        if (cached !== null)
            return cached;
        const value = await fn();
        await this.set(key, value, options);
        return value;
    }
    /**
     * Wraps an async function so its result is cached automatically.
     */
    wrap(key, fn, options) {
        return async (...args) => {
            const resolvedKey = typeof key === "function" ? key(...args) : key;
            return this.getOrSet(resolvedKey, () => fn(...args), options);
        };
    }
}
exports.CacheStore = CacheStore;
