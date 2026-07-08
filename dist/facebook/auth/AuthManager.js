"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthManager = void 0;
const AppStateProvider_1 = require("./AppStateProvider");
const IAuth_1 = require("./types/IAuth");
const LoggerManager_1 = require("../../logger/LoggerManager");
const log = LoggerManager_1.LoggerManager.getLogger("AuthManager");
class AuthManager {
    name = "auth";
    accounts = new Map();
    providers = new Map();
    /**
     * Fallback providers tried in order after the main provider fails.
     * Designed for EmailPasswordProvider — registered via registerFallbackProvider().
     * Transparent to ReconnectManager: auth.login() uses them automatically.
     */
    fallbackProviders = new Map();
    async initialize() {
        log.info(`AuthManager initialized. providers=${this.providers.size}`);
    }
    async destroy() {
        this.accounts.clear();
        this.providers.clear();
        this.fallbackProviders.clear();
        log.info("AuthManager destroyed. All credentials cleared.");
    }
    // ── Provider registration ─────────────────────────────────────────────────
    registerAccount(accountId, provider) {
        if (this.providers.has(accountId)) {
            log.warn(`Account "${accountId}" already registered. Overwriting provider.`);
        }
        this.providers.set(accountId, provider);
        log.info(`Provider registered for account: ${accountId}`);
        return this;
    }
    /**
     * Register a fallback provider that is tried (in registration order) when the
     * main provider fails. The canonical use case is registering an
     * EmailPasswordProvider so that auth.login() automatically falls back to a full
     * email/password login during reconnects — without any changes to ReconnectManager.
     */
    registerFallbackProvider(accountId, provider) {
        const existing = this.fallbackProviders.get(accountId) ?? [];
        existing.push(provider);
        this.fallbackProviders.set(accountId, existing);
        log.info(`Fallback provider registered for account: ${accountId} ` +
            `(total fallbacks: ${existing.length})`);
        return this;
    }
    // ── Authentication ────────────────────────────────────────────────────────
    /**
     * Authenticates an account using its registered provider.
     * If the main provider fails, each fallback provider is tried in order.
     *
     * For the startup multi-stage pipeline with full per-stage reporting,
     * use AuthPipeline.run() instead — it wraps this method and adds diagnostics.
     */
    async login(accountId) {
        const mainProvider = this.providers.get(accountId);
        if (!mainProvider) {
            return {
                success: false,
                status: IAuth_1.AuthStatus.UNAUTHENTICATED,
                error: `No provider registered for account "${accountId}".`,
            };
        }
        log.info(`Logging in account: ${accountId}`);
        // ── Try main provider ─────────────────────────────────────────────────
        let appState;
        let lastError;
        try {
            appState = await mainProvider.load();
            lastError = undefined;
        }
        catch (err) {
            lastError = err instanceof Error ? err.message : String(err);
            const hasFallbacks = (this.fallbackProviders.get(accountId)?.length ?? 0) > 0;
            log.warn(`Main provider failed for "${accountId}": ${lastError}.` +
                (hasFallbacks ? " Trying fallback provider(s)…" : ""));
        }
        // ── Try fallback providers in order ───────────────────────────────────
        if (!appState) {
            const fallbacks = this.fallbackProviders.get(accountId) ?? [];
            for (let i = 0; i < fallbacks.length; i++) {
                log.info(`Fallback provider ${i + 1}/${fallbacks.length} for "${accountId}"…`);
                try {
                    appState = await fallbacks[i].load();
                    lastError = undefined;
                    log.info(`Fallback provider ${i + 1} succeeded for "${accountId}". ` +
                        `cookies=${appState.length}`);
                    break;
                }
                catch (err) {
                    lastError = err instanceof Error ? err.message : String(err);
                    log.warn(`Fallback provider ${i + 1} failed for "${accountId}": ${lastError}`);
                }
            }
        }
        // ── Result ────────────────────────────────────────────────────────────
        if (!appState) {
            log.error(`Login failed for "${accountId}": ${lastError}`);
            return { success: false, status: IAuth_1.AuthStatus.CORRUPTED, error: lastError };
        }
        this.accounts.set(accountId, { accountId, appState, loadedAt: new Date() });
        log.info(`Account "${accountId}" authenticated. cookies=${appState.length}`);
        return { success: true, accountId, status: IAuth_1.AuthStatus.AUTHENTICATED };
    }
    async loginAll() {
        const results = new Map();
        for (const id of this.providers.keys()) {
            results.set(id, await this.login(id));
        }
        return results;
    }
    /**
     * Authenticate using ONLY fallback providers (e.g. EmailPasswordProvider),
     * bypassing the main provider entirely.
     *
     * In reconnect contexts, AppStateProvider.load() reads expired env cookies
     * and returns them without liveness validation — never throwing. This causes
     * auth.login() to always "succeed" with expired cookies, so EmailPasswordProvider
     * (registered as fallback) is never reached through the normal path.
     *
     * Call this in ReconnectManager.attemptLogin() to force the fallback chain.
     */
    async loginFallbackOnly(accountId) {
        const fallbacks = this.fallbackProviders.get(accountId) ?? [];
        if (fallbacks.length === 0) {
            return {
                success: false,
                status: IAuth_1.AuthStatus.UNAUTHENTICATED,
                error: `No fallback providers registered for account "${accountId}".`,
            };
        }
        log.info(`loginFallbackOnly: trying ${fallbacks.length} fallback(s) for "${accountId}"…`);
        let appState;
        let lastError;
        for (let i = 0; i < fallbacks.length; i++) {
            log.info(`Fallback provider ${i + 1}/${fallbacks.length} for "${accountId}"…`);
            try {
                appState = await fallbacks[i].load();
                lastError = undefined;
                log.info(`Fallback provider ${i + 1} succeeded for "${accountId}". ` +
                    `cookies=${appState.length}`);
                break;
            }
            catch (err) {
                lastError = err instanceof Error ? err.message : String(err);
                log.warn(`Fallback provider ${i + 1} failed for "${accountId}": ${lastError}`);
            }
        }
        if (!appState) {
            log.error(`loginFallbackOnly: all fallbacks failed for "${accountId}": ${lastError}`);
            return { success: false, status: IAuth_1.AuthStatus.CORRUPTED, error: lastError };
        }
        this.accounts.set(accountId, { accountId, appState, loadedAt: new Date() });
        log.info(`Account "${accountId}" authenticated via fallback. cookies=${appState.length}`);
        return { success: true, accountId, status: IAuth_1.AuthStatus.AUTHENTICATED };
    }
    injectCredentials(credentials) {
        this.accounts.set(credentials.accountId, credentials);
        log.info(`Credentials injected for account: ${credentials.accountId}`);
    }
    /**
     * Update the stored AppState for an account in-memory.
     * Used by the transport layer to persist fresh cookies obtained from
     * fca-unofficial after a successful MQTT connection so that the next
     * session save writes the latest cookies, not the original ones.
     */
    updateAppState(accountId, appState) {
        const existing = this.accounts.get(accountId);
        if (!existing) {
            log.warn(`updateAppState: account "${accountId}" not found.`);
            return;
        }
        this.accounts.set(accountId, { ...existing, appState, loadedAt: new Date() });
        log.info(`AppState updated for account: ${accountId} cookies=${appState.length}`);
    }
    logout(accountId) {
        this.accounts.delete(accountId);
        log.info(`Account "${accountId}" logged out.`);
    }
    getCredentials(accountId) {
        return this.accounts.get(accountId) ?? null;
    }
    isAuthenticated(accountId) {
        return this.accounts.has(accountId);
    }
    hasProvider(accountId) {
        return this.providers.has(accountId);
    }
    hasFallbacks(accountId) {
        return (this.fallbackProviders.get(accountId)?.length ?? 0) > 0;
    }
    getAuthenticatedAccounts() {
        return Array.from(this.accounts.keys());
    }
    getRegisteredAccounts() {
        return Array.from(this.providers.keys());
    }
    static fromEnv(accountId, envKey) {
        const value = process.env[envKey];
        if (!value) {
            throw new Error(`Environment variable "${envKey}" is not set.`);
        }
        return { accountId, provider: new AppStateProvider_1.AppStateProvider({ fromEnv: value }) };
    }
    static fromFile(accountId, filePath) {
        return { accountId, provider: new AppStateProvider_1.AppStateProvider({ fromFile: filePath }) };
    }
}
exports.AuthManager = AuthManager;
