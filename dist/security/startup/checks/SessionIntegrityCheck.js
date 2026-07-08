"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionIntegrityCheck = void 0;
const fs_1 = __importDefault(require("fs"));
const IStartupCheck_1 = require("../IStartupCheck");
const ISession_1 = require("../../../facebook/session/types/ISession");
class SessionIntegrityCheck {
    name = "session-integrity";
    severity;
    filePath;
    constructor(opts) {
        this.filePath = opts.sessionFilePath;
        this.severity = opts.severity ?? IStartupCheck_1.CheckSeverity.WARNING;
    }
    async run() {
        if (!fs_1.default.existsSync(this.filePath)) {
            return {
                name: this.name,
                passed: true,
                severity: this.severity,
                message: "No session file found — fresh start.",
                detail: `Expected at: ${this.filePath}`,
            };
        }
        let raw;
        try {
            raw = JSON.parse(fs_1.default.readFileSync(this.filePath, "utf8"));
        }
        catch {
            return {
                name: this.name,
                passed: false,
                severity: this.severity,
                message: "Session file exists but cannot be parsed — may be corrupted.",
                detail: `Path: ${this.filePath}`,
            };
        }
        const sessions = Object.entries(raw.sessions ?? {});
        const corrupted = [];
        const expired = [];
        const healthy = [];
        for (const [id, s] of sessions) {
            if (s.status === ISession_1.SessionStatus.CORRUPTED) {
                corrupted.push(id);
                continue;
            }
            if (s.expiresAt && Date.now() > new Date(s.expiresAt).getTime()) {
                expired.push(id);
                continue;
            }
            healthy.push(id);
        }
        const issues = [];
        if (corrupted.length > 0)
            issues.push(`${corrupted.length} corrupted`);
        if (expired.length > 0)
            issues.push(`${expired.length} expired`);
        if (corrupted.length > 0) {
            return {
                name: this.name,
                passed: false,
                severity: this.severity,
                message: `Session integrity issues: ${issues.join(", ")}.`,
                detail: `Corrupted: [${corrupted.join(", ")}]. Expired: [${expired.join(", ")}]. Healthy: [${healthy.join(", ")}].`,
            };
        }
        return {
            name: this.name,
            passed: true,
            severity: this.severity,
            message: expired.length > 0
                ? `${healthy.length} healthy session(s), ${expired.length} will be auto-renewed.`
                : `${healthy.length} session(s) healthy.`,
        };
    }
}
exports.SessionIntegrityCheck = SessionIntegrityCheck;
