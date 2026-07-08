"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
if (typeof globalThis.crypto === "undefined") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeCrypto = require("crypto");
    if (nodeCrypto.webcrypto) {
        Object.defineProperty(globalThis, "crypto", {
            value: nodeCrypto.webcrypto,
            configurable: true,
            writable: true,
        });
    }
}
const express_1 = __importDefault(require("express"));
const env_1 = require("./config/env");
const LoggerManager_1 = require("./logger/LoggerManager");
const PrefixStore_1 = require("./prefix/PrefixStore");
const migration_1 = require("./database/migration");
const bootstrapCore_1 = require("./bootstrap/bootstrapCore");
const bootstrapAuth_1 = require("./bootstrap/bootstrapAuth");
const bootstrapStores_1 = require("./bootstrap/bootstrapStores");
const bootstrapCommands_1 = require("./bootstrap/bootstrapCommands");
const bootstrapFacebook_1 = require("./bootstrap/bootstrapFacebook");
const bootstrapPlugins_1 = require("./bootstrap/bootstrapPlugins");
const bootstrapRoutes_1 = require("./bootstrap/bootstrapRoutes");
LoggerManager_1.LoggerManager.configure({
    level: env_1.config.logger.level,
    logDir: env_1.config.logger.dir,
    enableFile: env_1.config.logger.enableFile,
    enableConsole: true,
});
const log = LoggerManager_1.LoggerManager.getLogger("Boot");
async function bootstrap() {
    const app = (0, express_1.default)();
    app.use(express_1.default.json({ limit: "1mb" }));
    app.use(express_1.default.urlencoded({ extended: true, limit: "1mb" }));
    const transports = [];
    app.get(["/health", "/api/health", "/api/healthz"], (_req, res) => {
        res.status(200).json({
            status: "ok",
            uptime: process.uptime(),
            engine: "Aki — Sixsu × Nejin Hybrid",
            accounts: transports.map(({ label, transport: t }) => ({
                account: label,
                connected: t.isConnected(),
                running: t.isRunning(),
                userId: t.getCurrentUserId() || null,
            })),
        });
    });
    await new Promise((resolve, reject) => {
        const srv = app.listen(env_1.config.port, () => {
            log.info(`HTTP server ready on port ${env_1.config.port}.`, { env: env_1.config.nodeEnv });
            resolve();
        });
        srv.on("error", (err) => { log.error("HTTP server failed.", err); reject(err); });
    });
    const { bot, cache, scheduler, mongoEnabled } = await (0, bootstrapCore_1.bootstrapCore)(env_1.config.database.mongoUri);
    const { auth, sessionManager, reconnect } = await (0, bootstrapAuth_1.bootstrapAuth)(bot);
    const { banStore, lockdownStore, adminStore, userSvc } = (0, bootstrapStores_1.bootstrapStores)(env_1.config.bot.adminIds, cache);
    const { registry } = await (0, bootstrapCommands_1.bootstrapCommands)(banStore, lockdownStore, adminStore, scheduler, reconnect, userSvc);
    const booted = (0, bootstrapFacebook_1.bootstrapFacebook)(auth, userSvc, adminStore, bot, reconnect, sessionManager);
    transports.push(...booted);
    const { botAdminRepo, groupSettingsRepo, banRepo, botConfigRepo } = (0, bootstrapPlugins_1.bootstrapPlugins)(bot, registry, scheduler, userSvc, banStore, lockdownStore, adminStore, transports, mongoEnabled);
    (0, bootstrapRoutes_1.bootstrapRoutes)(app, transports, adminStore, userSvc);
    await bot.start();
    if (mongoEnabled && botAdminRepo && groupSettingsRepo && banRepo) {
        try {
            await Promise.all([
                adminStore.loadFromDatabase(),
                lockdownStore.loadFromDatabase(),
                banStore.loadFromDatabase(),
            ]);
            if (botConfigRepo)
                await PrefixStore_1.prefixStore.loadFromDatabase(botConfigRepo);
            await (0, migration_1.runMigrationIfNeeded)();
            log.info("Post-start: stores loaded from MongoDB.");
        }
        catch (err) {
            log.error("Post-start: failed to load from MongoDB.", err);
        }
    }
    log.info("── AKI BOT READY ──", {
        engine: "Sixsu × Nejin Hybrid",
        accounts: transports.map(({ label, transport: t }) => ({
            label, userId: t.getCurrentUserId(), connected: t.isConnected(),
        })),
        prefix: PrefixStore_1.prefixStore.get(),
        nodeEnv: env_1.config.nodeEnv,
        mongoDb: mongoEnabled ? "connected" : "disabled",
        adminCount: adminStore.size(),
    });
    if (process.send)
        process.send("ready");
}
bootstrap().catch((err) => {
    log.error("Fatal startup error.", err);
    process.exit(1);
});
