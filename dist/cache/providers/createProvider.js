"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCacheProvider = createCacheProvider;
const MemoryProvider_1 = require("./MemoryProvider");
const RedisProvider_1 = require("./RedisProvider");
const LoggerManager_1 = require("../../logger/LoggerManager");
const log = LoggerManager_1.LoggerManager.getLogger("Cache");
/**
 * Factory that resolves the best available cache provider at startup.
 *
 * Resolution order:
 *   1. If REDIS_URL is set → try RedisProvider.connect()
 *      - Success : Redis is used.
 *      - Failure : logs a warning and falls back to MemoryProvider.
 *   2. If REDIS_URL is absent → MemoryProvider is used directly.
 *
 * This means the app never crashes due to Redis being unavailable;
 * it degrades gracefully while making the situation visible in logs.
 */
async function createCacheProvider() {
    const redisUrl = process.env["REDIS_URL"];
    if (!redisUrl) {
        log.info("Cache: REDIS_URL is not set — using in-memory cache. " +
            "Set REDIS_URL to enable Redis.");
        return new MemoryProvider_1.MemoryProvider();
    }
    log.info("Cache: REDIS_URL detected — attempting to connect to Redis...");
    try {
        const provider = await RedisProvider_1.RedisProvider.connect(redisUrl);
        log.info("Cache: Redis connected successfully. Using RedisProvider.");
        return provider;
    }
    catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        log.warn(`Cache: Redis unavailable — ${reason} ` +
            "Falling back to in-memory cache. Data will not persist across restarts.");
        return new MemoryProvider_1.MemoryProvider();
    }
}
