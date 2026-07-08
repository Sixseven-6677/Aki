"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AkiTransport = void 0;
const path_1 = __importDefault(require("path"));
const LoggerManager_1 = require("../logger/LoggerManager");
const DiagnosticMonitor_1 = require("../diagnostic/DiagnosticMonitor");
const log = LoggerManager_1.LoggerManager.getLogger("AkiTransport");
const GOATBOT_ESSENTIAL_KEYS = new Set(["c_user", "xs", "datr", "fr", "sb", "i_user"]);
const SESSION_EXPIRED_HINTS = [
    "fb_appstate expired",
    "appstate expired",
    "appstate die",
    "c_user/i_user cookie not found",
    "không tìm thấy cookie",
    "login",
];
function isSessionExpiredError(msg) {
    const lower = msg.toLowerCase();
    return SESSION_EXPIRED_HINTS.some(h => lower.includes(h.toLowerCase()));
}
const BASE_DELAY_MS = 5_000;
const MAX_DELAY_MS = 5 * 60_000;
const MAX_ATTEMPTS = 10;
const STABLE_MS = 30_000;
const FATAL_ERRORS = new Set([1357004, 1357031, 1357045]);
function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}
class AkiTransport {
    name;
    appState;
    currentState = [];
    initDelayMs;
    proactiveMs;
    api = null;
    stopListenFn = null;
    running = false;
    loginAttempts = 0;
    reconnectTimer = null;
    proactiveTimer = null;
    listenerStartMs = 0;
    lastConnectedAt = null;
    totalReconnects = 0;
    eventHandler = null;
    onPermFailure = null;
    onAppStateRefresh = null;
    listenerGeneration = 0;
    seenMsgIds = [];
    rawListeners = new Set();
    constructor(rawAppState, systemName = "aki-connection", opts = {}) {
        this.name = systemName;
        this.initDelayMs = opts.initDelayMs ?? 0;
        this.proactiveMs = opts.proactiveRestartMs ?? 30 * 60_000;
        this.appState = AkiTransport.filterAppState(rawAppState);
        log.info(`[${systemName}]: AppState — ${rawAppState.length} → ${this.appState.length} essential cookies (Goatbot filter).`);
    }
    static filterAppState(cookies) {
        return cookies.filter(c => GOATBOT_ESSENTIAL_KEYS.has(c.key));
    }
    setEventHandler(fn) { this.eventHandler = fn; }
    addRawEventListener(fn) { this.rawListeners.add(fn); }
    removeRawEventListener(fn) { this.rawListeners.delete(fn); }
    setOnPermanentFailure(fn) { this.onPermFailure = fn; }
    setOnAppStateRefresh(fn) { this.onAppStateRefresh = fn; }
    getApi() { return this.api; }
    isConnected() { return this.api !== null && this.running; }
    isRunning() { return this.running; }
    getCurrentUserId() {
        const c = this.appState.find(c => c.key === "c_user");
        return c?.value ?? "";
    }
    getStats() {
        return {
            name: this.name,
            running: this.running,
            connected: this.api !== null,
            loginAttempts: this.loginAttempts,
            totalReconnects: this.totalReconnects,
            lastConnectedAt: this.lastConnectedAt,
        };
    }
    async initialize() {
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
    async destroy() {
        log.info(`[${this.name}]: destroying.`);
        this.running = false;
        this.stopProactiveRestart();
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.stopListening();
        if (this.api) {
            try {
                this.api.logout();
            }
            catch { /**/ }
            this.api = null;
        }
        this.stopProtection();
    }
    async restart(freshAppState) {
        log.info(`[${this.name}]: manual restart requested.`);
        this.listenerGeneration++;
        this.stopListening();
        if (this.api) {
            try {
                this.api.logout();
            }
            catch { /**/ }
            this.api = null;
        }
        this.stopProtection();
        if (freshAppState?.length) {
            this.currentState = freshAppState;
            log.info(`[${this.name}]: using ${freshAppState.length} fresh cookies for restart.`);
        }
        this.loginAttempts = 0;
        this.running = true;
        this.rewireEventHandler();
        await this.doLogin();
    }
    rewireEventHandler() {
        const gen = ++this.listenerGeneration;
        log.debug(`[${this.name}]: rewired event handler (generation ${gen}).`);
    }
    doLogin() {
        return new Promise((resolve) => {
            const stateToUse = this.currentState.length > 0 ? this.currentState : this.appState;
            log.info(`[${this.name}]: logging in with Djamel-FCA…`, {
                attempt: this.loginAttempts + 1,
                cookies: stateToUse.length,
            });
            let resolved = false;
            /* eslint-disable @typescript-eslint/no-var-requires */
            const DjamelFCA = require(path_1.default.resolve(process.cwd(), "fca"));
            /* eslint-enable @typescript-eslint/no-var-requires */
            DjamelFCA(stateToUse, (err, api, extras) => {
                if (resolved)
                    return;
                if (err || !api) {
                    const errMsg = err instanceof Error ? err.message
                        : (err != null ? JSON.stringify(err) : "null API returned");
                    if (isSessionExpiredError(errMsg)) {
                        log.error(`[${this.name}]: AppState expired — stopping. [permanent-failure]`, { error: errMsg });
                        this.running = false;
                        resolved = true;
                        resolve();
                        this.onPermFailure?.("appstate-expired");
                        return;
                    }
                    DiagnosticMonitor_1.diagnosticMonitor.recordLogin(this.name, false, { error: errMsg, attempt: this.loginAttempts + 1 });
                    log.warn(`[${this.name}]: login failed.`, { error: errMsg });
                    resolved = true;
                    resolve();
                    this.scheduleReLogin("login-error");
                    return;
                }
                this.api = api;
                this.lastConnectedAt = Date.now();
                this.totalReconnects++;
                api.setOptions({
                    listenEvents: true,
                    selfListen: false,
                    updatePresence: false,
                    forceLogin: false,
                    userAgent: "Mozilla/5.0 (Linux; Android 12; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36",
                    autoMarkDelivered: false,
                    autoMarkRead: false,
                    logLevel: "silent",
                });
                const freshCookies = extras?.appState ?? api.getAppState();
                if (freshCookies?.length) {
                    this.currentState = freshCookies;
                    this.onAppStateRefresh?.(freshCookies);
                    log.info(`[${this.name}]: AppState refreshed (${freshCookies.length} cookies).`);
                }
                DiagnosticMonitor_1.diagnosticMonitor.recordLogin(this.name, true, {
                    userId: api.getCurrentUserID(),
                    attempt: this.loginAttempts + 1,
                });
                log.info(`[${this.name}]: logged in. [listener-start]`, {
                    userId: api.getCurrentUserID(),
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
    startListening() {
        if (!this.api)
            return;
        log.info(`[${this.name}]: starting MQTT listener…`);
        this.listenerStartMs = Date.now();
        DiagnosticMonitor_1.diagnosticMonitor.recordMqttConnect(this.name);
        const handleError = (err) => {
            if (!this.running)
                return;
            const stableMs = Date.now() - this.listenerStartMs;
            const errCode = err["error"];
            const errMsg = err?.message ?? JSON.stringify(err);
            this.api = null;
            this.stopListening();
            DiagnosticMonitor_1.diagnosticMonitor.recordMqttDisconnect(this.name, { errorCode: errCode, errorMsg: errMsg, stableMs });
            log.warn(`[${this.name}]: MQTT error — scheduling re-login.`, { error: errMsg, stableMs });
            if (errCode !== undefined && FATAL_ERRORS.has(errCode) && this.loginAttempts >= 2) {
                log.error(`[${this.name}]: fatal FB error ${errCode} persists — stopping. [permanent-failure]`);
                this.running = false;
                this.onPermFailure?.(`fatal-fb-error-${errCode}`);
                return;
            }
            if (stableMs >= STABLE_MS)
                this.loginAttempts = 0;
            this.scheduleReLogin("listen-error");
        };
        const handleEvent = (event) => {
            if (!this.running || !event)
                return;
            global.lastMqttActivity = Date.now();
            const evType = event["type"];
            log.info(`[${this.name}]: raw FCA event received.`, { type: evType });
            const msgId = event["messageID"];
            if (msgId) {
                if (this.seenMsgIds.includes(msgId)) {
                    log.debug(`[${this.name}]: dedup drop — ${msgId}.`);
                    return;
                }
                this.seenMsgIds.push(msgId);
                if (this.seenMsgIds.length > 5)
                    this.seenMsgIds.shift();
            }
            for (const fn of this.rawListeners) {
                try {
                    fn(event);
                }
                catch { /* ignore */ }
            }
            try {
                this.eventHandler?.(event);
            }
            catch (handlerErr) {
                log.error(`[${this.name}]: event handler threw.`, {
                    error: handlerErr instanceof Error ? handlerErr.message : String(handlerErr),
                });
            }
        };
        // Support both v3 (callback returns stop-fn) and v4 (returns MessageEmitter with stopListening())
        const listenResult = this.api.listen((err, event) => {
            if (err) {
                handleError(err);
                return;
            }
            handleEvent(event);
        });
        // v4: listenResult is a MessageEmitter — also wire EventEmitter events as fallback
        if (listenResult && typeof listenResult.on === "function") {
            const emitter = listenResult;
            const emitTypes = ["message", "message_reply", "event", "typ", "read", "read_receipt"];
            emitTypes.forEach(evName => {
                emitter.on(evName, (e) => handleEvent(e));
            });
            emitter.on("error", (e) => handleError(e));
            log.info(`[${this.name}]: v4 EventEmitter listeners attached.`);
            this.stopListenFn = () => {
                if (typeof emitter.stopListening === "function") {
                    try {
                        emitter.stopListening(() => { });
                    }
                    catch { /* ignore */ }
                }
            };
        }
        else if (typeof listenResult === "function") {
            // v3: returns stop function directly
            this.stopListenFn = listenResult;
        }
        else {
            this.stopListenFn = null;
        }
        log.info(`[${this.name}]: MQTT listener active. [listener-active]`);
    }
    stopListening() {
        if (this.stopListenFn) {
            try {
                this.stopListenFn();
            }
            catch { /**/ }
            this.stopListenFn = null;
            log.info(`[${this.name}]: listener stopped.`);
        }
    }
    scheduleReLogin(reason) {
        if (!this.running)
            return;
        this.loginAttempts++;
        DiagnosticMonitor_1.diagnosticMonitor.recordReconnect(this.name, reason, this.loginAttempts);
        if (this.loginAttempts > MAX_ATTEMPTS) {
            log.warn(`[${this.name}]: max login attempts reached — stopping. [permanent-failure]`, { reason });
            this.running = false;
            this.onPermFailure?.("max-login-attempts");
            return;
        }
        const delay = Math.min(BASE_DELAY_MS * Math.pow(2, this.loginAttempts - 1), MAX_DELAY_MS);
        log.info(`[${this.name}]: re-login in ${delay}ms.`, { reason, attempt: this.loginAttempts });
        if (this.api) {
            try {
                this.api.logout();
            }
            catch { /**/ }
            this.api = null;
        }
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            if (!this.running)
                return;
            this.rewireEventHandler();
            this.doLogin().catch((e) => {
                log.error(`[${this.name}]: re-login threw.`, { error: String(e) });
            });
        }, delay);
    }
    startProactiveRestart() {
        if (!this.proactiveMs)
            return;
        this.proactiveTimer = setInterval(async () => {
            log.info(`[${this.name}]: proactive MQTT restart (30-min Goatbot pattern).`);
            this.listenerGeneration++;
            this.stopListening();
            if (this.api) {
                try {
                    this.api.logout();
                }
                catch { /**/ }
                this.api = null;
            }
            this.stopProtection();
            this.rewireEventHandler();
            await this.doLogin();
        }, this.proactiveMs);
    }
    stopProactiveRestart() {
        if (this.proactiveTimer) {
            clearInterval(this.proactiveTimer);
            this.proactiveTimer = null;
        }
    }
    initGoatbotGlobals(api) {
        const uid = api.getCurrentUserID();
        if (!global.GoatBot) {
            global.GoatBot = {
                startTime: Date.now(),
                config: global.config ?? {},
                commands: new Map(),
                eventCommands: new Map(),
                aliases: new Map(),
                onChat: [],
                onReply: new Map(),
                onReaction: new Map(),
                onEvent: [],
                fcaApi: api,
                botID: uid,
                angelIntervals: {},
                divelWatchers: {},
                nmLocks: new Map(),
                dmLocked: false,
                allThreadData: {},
                reLoginBot: () => this.restart().catch(() => { }),
                _replyTimeout: 30 * 60 * 1000,
            };
        }
        else {
            global.GoatBot.fcaApi = api;
            global.GoatBot.botID = uid;
            global.GoatBot.reLoginBot = () => this.restart().catch(() => { });
        }
        global.api = api;
        global.lastMqttActivity = Date.now();
        log.info(`[${this.name}]: GoatBot globals initialized (botID=${uid}).`);
    }
    startProtection(api) {
        const layers = [
            "stealth", "keepAlive", "mqttHealthCheck", "humanTyping",
            "naturalPresence", "behaviorScheduler", "sessionRefresher",
            "Uprotection",
        ];
        for (const layer of layers) {
            try {
                const mod = require(path_1.default.resolve(process.cwd(), "src/protection", layer));
                if (typeof mod.start === "function")
                    mod.start(api);
                if (typeof mod.startHealthCheck === "function")
                    mod.startHealthCheck();
                if (typeof mod.startSession === "function")
                    mod.startSession();
            }
            catch (e) {
                log.warn(`[${this.name}]: protection layer "${layer}" failed to start — skipping.`, {
                    error: e instanceof Error ? e.message : String(e),
                });
            }
        }
        log.info(`[${this.name}]: protection layers started (${layers.length} layers).`);
    }
    stopProtection() {
        const layers = [
            "stealth", "keepAlive", "mqttHealthCheck", "humanTyping",
            "naturalPresence", "behaviorScheduler", "sessionRefresher",
            "Uprotection",
        ];
        for (const layer of layers) {
            try {
                const mod = require(path_1.default.resolve(process.cwd(), "src/protection", layer));
                if (typeof mod.stop === "function")
                    mod.stop();
                if (typeof mod.stopHealthCheck === "function")
                    mod.stopHealthCheck();
            }
            catch { /**/ }
        }
    }
}
exports.AkiTransport = AkiTransport;
