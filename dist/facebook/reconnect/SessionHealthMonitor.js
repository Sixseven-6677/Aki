"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionHealthMonitor = void 0;
const LoggerManager_1 = require("../../logger/LoggerManager");
const log = LoggerManager_1.LoggerManager.getLogger("SessionHealthMonitor");
/** Returns a delay with +/-20% jitter so health checks do not fire on a perfect clock. */
function withJitter(baseMs) {
    const jitter = (Math.random() - 0.5) * 0.4 * baseMs;
    return Math.max(baseMs + jitter, 10_000);
}
class SessionHealthMonitor {
    timer = null;
    running = false;
    opts;
    constructor(opts) {
        this.opts = opts;
    }
    start() {
        if (this.timer !== null)
            return;
        log.info(`SessionHealthMonitor started. Base interval: ${this.opts.intervalMs}ms (+/-20% jitter)`);
        this.scheduleNext();
    }
    stop() {
        if (this.timer !== null) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        log.info("SessionHealthMonitor stopped.");
    }
    /** Force an immediate health check outside the normal interval. */
    async checkNow() {
        await this.tick();
    }
    scheduleNext() {
        const delay = withJitter(this.opts.intervalMs);
        log.debug(`SessionHealthMonitor: next check in ${Math.round(delay / 1000)}s.`);
        this.timer = setTimeout(async () => {
            this.timer = null;
            if (!this.running)
                await this.tick();
            this.scheduleNext();
        }, delay);
    }
    async tick() {
        this.running = true;
        const accounts = this.opts.getAccounts();
        for (const id of accounts) {
            try {
                const healthy = await this.opts.healthCheck(id);
                if (!healthy) {
                    log.warn(`Health check FAILED for account: ${id}`);
                    this.opts.onDisconnected(id);
                }
                else {
                    log.info(`Health check OK for account: ${id}`);
                }
            }
            catch (err) {
                log.error(`Health check threw for account "${id}".`, err);
                this.opts.onDisconnected(id);
            }
        }
        this.running = false;
    }
}
exports.SessionHealthMonitor = SessionHealthMonitor;
