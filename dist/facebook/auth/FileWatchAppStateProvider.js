"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileWatchAppStateProvider = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const CryptoHelper_1 = require("./CryptoHelper");
const LoggerManager_1 = require("../../logger/LoggerManager");
const log = LoggerManager_1.LoggerManager.getLogger("FileWatchAppStateProvider");
const REQUIRED_COOKIES = ["c_user", "xs"];
/** Marker prefix written to disk once the file's content has been encrypted. */
const ENCRYPTED_PREFIX = "ENC1:";
/** Debounce window for fs.watch — editors/operators often fire multiple events per save. */
const DEBOUNCE_MS = 500;
/**
 * FileWatchAppStateProvider — "single state file" AppState provider.
 *
 * Ports Nejin's file-as-state simplicity (one file holds the live session,
 * `fs.watch` detects manual edits, auto re-login on change) into Sixsu's
 * layered auth architecture:
 *
 *  - Implements IAuthProvider like AppStateProvider / EmailPasswordProvider,
 *    so it plugs into AuthManager / AuthPipeline / ReconnectManager with
 *    zero changes to those layers.
 *  - Unlike Nejin's original account.txt, the file is encrypted at rest
 *    (AES-256-GCM, same CryptoHelper used by SessionStore) whenever an
 *    encryption key is configured — closing the "public repo leaks live
 *    cookies" gap found in Xanga / Goatbot-updated.
 *  - Exposes onChange()/startWatching() so bootstrap code can trigger
 *    auth.login() + sessionManager.saveSession() + reconnect.resetCircuit()
 *    whenever an operator manually updates the file with fresh cookies.
 */
class FileWatchAppStateProvider {
    filePath;
    encryptionKey;
    watcher = null;
    debounceTimer = null;
    lastMtimeMs = 0;
    changeHandlers = [];
    constructor(options) {
        this.filePath = options.filePath;
        this.encryptionKey = options.encryptionKey ?? "";
    }
    // ── IAuthProvider ─────────────────────────────────────────────────────────
    async load() {
        if (!fs_1.default.existsSync(this.filePath)) {
            throw new Error(`AppState watch file not found: ${this.filePath}`);
        }
        const raw = fs_1.default.readFileSync(this.filePath, "utf8").trim();
        const json = await this.decodeContent(raw);
        let parsed;
        try {
            parsed = JSON.parse(json);
        }
        catch {
            throw new Error(`AppState watch file "${this.filePath}" does not contain valid JSON.`);
        }
        if (!Array.isArray(parsed)) {
            throw new Error("AppState must be a JSON array of cookie objects.");
        }
        const appState = parsed;
        if (!this.validate(appState)) {
            const found = appState.map((c) => c.key).join(", ") || "(none)";
            throw new Error(`AppState watch file is missing required cookies: ${REQUIRED_COOKIES.join(", ")}. ` +
                `Found keys: ${found}`);
        }
        // Transparent upgrade: if the file was plaintext (Nejin-style) and an
        // encryption key is configured, encrypt it in place right now.
        if (this.encryptionKey && !raw.startsWith(ENCRYPTED_PREFIX)) {
            await this.encryptInPlace(json);
        }
        this.lastMtimeMs = this.statMtime();
        log.info(`AppState loaded from watched file. cookies=${appState.length}`);
        return appState;
    }
    validate(appState) {
        const keys = new Set(appState.map((c) => c.key));
        return REQUIRED_COOKIES.every((k) => keys.has(k));
    }
    // ── Watch lifecycle ──────────────────────────────────────────────────────
    /** Registers a callback fired (debounced) after the watched file is edited on disk. */
    onChange(handler) {
        this.changeHandlers.push(handler);
    }
    /** Starts watching the file for external edits (operator pastes fresh cookies). */
    startWatching() {
        if (this.watcher)
            return;
        const dir = path_1.default.dirname(this.filePath);
        if (!fs_1.default.existsSync(dir))
            fs_1.default.mkdirSync(dir, { recursive: true });
        if (!fs_1.default.existsSync(this.filePath)) {
            log.warn(`FileWatchAppStateProvider: cannot watch "${this.filePath}" — file does not exist yet.`);
            return;
        }
        try {
            this.watcher = fs_1.default.watch(this.filePath, { persistent: true }, (eventType) => {
                if (eventType !== "change" && eventType !== "rename")
                    return;
                this.scheduleChangeCheck();
            });
            log.info(`FileWatchAppStateProvider: watching "${this.filePath}" for changes.`);
        }
        catch (err) {
            log.warn(`FileWatchAppStateProvider: failed to start fs.watch on "${this.filePath}".`, { error: err instanceof Error ? err.message : String(err) });
        }
    }
    stopWatching() {
        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
            log.info("FileWatchAppStateProvider: stopped watching.");
        }
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
    }
    // ── Private ──────────────────────────────────────────────────────────────
    scheduleChangeCheck() {
        if (this.debounceTimer)
            clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
            this.debounceTimer = null;
            const mtime = this.statMtime();
            // Ignore events caused by our own encryptInPlace() write, or duplicate
            // fs events for the same save.
            if (mtime === this.lastMtimeMs)
                return;
            this.lastMtimeMs = mtime;
            log.info(`FileWatchAppStateProvider: change detected in "${this.filePath}".`);
            for (const handler of this.changeHandlers) {
                Promise.resolve()
                    .then(() => handler())
                    .catch((err) => {
                    log.error("FileWatchAppStateProvider: onChange handler threw.", err instanceof Error ? err : new Error(String(err)));
                });
            }
        }, DEBOUNCE_MS);
    }
    statMtime() {
        try {
            return fs_1.default.statSync(this.filePath).mtimeMs;
        }
        catch {
            return 0;
        }
    }
    async decodeContent(raw) {
        if (!raw.startsWith(ENCRYPTED_PREFIX))
            return raw; // plaintext (legacy Nejin-style)
        if (!this.encryptionKey) {
            throw new Error(`AppState watch file "${this.filePath}" is encrypted but no encryption key is ` +
                `configured. Set SESSION_SECRET / FB_SESSION_SECRET.`);
        }
        const ciphertext = raw.slice(ENCRYPTED_PREFIX.length);
        try {
            return await CryptoHelper_1.CryptoHelper.decrypt(ciphertext, this.encryptionKey);
        }
        catch (err) {
            throw new Error(`Failed to decrypt AppState watch file "${this.filePath}": ` +
                (err instanceof Error ? err.message : String(err)));
        }
    }
    async encryptInPlace(plainJson) {
        try {
            const encrypted = await CryptoHelper_1.CryptoHelper.encrypt(plainJson, this.encryptionKey);
            fs_1.default.writeFileSync(this.filePath, ENCRYPTED_PREFIX + encrypted, "utf8");
            log.info(`FileWatchAppStateProvider: encrypted plaintext AppState file "${this.filePath}" in place.`);
        }
        catch (err) {
            log.warn(`FileWatchAppStateProvider: failed to encrypt "${this.filePath}" in place — ` +
                `leaving it as plaintext.`, { error: err instanceof Error ? err.message : String(err) });
        }
    }
}
exports.FileWatchAppStateProvider = FileWatchAppStateProvider;
