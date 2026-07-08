"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CredentialManager = void 0;
const ICredential_1 = require("./types/ICredential");
const LoggerManager_1 = require("../logger/LoggerManager");
const log = LoggerManager_1.LoggerManager.getLogger("CredentialManager");
class CredentialManager {
    loaders;
    cachedResult = null;
    constructor(loaders) {
        this.loaders = loaders;
    }
    async load(forceReload = false) {
        if (this.cachedResult && !forceReload) {
            return this.cachedResult;
        }
        for (const loader of this.loaders) {
            let canLoad;
            try {
                canLoad = await loader.canLoad();
            }
            catch {
                canLoad = false;
            }
            if (!canLoad)
                continue;
            log.info(`CredentialManager: trying loader "${loader.name}".`);
            let result;
            try {
                result = await loader.load();
            }
            catch (err) {
                result = {
                    success: false, credentials: [],
                    source: ICredential_1.CredentialSource.UNKNOWN,
                    error: err instanceof Error ? err.message : String(err),
                };
            }
            if (result.success) {
                log.info(`CredentialManager: loader "${loader.name}" succeeded — ${result.credentials.length} credential(s).`);
                this.cachedResult = result;
                return result;
            }
            log.warn(`CredentialManager: loader "${loader.name}" failed — ${result.error ?? "unknown"}.`);
        }
        return { success: false, credentials: [], source: ICredential_1.CredentialSource.UNKNOWN, error: "No credential loader succeeded." };
    }
    invalidate() { this.cachedResult = null; }
}
exports.CredentialManager = CredentialManager;
