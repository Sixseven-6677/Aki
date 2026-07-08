"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createWebhookRouter = createWebhookRouter;
const express_1 = require("express");
const message_handler_1 = require("../handlers/message.handler");
/**
 * Note: Facebook HMAC-SHA256 signature verification (X-Hub-Signature-256) is
 * applied as middleware in app.ts before this router is mounted, so all
 * requests reaching here have already been authenticated in production.
 */
function createWebhookRouter(gateway, groupHandlers = {}) {
    const router = (0, express_1.Router)();
    router.get("/", (req, res) => {
        gateway.handleVerification(req, res);
    });
    router.post("/", (req, res) => {
        const body = req.body;
        if (body.object !== "page") {
            res.status(404).json({ error: "Not a page event" });
            return;
        }
        res.status(200).send("EVENT_RECEIVED");
        gateway.processWebhookBody(body, message_handler_1.handleMessage, groupHandlers);
    });
    return router;
}
