/**
 * AkiTransport — طبقة الاتصال الهجينة
 *
 * إعادة كتابة كاملة. المشاكل التي حُلّت:
 *
 *  ① doLogin() كانت callback بلا timeout — تتجمّد إلى الأبد إذا لم يرد Facebook
 *     الحل: attemptLogin() تُعيد Promise تنتهي بعد LOGIN_TIMEOUT_MS على أقصى تقدير.
 *
 *  ② إثنان يُعيدان الاتصال في نفس الوقت:
 *     - SessionHealthMonitor (كل 5 دقائق) كان يرى isConnected()=false أثناء الإعادة
 *       ويُطلق ReconnectManager الذي يُلغي connectLoop الداخلية.
 *     - mqttHealthCheck.js كان يستدعي restart() بغض النظر عن الحالة.
 *     الحل: State Machine واضحة.
 *       • RECONNECTING → isConnected() = true → SessionHealthMonitor لا يتدخل.
 *       • reLoginBot  → يُطلق restart() فقط عند STOPPED، وإلا يتجاهل الطلب.
 *
 *  ③ setTimeout chain مع loginAttempts flag عُرضة للتعارض.
 *     الحل: connectLoop() = async while loop واحد يُمثّل كل المسارات.
 *     reconnectGen counter يضمن أن restart() الخارجية تُلغي اللوب القديم
 *     بدون race condition.
 */

import path from "path";
import { ISystem } from "../core/interfaces/ISystem";
import { FcaApi, FcaCookie, FcaEvent } from "./types/FcaTypes";
import { LoggerManager } from "../logger/LoggerManager";
import { diagnosticMonitor } from "../diagnostic/DiagnosticMonitor";

const log = LoggerManager.getLogger("AkiTransport");

// ─── Constants ────────────────────────────────────────────────────────────────

/** الـ cookies التي يحتاجها Djamel-FCA فعلاً — نُصفّي الباقي لتقليل الحجم. */
const GOATBOT_ESSENTIAL_KEYS = new Set(["c_user", "xs", "datr", "fr", "sb", "i_user"]);

const SESSION_EXPIRED_HINTS = [
  "fb_appstate expired",
  "appstate expired",
  "appstate die",
  "c_user/i_user cookie not found",
  "không tìm thấy cookie",
  "login",
] as const;

/** أكواد خطأ Facebook تعني حظراً دائماً لا يُجدي معه الإعادة. */
const FATAL_FB_ERRORS = new Set([1357004, 1357031, 1357045]);

/** إذا لم يرد FCA callback خلال هذه المدة نعتبر المحاولة فاشلة ونُعيد التجربة. */
const LOGIN_TIMEOUT_MS = 90_000; // 90 ثانية

/**
 * إذا كانت مدة الاتصال الناجح أطول من هذه القيمة نُعيد ضبط عداد المحاولات،
 * لأن الانقطاع كان بسبب شبكة وليس بيانات اعتماد فاسدة.
 */
const STABLE_CONNECTION_MS = 30_000;

// Exponential backoff — تعمّدنا تقليل الحد الأقصى إلى دقيقة واحدة
// (كان 5 دقائق سابقاً، وهو ما جعل كل محاولة تبدو كـ "reconnect كل 5 دقائق")
const BACKOFF_BASE_MS = 5_000;
const BACKOFF_MAX_MS  = 60_000; // دقيقة واحدة
const BACKOFF_MULT    = 2;
const MAX_ATTEMPTS    = 10;

// ─── State Machine ────────────────────────────────────────────────────────────

export enum TransportState {
  /** لم تبدأ بعد. */
  IDLE         = "IDLE",
  /** محاولة تسجيل دخول أولى (initialize أو restart). */
  CONNECTING   = "CONNECTING",
  /** متصل بالكامل — api جاهزة، MQTT تستمع. */
  CONNECTED    = "CONNECTED",
  /**
   * MQTT انقطع — connectLoop داخلية تُعيد الاتصال.
   * isConnected() = true في هذه الحالة عن قصد:
   * SessionHealthMonitor لا يرى انقطاعاً ولا يُطلق reconnect خارجي
   * يتعارض مع اللوب الداخلية. فقط عند STOPPED ينبغي له التدخل.
   */
  RECONNECTING = "RECONNECTING",
  /** destroy() استُدعي — نتجاهل كل الأحداث. */
  STOPPING     = "STOPPING",
  /**
   * توقف نهائي — اللوب الداخلية استنفدت محاولاتها.
   * isConnected() = false هنا → SessionHealthMonitor يرى انقطاعاً
   * ويُطلق ReconnectManager الذي يأتي ببيانات اعتماد جديدة.
   */
  STOPPED      = "STOPPED",
}

// ─── Internal result types ────────────────────────────────────────────────────

interface LoginSuccess {
  ok:     true;
  api:    FcaApi;
  extras: { appState?: FcaCookie[] } | undefined;
}

interface LoginFailure {
  ok:      false;
  reason:  string;
  expired: boolean; // AppState منتهية الصلاحية — لا جدوى من الإعادة
  fatal:   boolean; // خطأ Facebook دائم — لا جدوى من الإعادة
  errCode: number | undefined;
}

type LoginAttemptResult = LoginSuccess | LoginFailure;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function isSessionExpiredError(msg: string): boolean {
  const lower = msg.toLowerCase();
  return SESSION_EXPIRED_HINTS.some(h => lower.includes(h.toLowerCase()));
}

/**
 * Exponential backoff مع ±25% jitter لمنع thundering-herd.
 * attempt يبدأ من 1.
 */
function computeBackoff(attempt: number): number {
  const raw    = BACKOFF_BASE_MS * Math.pow(BACKOFF_MULT, attempt - 1);
  const capped = Math.min(raw, BACKOFF_MAX_MS);
  return Math.round(capped * (0.75 + Math.random() * 0.5));
}

// ─── Public interface ─────────────────────────────────────────────────────────

export type AkiEventHandler = (event: FcaEvent) => void;

export interface AkiTransportOptions {
  /** تأخير عند البدء (لتفادي تعارض حسابات متعددة تبدأ في نفس الوقت). */
  initDelayMs?:        number;
  /** إعادة اتصال وقائية دورية — 30 دقيقة افتراضياً (نمط GoatBot). */
  proactiveRestartMs?: number;
}

// ─── AkiTransport ────────────────────────────────────────────────────────────

export class AkiTransport implements ISystem {
  readonly name: string;

  // Cookies
  private appState:     FcaCookie[]; // الأصل — لا يتغير
  private currentState: FcaCookie[] = []; // يُحدَّث عند تجديد FCA

  // Options
  private readonly initDelayMs: number;
  private readonly proactiveMs: number;

  // State machine
  private state: TransportState = TransportState.IDLE;

  // FCA
  private api:          FcaApi | null     = null;
  private stopListenFn: (() => void) | null = null;

  /**
   * Generation counter — يُزداد عند كل restart() أو connectLoop جديدة.
   * اللوب القديمة تفحص أن رقمها لا يزال صحيحاً بعد كل await،
   * وتخرج فوراً إذا تغيّر — هذا يمنع race condition بين لوبين متزامنتين.
   */
  private reconnectGen = 0;

  // Tracking
  private attempts        = 0;
  private lastConnectedAt: number | null = null;
  private connectedSince:  number | null = null;
  private totalReconnects  = 0;

  // Timers
  private proactiveTimer: ReturnType<typeof setInterval> | null = null;

  // Callbacks
  private eventHandler:      AkiEventHandler | null                  = null;
  private onPermFailure:     ((reason: string) => void) | null       = null;
  private onAppStateRefresh: ((cookies: FcaCookie[]) => void) | null = null;

  // Dedup
  private readonly seenMsgIds:   string[]                       = [];
  private readonly rawListeners: Set<(e: unknown) => void>      = new Set();

  // ── Constructor ──────────────────────────────────────────────────────────

  constructor(
    rawAppState: FcaCookie[],
    systemName  = "aki-connection",
    opts: AkiTransportOptions = {},
  ) {
    this.name        = systemName;
    this.initDelayMs = opts.initDelayMs        ?? 0;
    this.proactiveMs = opts.proactiveRestartMs ?? 30 * 60_000;
    this.appState    = AkiTransport.filterAppState(rawAppState);

    log.info(
      `[${systemName}]: AppState — ${rawAppState.length} → ${this.appState.length} cookies (essential filter).`,
    );
  }

  // ── Static ────────────────────────────────────────────────────────────────

  /** نحتفظ فقط بالـ cookies التي تحتاجها FCA فعلاً. */
  static filterAppState(cookies: FcaCookie[]): FcaCookie[] {
    return cookies.filter(c => GOATBOT_ESSENTIAL_KEYS.has(c.key));
  }

  // ── Callback registration ─────────────────────────────────────────────────

  setEventHandler(fn: AkiEventHandler): void                     { this.eventHandler      = fn; }
  setOnPermanentFailure(fn: (r: string) => void): void           { this.onPermFailure      = fn; }
  setOnAppStateRefresh(fn: (c: FcaCookie[]) => void): void       { this.onAppStateRefresh  = fn; }
  addRawEventListener(fn: (e: unknown) => void): void            { this.rawListeners.add(fn); }
  removeRawEventListener(fn: (e: unknown) => void): void         { this.rawListeners.delete(fn); }

  // ── Public queries ────────────────────────────────────────────────────────

  getApi(): FcaApi | null { return this.api; }
  getState():  TransportState { return this.state; }
  /** متوافق مع الكود القديم الذي يستخدم isRunning(). */
  isRunning(): boolean { return this.state !== TransportState.STOPPED && this.state !== TransportState.STOPPING; }

  /** مساعد داخلي — يخرج TypeScript من narrowing بعد await. */
  private shouldAbort(myGen: number): boolean {
    return (
      myGen !== this.reconnectGen ||
      this.state === TransportState.STOPPING ||
      this.state === TransportState.STOPPED
    );
  }

  /**
   * تُعيد true في حالتي CONNECTED و RECONNECTING.
   *
   * لماذا true أثناء RECONNECTING؟
   * لأن connectLoop الداخلية تُعالج الموقف. إعادة false هنا كانت تُسبب
   * SessionHealthMonitor يُطلق ReconnectManager كل 5 دقائق ليُلغي اللوب الداخلية
   * ويبدأ من الصفر — وهو جوهر مشكلة "reconnect كل 5 دقائق".
   *
   * عند STOPPED فقط (استنفدت كل المحاولات) نُعيد false لكي يتدخل
   * ReconnectManager ببيانات اعتماد جديدة.
   */
  isConnected(): boolean {
    return (
      this.state === TransportState.CONNECTED ||
      this.state === TransportState.RECONNECTING
    );
  }

  getCurrentUserId(): string {
    const c = this.appState.find(x => x.key === "c_user");
    return c?.value ?? "";
  }

  getStats(): Record<string, unknown> {
    return {
      name:            this.name,
      state:           this.state,
      attempts:        this.attempts,
      totalReconnects: this.totalReconnects,
      lastConnectedAt: this.lastConnectedAt,
    };
  }

  // ── ISystem lifecycle ─────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    log.info(`[${this.name}]: initializing…`);
    this.state = TransportState.CONNECTING;

    if (this.initDelayMs > 0) {
      log.info(`[${this.name}]: startup stagger ${this.initDelayMs}ms…`);
      await sleep(this.initDelayMs);
    }

    await this.connectLoop("initialize");
    this.startProactiveRestart();
  }

  async destroy(): Promise<void> {
    log.info(`[${this.name}]: destroying.`);
    this.state = TransportState.STOPPING;
    this.reconnectGen++; // يُلغي أي connectLoop جارية
    this.stopProactiveRestart();
    this.teardownConnection();
    this.stopProtection();
    this.state = TransportState.STOPPED;
    log.info(`[${this.name}]: destroyed.`);
  }

  /**
   * إعادة الاتصال الخارجية — تُستدعى من ReconnectManager بعد نجاحه في
   * تجديد بيانات الاعتماد. تُلغي أي لوب داخلية جارية وتبدأ من الصفر.
   */
  async restart(freshCookies?: FcaCookie[]): Promise<void> {
    log.info(`[${this.name}]: restart() — clean restart.`);

    // إلغاء اللوب القديمة إن وُجدت
    this.reconnectGen++;
    this.teardownConnection();
    this.stopProtection();

    if (freshCookies?.length) {
      this.currentState = AkiTransport.filterAppState(freshCookies);
      log.info(`[${this.name}]: updated to ${freshCookies.length} fresh cookies.`);
    }

    this.attempts = 0;
    this.state    = TransportState.CONNECTING;
    await this.connectLoop("restart");
  }

  // ── connectLoop — نقطة الدخول الوحيدة لكل المحاولات ─────────────────────

  /**
   * حلقة اتصال واحدة تُمثّل: initialize, reconnect بعد MQTT error, restart.
   *
   * reconnectGen: كل restart() تُزيده. اللوب تفحصه بعد كل await وتخرج
   * إذا تغيّر — بدون race condition ولا حاجة لـ AbortController.
   */
  private async connectLoop(reason: string): Promise<void> {
    const myGen = this.reconnectGen;

    log.info(`[${this.name}]: connectLoop started — reason=${reason} gen=${myGen}.`);

    while (true) {
      // تحقق من أن اللوب لم تُلغَ (shouldAbort يُعيد true إذا تغيّر الجيل أو بدأ destroy)
      if (this.shouldAbort(myGen)) return;

      this.attempts++;

      // المحاولة الأولى بلا تأخير — الباقي بـ exponential backoff
      if (this.attempts > 1) {
        const delay = computeBackoff(this.attempts - 1);
        log.info(`[${this.name}]: backoff ${delay}ms (attempt ${this.attempts}/${MAX_ATTEMPTS})…`);
        await sleep(delay);

        // تحقق مرة ثانية بعد الانتظار — restart() قد استُدعي خلاله
        if (this.shouldAbort(myGen)) return;
      }

      log.info(`[${this.name}]: attempting login (${this.attempts}/${MAX_ATTEMPTS})…`);
      const result = await this.attemptLogin(); // ← بـ timeout — لن يتجمّد أبداً

      // تحقق بعد الـ await الطويل
      if (this.shouldAbort(myGen)) return;

      // ── نجاح ──────────────────────────────────────────────────────────
      if (result.ok) {
        this.state           = TransportState.CONNECTED;
        this.attempts        = 0;
        this.lastConnectedAt = Date.now();
        this.connectedSince  = Date.now();
        this.totalReconnects++;

        this.onLoginSuccess(result.api, result.extras);
        log.info(
          `[${this.name}]: CONNECTED (totalReconnects=${this.totalReconnects}). [listener-active]`,
        );
        return;
      }

      // ── فشل — نُحوّل النوع صراحةً بعد استبعاد حالة النجاح بالـ return أعلاه ──
      const failure = result as LoginFailure;

      // فشل دائم — لا فائدة من الإعادة
      if (failure.expired) {
        log.error(`[${this.name}]: AppState expired. [permanent-failure]`);
        this.state = TransportState.STOPPED;
        this.onPermFailure?.("appstate-expired");
        return;
      }

      if (failure.fatal) {
        log.error(`[${this.name}]: fatal FB error ${failure.errCode}. [permanent-failure]`);
        this.state = TransportState.STOPPED;
        this.onPermFailure?.(`fatal-fb-error-${failure.errCode}`);
        return;
      }

      // ── استنفاد المحاولات ──────────────────────────────────────────────
      if (this.attempts >= MAX_ATTEMPTS) {
        log.warn(
          `[${this.name}]: exhausted ${MAX_ATTEMPTS} attempts. [permanent-failure]`,
          { lastError: failure.reason },
        );
        this.state = TransportState.STOPPED;
        this.onPermFailure?.("max-login-attempts");
        return;
      }

      // ── فشل مؤقت — نُعيد التجربة في الدورة التالية ──────────────────
      log.warn(`[${this.name}]: attempt ${this.attempts} failed: ${failure.reason}`);
      diagnosticMonitor.recordLogin(this.name, false, {
        error:   failure.reason,
        attempt: this.attempts,
      });
    }
  }

  // ── محاولة تسجيل دخول مفردة مع timeout ──────────────────────────────────

  private attemptLogin(): Promise<LoginAttemptResult> {
    return new Promise<LoginAttemptResult>((resolve) => {
      const stateToUse = this.currentState.length > 0 ? this.currentState : this.appState;

      let settled = false;
      const settle = (r: LoginAttemptResult): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutHandle);
        resolve(r);
      };

      // ── Timeout guard — الحل الجوهري للتجمّد ──────────────────────────
      const timeoutHandle = setTimeout(() => {
        log.warn(
          `[${this.name}]: FCA login timed out after ${LOGIN_TIMEOUT_MS / 1000}s — will retry.`,
        );
        settle({
          ok:      false,
          reason:  "login-timeout",
          expired: false,
          fatal:   false,
          errCode: undefined,
        });
      }, LOGIN_TIMEOUT_MS);

      // ── تحميل FCA ─────────────────────────────────────────────────────
      /* eslint-disable @typescript-eslint/no-var-requires */
      let DjamelFCA: (
        cookies: FcaCookie[],
        cb: (err: Error | null, api: FcaApi | null, extras?: { appState?: FcaCookie[] }) => void,
      ) => void;

      try {
        DjamelFCA = require(path.resolve(process.cwd(), "fca")) as typeof DjamelFCA;
      } catch (loadErr: unknown) {
        settle({
          ok:      false,
          reason:  `fca load error: ${String(loadErr)}`,
          expired: false,
          fatal:   false,
          errCode: undefined,
        });
        return;
      }
      /* eslint-enable @typescript-eslint/no-var-requires */

      // ── استدعاء FCA ───────────────────────────────────────────────────
      DjamelFCA(stateToUse, (err, api, extras) => {
        if (err || !api) {
          const errMsg  = err instanceof Error
            ? err.message
            : (err != null ? JSON.stringify(err) : "null API returned");

          const errCode = (err as unknown as Record<string, unknown>)?.["error"] as number | undefined;
          const fatal   = errCode !== undefined
            && FATAL_FB_ERRORS.has(errCode)
            && this.attempts >= 2;

          settle({
            ok:      false,
            reason:  errMsg,
            expired: isSessionExpiredError(errMsg),
            fatal,
            errCode,
          });
          return;
        }

        settle({ ok: true, api, extras });
      });
    });
  }

  // ── ما بعد نجاح تسجيل الدخول ─────────────────────────────────────────────

  private onLoginSuccess(
    api:    FcaApi,
    extras: { appState?: FcaCookie[] } | undefined,
  ): void {
    this.api = api;

    api.setOptions({
      listenEvents:      true,
      selfListen:        false,
      updatePresence:    false,
      forceLogin:        false,
      userAgent:
        "Mozilla/5.0 (Linux; Android 12; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36",
      autoMarkDelivered: false,
      autoMarkRead:      false,
      logLevel:          "silent",
    });

    // تحديث AppState إذا أعادت FCA cookies محدّثة
    const freshCookies = extras?.appState ?? api.getAppState();
    if (freshCookies?.length) {
      this.currentState = freshCookies;
      this.onAppStateRefresh?.(freshCookies);
      log.info(`[${this.name}]: AppState refreshed (${freshCookies.length} cookies).`);
    }

    diagnosticMonitor.recordLogin(this.name, true, {
      userId:  api.getCurrentUserID(),
      attempt: this.attempts,
    });

    this.initGoatbotGlobals(api);
    this.startProtection(api);
    this.startListening();
  }

  // ── MQTT Listener ─────────────────────────────────────────────────────────

  private startListening(): void {
    if (!this.api) return;

    log.info(`[${this.name}]: starting MQTT listener…`);
    const listenStartMs = Date.now();
    diagnosticMonitor.recordMqttConnect(this.name);

    // ── معالج الخطأ ──────────────────────────────────────────────────────
    const handleError = (err: Error): void => {
      // نتجاهل الأخطاء المتكررة إذا بدأنا بالفعل إعادة الاتصال أو destroy.
      // بدون هذا الحارس، أحداث error متعددة (error storm) تُشغّل connectLoop
      // متعددة بالتوازي وتُضخّم attempts بشكل خاطئ.
      if (
        this.state === TransportState.RECONNECTING ||
        this.state === TransportState.STOPPING     ||
        this.state === TransportState.STOPPED
      ) return;

      const stableMs = Date.now() - listenStartMs;
      const errCode  = (err as unknown as Record<string, unknown>)["error"] as number | undefined;
      const errMsg   = err?.message ?? JSON.stringify(err);

      diagnosticMonitor.recordMqttDisconnect(this.name, {
        errorCode: errCode,
        errorMsg:  errMsg,
        stableMs,
      });
      log.warn(`[${this.name}]: MQTT error — entering reconnect loop.`, { error: errMsg, stableMs });

      // إذا كان الاتصال مستقراً قبل الانقطاع، نُعيد ضبط عداد المحاولات
      if (stableMs >= STABLE_CONNECTION_MS) this.attempts = 0;

      this.teardownConnection();
      this.stopProtection();

      /**
       * الانتقال إلى RECONNECTING — isConnected() تُعيد true هنا.
       * هذا يمنع SessionHealthMonitor من رؤية "انقطاع" ويُطلق reconnect خارجي.
       * connectLoop الداخلية ستُعالج الموقف بنفسها.
       * فقط عند انتهائها بـ STOPPED سيتدخل ReconnectManager.
       */
      this.state = TransportState.RECONNECTING;
      this.reconnectGen++;
      this.connectLoop("mqtt-error").catch((e: unknown) => {
        log.error(`[${this.name}]: connectLoop threw.`, { error: String(e) });
      });
    };

    // ── معالج الأحداث ─────────────────────────────────────────────────────
    const handleEvent = (event: unknown): void => {
      if (this.state === TransportState.STOPPING || this.state === TransportState.STOPPED) return;
      if (!event) return;

      // تحديث نشاط MQTT — يُعيد ضبط مؤقت mqttHealthCheck
      global.lastMqttActivity = Date.now();

      const evType = (event as Record<string, unknown>)["type"] as string | undefined;
      log.info(`[${this.name}]: FCA event.`, { type: evType });

      // Dedup by messageID
      const msgId = (event as Record<string, unknown>)["messageID"] as string | undefined;
      if (msgId) {
        if (this.seenMsgIds.includes(msgId)) {
          log.debug(`[${this.name}]: dedup drop ${msgId}.`);
          return;
        }
        this.seenMsgIds.push(msgId);
        if (this.seenMsgIds.length > 10) this.seenMsgIds.shift();
      }

      // Raw listeners (للـ diagnostic وغيرها)
      for (const fn of this.rawListeners) {
        try { fn(event as FcaEvent); } catch { /* ignore */ }
      }

      // Event handler الرئيسي
      try {
        this.eventHandler?.(event as FcaEvent);
      } catch (handlerErr: unknown) {
        log.error(`[${this.name}]: event handler threw.`, {
          error: handlerErr instanceof Error ? handlerErr.message : String(handlerErr),
        });
      }
    };

    // ── تسجيل الاستماع — FCA v3 (returns stop-fn) و v4 (returns EventEmitter) ──
    const listenResult = this.api.listen((err: Error | null, event: unknown) => {
      if (err) { handleError(err); return; }
      handleEvent(event);
    });

    if (
      listenResult &&
      typeof (listenResult as unknown as Record<string, unknown>).on === "function"
    ) {
      // FCA v4 — EventEmitter
      const emitter = listenResult as unknown as {
        on(ev: string, fn: (e: unknown) => void): void;
        stopListening?(cb?: () => void): void;
      };
      ["message", "message_reply", "event", "typ", "read", "read_receipt"].forEach(evName =>
        emitter.on(evName, handleEvent),
      );
      emitter.on("error", (e: unknown) => handleError(e as Error));

      this.stopListenFn = () => {
        if (typeof emitter.stopListening === "function") {
          try { emitter.stopListening(() => {}); } catch { /* ignore */ }
        }
      };
      log.info(`[${this.name}]: v4 EventEmitter wired.`);
    } else if (typeof listenResult === "function") {
      // FCA v3 — stop function مباشرة
      this.stopListenFn = listenResult as () => void;
    } else {
      this.stopListenFn = null;
    }

    log.info(`[${this.name}]: MQTT listener active.`);
  }

  // ── قطع الاتصال ───────────────────────────────────────────────────────────

  private teardownConnection(): void {
    if (this.stopListenFn) {
      try { this.stopListenFn(); } catch { /* ignore */ }
      this.stopListenFn = null;
      log.info(`[${this.name}]: listener stopped.`);
    }
    if (this.api) {
      try { this.api.logout(); } catch { /* ignore */ }
      this.api = null;
      log.info(`[${this.name}]: api cleared.`);
    }
  }

  // ── Proactive restart (نمط GoatBot 30 دقيقة) ─────────────────────────────

  private startProactiveRestart(): void {
    if (!this.proactiveMs) return;

    this.proactiveTimer = setInterval(() => {
      // لا نُعيد الاتصال إذا لم نكن متصلين أصلاً — اللوب الداخلية تُعالج ذلك
      if (this.state !== TransportState.CONNECTED) return;

      log.info(
        `[${this.name}]: proactive restart (${this.proactiveMs / 60_000}m interval).`,
      );
      this.restart().catch((e: unknown) => {
        log.error(`[${this.name}]: proactive restart threw.`, { error: String(e) });
      });
    }, this.proactiveMs);
  }

  private stopProactiveRestart(): void {
    if (this.proactiveTimer) {
      clearInterval(this.proactiveTimer);
      this.proactiveTimer = null;
    }
  }

  // ── GoatBot globals ───────────────────────────────────────────────────────

  private initGoatbotGlobals(api: FcaApi): void {
    const uid = api.getCurrentUserID();

    /**
     * reLoginBot — تُستدعى من mqttHealthCheck.js وغيرها.
     *
     * السلوك الجديد (مختلف جوهرياً عن القديم):
     *   • STOPPED:      نُطلق restart() — هذا هو المقصود.
     *   • أي حالة أخرى: لا نفعل شيئاً — إما متصل أو اللوب الداخلية تعمل.
     *
     * لماذا؟ قديماً كان يستدعي restart() دائماً، فكان يُلغي connectLoop
     * الداخلية في منتصف الطريق ويُعيد ضبط المحاولات — وهو ما كان يخلق
     * تعارضاً مع SessionHealthMonitor ويُنتج نمط "reconnect كل 5 دقائق".
     */
    const reLoginBot = (): void => {
      if (this.state === TransportState.STOPPED) {
        log.info(`[${this.name}]: reLoginBot — STOPPED, triggering restart.`);
        this.restart().catch(() => {});
      } else {
        log.debug(
          `[${this.name}]: reLoginBot — state=${this.state}, internal loop handles it.`,
        );
      }
    };

    if (!global.GoatBot) {
      global.GoatBot = {
        startTime:      Date.now(),
        config:         global.config ?? {},
        commands:       new Map(),
        eventCommands:  new Map(),
        aliases:        new Map(),
        onChat:         [],
        onReply:        new Map(),
        onReaction:     new Map(),
        onEvent:        [],
        fcaApi:         api,
        botID:          uid,
        angelIntervals: {},
        divelWatchers:  {},
        nmLocks:        new Map(),
        dmLocked:       false,
        allThreadData:  {},
        reLoginBot,
        _replyTimeout:  30 * 60 * 1000,
      };
    } else {
      global.GoatBot.fcaApi     = api;
      global.GoatBot.botID      = uid;
      global.GoatBot.reLoginBot = reLoginBot;
    }

    global.api              = api;
    global.lastMqttActivity = Date.now();
    log.info(`[${this.name}]: GoatBot globals initialized (botID=${uid}).`);
  }

  // ── طبقات الحماية ────────────────────────────────────────────────────────

  private startProtection(api: FcaApi): void {
    const layers = [
      "stealth", "keepAlive", "mqttHealthCheck", "humanTyping",
      "naturalPresence", "behaviorScheduler", "sessionRefresher", "Uprotection",
    ];

    for (const layer of layers) {
      try {
        /* eslint-disable @typescript-eslint/no-var-requires */
        const mod = require(path.resolve(process.cwd(), "src/protection", layer)) as {
          start?:            (api: FcaApi) => void;
          startHealthCheck?: () => void;
          startSession?:     () => void;
        };
        /* eslint-enable @typescript-eslint/no-var-requires */
        if (typeof mod.start            === "function") mod.start(api);
        if (typeof mod.startHealthCheck === "function") mod.startHealthCheck();
        if (typeof mod.startSession     === "function") mod.startSession();
      } catch (e) {
        log.warn(`[${this.name}]: protection layer "${layer}" skipped.`, {
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    log.info(`[${this.name}]: protection layers started.`);
  }

  private stopProtection(): void {
    const layers = [
      "stealth", "keepAlive", "mqttHealthCheck", "humanTyping",
      "naturalPresence", "behaviorScheduler", "sessionRefresher", "Uprotection",
    ];

    for (const layer of layers) {
      try {
        /* eslint-disable @typescript-eslint/no-var-requires */
        const mod = require(path.resolve(process.cwd(), "src/protection", layer)) as {
          stop?:            () => void;
          stopHealthCheck?: () => void;
        };
        /* eslint-enable @typescript-eslint/no-var-requires */
        if (typeof mod.stop            === "function") mod.stop();
        if (typeof mod.stopHealthCheck === "function") mod.stopHealthCheck();
      } catch { /* ignore */ }
    }
  }
}

// ─── Global declarations ──────────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line no-var
  var GoatBot: {
    startTime:      number;
    config:         Record<string, unknown>;
    commands:       Map<string, unknown>;
    eventCommands:  Map<string, unknown>;
    aliases:        Map<string, unknown>;
    onChat:         string[];
    onReply:        Map<string, unknown>;
    onReaction:     Map<string, unknown>;
    onEvent:        unknown[];
    fcaApi:         FcaApi | null;
    botID:          string | null;
    angelIntervals: Record<string, ReturnType<typeof setTimeout>>;
    divelWatchers:  Record<string, unknown>;
    nmLocks:        Map<string, unknown>;
    dmLocked:       boolean;
    allThreadData:  Record<string, unknown>;
    reLoginBot:     () => void;
    _replyTimeout:  number;
    [key: string]:  unknown;
  } | undefined;
  // eslint-disable-next-line no-var
  var api:              FcaApi | undefined;
  // eslint-disable-next-line no-var
  var lastMqttActivity: number | undefined;
  // eslint-disable-next-line no-var
  var config:           Record<string, unknown> | undefined;
}
