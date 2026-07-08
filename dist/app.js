"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const express_1 = __importDefault(require("express"));
const webhook_route_1 = require("./routes/webhook.route");
const HttpErrorHandler_1 = require("./errors/handlers/HttpErrorHandler");
function createApp(gateway, groupHandlers = {}, miraiTransport = null) {
    const app = (0, express_1.default)();
    app.use(express_1.default.json({
        limit: "1mb",
    }));
    app.use(express_1.default.urlencoded({ extended: true, limit: "1mb" }));
    app.get(["/health", "/api/health", "/api/healthz"], (_req, res) => {
        const mqttConnected = miraiTransport ? miraiTransport.getApi() !== null : null;
        res.status(200).json({
            status: "ok",
            uptime: process.uptime(),
            mqtt: mqttConnected === null ? "unknown" : mqttConnected ? "connected" : "disconnected",
            botUserId: miraiTransport?.getCurrentUserId() || null,
        });
    });
    const webhookRouter = (0, webhook_route_1.createWebhookRouter)(gateway, groupHandlers);
    app.use("/webhook", webhookRouter);
    app.use(HttpErrorHandler_1.notFoundHandler);
    app.use(HttpErrorHandler_1.httpErrorHandler);
    return app;
}
