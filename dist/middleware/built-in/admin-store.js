"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminStore = void 0;
const LoggerManager_1 = require("../../logger/LoggerManager");
const log = LoggerManager_1.LoggerManager.getLogger("AdminStore");
// ─── AdminStore ───────────────────────────────────────────────────────────────
class AdminStore {
    admins;
    seedIds;
    repo = null;
    constructor(seedIds = []) {
        this.seedIds = seedIds;
        this.admins = new Set(seedIds);
        log.info(`AdminStore initialised — ${this.admins.size} admin(s) (seed).`);
    }
    // ── MongoDB wiring (called after DB connects) ───────────────────────────────
    setRepository(repo) {
        this.repo = repo;
        log.debug("AdminStore: MongoDB repository attached.");
    }
    /**
     * Load admins from MongoDB and merge with current in-memory set.
     * Called once after the DB connection is established.
     */
    async loadFromDatabase() {
        if (!this.repo)
            return;
        try {
            const dbIds = await this.repo.findAll();
            // Persist seed IDs to MongoDB so they survive on subsequent restarts
            for (const id of this.seedIds) {
                if (!dbIds.includes(id)) {
                    try {
                        await this.repo.add(id, "system:seed");
                    }
                    catch {
                        // May already exist — tolerate duplicate upsert errors
                    }
                }
            }
            // Merge DB admins into in-memory set
            for (const id of dbIds) {
                this.admins.add(id);
            }
            log.info(`AdminStore: loaded from MongoDB — ${this.admins.size} admin(s) total.`);
        }
        catch (err) {
            log.warn("AdminStore: failed to load from MongoDB — using seed data.", {
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }
    // ── Mutations ───────────────────────────────────────────────────────────────
    add(id, addedBy = "system") {
        this.admins.add(id);
        if (this.repo) {
            this.repo.add(id, addedBy).catch((err) => {
                log.warn("AdminStore: MongoDB add failed — admin is still active in memory.", {
                    id,
                    error: err instanceof Error ? err.message : String(err),
                });
            });
        }
        else {
            log.debug("AdminStore: no repo attached — admin added in memory only.", { id });
        }
        log.info(`Admin added: ${id}`);
    }
    remove(id) {
        const existed = this.admins.delete(id);
        if (existed) {
            if (this.repo) {
                this.repo.remove(id).catch((err) => {
                    log.warn("AdminStore: MongoDB remove failed — admin is removed in memory.", {
                        id,
                        error: err instanceof Error ? err.message : String(err),
                    });
                });
            }
            else {
                log.debug("AdminStore: no repo attached — admin removed in memory only.", { id });
            }
            log.info(`Admin removed: ${id}`);
        }
        return existed;
    }
    // ── Queries ─────────────────────────────────────────────────────────────────
    has(id) {
        return this.admins.has(id);
    }
    getAll() {
        return Array.from(this.admins);
    }
    size() {
        return this.admins.size;
    }
}
exports.AdminStore = AdminStore;
