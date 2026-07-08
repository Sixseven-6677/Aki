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
exports.bootstrapAuth = bootstrapAuth;
const AuthManager_1 = require("../facebook/auth/AuthManager");
const EmailPasswordProvider_1 = require("../facebook/auth/EmailPasswordProvider");
const FileWatchAppStateProvider_1 = require("../facebook/auth/FileWatchAppStateProvider");
const AuthPipeline_1 = require("../facebook/auth/AuthPipeline");
const SessionManager_1 = require("../facebook/session/SessionManager");
const SessionStore_1 = require("../facebook/session/SessionStore");
const ReconnectManager_1 = require("../facebook/reconnect/ReconnectManager");
const env_1 = require("../config/env");
const LoggerManager_1 = require("../logger/LoggerManager");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const log = LoggerManager_1.LoggerManager.getLogger("Boot.Auth");
async function bootstrapAuth(bot) {
    const auth = new AuthManager_1.AuthManager();
    // ── Session infrastructure ─────────────────────────────────────────────────
    const sessionSecret = env_1.config.auth.sessionSecret;
    if (!sessionSecret) {
        log.warn("Auth: SESSION_SECRET / FB_SESSION_SECRET is not set. " +
            "Sessions will be encrypted with an empty key — set a secret in production.");
    }
    const sessionStore = new SessionStore_1.SessionStore(env_1.config.auth.sessionFile, sessionSecret || "");
    const sessionManager = new SessionManager_1.SessionManager({
        store: sessionStore,
        auth,
        ttlMs: env_1.config.auth.sessionTtlDays * 24 * 60 * 60 * 1000,
    });
    // ── Email/Password fallback provider ───────────────────────────────────────
    // Built once — reused by both the startup pipeline (AuthPipeline) and the
    // reconnect path (registered as a fallback on AuthManager so ReconnectManager
    // benefits automatically without any code changes to that layer).
    const emailPasswordProvider = EmailPasswordProvider_1.EmailPasswordProvider.fromEnv();
    if (emailPasswordProvider) {
        log.info("Auth: email/password fallback ENABLED " +
            "(FB_EMAIL + FB_PASSWORD are set). Stage 2 will activate on AppState failure.");
    }
    else {
        log.info("Auth: email/password fallback DISABLED. " +
            "Set FB_EMAIL and FB_PASSWORD to enable automatic recovery when AppState expires.");
    }
    // ── Write fca-config.json for @dongdev/fca-unofficial auto-login ──────────
    // @dongdev/fca-unofficial's tryAutoLoginIfNeeded() reads credentials from
    // fca-config.json in the process working directory (not from fcaLogin() args).
    // Without this file, the library logs "No credentials configured for auto-login"
    // and all reconnect attempts fail permanently — even when FB_EMAIL and
    // FB_PASSWORD are set in Railway env vars.
    if (emailPasswordProvider) {
        const fcaConfigPath = path.join(process.cwd(), "fca-config.json");
        try {
            // NOTE: fca-config.json will contain plaintext credentials.
            // This is intentional — the library REQUIRES them in this format.
            // Railway's container filesystem is ephemeral and not exposed externally.
            fs.writeFileSync(fcaConfigPath, JSON.stringify({
                // Top-level email/password (checked as config.email / config.password)
                email: process.env["FB_EMAIL"] ?? "",
                password: process.env["FB_PASSWORD"] ?? "",
                // credentials sub-object (checked as config.credentials?.email)
                credentials: {
                    email: process.env["FB_EMAIL"] ?? "",
                    password: process.env["FB_PASSWORD"] ?? "",
                },
                autoLogin: true,
                autoReconnect: false,
            }), "utf8");
            log.info(`Auth: wrote fca-config.json → ${fcaConfigPath} (email/password configured)`);
        }
        catch (writeErr) {
            const msg = writeErr instanceof Error ? writeErr.message : String(writeErr);
            log.warn(`Auth: failed to write fca-config.json: ${msg}. Auto-login may not work.`);
        }
    }
    // ── Register AppState providers ────────────────────────────────────────────
    const appStateVal = process.env[env_1.config.auth.appStateEnvKey] ?? process.env["FB_APPSTATE"];
    const appStateFile = env_1.config.auth.appStateFile;
    const appStateWatchFile = env_1.config.auth.appStateWatchFile;
    // Watched single-file provider takes priority — lets an operator drop
    // fresh cookies into one file (Nejin-style) and have the bot pick them up
    // automatically, without redeploying. See FileWatchAppStateProvider.
    let watchProvider = null;
    if (appStateWatchFile) {
        // One-time seed: on a fresh volume the watched file won't exist yet.
        // If we already have AppState from FB_APPSTATE / FB_APPSTATE_FILE, write
        // it once so the watch file starts populated instead of empty. Later
        // edits to the watch file (or FileWatchAppStateProvider's own encrypted
        // rewrites) always take precedence over this seed.
        if (!fs.existsSync(appStateWatchFile)) {
            const seedRaw = appStateFile
                ? (() => { try {
                    return fs.readFileSync(appStateFile, "utf8");
                }
                catch {
                    return null;
                } })()
                : (appStateVal ?? null);
            if (seedRaw) {
                try {
                    fs.mkdirSync(path.dirname(appStateWatchFile), { recursive: true });
                    fs.writeFileSync(appStateWatchFile, seedRaw, "utf8");
                    log.info(`Auth: seeded watched file "${appStateWatchFile}" from existing AppState source.`);
                }
                catch (seedErr) {
                    const msg = seedErr instanceof Error ? seedErr.message : String(seedErr);
                    log.warn(`Auth: failed to seed watched file "${appStateWatchFile}": ${msg}`);
                }
            }
        }
        watchProvider = new FileWatchAppStateProvider_1.FileWatchAppStateProvider({
            filePath: appStateWatchFile,
            encryptionKey: sessionSecret || "",
        });
        auth.registerAccount("primary", watchProvider);
        log.info(`Auth: primary account registered from watched file: ${appStateWatchFile}`);
    }
    else if (appStateFile) {
        auth.registerAccount("primary", AuthManager_1.AuthManager.fromFile("primary", appStateFile).provider);
        log.info("Auth: primary account registered from file.");
    }
    else if (appStateVal) {
        auth.registerAccount("primary", AuthManager_1.AuthManager.fromEnv("primary", env_1.config.auth.appStateEnvKey).provider);
        log.info("Auth: primary account registered from env.");
    }
    else {
        log.warn("Auth: FB_APPSTATE not set. " +
            (emailPasswordProvider
                ? "Will attempt email/password login directly."
                : "Bot starts in health-only mode — cannot send Facebook messages."));
    }
    // Register email/password as transparent fallback on the primary account.
    // AuthManager.login() will try it automatically if the AppState provider fails —
    // this transparently covers the ReconnectManager reconnect path.
    if (emailPasswordProvider) {
        auth.registerFallbackProvider("primary", emailPasswordProvider);
    }
    // ── Optional secondary account ─────────────────────────────────────────────
    const appStateVal2 = process.env[env_1.config.auth.appStateEnvKey2] ?? process.env["FB_APPSTATE_2"];
    const appStateFile2 = env_1.config.auth.appStateFile2;
    if (appStateFile2) {
        auth.registerAccount("secondary", AuthManager_1.AuthManager.fromFile("secondary", appStateFile2).provider);
        if (emailPasswordProvider)
            auth.registerFallbackProvider("secondary", emailPasswordProvider);
        log.info("Auth: secondary account registered from file.");
    }
    else if (appStateVal2) {
        auth.registerAccount("secondary", AuthManager_1.AuthManager.fromEnv("secondary", env_1.config.auth.appStateEnvKey2).provider);
        if (emailPasswordProvider)
            auth.registerFallbackProvider("secondary", emailPasswordProvider);
        log.info("Auth: secondary account registered from env.");
    }
    // ── Multi-stage auth pipeline (startup) ────────────────────────────────────
    const pipeline = new AuthPipeline_1.AuthPipeline({
        auth,
        session: sessionManager,
        emailPassword: emailPasswordProvider,
    });
    for (const accountId of auth.getRegisteredAccounts()) {
        const result = await pipeline.run(accountId);
        // Always emit the full report — essential for startup audits
        log.info(AuthPipeline_1.AuthPipeline.formatReport(result));
        if (!result.success) {
            const advice = AuthPipeline_1.AuthPipeline.remediationAdvice(result);
            log.error(`Auth: account "${accountId}" failed all authentication stages.\n` +
                `  Remediation: ${advice}`);
        }
        else if (result.freshAppStateGenerated) {
            log.info(`Auth: account "${accountId}" recovered via email/password. ` +
                `Fresh AppState saved to session — bot will use it for all future reconnects.`);
        }
    }
    bot.register(auth);
    bot.register(sessionManager);
    // ── Reconnect manager ──────────────────────────────────────────────────────
    const reconnect = new ReconnectManager_1.ReconnectManager(auth, sessionManager, {
        retry: { maxAttempts: 5, baseDelayMs: 2_000, maxDelayMs: 60_000 },
        // 5-minute interval: gives MiraiTransport's self-recovery loop time to
        // recover before ReconnectManager escalates to a full credential refresh.
        healthCheckIntervalMs: 300_000,
        spamWindowMs: 120_000,
        maxAttemptsPerWindow: 2,
    });
    bot.register(reconnect);
    // ── Wire up watched-file auto reload (Nejin-style operational override) ────
    // When an operator manually edits FB_APPSTATE_WATCH_FILE with fresh cookies,
    // re-authenticate immediately and reset the circuit breaker so the bot does
    // not stay stuck in CIRCUIT_OPEN waiting for a redeploy.
    if (watchProvider) {
        watchProvider.onChange(async () => {
            log.info('Auth: watched AppState file changed for "primary" — reloading credentials.');
            const result = await auth.login("primary");
            if (result.success) {
                await sessionManager.saveSession("primary");
                reconnect.resetCircuit("primary");
                log.info('Auth: account "primary" re-authenticated from watched file update. Circuit reset.');
            }
            else {
                log.warn(`Auth: reload from watched file failed for "primary": ${result.error ?? "unknown error"}`);
            }
        });
        watchProvider.startWatching();
    }
    return { auth, sessionManager, reconnect, pipeline };
}
