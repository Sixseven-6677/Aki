"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BanStore = void 0;
exports.createBannedMiddleware = createBannedMiddleware;
const LoggerManager_1 = require("../../logger/LoggerManager");
const log = LoggerManager_1.LoggerManager.getLogger("Middleware/Banned");
// ─── BanStore ─────────────────────────────────────────────────────────────────
class BanStore {
    bans = new Map();
    repo = null;
    // ── MongoDB wiring ──────────────────────────────────────────────────────────
    setRepository(repo) {
        this.repo = repo;
        log.debug("BanStore: MongoDB repository attached.");
    }
    async loadFromDatabase() {
        if (!this.repo)
            return;
        try {
            const active = await this.repo.findActive();
            for (const entry of active) {
                this.bans.set(entry.userId, entry);
            }
            log.info(`BanStore: loaded from MongoDB — ${active.length} active ban(s).`);
        }
        catch (err) {
            log.warn("BanStore: failed to load from MongoDB — starting with empty store.", {
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }
    // ── Mutations ───────────────────────────────────────────────────────────────
    ban(userId, opts = {}) {
        const entry = {
            userId,
            reason: opts.reason,
            bannedAt: new Date(),
            expiresAt: opts.durationMs ? new Date(Date.now() + opts.durationMs) : null,
            bannedBy: opts.bannedBy,
        };
        this.bans.set(userId, entry);
        if (this.repo) {
            this.repo.upsert(entry).catch((err) => {
                log.warn("BanStore: MongoDB ban failed — ban is active in memory.", {
                    userId,
                    error: err instanceof Error ? err.message : String(err),
                });
            });
        }
        const expiry = entry.expiresAt
            ? `expires: ${entry.expiresAt.toISOString()}`
            : "permanent";
        log.info(`Banned user ${userId} — reason: "${opts.reason ?? "none"}" | ${expiry}` +
            (opts.bannedBy ? ` | by: ${opts.bannedBy}` : ""));
        return entry;
    }
    unban(userId) {
        const had = this.bans.has(userId);
        if (had) {
            this.bans.delete(userId);
            if (this.repo) {
                this.repo.remove(userId).catch((err) => {
                    log.warn("BanStore: MongoDB unban failed — user is unban in memory.", {
                        userId,
                        error: err instanceof Error ? err.message : String(err),
                    });
                });
            }
            log.info(`Unbanned user ${userId}.`);
        }
        return had;
    }
    // ── Queries ─────────────────────────────────────────────────────────────────
    isBanned(userId) {
        const entry = this.bans.get(userId);
        if (!entry)
            return false;
        if (entry.expiresAt && Date.now() >= entry.expiresAt.getTime()) {
            this.bans.delete(userId);
            if (this.repo) {
                this.repo.remove(userId).catch(() => { });
            }
            log.info(`Temporary ban expired — user ${userId} is now free.`);
            return false;
        }
        return true;
    }
    getEntry(userId) {
        if (!this.isBanned(userId))
            return null;
        return this.bans.get(userId) ?? null;
    }
    getAll() {
        const now = Date.now();
        const active = [];
        for (const [userId, entry] of this.bans) {
            if (entry.expiresAt && now >= entry.expiresAt.getTime()) {
                this.bans.delete(userId);
                if (this.repo)
                    this.repo.remove(userId).catch(() => { });
            }
            else {
                active.push(entry);
            }
        }
        return active;
    }
    summary() {
        const all = Array.from(this.bans.values());
        const now = Date.now();
        const active = all.filter((e) => !e.expiresAt || now < e.expiresAt.getTime());
        const expired = all.length - active.length;
        const permanent = active.filter((e) => !e.expiresAt).length;
        const temporary = active.filter((e) => !!e.expiresAt).length;
        return { total: all.length, active: active.length, permanent, temporary, expired };
    }
    purgeExpired() {
        const now = Date.now();
        let removed = 0;
        for (const [userId, entry] of this.bans) {
            if (entry.expiresAt && now >= entry.expiresAt.getTime()) {
                this.bans.delete(userId);
                removed++;
            }
        }
        if (removed > 0) {
            log.info(`Purged ${removed} expired ban(s).`);
            if (this.repo)
                this.repo.purgeExpired().catch(() => { });
        }
        return removed;
    }
    get size() {
        return this.bans.size;
    }
}
exports.BanStore = BanStore;
function createBannedMiddleware(opts) {
    return {
        name: "banned",
        description: "Blocks banned users from executing any command",
        handle: async (ctx, _command, next) => {
            const entry = opts.store.getEntry(ctx.user.id);
            if (!entry) {
                await next();
                return;
            }
            const reason = entry.reason ? ` السبب: ${entry.reason}.` : "";
            const expiry = entry.expiresAt
                ? ` انتهاء الحظر: ${entry.expiresAt.toLocaleString()}.`
                : " الحظر دائم.";
            log.warn(`Banned user ${ctx.user.id} tried to use bot — blocked.` +
                (entry.reason ? ` Reason: ${entry.reason}` : ""));
            if (!opts.silent) {
                const msg = opts.message?.(entry) ??
                    `🚫 أنت محظور من استخدام البوت.${reason}${expiry}`;
                await ctx.reply(msg);
            }
        },
    };
}
