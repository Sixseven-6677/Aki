"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CredentialLoadCheck = void 0;
const IStartupCheck_1 = require("../IStartupCheck");
const ICredential_1 = require("../../types/ICredential");
class CredentialLoadCheck {
    name = "credential-load";
    severity = IStartupCheck_1.CheckSeverity.CRITICAL;
    manager;
    constructor(manager) {
        this.manager = manager;
    }
    async run() {
        const result = await this.manager.load(true);
        if (!result.success) {
            return {
                name: this.name,
                passed: false,
                severity: this.severity,
                message: "Failed to load credentials from any configured source.",
                detail: result.error,
            };
        }
        const invalid = result.credentials.filter((c) => c.status !== ICredential_1.CredentialStatus.VALID);
        if (invalid.length > 0) {
            const names = invalid.map((c) => `${c.key}(${c.status})`).join(", ");
            return {
                name: this.name,
                passed: false,
                severity: this.severity,
                message: `${invalid.length} credential(s) failed validation: ${names}`,
                detail: "Check your credentials for placeholder or corrupted values.",
            };
        }
        return {
            name: this.name,
            passed: true,
            severity: this.severity,
            message: `${result.credentials.length} credential(s) loaded from "${result.source}" — all valid.`,
        };
    }
}
exports.CredentialLoadCheck = CredentialLoadCheck;
