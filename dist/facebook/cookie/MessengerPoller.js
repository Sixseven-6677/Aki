"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessengerPoller = void 0;
const LoggerManager_1 = require("../../logger/LoggerManager");
const log = LoggerManager_1.LoggerManager.getLogger("MessengerPoller");
// ─── fca-unofficial types (no @types package exists) ─────────────────────────
/* eslint-disable @typescript-eslint/no-var-requires */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fcaLogin = require("fca-unofficial");
/**
 * Listens for new Messenger messages in real-time using fca-unofficial.
 *
 * fca-unofficial connects to Facebook's MQTT/WebSocket broker (the same
 * channel the Messenger web app uses), which is far more reliable than
 * REST polling.  It requires only the AppState cookie array — no Page
 * Access Token or Developer app needed.
 *
 * Lifecycle:
 *   initialize() → login to Facebook via fca-unofficial, start listening
 *   destroy()    → stop listening + logout
 */
class MessengerPoller {
    name = "messenger-poller";
    client;
    userId;
    handler = null;
    api = null;
    stopFn = null;
    running = false;
    constructor(client) {
        this.client = client;
        this.userId = client.getUserId();
    }
    setHandler(handler) {
        this.handler = handler;
    }
    async initialize() {
        this.running = true;
        log.info("MessengerPoller initializing via fca-unofficial…", {
            userId: this.userId,
        });
        return new Promise((resolve) => {
            const appState = this.client.getRawAppState();
            fcaLogin({ appState }, (err, api) => {
                if (err) {
                    log.warn("fca-unofficial login failed.", {
                        error: err.message,
                    });
                    // Resolve (don't reject) — bot still works for sending,
                    // just won't receive messages via this listener.
                    resolve();
                    return;
                }
                if (!api) {
                    log.warn("fca-unofficial returned null API — skipping listener.");
                    resolve();
                    return;
                }
                this.api = api;
                log.info("fca-unofficial logged in, starting listener.", {
                    userId: api.getCurrentUserID(),
                });
                this.stopFn = api.listen((listenErr, event) => {
                    if (listenErr) {
                        log.warn("fca-unofficial listen error.", { error: listenErr.message });
                        return;
                    }
                    if (!event)
                        return;
                    if (!this.running)
                        return;
                    this.handleEvent(event);
                });
                resolve();
            });
        });
    }
    async destroy() {
        this.running = false;
        if (this.stopFn) {
            try {
                this.stopFn();
            }
            catch { /* ignore */ }
            this.stopFn = null;
        }
        if (this.api) {
            try {
                this.api.logout();
            }
            catch { /* ignore */ }
            this.api = null;
        }
        log.info("MessengerPoller stopped.");
    }
    // ─── Event handling ───────────────────────────────────────────────────────
    handleEvent(event) {
        // Only handle incoming messages (not typing, read receipts, etc.)
        if (event.type !== "message" && event.type !== "message_reply")
            return;
        // Ignore messages sent by the bot itself
        if (event.senderID === this.userId)
            return;
        // Must have text or attachments
        if (!event.body && !event.attachments?.length)
            return;
        const ts = parseInt(event.timestamp, 10);
        const attachments = (event.attachments ?? [])
            .map(a => ({
            type: this.guessType(a.type),
            payload: { url: a.url ?? a.previewUrl },
        }));
        const entry = {
            sender: { id: event.senderID },
            recipient: { id: this.userId },
            timestamp: ts,
            message: {
                mid: event.messageID,
                text: event.body,
                attachments: attachments,
            },
        };
        log.info("New message received via fca-unofficial.", {
            from: event.senderID,
            thread: event.threadID,
            isGroup: event.isGroup,
            text: (event.body ?? "").slice(0, 100),
            attachments: attachments.length,
        });
        if (this.handler) {
            this.handler([entry]);
        }
    }
    guessType(fcaType) {
        switch (fcaType) {
            case "photo": return "image";
            case "video": return "video";
            case "audio": return "audio";
            default: return "file";
        }
    }
}
exports.MessengerPoller = MessengerPoller;
