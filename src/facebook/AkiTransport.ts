/**
 * AkiTransport — Hybrid Connection Layer
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  معمارية Sixsu (ISystem lifecycle, exponential backoff)         │
 * │  +  Djamel-FCA (مكتبة الاتصال الأقوى من Nejin)                 │
 * │  +  20 طبقة حماية من Nejin (stealth, keepAlive, mqttHealth…)   │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * يحل محل: MiraiTransport + MiraiConnectionManager من Sixsu
 * يستخدم: Djamel-fca بدلاً من @dongdev/fca-unofficial
 */

import path                        from "path";
import { ISystem }                 from "../core/interfaces/ISystem";
import { FcaApi, FcaCookie, FcaEvent } from "./types/FcaTypes";
import { LoggerManager }           from "../logger/LoggerManager";
import { diagnosticMonitor }       from "../diagnostic/DiagnosticMonitor";

const log = LoggerManager.getLogger("AkiTransport");

export type AkiEventHandler = (event: FcaEvent) => void;

export interface AkiTransportOptions {
  initDelayMs?:         number;
  proactiveRestartMs?:  number;
  cookieHealthMs?:      number;
}

const GOATBOT_ESSENTIAL_KEYS = new Set(["c_user", "xs", "datr", "fr", "sb", "i_user"]);

const SESSION_EXPIRED_HINTS = [
  "fb_appstate expired",
  "appstate expired",
  "appstate die",
  "c_user/i_user cookie not found",
  "không tìm thấy cookie",
  "login",
] as const;

function isSessionExpiredError(msg: string): boolean {
  const lower = msg.toLowerCase();
  return SESSION_EXPIRED_HINTS.some(h => lower.includes(h.toLowerCase()));
}

const BASE_DELAY_MS = 5_000;
const MAX_DELAY_MS  = 5 * 60_000;
const MAX_ATTEMPTS  = 10;
const STABLE_MS     = 30_000;
const FATAL_ERRORS  = new Set([1357004, 1357031, 1357045]);

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

export class AkiTransport implements ISystem {
  readonly name: string;

  private appState:       FcaCookie[];
  private currentState:   FcaCookie[] = [];
  private readonly initDelayMs:      number;
  private readonly proactiveMs:      number;

  private api:            FcaApi | null = null;
  private stopListenFn:   (() => void) | null = null;
  private running         = false;
  private loginAttempts   = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private proactiveTimer: ReturnType<typeof setInterval> | null = null;
  private listenerStartMs = 0;
  private lastConnectedAt: number | null = null;
  private totalReconnects = 0;

  private eventHandler:     AkiEventHandler | null = null;
  private onPermFailure:    ((reason: string) => void) | null = null;
  private onAppStateRefresh:((cookies: FcaCookie[]) => void) | null = null;

  private listenerGeneration = 0;
  private readonly seenMsgIds: string[] = [];

  constructor(
    rawAppState: FcaCookie[],
    systemName  = "aki-connection",
    opts: AkiTransportOptions = {},
  ) {
    this.name         = systemName;
    this.initDelayMs  = opts.initDelayMs        ?? 0;
    this.proactiveMs  = opts.proactiveRestartMs ?? 30 * 60_000;
    this.appState     = AkiTransport.filterAppState(rawAppState);

    log.info(`[${systemName}]: AppState — ${rawAppState.length} → ${this.appState.length} essential cookies (Goatbot filter).`);
  }

  static filterAppState(cookies: FcaCookie[]): FcaCookie[] {
    return cookies.filter(c => GOATBOT_ESSENTIAL_KEYS.has(c.key));
  }

  setEventHandler(fn: AkiEventHandler): void    { this.eventHandler      = fn; }
  setOnPermanentFailure(fn: (r: string) => void): void { this.onPermFailure = fn; }
  setOnAppStateRefresh(fn: (c: FcaCookie[]) => void): void { this.onAppStateRefresh = fn; }

  getApi(): FcaApi | null { return this.api; }
  isConnected(): boolean  { return this.api !== null && this.running; }
  isRunning():   boolean  { return this.running; }

  getCurrentUserId(): string {
    const c = this.appState.find(c => c.key === "c_user");
    return c?.value ?? "";
  }

  getStats(): Record<string, unknown> {
    return {
      name:            this.name,
      running:         this.running,
      connected:       this.api !== null,
      loginAttempts:   this.loginAttempts,
      totalReconnects: this.totalReconnects,
      lastConnectedAt: this.lastConnectedAt,
    };
  }

  async initialize(): Promise<void> {
    log.info(`[${this.name}]: initializing AkiTransport (Sixsu+Nejin hybrid)…`);
    this.running = true;
    this.rewireEventHandler();

    if (this.initDelayMs > 0) {
      log.info(`[${this.name}]: startup delay ${this.initDelayMs}ms (multi-account stagger)…`);
      await sleep(this.initDelayMs);
    }

    await this.doLogin();
    this.startProactiveRestart();
  }

  async destroy(): Promise<void> {
    log.info(`[${this.name}]: destroying.`);
    this.running = false;
    this.stopProactiveRestart();
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this.stopListening();
    if (this.api) { try { this.api.logout(); } catch { /**/ } this.api = null; }
    this.stopProtection();
  }

  async restart(freshAppState?: FcaCookie[]): Promise<void> {
    log.info(`[${this.name}]: manual restart requested.`);
    this.listenerGeneration++;
    this.stopListening();
    if (this.api) { try { this.api.logout(); } catch { /**/ } this.api = null; }
    this.stopProtection();

    if (freshAppState?.length) {
      this.currentState = freshAppState;
      log.info(`[${this.name}]: using ${freshAppState.length} fresh cookies for restart.`);
    }
    this.loginAttempts = 0;
    this.running       = true;
    this.rewireEventHandler();
    await this.doLogin();
  }

  private rewireEventHandler(): void {
    const gen = ++this.listenerGeneration;
    log.debug(`[${this.name}]: rewired event handler (generation ${gen}).`);
  }

  private doLogin(): Promise<void> {
    return new Promise<void>((resolve) => {
      const stateToUse = this.currentState.length > 0 ? this.currentState : this.appState;

      log.info(`[${this.name}]: logging in with Djamel-FCA…`, {
        attempt: this.loginAttempts + 1,
        cookies: stateToUse.length,
      });

      let resolved = false;

      /* eslint-disable @typescript-eslint/no-var-requires */
      const DjamelFCA = require(path.resolve(process.cwd(), "fca")) as (
        opts:     { appState: FcaCookie[] },
        callback: (err: Error | null, api: FcaApi | null, extras?: { appState?: FcaCookie[] }) => void,
      ) => void;
      /* eslint-enable @typescript-eslint/no-var-requires */

      DjamelFCA({ appState: stateToUse }, (err, api, extras) => {
        if (resolved) return;

        if (err || !api) {
          const errMsg = err instanceof Error ? err.message
            : (err != null ? JSON.stringify(err) : "null API returned");

          if (isSessionExpiredError(errMsg)) {
            log.error(`[${this.name}]: AppState expired — stopping. [permanent-failure]`, { error: errMsg });
            this.running = false;
            resolved = true; resolve();
            this.onPermFailure?.("appstate-expired");
            return;
          }

          diagnosticMonitor.recordLogin(this.name, false, { error: errMsg, attempt: this.loginAttempts + 1 });
          log.warn(`[${this.name}]: login failed.`, { error: errMsg });
          resolved = true; resolve();
          this.scheduleReLogin("login-error");
          return;
        }

        this.api = api;
        this.lastConnectedAt = Date.now();
        this.totalReconnects++;

        api.setOptions({
          listenEvents:         true,
          selfListen:           false,
          updatePresence:       false,
          forceLogin:           false,
          userAgent:            "Mozilla/5.0 (Linux; Android 12; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36",
          autoMarkDelivered:    false,
          autoMarkRead:         false,
          logLevel:             "silent",
        });

        const freshCookies = extras?.appState ?? api.getAppState();
        if (freshCookies?.length) {
          this.currentState = freshCookies;
          this.onAppStateRefresh?.(freshCookies);
          log.info(`[${this.name}]: AppState refreshed (${freshCookies.length} cookies).`);
        }

        diagnosticMonitor.recordLogin(this.name, true, {
          userId: api.getCurrentUserID(),
          attempt: this.loginAttempts + 1,
        });

        log.info(`[${this.name}]: logged in. [listener-start]`, {
          userId:          api.getCurrentUserID(),
          totalReconnects: this.totalReconnects,
        });

        this.initGoatbotGlobals(api);
        this.startProtection(api);
        this.loginAttempts = 0;

        resolved = true;
        this.startListening();
        resolve();
      });
    });
  }

  private startListening(): void {
    if (!this.api) return;

    log.info(`[${this.name}]: starting MQTT listener…`);
    this.listenerStartMs = Date.now();
    const capturedGen    = this.listenerGeneration;
    diagnosticMonitor.recordMqttConnect(this.name);

    this.stopListenFn = this.api.listen((err, event) => {
      if (capturedGen !== this.listenerGeneration) return;

      if (err) {
        const stableMs = Date.now() - this.listenerStartMs;
        const errCode  = (err as unknown as Record<string, unknown>)["error"] as number | undefined;
        const errMsg   = err.message ?? JSON.stringify(err);

        this.api = null;
        this.stopListening();
        diagnosticMonitor.recordMqttDisconnect(this.name, { errorCode: errCode, errorMsg: errMsg, stableMs });
        log.warn(`[${this.name}]: MQTT error — scheduling re-login.`, { error: errMsg, stableMs });

        if (errCode !== undefined && FATAL_ERRORS.has(errCode) && this.loginAttempts >= 2) {
          log.error(`[${this.name}]: fatal FB error ${errCode} persists — stopping. [permanent-failure]`);
          this.running = false;
          this.onPermFailure?.(`fatal-fb-error-${errCode}`);
          return;
        }

        if (stableMs >= STABLE_MS) this.loginAttempts = 0;
        this.scheduleReLogin("listen-error");
        return;
      }

      if (!this.running || !event) return;

      global.lastMqttActivity = Date.now();

      const msgId = (event as Record<string, unknown>)["messageID"] as string | undefined;
      if (msgId) {
        if (this.seenMsgIds.includes(msgId)) {
          log.debug(`[${this.name}]: dedup drop (storage5Message) — ${msgId}.`);
          if (capturedGen === this.listenerGeneration) this.listenerGeneration++;
          return;
        }
        this.seenMsgIds.push(msgId);
        if (this.seenMsgIds.length > 5) this.seenMsgIds.shift();
      }

      try { this.eventHandler?.(event); } catch (handlerErr: unknown) {
        log.error(`[${this.name}]: event handler threw.`, {
          error: handlerErr instanceof Error ? handlerErr.message : String(handlerErr),
        });
      }
    });

    log.info(`[${this.name}]: MQTT listener active (gen=${capturedGen}). [listener-active]`);
  }

  private stopListening(): void {
    if (this.stopListenFn) {
      try { this.stopListenFn(); } catch { /**/ }
      this.stopListenFn = null;
      log.info(`[${this.name}]: listener stopped.`);
    }
  }

  private scheduleReLogin(reason: string): void {
    if (!this.running) return;
    this.loginAttempts++;
    diagnosticMonitor.recordReconnect(this.name, reason, this.loginAttempts);

    if (this.loginAttempts > MAX_ATTEMPTS) {
      log.warn(`[${this.name}]: max login attempts reached — stopping. [permanent-failure]`, { reason });
      this.running = false;
      this.onPermFailure?.("max-login-attempts");
      return;
    }

    const delay = Math.min(BASE_DELAY_MS * Math.pow(2, this.loginAttempts - 1), MAX_DELAY_MS);
    log.info(`[${this.name}]: re-login in ${delay}ms.`, { reason, attempt: this.loginAttempts });

    if (this.api) { try { this.api.logout(); } catch { /**/ } this.api = null; }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.running) return;
      this.rewireEventHandler();
      this.doLogin().catch((e: unknown) => {
        log.error(`[${this.name}]: re-login threw.`, { error: String(e) });
      });
    }, delay);
  }

  private startProactiveRestart(): void {
    if (!this.proactiveMs) return;
    this.proactiveTimer = setInterval(async () => {
      log.info(`[${this.name}]: proactive MQTT restart (30-min Goatbot pattern).`);
      this.listenerGeneration++;
      this.stopListening();
      if (this.api) { try { this.api.logout(); } catch { /**/ } this.api = null; }
      this.stopProtection();
      this.rewireEventHandler();
      await this.doLogin();
    }, this.proactiveMs);
  }

  private stopProactiveRestart(): void {
    if (this.proactiveTimer) { clearInterval(this.proactiveTimer); this.proactiveTimer = null; }
  }

  private initGoatbotGlobals(api: FcaApi): void {
    const uid = api.getCurrentUserID();
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
        reLoginBot:     () => this.restart().catch(() => {}),
        _replyTimeout:  30 * 60 * 1000,
      };
    } else {
      global.GoatBot.fcaApi = api;
      global.GoatBot.botID  = uid;
      global.GoatBot.reLoginBot = () => this.restart().catch(() => {});
    }
    global.api = api;
    global.lastMqttActivity = Date.now();
    log.info(`[${this.name}]: GoatBot globals initialized (botID=${uid}).`);
  }

  private startProtection(api: FcaApi): void {
    const layers = [
      "stealth", "keepAlive", "mqttHealthCheck", "humanTyping",
      "naturalPresence", "behaviorScheduler", "sessionRefresher",
      "Uprotection",
    ];

    for (const layer of layers) {
      try {
        const mod = require(path.resolve(process.cwd(), "src/protection", layer)) as {
          start?:            (api: FcaApi) => void;
          startHealthCheck?: () => void;
          startSession?:     () => void;
        };
        if (typeof mod.start            === "function") mod.start(api);
        if (typeof mod.startHealthCheck === "function") mod.startHealthCheck();
        if (typeof mod.startSession     === "function") mod.startSession();
      } catch (e) {
        log.warn(`[${this.name}]: protection layer "${layer}" failed to start — skipping.`, {
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    log.info(`[${this.name}]: protection layers started (${layers.length} layers).`);
  }

  private stopProtection(): void {
    const layers = [
      "stealth", "keepAlive", "mqttHealthCheck", "humanTyping",
      "naturalPresence", "behaviorScheduler", "sessionRefresher",
      "Uprotection",
    ];

    for (const layer of layers) {
      try {
        const mod = require(path.resolve(process.cwd(), "src/protection", layer)) as {
          stop?:            () => void;
          stopHealthCheck?: () => void;
        };
        if (typeof mod.stop            === "function") mod.stop();
        if (typeof mod.stopHealthCheck === "function") mod.stopHealthCheck();
      } catch { /**/ }
    }
  }
}

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
  var api:                FcaApi | undefined;
  // eslint-disable-next-line no-var
  var lastMqttActivity:   number | undefined;
  // eslint-disable-next-line no-var
  var config:             Record<string, unknown> | undefined;
}
