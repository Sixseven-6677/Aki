"use strict";
    /**
    * AkiSender — المرسل الهجين
    *
    * يحل محل MiraiSender من Sixsu.
    * يستخدم ws3-fca مباشرةً (callback-based API) لإرسال الرسائل مع retry + timeout.
    *
    * ⚠️  ws3-fca is callback-based, NOT promise-based.
    *     CRITICAL: sendTypingIndicator signature is (isTyping, threadID, callback?)
    *     NOT (threadID, callback) — passing wrong args causes ws3-fca to use a
    *     Function as threadID → TypeError → uncaughtException → process restart.
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
                  // ws3-fca is callback-based — NEVER call without a callback.
                  // Calling without callback causes ws3-fca to invoke undefined()
                  // after the async send → TypeError: callback is not a function
                  // → uncaughtException → ProcessErrorHandler restarts the process.
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
          // ws3-fca sendTypingIndicator signature: (isTyping: boolean, threadID: string, callback?)
          // CRITICAL: first arg MUST be a boolean — passing a string (threadID) as first arg
          // causes ws3-fca to use our callback function as threadID → TypeError → process crash.
          // The callback may never fire (ws3-fca keeps looping), so we always resolve after
          // a short delay via setTimeout to avoid blocking the pipeline.
          const indicatorPromise = new Promise((resolve) => {
              try {
                  api.sendTypingIndicator(true, recipientId, (err) => {
                      if (err)
                          log.warn("AkiSender.sendTyping: callback error.", { error: err.message });
                      resolve();
                  });
                  // Fallback: resolve after 500ms in case ws3-fca never fires the callback
                  // (some versions use a return-value pattern instead of callbacks).
                  setTimeout(resolve, 500);
              }
              catch (e) {
                  log.warn("AkiSender.sendTyping: threw synchronously.", { error: String(e) });
                  resolve();
              }
          });
          try {
              await withTimeout(indicatorPromise, 1_500, `sendTypingIndicator to ${recipientId}`);
          }
          catch {
              // Non-critical — typing indicator failure should never block the reply.
          }
      }
      async sendReaction(messageId, _recipientId, emoji) {
          const api = this.provider.getApi();
          if (!api)
              return;
          try {
              await new Promise((resolve) => {
                  api.setMessageReaction(emoji, messageId, (err) => {
                      if (err)
                          log.warn("AkiSender.sendReaction: failed.", { error: err.message });
                      resolve();
                  });
                  // Fallback in case ws3-fca never calls the reaction callback
                  setTimeout(resolve, 3000);
              });
          }
          catch (e) {
              log.warn("AkiSender.sendReaction: threw.", { error: String(e) });
          }
      }
    }
    exports.AkiSender = AkiSender;
    