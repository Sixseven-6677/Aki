"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LockdownStore = void 0;
exports.createLockdownMiddleware = createLockdownMiddleware;
const LoggerManager_1 = require("../../logger/LoggerManager");
const log = LoggerManager_1.LoggerManager.getLogger("Middleware/Lockdown");
// ─── LockdownStore ────────────────────────────────────────────────────────────
class LockdownStore {
    threads = new Map();
    repo = null;
    constructor() {
        log.info("LockdownStore initialized — no locked threads yet.");
    }
    // ── MongoDB wiring ──────────────────────────────────────────────────────────
    setRepository(repo) {
        this.repo = repo;
        log.debug("LockdownStore: MongoDB repository attached.");
    }
    async loadFromDatabase() {
        if (!this.repo)
            return;
        try {
            const lockedIds = await this.repo.getLockedThreadIds();
            for (const id of lockedIds) {
                this.threads.set(id, true);
            }
            log.info(`LockdownStore: loaded from MongoDB — ${lockedIds.length} locked thread(s).`);
        }
        catch (err) {
            log.warn("LockdownStore: failed to load from MongoDB — starting empty.", {
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }
    // ── Mutations ───────────────────────────────────────────────────────────────
    enable(threadId) {
        this.threads.set(threadId, true);
        if (this.repo) {
            this.repo.setLockdown(threadId, true).catch((err) => {
                log.warn("LockdownStore: MongoDB enable failed — state active in memory.", {
                    threadId,
                    error: err instanceof Error ? err.message : String(err),
                });
            });
        }
        else {
            log.debug("LockdownStore: no repo attached — lockdown active in memory only.", { threadId });
        }
        log.info("Lockdown enabled.", { threadId });
    }
    disable(threadId) {
        this.threads.set(threadId, false);
        if (this.repo) {
            this.repo.setLockdown(threadId, false).catch((err) => {
                log.warn("LockdownStore: MongoDB disable failed — state updated in memory.", {
                    threadId,
                    error: err instanceof Error ? err.message : String(err),
                });
            });
        }
        else {
            log.debug("LockdownStore: no repo attached — lockdown disabled in memory only.", { threadId });
        }
        log.info("Lockdown disabled.", { threadId });
    }
    // ── Queries ─────────────────────────────────────────────────────────────────
    isLocked(threadId) {
        return this.threads.get(threadId) === true;
    }
    getLockedThreads() {
        const result = [];
        for (const [id, locked] of this.threads) {
            if (locked)
                result.push(id);
        }
        return result;
    }
    get lockedCount() {
        return this.getLockedThreads().length;
    }
}
exports.LockdownStore = LockdownStore;
function createLockdownMiddleware(opts) {
    return {
        name: "lockdown",
        description: "Silently blocks non-admin commands when lockdown is active for a thread",
        handle: async (ctx, _command, next) => {
            if (!opts.store.isLocked(ctx.thread.id)) {
                await next();
                return;
            }
            // Admins bypass lockdown (ctx.hasRole("admin") now reflects AdminStore too)
            if (ctx.hasRole("admin")) {
                await next();
                return;
            }
            log.debug("Lockdown: blocked non-admin command.", {
                threadId: ctx.thread.id,
                userId: ctx.user.id,
                cmd: (ctx.message.text ?? "").slice(0, 60),
            });
        },
    };
}
