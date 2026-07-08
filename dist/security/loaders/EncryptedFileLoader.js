"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EncryptedFileLoader = void 0;
const fs_1 = __importDefault(require("fs"));
const ICredential_1 = require("../types/ICredential");
const CredentialGuard_1 = require("../CredentialGuard");
const CryptoHelper_1 = require("../../facebook/auth/CryptoHelper");
const LoggerManager_1 = require("../../logger/LoggerManager");
const log = LoggerManager_1.LoggerManager.getLogger("EncryptedFileLoader");
class EncryptedFileLoader {
    name = "encrypted-file";
    opts;
    constructor(opts) {
        this.opts = opts;
    }
    async canLoad() {
        return fs_1.default.existsSync(this.opts.filePath);
    }
    async load() {
        log.info(`EncryptedFileLoader: reading "${this.opts.filePath}".`);
        if (!fs_1.default.existsSync(this.opts.filePath)) {
            return {
                success: false,
                credentials: [],
                source: ICredential_1.CredentialSource.ENCRYPTED_FILE,
                error: `Encrypted credentials file not found: ${this.opts.filePath}`,
            };
        }
        let ciphertext;
        try {
            ciphertext = fs_1.default.readFileSync(this.opts.filePath, "utf8").trim();
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return {
                success: false, credentials: [], source: ICredential_1.CredentialSource.ENCRYPTED_FILE,
                error: `Failed to read file: ${msg}`,
            };
        }
        let plaintext;
        try {
            plaintext = await CryptoHelper_1.CryptoHelper.decrypt(ciphertext, this.opts.encryptionKey);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            log.error(`EncryptedFileLoader: decryption failed — wrong key or corrupted file.`);
            return {
                success: false, credentials: [], source: ICredential_1.CredentialSource.ENCRYPTED_FILE,
                error: `Decryption failed: ${msg}`,
            };
        }
        let parsed;
        try {
            const raw = JSON.parse(plaintext);
            if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
                throw new Error("Expected a JSON object of key-value credential pairs.");
            }
            parsed = raw;
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return {
                success: false, credentials: [], source: ICredential_1.CredentialSource.ENCRYPTED_FILE,
                error: `Invalid JSON in decrypted file: ${msg}`,
            };
        }
        const credentials = [];
        const errors = [];
        const now = new Date();
        for (const [key, value] of Object.entries(parsed)) {
            if (typeof value !== "string") {
                errors.push(`"${key}" has a non-string value.`);
                continue;
            }
            const guard = CredentialGuard_1.CredentialGuard.validate(key, value);
            if (!guard.valid) {
                errors.push(guard.reason ?? `"${key}" failed guard validation.`);
                credentials.push({
                    key, value: "", source: ICredential_1.CredentialSource.ENCRYPTED_FILE,
                    status: ICredential_1.CredentialStatus.HARDCODED, loadedAt: now,
                });
                log.error(`EncryptedFileLoader: ${guard.reason}`);
                continue;
            }
            credentials.push({
                key, value, source: ICredential_1.CredentialSource.ENCRYPTED_FILE,
                status: ICredential_1.CredentialStatus.VALID, loadedAt: now,
            });
            log.info(`EncryptedFileLoader: "${key}" loaded OK.`);
        }
        if (errors.length > 0) {
            return {
                success: false, credentials, source: ICredential_1.CredentialSource.ENCRYPTED_FILE,
                error: errors.join(" | "),
            };
        }
        log.info(`EncryptedFileLoader: ${credentials.length} credential(s) loaded successfully.`);
        return { success: true, credentials, source: ICredential_1.CredentialSource.ENCRYPTED_FILE };
    }
}
exports.EncryptedFileLoader = EncryptedFileLoader;
