"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bootstrapRoutes = bootstrapRoutes;
const env_1 = require("../config/env");
const FacebookConnection_1 = require("../facebook/FacebookConnection");
const FacebookEventNormalizer_1 = require("../facebook/FacebookEventNormalizer");
const FacebookGateway_1 = require("../facebook/FacebookGateway");
const AkiSender_1 = require("../facebook/AkiSender");
const HumanBehaviorSender_1 = require("../facebook/HumanBehaviorSender");
const webhook_route_1 = require("../routes/webhook.route");
const HttpErrorHandler_1 = require("../errors/handlers/HttpErrorHandler");
const group_handler_1 = require("../handlers/group.handler");
const LoggerManager_1 = require("../logger/LoggerManager");
const log = LoggerManager_1.LoggerManager.getLogger("Boot.Routes");
function bootstrapRoutes(app, transports, adminStore, userSvc) {
    if (transports[0]) {
        const conn = new FacebookConnection_1.FacebookConnection();
        const gateway = new FacebookGateway_1.FacebookGateway(conn, new HumanBehaviorSender_1.HumanBehaviorSender(new AkiSender_1.AkiSender(transports[0].transport)), new FacebookEventNormalizer_1.FacebookEventNormalizer(), env_1.config.bot.ownerIds, adminStore, userSvc);
        conn.connect();
        app.use("/webhook", (0, webhook_route_1.createWebhookRouter)(gateway, {
            onMemberJoined: (evt) => (0, group_handler_1.handleMemberJoined)(evt),
            onMemberLeft: (evt) => (0, group_handler_1.handleMemberLeft)(evt),
        }));
        log.info("Routes: webhook router mounted.");
    }
    else {
        log.warn("Routes: no transport available — webhook route not mounted.");
    }
    // 404 + error handlers must come last
    app.use(HttpErrorHandler_1.notFoundHandler);
    app.use(HttpErrorHandler_1.httpErrorHandler);
}
