/**
 * AkiSender — المرسل الهجين
 *
 * يحل محل MiraiSender من Sixsu.
 * يستخدم Djamel-FCA مباشرةً لإرسال الرسائل مع retry + timeout.
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
        const info = await withTimeout(
          Promise.resolve(api!.sendMessage(text, recipientId)) as Promise<{ messageID?: string } | void>,
          SEND_TIMEOUT_MS,
          `sendMessage to ${recipientId}`,
        );
        log.info("AkiSender: message sent.", { to: recipientId, messageID: (info as { messageID?: string } | void)?.messageID });
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
        Promise.resolve(api.sendTypingIndicator(true, recipientId)),
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
      await Promise.resolve(api.setMessageReaction(emoji, messageId));
    } catch (e) {
      log.warn("AkiSender.sendReaction: failed.", { error: String(e) });
    }
  }
}
