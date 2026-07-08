"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionManager = void 0;
const ISession_1 = require("./types/ISession");
const LoggerManager_1 = require("../../logger/LoggerManager");
const log = LoggerManager_1.LoggerManager.getLogger("SessionManager");
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_FAIL_COUNT = 5;
class SessionManager {
    name = "session";
    store;
    auth;
    ttlMs;
    constructor(options) {
        this.store = options.store;
        this.auth = options.auth;
        this.ttlMs = options.ttlMs ?? SESSION_TTL_MS;
    }
    async initialize() {
        log.info("SessionManager initialized. Restoring sessions...");
        await this.restoreAll();
    }
    async destroy() {
        log.info("SessionManager destroyed.");
    }
    // ── Session persistence ───────────────────────────────────────────────────
    async saveSession(accountId) {
        const credentials = this.auth.getCredentials(accountId);
        if (!credentials) {
            throw new Error(`Cannot save session: account "${accountId}" is not authenticated.`);
        }
        const entry = {
            accountId,
            appStateData: JSON.stringify(credentials.appState),
            createdAt: credentials.loadedAt.toISOString(),
            expiresAt: new Date(Date.now() + this.ttlMs).toISOString(),
            lastValidatedAt: new Date().toISOString(),
            status: ISession_1.SessionStatus.ACTIVE,
            failCount: 0,
        };
        await this.store.save(entry);
        log.info(`Session saved for account: ${accountId} cookies=${credentials.appState.length}`);
    }
    /**
     * Persist sessions for all currently authenticated accounts.
     * Safe to call concurrently — SessionStore serialises writes internally.
     */
    async saveAll() {
        const accounts = this.auth.getAuthenticatedAccounts();
        let saved = 0;
        for (const id of accounts) {
            try {
                await this.saveSession(id);
                saved++;
            }
            catch (err) {
                log.warn(`saveAll: failed to save session for "${id}".`, err);
            }
        }
        log.info(`saveAll: ${saved}/${accounts.length} sessions saved.`);
    }
    // ── Session restore ───────────────────────────────────────────────────────
    async restoreSession(accountId) {
        log.info(`Restoring session for account: ${accountId}`);
        const entry = await this.store.load(accountId);
        if (!entry) {
            log.warn(`No saved session found for account: ${accountId}`);
            return false;
        }
        const validation = this.validateEntry(entry);
        if (!validation.valid) {
            log.warn(`Session for "${accountId}" invalid: ${validation.reason ?? "unknown"}`);
            await this.handleInvalidSession(accountId, entry, validation.status);
            return false;
        }
        let appState;
        try {
            appState = JSON.parse(entry.appStateData);
        }
        catch {
            log.error(`Session data for "${accountId}" is corrupted (invalid JSON).`);
            await this.markCorrupted(accountId, entry);
            return false;
        }
        this.auth.injectCredentials({
            accountId,
            appState,
            loadedAt: new Date(entry.createdAt),
        });
        await this.store.save({
            ...entry,
            lastValidatedAt: new Date().toISOString(),
            status: ISession_1.SessionStatus.ACTIVE,
        });
        log.info(`Session restored for account: ${accountId} cookies=${appState.length}`);
        return true;
    }
    /**
     * Restore sessions only for accounts NOT already authenticated via env/file.
     * Env/file credentials are always fresher and take priority over persisted sessions.
     */
    async restoreAll() {
        const allStored = this.store.listAccounts();
        if (allStored.length === 0) {
            log.info("No saved sessions found.");
            return;
        }
        const toRestore = allStored.filter((id) => !this.auth.isAuthenticated(id));
        if (toRestore.length === 0) {
            log.info(`restoreAll: all ${allStored.length} stored account(s) already authenticated ` +
                `via env/file — session restore skipped.`);
            return;
        }
        let restored = 0;
        for (const id of toRestore) {
            if (await this.restoreSession(id))
                restored++;
        }
        log.info(`Sessions restored: ${restored}/${toRestore.length}`);
    }
    // ── Reconnect ─────────────────────────────────────────────────────────────
    /**
     * Attempt a re-login via the registered AuthManager provider, then persist the
     * refreshed session. For production reconnect flows with retry/backoff, prefer
     * ReconnectManager.reconnect() which calls this internally.
     */
    async reconnect(accountId) {
        log.info(`Reconnecting account: ${accountId}`);
        const entry = await this.store.load(accountId);
        if (entry && entry.failCount >= MAX_FAIL_COUNT) {
            log.error(`Account "${accountId}" exceeded max reconnect attempts (${MAX_FAIL_COUNT}). ` +
                `Manual credential rotation required.`);
            return false;
        }
        const result = await this.auth.login(accountId);
        if (!result.success) {
            await this.incrementFailCount(accountId);
            log.warn(`Reconnect failed for "${accountId}": ${result.error ?? "unknown error"}`);
            return false;
        }
        await this.saveSession(accountId);
        log.info(`Reconnect successful for account: ${accountId}`);
        return true;
    }
    // ── Validation ────────────────────────────────────────────────────────────
    validate(accountId) {
        if (!this.auth.isAuthenticated(accountId)) {
            return {
                valid: false,
                reason: "Account is not authenticated.",
                status: ISession_1.SessionStatus.DISCONNECTED,
            };
        }
        return { valid: true, status: ISession_1.SessionStatus.ACTIVE };
    }
    invalidate(accountId) {
        this.auth.logout(accountId);
        this.store.delete(accountId);
        log.info(`Session invalidated for account: ${accountId}`);
    }
    getStatus(accountId) {
        return this.auth.isAuthenticated(accountId)
            ? ISession_1.SessionStatus.ACTIVE
            : ISession_1.SessionStatus.DISCONNECTED;
    }
    // ── Private helpers ───────────────────────────────────────────────────────
    validateEntry(entry) {
        if (entry.status === ISession_1.SessionStatus.CORRUPTED) {
            return {
                valid: false,
                reason: "Session is marked as corrupted.",
                status: ISession_1.SessionStatus.CORRUPTED,
            };
        }
        if (entry.failCount >= MAX_FAIL_COUNT) {
            return {
                valid: false,
                reason: `Too many failures (${entry.failCount}/${MAX_FAIL_COUNT}).`,
                status: ISession_1.SessionStatus.DISCONNECTED,
            };
        }
        if (entry.expiresAt && Date.now() > new Date(entry.expiresAt).getTime()) {
            return {
                valid: false,
                reason: `Session expired at ${entry.expiresAt}.`,
                status: ISession_1.SessionStatus.EXPIRED,
            };
        }
        return { valid: true, status: ISession_1.SessionStatus.ACTIVE };
    }
    async handleInvalidSession(accountId, entry, status) {
        if (status === ISession_1.SessionStatus.EXPIRED) {
            log.warn(`Session for "${accountId}" expired. ` +
                `ReconnectManager will handle re-authentication with retry/backoff.`);
        }
        else {
            await this.markCorrupted(accountId, entry);
        }
    }
    async markCorrupted(accountId, entry) {
        await this.store.save({ ...entry, status: ISession_1.SessionStatus.CORRUPTED });
        log.error(`Session for "${accountId}" marked as CORRUPTED.`);
    }
    async incrementFailCount(accountId) {
        const entry = await this.store.load(accountId);
        if (!entry)
            return;
        await this.store.save({
            ...entry,
            failCount: entry.failCount + 1,
            status: ISession_1.SessionStatus.DISCONNECTED,
        });
    }
}
exports.SessionManager = SessionManager;
