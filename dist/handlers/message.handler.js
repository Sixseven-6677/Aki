"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageHandler = void 0;
exports.createMessageHandler = createMessageHandler;
exports.getMessageHandler = getMessageHandler;
exports.handleMessage = handleMessage;
const LoggerManager_1 = require("../logger/LoggerManager");
const log = LoggerManager_1.LoggerManager.getLogger("MessageHandler");
// ─── MessageHandler class ─────────────────────────────────────────────────────
class MessageHandler {
    pipeline;
    registry;
    scheduler;
    reconnectManager;
    banStore;
    userService;
    constructor(pipeline, registry, scheduler, reconnectManager, banStore, userService) {
        this.pipeline = pipeline;
        this.registry = registry;
        this.scheduler = scheduler;
        this.reconnectManager = reconnectManager;
        this.banStore = banStore;
        this.userService = userService;
    }
    get commandPipeline() { return this.pipeline; }
    get commandRegistry() { return this.registry; }
    get taskScheduler() { return this.scheduler; }
    get reconnect() { return this.reconnectManager; }
    get bans() { return this.banStore; }
    get users() { return this.userService; }
    handle = async (ctx) => {
        const msgType = ctx.message.isPostback
            ? "postback"
            : ctx.message.attachments.length > 0
                ? "attachment"
                : ctx.message.text
                    ? "text"
                    : "empty";
        log.info("MessageHandler: routing message.", {
            userId: ctx.user.id,
            role: ctx.user.role,
            msgType,
            text: (ctx.message.text ?? "").slice(0, 80),
            attachmentCount: ctx.message.attachments.length,
            postbackPayload: ctx.message.postbackPayload?.slice(0, 80),
        });
        if (ctx.message.isPostback) {
            await this.handlePostback(ctx);
            return;
        }
        if (ctx.message.attachments.length > 0) {
            log.debug("MessageHandler: attachment received — ignoring.", {
                userId: ctx.user.id,
                types: ctx.message.attachments.map((a) => a.type),
            });
            return;
        }
        if (ctx.message.text) {
            await this.handleText(ctx);
            return;
        }
        log.debug("MessageHandler: message has no actionable content — skipping.", {
            userId: ctx.user.id,
        });
    };
    async handleText(ctx) {
        log.info("MessageHandler: entering command pipeline.", {
            userId: ctx.user.id,
            commandName: ctx.commandName ?? "(none)",
            text: (ctx.message.text ?? "").slice(0, 80),
        });
        await this.pipeline.run(ctx);
    }
    async handlePostback(ctx) {
        log.info("MessageHandler: postback received.", {
            userId: ctx.user.id,
            payload: ctx.message.postbackPayload,
        });
        await ctx.reply(`Postback: ${ctx.message.postbackPayload}`);
    }
}
exports.MessageHandler = MessageHandler;
// ─── Backward-compat singleton wiring (used by index.ts during transition) ───
// These will be removed once index.ts is decomposed into bootstrap/ modules.
let _handler;
function createMessageHandler(pipeline, registry, scheduler, reconnectManager, banStore, userService) {
    _handler = new MessageHandler(pipeline, registry, scheduler, reconnectManager, banStore, userService);
    return _handler;
}
function getMessageHandler() {
    if (!_handler)
        throw new Error("MessageHandler not initialised — call createMessageHandler() first.");
    return _handler;
}
/** Entry point for FCA event adapter (bound to handler.handle) */
async function handleMessage(ctx) {
    if (!_handler) {
        log.warn("MessageHandler: not initialised — dropping message.", { userId: ctx.user.id });
        return;
    }
    return _handler.handle(ctx);
}
