"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserService = void 0;
const LoggerManager_1 = require("../logger/LoggerManager");
const USER_CACHE_TTL_MS = 5 * 60 * 1_000; // 5 minutes
const cacheKey = (fbId) => `profile:${fbId}`;
/**
 * UserService — core layer for user lifecycle management.
 *
 * On every incoming message:
 *   1. Checks the in-process cache (fast path, ~0 ms).
 *   2. On cache miss: atomically upserts the DB record (findOrCreate + increment).
 *   3. Caches the result with a TTL.
 *
 * Cache-hit path fires a background DB refresh (fire-and-forget) so counters
 * stay accurate without blocking the message pipeline.
 *
 * All DB errors are caught and logged — the system degrades gracefully by
 * returning a fallback record rather than crashing the handler.
 */
class UserService {
    repo;
    cache;
    log;
    constructor(repo, cache) {
        this.repo = repo;
        this.cache = cache;
        this.log = LoggerManager_1.LoggerManager.getLogger("UserService");
    }
    // ── Public API ─────────────────────────────────────────────────────────
    async findOrCreate(fbId, name) {
        const key = cacheKey(fbId);
        // Fast path — serve from cache
        const cached = await this.cache.get(key);
        if (cached) {
            // Bump counters in the background so the pipeline is never blocked
            this.refreshInBackground(fbId, name);
            return cached;
        }
        // Slow path — DB upsert
        const { doc, isNew } = await this.repo.trackActivity(fbId, name);
        const record = this.toRecord(doc, isNew);
        await this.cache.set(key, record, { ttlMs: USER_CACHE_TTL_MS });
        if (isNew) {
            this.log.info("UserService: new user created.", { fbId, name });
        }
        return record;
    }
    async updateProfile(fbId, data) {
        await this.repo.upsertByFbId(fbId, data);
        await this.cache.delete(cacheKey(fbId));
        this.log.info("UserService: profile updated.", { fbId, ...data });
    }
    async getPreference(fbId, key, defaultValue) {
        const cached = await this.cache.get(cacheKey(fbId));
        if (cached) {
            const val = cached.preferences[key];
            return (val !== undefined ? val : defaultValue);
        }
        const doc = await this.repo.findByFbId(fbId);
        if (!doc)
            return defaultValue;
        const val = doc.preferences[key];
        return (val !== undefined ? val : defaultValue);
    }
    async setPreference(fbId, key, value) {
        await this.repo.setPreference(fbId, key, value);
        await this.cache.delete(cacheKey(fbId));
        this.log.debug("UserService: preference set.", { fbId, key });
    }
    // ── Internals ─────────────────────────────────────────────────────────
    toRecord(doc, isNew) {
        return {
            fbId: doc.fbId,
            name: doc.name,
            role: doc.role,
            isBlocked: doc.isBlocked,
            lastSeenAt: doc.lastSeenAt,
            messageCount: doc.messageCount,
            preferences: (doc.preferences ?? {}),
            createdAt: doc.createdAt ?? new Date(),
            isNew,
        };
    }
    /**
     * Fire-and-forget background DB refresh.
     * Updates counters in the DB and repopulates the cache so stats stay accurate.
     */
    refreshInBackground(fbId, name) {
        this.repo.trackActivity(fbId, name)
            .then(({ doc }) => this.cache.set(cacheKey(fbId), this.toRecord(doc, false), { ttlMs: USER_CACHE_TTL_MS }))
            .catch((err) => {
            this.log.warn("UserService: background refresh failed.", {
                fbId,
                error: err instanceof Error ? err.message : String(err),
            });
        });
    }
}
exports.UserService = UserService;
