"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bootstrapFacebook = bootstrapFacebook;
const env_1 = require("../config/env");
const FacebookConnection_1 = require("../facebook/FacebookConnection");
const FacebookEventNormalizer_1 = require("../facebook/FacebookEventNormalizer");
const FacebookGateway_1 = require("../facebook/FacebookGateway");
const AkiTransport_1 = require("../facebook/AkiTransport");
const AkiSender_1 = require("../facebook/AkiSender");
const FcaEventAdapter_1 = require("../facebook/FcaEventAdapter");
const HumanBehaviorSender_1 = require("../facebook/HumanBehaviorSender");
const message_handler_1 = require("../handlers/message.handler");
const group_handler_1 = require("../handlers/group.handler");
const LoggerManager_1 = require("../logger/LoggerManager");
const log = LoggerManager_1.LoggerManager.getLogger("Boot.Facebook");
function getUserIdFromAppState(appState) {
    try {
        const cookies = appState;
        return cookies.find(c => (c.key ?? c.name) === "c_user")?.value ?? "";
    }
    catch {
        return "";
    }
}
function bootAccount(opts) {
    const { label, credentials, userSvc, adminStore, bot, isPrimary, startupDelayMs, auth, sessionManager } = opts;
    const botUserId = getUserIdFromAppState(credentials.appState);
    const systemName = isPrimary ? "aki-connection" : `aki-connection-${label}`;
    const transport = new AkiTransport_1.AkiTransport(credentials.appState, systemName, { initDelayMs: startupDelayMs, proactiveRestartMs: 30 * 60_000 });
    const sender = new HumanBehaviorSender_1.HumanBehaviorSender(new AkiSender_1.AkiSender(transport));
    log.info(`Account [${label}]: AkiTransport created.`, { botUserId, systemName });
    if (isPrimary) {
        (0, group_handler_1.setGroupSender)(sender);
        (0, group_handler_1.setGroupBotUserId)(botUserId);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (0, group_handler_1.setGroupApiGetter)(() => transport.getApi());
    }
    const gateway = new FacebookGateway_1.FacebookGateway(new FacebookConnection_1.FacebookConnection(), sender, new FacebookEventNormalizer_1.FacebookEventNormalizer(), env_1.config.bot.ownerIds, adminStore, userSvc);
    const adapter = new FcaEventAdapter_1.FcaEventAdapter(botUserId);
    const accountSender = sender;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const accountApiGetter = () => transport.getApi();
    transport.setEventHandler((fcaEvent) => {
        const entries = adapter.adapt(fcaEvent);
        for (const entry of entries) {
            gateway.processWebhookBody({
                object: "page",
                entry: [{
                        id: botUserId,
                        time: entry.timestamp,
                        messaging: [entry],
                    }],
            }, message_handler_1.handleMessage, {
                onMemberJoined: (evt) => (0, group_handler_1.handleMemberJoined)(evt, accountSender),
                onMemberLeft: (evt) => (0, group_handler_1.handleMemberLeft)(evt, accountSender),
                onNameChanged: (evt) => (0, group_handler_1.handleNameChanged)(evt, accountApiGetter),
                onNicknameChanged: (evt) => (0, group_handler_1.handleNicknameChanged)(evt, accountApiGetter),
            });
        }
    });
    transport.setOnAppStateRefresh((freshCookies) => {
        auth.updateAppState(label, freshCookies);
        sessionManager.saveSession(label).catch((err) => {
            log.warn(`[${label}] Failed to persist refreshed AppState.`, {
                error: err instanceof Error ? err.message : String(err),
            });
        });
    });
    transport.setOnPermanentFailure((reason) => {
        log.error(`Transport [${label}]: permanent failure — ${reason}. [permanent-failure]`, { label, reason });
    });
    bot.register(transport);
    log.info(`Account [${label}]: registered with Bot.`, { botUserId });
    return transport;
}
function wireReconnectHooks(transports, reconnect, auth) {
    const map = new Map(transports.map(({ label, transport }) => [label, transport]));
    reconnect.setHealthCheck(async (id) => {
        const t = map.get(id);
        return t ? t.isConnected() : false;
    });
    reconnect.setRestartHook(async (id) => {
        const t = map.get(id);
        if (t) {
            const creds = auth.getCredentials(id);
            log.info(`ReconnectManager → restarting AkiTransport [${id}].`);
            await t.restart(creds?.appState);
        }
    });
    for (const { label, transport: t } of transports) {
        t.setOnPermanentFailure((reason) => {
            log.error(`Transport [${label}]: permanent failure — ${reason}. Triggering ReconnectManager.`);
            reconnect.reconnect(label).catch((err) => {
                log.error(`Forced reconnect threw for [${label}].`, { error: String(err) });
            });
        });
    }
}
function bootstrapFacebook(auth, userSvc, adminStore, bot, reconnect, sessionManager) {
    const transports = [];
    const primaryCreds = auth.getCredentials("primary");
    const secondaryCreds = auth.getCredentials("secondary");
    if (primaryCreds) {
        const t = bootAccount({ label: "primary", credentials: primaryCreds, userSvc, adminStore, bot, isPrimary: true, startupDelayMs: 0, auth, sessionManager });
        transports.push({ label: "primary", transport: t });
    }
    if (secondaryCreds) {
        const t = bootAccount({ label: "secondary", credentials: secondaryCreds, userSvc, adminStore, bot, isPrimary: false, startupDelayMs: 5_000, auth, sessionManager });
        transports.push({ label: "secondary", transport: t });
        log.info("Two accounts active — primary + secondary.");
    }
    if (transports.length === 0) {
        log.warn("No FB_APPSTATE set — health-only mode.");
        const noOp = {
            sendText: async () => { log.warn("NoOpSender: no FB_APPSTATE configured."); },
            sendTyping: async () => { },
            sendReaction: async () => { },
        };
        (0, group_handler_1.setGroupSender)(new HumanBehaviorSender_1.HumanBehaviorSender(noOp));
    }
    if (transports.length > 0)
        wireReconnectHooks(transports, reconnect, auth);
    return transports;
}
