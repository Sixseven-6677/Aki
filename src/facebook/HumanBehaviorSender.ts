import { ISender }       from './types/ISender';
import { LoggerManager } from '../logger/LoggerManager';

const log = LoggerManager.getLogger('HumanBehaviorSender');

export class HumanBehaviorSender implements ISender {
  private readonly inner: ISender;

  constructor(inner: ISender) {
    this.inner = inner;
  }

  async sendText(recipientId: string, text: string): Promise<void> {
    const delayMs = HumanBehaviorSender.calculateDelay(text);

    log.debug('HumanBehaviorSender: queuing message with human delay.', {
      to: recipientId, chars: text.length, delayMs: Math.round(delayMs),
    });

    try { await this.inner.sendTyping(recipientId); } catch { /* ignore */ }
    await HumanBehaviorSender.sleep(delayMs);
    await this.inner.sendText(recipientId, text);
  }

  async sendTyping(recipientId: string): Promise<void> {
    return this.inner.sendTyping(recipientId);
  }

  async sendReaction(messageId: string, recipientId: string, emoji: string): Promise<void> {
    return this.inner.sendReaction(messageId, recipientId, emoji);
  }

  private static calculateDelay(text: string): number {
    const bell = Math.random() + Math.random();
    const len  = text.length;
    if (len < 80)  return 200 + bell * 200;
    if (len < 250) return 400 + bell * 300;
    return               600 + bell * 400;
  }

  private static sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const id = setTimeout(resolve, ms);
      if (typeof (id as NodeJS.Timeout).unref === 'function') {
        (id as NodeJS.Timeout).unref();
      }
    });
  }
}
