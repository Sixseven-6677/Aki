"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RetryPolicy = void 0;
const DEFAULTS = {
    maxAttempts: 5,
    baseDelayMs: 2_000,
    maxDelayMs: 60_000,
    multiplier: 2,
    jitter: true,
};
class RetryPolicy {
    opts;
    constructor(options = {}) {
        this.opts = { ...DEFAULTS, ...options };
    }
    /**
     * Compute delay for a given attempt index (0-based).
     * Formula: base * multiplier^attempt, capped, ±25% jitter.
     */
    computeDelay(attempt) {
        const raw = this.opts.baseDelayMs * Math.pow(this.opts.multiplier, attempt);
        const capped = Math.min(raw, this.opts.maxDelayMs);
        if (!this.opts.jitter)
            return Math.round(capped);
        // ±25% jitter to prevent thundering-herd
        const factor = 0.75 + Math.random() * 0.5;
        return Math.round(capped * factor);
    }
    shouldRetry(attempt) {
        return attempt < this.opts.maxAttempts;
    }
    get maxAttempts() {
        return this.opts.maxAttempts;
    }
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
exports.RetryPolicy = RetryPolicy;
