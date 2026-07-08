"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FacebookGateway = void 0;
const ContextBuilder_1 = require("../context/ContextBuilder");
const LoggerManager_1 = require("../logger/LoggerManager");
const log = LoggerManager_1.LoggerManager.getLogger("FacebookGateway");
class FacebookGateway {
    connection;
    normalizer;
    contextBuilder;
    /**
     * @param connection  FacebookConnection instance.
     * @param sender      ISender for outgoing messages.
     * @param normalizer  Event normalizer.
     * @param ownerIds    Owner user IDs — passed to ContextBuilder at construction
     *                    time so no message is ever processed without the owner list.
     * @param adminStore  Live AdminStore reference — passed to ContextBuilder so
     *                    ctx.hasRole("admin") always reflects dynamic admins.
     * @param userService Optional UserService — can be injected later via
     *                    setUserService() if not available at gateway creation.
     */
    constructor(connection, sender, normalizer, ownerIds = [], adminStore = { has: () => false }, userService) {
        this.connection = connection;
        this.normalizer = normalizer;
        this.contextBuilder = new ContextBuilder_1.ContextBuilder(sender, ownerIds, adminStore, userService);
    }
    /** Inject UserService after construction (e.g. when DB is ready). */
    setUserService(svc) {
        this.contextBuilder.setUserService(svc);
    }
    handleVerification(req, res) {
        const { "hub.mode": mode, "hub.verify_token": token, "hub.challenge": challenge, } = req.query;
        const result = this.connection.verifyWebhookChallenge(mode, token, challenge);
        if (result !== null) {
            log.info("Webhook verified.");
            res.status(200).send(result);
            return;
        }
        log.warn("Webhook verification failed.", { mode, token });
        res.status(403).json({ error: "Forbidden" });
    }
    processWebhookBody(body, handler, groupHandlers = {}) {
        if (body.object !== "page")
            return;
        for (const entry of body.entry) {
            for (const messagingEntry of entry.messaging) {
                const event = this.normalizer.normalize(messagingEntry);
                if (event.type === "unknown") {
                    log.warn("Skipping unknown event type.", { raw: messagingEntry });
                    continue;
                }
                log.info("Gateway: event received — starting pipeline.", {
                    type: event.type,
                    senderId: event.senderId,
                    pageId: event.pageId,
                    timestamp: event.timestamp,
                    ...(event.type === "message"
                        ? {
                            messageId: event.messageId,
                            text: event.text?.slice(0, 80),
                            attachments: event.attachments.length,
                        }
                        : event.type === "postback"
                            ? { payload: event.payload?.slice(0, 80) }
                            : event.type === "member_joined"
                                ? { addedByUserId: event.addedByUserId, members: event.members }
                                : event.type === "member_left"
                                    ? { members: event.members }
                                    : event.type === "name_changed"
                                        ? { threadId: event.threadId, newName: event.newName }
                                        : event.type === "nickname_changed"
                                            ? { threadId: event.threadId, participantId: event.participantId }
                                            : {}),
                });
                if (event.type === "member_joined" && groupHandlers.onMemberJoined) {
                    groupHandlers.onMemberJoined(event).catch((err) => {
                        log.error("Unhandled error in member_joined handler.", {
                            senderId: event.senderId,
                            error: err instanceof Error ? err.message : String(err),
                        });
                    });
                    continue;
                }
                if (event.type === "member_left" && groupHandlers.onMemberLeft) {
                    groupHandlers.onMemberLeft(event).catch((err) => {
                        log.error("Unhandled error in member_left handler.", {
                            senderId: event.senderId,
                            error: err instanceof Error ? err.message : String(err),
                        });
                    });
                    continue;
                }
                if (event.type === "name_changed" && groupHandlers.onNameChanged) {
                    groupHandlers.onNameChanged(event).catch((err) => {
                        log.error("Unhandled error in name_changed handler.", {
                            senderId: event.senderId,
                            error: err instanceof Error ? err.message : String(err),
                        });
                    });
                    continue;
                }
                if (event.type === "nickname_changed" && groupHandlers.onNicknameChanged) {
                    groupHandlers.onNicknameChanged(event).catch((err) => {
                        log.error("Unhandled error in nickname_changed handler.", {
                            senderId: event.senderId,
                            error: err instanceof Error ? err.message : String(err),
                        });
                    });
                    continue;
                }
                if (event.type !== "message" && event.type !== "postback")
                    continue;
                const start = Date.now();
                this.contextBuilder
                    .build(event)
                    .then((ctx) => {
                    log.info("Gateway: context created — dispatching to handler.", {
                        senderId: event.senderId,
                        buildMs: Date.now() - start,
                        userId: ctx.user.id,
                        role: ctx.user.role,
                        isNewUser: ctx.user.isNew,
                        text: event.type === "message" ? event.text?.slice(0, 80) : undefined,
                    });
                    return handler(ctx);
                })
                    .catch((err) => {
                    const msg = err instanceof Error ? err.message : String(err);
                    log.error("Unhandled error in message pipeline.", {
                        senderId: event.senderId,
                        error: msg,
                    });
                });
            }
        }
    }
}
exports.FacebookGateway = FacebookGateway;
