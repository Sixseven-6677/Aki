"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryProvider = void 0;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
class MemoryProvider {
    store = new Map();
    timer = null;
    counters = {
        hits: 0,
        misses: 0,
        sets: 0,
        deletes: 0,
        evictions: 0,
        size: 0,
    };
    start() {
        if (this.timer)
            return;
        this.timer = setInterval(() => this.evictExpired(), CLEANUP_INTERVAL_MS);
        if (this.timer.unref)
            this.timer.unref();
    }
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.store.clear();
    }
    async get(key) {
        const entry = this.store.get(key);
        if (!entry) {
            this.counters.misses++;
            return null;
        }
        if (this.isExpired(entry)) {
            this.store.delete(key);
            this.counters.misses++;
            this.counters.evictions++;
            return null;
        }
        entry.hits++;
        this.counters.hits++;
        return entry.value;
    }
    async set(key, value, options = {}) {
        const entry = {
            value,
            createdAt: Date.now(),
            hits: 0,
            expiresAt: options.ttlMs ? Date.now() + options.ttlMs : undefined,
        };
        this.store.set(key, entry);
        this.counters.sets++;
        this.counters.size = this.store.size;
    }
    async delete(key) {
        const deleted = this.store.delete(key);
        if (deleted) {
            this.counters.deletes++;
            this.counters.size = this.store.size;
        }
        return deleted;
    }
    async exists(key) {
        const entry = this.store.get(key);
        if (!entry)
            return false;
        if (this.isExpired(entry)) {
            this.store.delete(key);
            return false;
        }
        return true;
    }
    async clear(prefix) {
        if (!prefix) {
            this.store.clear();
        }
        else {
            for (const key of this.store.keys()) {
                if (key.startsWith(prefix))
                    this.store.delete(key);
            }
        }
        this.counters.size = this.store.size;
    }
    async size(prefix) {
        if (!prefix)
            return this.store.size;
        let count = 0;
        for (const key of this.store.keys()) {
            if (key.startsWith(prefix))
                count++;
        }
        return count;
    }
    stats() {
        return { ...this.counters, size: this.store.size };
    }
    isExpired(entry) {
        return entry.expiresAt !== undefined && Date.now() > entry.expiresAt;
    }
    evictExpired() {
        const now = Date.now();
        for (const [key, entry] of this.store.entries()) {
            if (entry.expiresAt !== undefined && now > entry.expiresAt) {
                this.store.delete(key);
                this.counters.evictions++;
            }
        }
        this.counters.size = this.store.size;
    }
}
exports.MemoryProvider = MemoryProvider;
