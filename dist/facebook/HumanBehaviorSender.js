"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HumanBehaviorSender = void 0;
const LoggerManager_1 = require("../logger/LoggerManager");
const log = LoggerManager_1.LoggerManager.getLogger('HumanBehaviorSender');
class HumanBehaviorSender {
    inner;
    constructor(inner) {
        this.inner = inner;
    }
    async sendText(recipientId, text) {
        const delayMs = HumanBehaviorSender.calculateDelay(text);
        log.debug('HumanBehaviorSender: queuing message with human delay.', {
            to: recipientId, chars: text.length, delayMs: Math.round(delayMs),
        });
        try {
            await this.inner.sendTyping(recipientId);
        }
        catch { /* ignore */ }
        await HumanBehaviorSender.sleep(delayMs);
        await this.inner.sendText(recipientId, text);
    }
    async sendTyping(recipientId) {
        return this.inner.sendTyping(recipientId);
    }
    async sendReaction(messageId, recipientId, emoji) {
        return this.inner.sendReaction(messageId, recipientId, emoji);
    }
    static calculateDelay(text) {
        const bell = Math.random() + Math.random();
        const len = text.length;
        if (len < 80)
            return 200 + bell * 200;
        if (len < 250)
            return 400 + bell * 300;
        return 600 + bell * 400;
    }
    static sleep(ms) {
        return new Promise((resolve) => {
            const id = setTimeout(resolve, ms);
            if (typeof id.unref === 'function') {
                id.unref();
            }
        });
    }
}
exports.HumanBehaviorSender = HumanBehaviorSender;
