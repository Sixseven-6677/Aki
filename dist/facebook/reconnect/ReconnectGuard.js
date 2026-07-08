"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReconnectGuard = void 0;
const LoggerManager_1 = require("../../logger/LoggerManager");
const log = LoggerManager_1.LoggerManager.getLogger("ReconnectGuard");
const GUARD_DEFAULTS = {
    windowMs: 60_000,
    maxAttemptsPerWindow: 3,
    blockDurationMs: 5 * 60_000,
};
class ReconnectGuard {
    windows = new Map();
    opts;
    constructor(options = {}) {
        this.opts = { ...GUARD_DEFAULTS, ...options };
    }
    /**
     * Returns true if the account is allowed to attempt reconnect right now.
     */
    isAllowed(accountId) {
        const now = Date.now();
        const window = this.ensure(accountId);
        // Still blocked?
        if (window.blockedUntil !== null && now < window.blockedUntil) {
            const remainSec = Math.ceil((window.blockedUntil - now) / 1000);
            log.warn(`ReconnectGuard: "${accountId}" is blocked for ${remainSec}s more.`);
            return false;
        }
        // Reset window if expired
        if (now - window.windowStart > this.opts.windowMs) {
            window.count = 0;
            window.windowStart = now;
            window.blockedUntil = null;
        }
        // Count check
        if (window.count >= this.opts.maxAttemptsPerWindow) {
            window.blockedUntil = now + this.opts.blockDurationMs;
            log.warn(`ReconnectGuard: "${accountId}" exceeded ${this.opts.maxAttemptsPerWindow} ` +
                `attempts/window. Blocked for ${this.opts.blockDurationMs / 1000}s.`);
            return false;
        }
        return true;
    }
    /** Call this right before each attempt to record it. */
    record(accountId) {
        const window = this.ensure(accountId);
        const now = Date.now();
        if (now - window.windowStart > this.opts.windowMs) {
            window.count = 0;
            window.windowStart = now;
            window.blockedUntil = null;
        }
        window.count += 1;
    }
    /** Reset guard state for an account (e.g. after successful reconnect). */
    reset(accountId) {
        this.windows.delete(accountId);
    }
    /** Returns null if not blocked, or the Date it unblocks. */
    blockedUntil(accountId) {
        const w = this.windows.get(accountId);
        if (!w?.blockedUntil)
            return null;
        if (Date.now() >= w.blockedUntil)
            return null;
        return new Date(w.blockedUntil);
    }
    ensure(accountId) {
        if (!this.windows.has(accountId)) {
            this.windows.set(accountId, {
                count: 0,
                windowStart: Date.now(),
                blockedUntil: null,
            });
        }
        return this.windows.get(accountId);
    }
}
exports.ReconnectGuard = ReconnectGuard;
