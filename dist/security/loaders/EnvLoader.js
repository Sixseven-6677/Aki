"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnvLoader = void 0;
const ICredential_1 = require("../types/ICredential");
const CredentialGuard_1 = require("../CredentialGuard");
const LoggerManager_1 = require("../../logger/LoggerManager");
const log = LoggerManager_1.LoggerManager.getLogger("EnvLoader");
class EnvLoader {
    name = "env";
    opts;
    constructor(opts) {
        this.opts = { optional: [], ...opts };
    }
    async canLoad() {
        return this.opts.required.every((key) => !!process.env[key]);
    }
    async load() {
        log.info(`EnvLoader: loading ${this.opts.required.length} required credential(s).`);
        const credentials = [];
        const errors = [];
        const now = new Date();
        for (const key of this.opts.required) {
            const raw = process.env[key];
            if (!raw) {
                errors.push(`Required env var "${key}" is not set.`);
                credentials.push({
                    key, value: "", source: ICredential_1.CredentialSource.ENV,
                    status: ICredential_1.CredentialStatus.MISSING, loadedAt: now,
                });
                continue;
            }
            const guard = CredentialGuard_1.CredentialGuard.validate(key, raw);
            if (!guard.valid) {
                errors.push(guard.reason ?? `"${key}" failed validation.`);
                credentials.push({
                    key, value: "", source: ICredential_1.CredentialSource.ENV,
                    status: ICredential_1.CredentialStatus.HARDCODED, loadedAt: now,
                });
                log.error(`EnvLoader: ${guard.reason}`);
                continue;
            }
            credentials.push({
                key, value: raw, source: ICredential_1.CredentialSource.ENV,
                status: ICredential_1.CredentialStatus.VALID, loadedAt: now,
            });
            log.info(`EnvLoader: "${key}" loaded OK (${raw.length} chars).`);
        }
        for (const key of this.opts.optional) {
            const raw = process.env[key];
            if (!raw)
                continue;
            const guard = CredentialGuard_1.CredentialGuard.validate(key, raw);
            credentials.push({
                key,
                value: guard.valid ? raw : "",
                source: ICredential_1.CredentialSource.ENV,
                status: guard.valid ? ICredential_1.CredentialStatus.VALID : ICredential_1.CredentialStatus.HARDCODED,
                loadedAt: now,
            });
        }
        if (errors.length > 0) {
            return {
                success: false,
                credentials,
                source: ICredential_1.CredentialSource.ENV,
                error: errors.join(" | "),
            };
        }
        return { success: true, credentials, source: ICredential_1.CredentialSource.ENV };
    }
}
exports.EnvLoader = EnvLoader;
