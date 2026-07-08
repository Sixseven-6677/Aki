"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnvPresenceCheck = void 0;
const IStartupCheck_1 = require("../IStartupCheck");
const CredentialGuard_1 = require("../../CredentialGuard");
class EnvPresenceCheck {
    name = "env-presence";
    severity;
    required;
    constructor(opts) {
        this.required = opts.required;
        this.severity = opts.severity ?? IStartupCheck_1.CheckSeverity.CRITICAL;
    }
    async run() {
        const missing = [];
        const hardcoded = [];
        for (const key of this.required) {
            const value = process.env[key];
            if (!value) {
                missing.push(key);
                continue;
            }
            const guard = CredentialGuard_1.CredentialGuard.validate(key, value);
            if (!guard.valid) {
                hardcoded.push(key);
            }
        }
        if (missing.length > 0) {
            return {
                name: this.name,
                passed: false,
                severity: this.severity,
                message: `Missing required environment variable(s): ${missing.join(", ")}`,
                detail: "Set these in your .env file or Railway/deployment environment.",
            };
        }
        if (hardcoded.length > 0) {
            return {
                name: this.name,
                passed: false,
                severity: this.severity,
                message: `Placeholder/hardcoded values detected: ${hardcoded.join(", ")}`,
                detail: "Replace placeholder values with real credentials.",
            };
        }
        return {
            name: this.name,
            passed: true,
            severity: this.severity,
            message: `All ${this.required.length} required environment variable(s) are present and valid.`,
        };
    }
}
exports.EnvPresenceCheck = EnvPresenceCheck;
