"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisProvider = void 0;
/**
 * Redis provider — requires `ioredis` to be installed.
 *
 * Do NOT instantiate directly. Use `RedisProvider.connect(url)` which throws
 * a descriptive error if ioredis is missing, allowing the caller to fall back
 * safely to MemoryProvider.
 *
 * To activate Redis:
 *   1. pnpm add ioredis
 *   2. Set REDIS_URL in your .env
 *   3. The createCacheProvider() factory picks it up automatically — no other changes needed.
 */
class RedisProvider {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    client;
    counters = {
        hits: 0, misses: 0, sets: 0, deletes: 0, evictions: 0, size: 0,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(client) {
        this.client = client;
    }
    /**
     * Attempts to create a connected RedisProvider.
     * Throws if `ioredis` is not installed or the connection times out.
     * The caller (createCacheProvider) catches this and falls back to MemoryProvider.
     */
    static async connect(url) {
        // Dynamic import — throws MODULE_NOT_FOUND if ioredis isn't installed
        let RedisClient;
        try {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore — ioredis is an optional peer dependency
            const mod = await Promise.resolve().then(() => __importStar(require("ioredis")));
            RedisClient = (mod.default ?? mod);
        }
        catch {
            throw new Error("ioredis is not installed. Run `pnpm add ioredis` to enable Redis support.");
        }
        const client = new RedisClient(url);
        await Promise.race([
            client.ping(),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Redis connection timed out after 5s.")), 5_000)),
        ]);
        return new RedisProvider(client);
    }
    async get(key) {
        const raw = await this.client.get(key);
        if (raw === null) {
            this.counters.misses++;
            return null;
        }
        this.counters.hits++;
        return JSON.parse(raw);
    }
    async set(key, value, options) {
        const serialized = JSON.stringify(value);
        if (options?.ttlMs) {
            await this.client.set(key, serialized, "PX", options.ttlMs);
        }
        else {
            await this.client.set(key, serialized);
        }
        this.counters.sets++;
    }
    async delete(key) {
        const count = await this.client.del(key);
        if (count > 0)
            this.counters.deletes++;
        return count > 0;
    }
    async exists(key) {
        const count = await this.client.exists(key);
        return count > 0;
    }
    async clear(prefix) {
        if (!prefix) {
            await this.client.flushdb();
        }
        else {
            const keys = await this.client.keys(`${prefix}*`);
            if (keys.length > 0) {
                await this.client.del(...keys);
            }
        }
    }
    async size(prefix) {
        if (!prefix)
            return this.client.dbsize();
        const keys = await this.client.keys(`${prefix}*`);
        return keys.length;
    }
    stats() {
        return { ...this.counters };
    }
    async stop() {
        await this.client.quit();
    }
}
exports.RedisProvider = RedisProvider;
