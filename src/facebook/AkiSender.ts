/**
    * AkiSender — المرسل الهجين
    *
    * يحل محل MiraiSender من Sixsu.
    * يستخدم ws3-fca مباشرةً (callback-based API) لإرسال الرسائل مع retry + timeout.
    *
    * ⚠️ ws3-fca is callback-based, NOT promise-based.
    *    Calling sendMessage / sendTypingIndicator / setMessageReaction without a
    *    callback causes ws3-fca to throw "TypeError: callback is not a function"
    *    as an unhandled rejection, crashing the process via ProcessErrorHandler.
    *    Always wrap in new Promise(...callback...).
    */

    import { FcaApi }        from "./types/FcaTypes";
    import { ISender }       from "./types/ISender";
    import { LoggerManager } from "../logger/LoggerManager";

    const log = LoggerManager.getLogger("AkiSender");

    const RETRYABLE = ["client disconnecting", "not connected", "api not connected", "timed out"];

    function isRetryable(err: unknown): boolean {
    const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
    return RETRYABLE.some(e => msg.includes(e));
    }

    function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`timed out: ${label} after ${ms}ms`)), ms);
      p.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
    });
    }

    function sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
    }

    export interface ApiProvider {
    getApi(): FcaApi | null;
    }

    export class AkiSender implements ISender {
    private readonly provider: ApiProvider;

    constructor(provider: ApiProvider) {
      this.provider = provider;
    }

    private async waitForApi(timeoutMs = 20_000): Promise<FcaApi | null> {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const api = this.provider.getApi();
        if (api) return api;
        await sleep(500);
      }
      return null;
    }

    async sendText(recipientId: string, text: string): Promise<void> {
      const MAX_ATTEMPTS    = 4;
      const SEND_TIMEOUT_MS = 10_000;
      let lastErr: unknown;

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        let api = this.provider.getApi();
        if (!api) {
          log.warn("AkiSender.sendText: API null — waiting.", { to: recipientId, attempt });
          api = await this.waitForApi(20_000);
          if (!api) throw new Error("Facebook API unavailable after 20s.");
        }

        try {
          // ws3-fca is callback-based. Wrap in a Promise so we can await/timeout.
          // NEVER call sendMessage without a callback — ws3-fca tries to invoke it
          // after the async send completes, throwing "TypeError: callback is not a
          // function" as an unhandled rejection that restarts the process.
          const info = await withTimeout(
            new Promise<{ messageID?: string } | void>((resolve, reject) => {
              (api as FcaApi).sendMessage(
                text,
                recipientId,
                (err: Error | null, msgInfo?: { messageID?: string }) => {
                  if (err) { reject(err); return; }
                  resolve(msgInfo);
                },
              );
            }),
            SEND_TIMEOUT_MS,
            `sendMessage to ${recipientId}`,
          );
          log.info("AkiSender: message sent.", {
            to: recipientId,
            messageID: (info as { messageID?: string } | void)?.messageID,
          });
          return;
        } catch (err) {
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

    async sendTyping(recipientId: string): Promise<void> {
      const api = this.provider.getApi();
      if (!api) return;

      try {
        await withTimeout(
          new Promise<void>((resolve) => {
            try {
              // ws3-fca real signature: sendTypingIndicator(isTyping, threadID, callback?)
              api.sendTypingIndicator(true, recipientId, (err?: Error) => {
                if (err) log.warn("AkiSender.sendTyping: failed.", { error: err.message });
                resolve();
              });
            } catch (e) {
              log.warn("AkiSender.sendTyping: threw.", { error: String(e) });
              resolve();
            }
          }),
          3_000,
          `sendTypingIndicator to ${recipientId}`,
        );
      } catch (e) {
        log.warn("AkiSender.sendTyping: failed or timed out — continuing.", { error: String(e) });
      }
    }

    async sendReaction(messageId: string, _recipientId: string, emoji: string): Promise<void> {
      const api = this.provider.getApi();
      if (!api) return;
      try {
        await new Promise<void>((resolve) => {
          api.setMessageReaction(emoji, messageId, (err?: Error) => {
            if (err) log.warn("AkiSender.sendReaction: failed.", { error: err.message });
            resolve();
          });
        });
      } catch (e) {
        log.warn("AkiSender.sendReaction: threw.", { error: String(e) });
      }
    }
    }
    