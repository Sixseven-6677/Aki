"use strict";
/**
 * AkiSender — المرسل الهجين
 *
 * يحل محل MiraiSender من Sixsu.
 * يستخدم Djamel-FCA مباشرةً لإرسال الرسائل مع retry + timeout.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AkiSender = void 0;
const LoggerManager_1 = require("../logger/LoggerManager");
const log = LoggerManager_1.LoggerManager.getLogger("AkiSender");
const RETRYABLE = ["client disconnecting", "not connected", "api not connected", "timed out"];
function isRetryable(err) {
    const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
    return RETRYABLE.some(e => msg.includes(e));
}
function withTimeout(p, ms, label) {
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`timed out: ${label} after ${ms}ms`)), ms);
        p.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
    });
}
function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}
class AkiSender {
    provider;
    constructor(provider) {
        this.provider = provider;
    }
    async waitForApi(timeoutMs = 20_000) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const api = this.provider.getApi();
            if (api)
                return api;
            await sleep(500);
        }
        return null;
    }
    async sendText(recipientId, text) {
        const MAX_ATTEMPTS = 4;
        const SEND_TIMEOUT_MS = 10_000;
        let lastErr;
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            let api = this.provider.getApi();
            if (!api) {
                log.warn("AkiSender.sendText: API null — waiting.", { to: recipientId, attempt });
                api = await this.waitForApi(20_000);
                if (!api)
                    throw new Error("Facebook API unavailable after 20s.");
            }
            try {
                await withTimeout(new Promise((resolve, reject) => {
                    api.sendMessage(text, recipientId, (err, info) => {
                        if (err) {
                            reject(err);
                            return;
                        }
                        log.info("AkiSender: message sent.", { to: recipientId, messageID: info?.messageID });
                        resolve();
                    });
                }), SEND_TIMEOUT_MS, `sendMessage to ${recipientId}`);
                return;
            }
            catch (err) {
                lastErr = err;
                const msg = err instanceof Error ? err.message : String(err);
                if (isRetryable(err) && attempt < MAX_ATTEMPTS) {
                    const waitMs = attempt * 2_000;
                    log.warn(`AkiSender: attempt ${attempt} failed (${msg}) — retrying in ${waitMs}ms.`);
                    await sleep(waitMs);
                    continue;
                }
                log.error("AkiSender: sendText permanently failed.", { to: recipientId, error: msg });
                throw err;
            }
        }
        throw lastErr;
    }
    async sendTyping(recipientId) {
        const api = this.provider.getApi();
        if (!api)
            return;
        const indicatorPromise = new Promise((resolve) => {
            try {
                api.sendTypingIndicator(recipientId, (err) => {
                    if (err)
                        log.warn("AkiSender.sendTyping: failed.", { error: err.message });
                    resolve();
                });
            }
            catch (e) {
                log.warn("AkiSender.sendTyping: threw.", { error: String(e) });
                resolve();
            }
        });
        try {
            await withTimeout(indicatorPromise, 3_000, `sendTypingIndicator to ${recipientId}`);
        }
        catch {
            log.warn("AkiSender.sendTyping: timed out — continuing.");
        }
    }
    async sendReaction(messageId, _recipientId, emoji) {
        const api = this.provider.getApi();
        if (!api)
            return;
        try {
            api.setMessageReaction(emoji, messageId, undefined, true);
        }
        catch { /**/ }
    }
}
exports.AkiSender = AkiSender;
