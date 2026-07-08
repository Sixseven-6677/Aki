"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionStore = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const CryptoHelper_1 = require("../auth/CryptoHelper");
const LoggerManager_1 = require("../../logger/LoggerManager");
const log = LoggerManager_1.LoggerManager.getLogger("SessionStore");
const STORE_VERSION = 1;
class SessionStore {
    filePath;
    encryptionKey;
    /**
     * Serialises all writes through a promise chain so concurrent save() / delete()
     * calls never interleave their read-modify-write cycles.
     */
    writeQueue = Promise.resolve();
    constructor(filePath, encryptionKey) {
        this.filePath = filePath;
        this.encryptionKey = encryptionKey;
        this.ensureDir();
    }
    async save(entry) {
        this.writeQueue = this.writeQueue.then(() => this.doSave(entry));
        return this.writeQueue;
    }
    async load(accountId) {
        const file = this.readRaw();
        const entry = file.sessions[accountId];
        if (!entry)
            return null;
        let decrypted;
        try {
            decrypted = await CryptoHelper_1.CryptoHelper.decrypt(entry.appStateData, this.encryptionKey);
        }
        catch (err) {
            log.error(`Failed to decrypt session for "${accountId}".`, err);
            return null;
        }
        return { ...entry, appStateData: decrypted };
    }
    /** Queues a delete; fully serialised through the write queue. */
    delete(accountId) {
        this.writeQueue = this.writeQueue.then(() => this.doDelete(accountId));
    }
    listAccounts() {
        return Object.keys(this.readRaw().sessions);
    }
    // ── Private ──────────────────────────────────────────────────────────────
    async doSave(entry) {
        const file = this.readRaw();
        const encryptedState = await CryptoHelper_1.CryptoHelper.encrypt(entry.appStateData, this.encryptionKey);
        file.sessions[entry.accountId] = { ...entry, appStateData: encryptedState };
        file.updatedAt = new Date().toISOString();
        this.writeRaw(file);
        log.info(`Session saved for account: ${entry.accountId}`);
    }
    doDelete(accountId) {
        const file = this.readRaw();
        if (!file.sessions[accountId])
            return;
        delete file.sessions[accountId];
        file.updatedAt = new Date().toISOString();
        this.writeRaw(file);
        log.info(`Session deleted for account: ${accountId}`);
    }
    ensureDir() {
        const dir = path_1.default.dirname(this.filePath);
        if (!fs_1.default.existsSync(dir))
            fs_1.default.mkdirSync(dir, { recursive: true });
    }
    readRaw() {
        if (!fs_1.default.existsSync(this.filePath)) {
            return { version: STORE_VERSION, updatedAt: new Date().toISOString(), sessions: {} };
        }
        try {
            return JSON.parse(fs_1.default.readFileSync(this.filePath, "utf8"));
        }
        catch (err) {
            log.error("Session store file corrupted — starting fresh.", err);
            return { version: STORE_VERSION, updatedAt: new Date().toISOString(), sessions: {} };
        }
    }
    writeRaw(file) {
        fs_1.default.writeFileSync(this.filePath, JSON.stringify(file, null, 2), "utf8");
    }
}
exports.SessionStore = SessionStore;
