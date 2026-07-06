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

import express             from "express";
import { config }          from "./config/env";
import { LoggerManager }   from "./logger/LoggerManager";
import { LogLevel }        from "./logger/types/ILogger";
import { prefixStore }     from "./prefix/PrefixStore";
import { runMigrationIfNeeded } from "./database/migration";

import { bootstrapCore }                      from "./bootstrap/bootstrapCore";
import { bootstrapAuth }                      from "./bootstrap/bootstrapAuth";
import { bootstrapStores }                    from "./bootstrap/bootstrapStores";
import { bootstrapCommands }                  from "./bootstrap/bootstrapCommands";
import { bootstrapFacebook, ActiveTransport } from "./bootstrap/bootstrapFacebook";
import { bootstrapPlugins }                   from "./bootstrap/bootstrapPlugins";
import { bootstrapRoutes }                    from "./bootstrap/bootstrapRoutes";

LoggerManager.configure({
  level:         config.logger.level as LogLevel,
  logDir:        config.logger.dir,
  enableFile:    config.logger.enableFile,
  enableConsole: true,
});

const log = LoggerManager.getLogger("Boot");

async function bootstrap(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));

  const transports: ActiveTransport[] = [];

  app.get(["/health", "/api/health", "/api/healthz"], (_req, res) => {
    res.status(200).json({
      status:  "ok",
      uptime:  process.uptime(),
      engine:  "Aki — Sixsu × Nejin Hybrid",
      accounts: transports.map(({ label, transport: t }) => ({
        account:   label,
        connected: t.isConnected(),
        running:   t.isRunning(),
        userId:    t.getCurrentUserId() || null,
      })),
    });
  });

  await new Promise<void>((resolve, reject) => {
    const srv = app.listen(config.port, () => {
      log.info(`HTTP server ready on port ${config.port}.`, { env: config.nodeEnv });
      resolve();
    });
    srv.on("error", (err: Error) => { log.error("HTTP server failed.", err); reject(err); });
  });

  const { bot, cache, scheduler, mongoEnabled } = await bootstrapCore(config.database.mongoUri);
  const { auth, sessionManager, reconnect }     = await bootstrapAuth(bot);
  const { banStore, lockdownStore, adminStore, userSvc } = bootstrapStores(config.bot.adminIds, cache);

  const { registry } = await bootstrapCommands(
    banStore, lockdownStore, adminStore, scheduler, reconnect, userSvc,
  );

  const booted = bootstrapFacebook(auth, userSvc, adminStore, bot, reconnect, sessionManager);
  transports.push(...booted);

  const { botAdminRepo, groupSettingsRepo, banRepo, botConfigRepo } = bootstrapPlugins(
    bot, registry, scheduler, userSvc,
    banStore, lockdownStore, adminStore,
    transports, mongoEnabled,
  );

  bootstrapRoutes(app, transports, adminStore, userSvc);

  await bot.start();

  if (mongoEnabled && botAdminRepo && groupSettingsRepo && banRepo) {
    try {
      await Promise.all([
        adminStore.loadFromDatabase(),
        lockdownStore.loadFromDatabase(),
        banStore.loadFromDatabase(),
      ]);
      if (botConfigRepo) await prefixStore.loadFromDatabase(botConfigRepo);
      await runMigrationIfNeeded();
      log.info("Post-start: stores loaded from MongoDB.");
    } catch (err) {
      log.error("Post-start: failed to load from MongoDB.", err);
    }
  }

  log.info("── AKI BOT READY ──", {
    engine:     "Sixsu × Nejin Hybrid",
    accounts:   transports.map(({ label, transport: t }) => ({
      label, userId: t.getCurrentUserId(), connected: t.isConnected(),
    })),
    prefix:     prefixStore.get(),
    nodeEnv:    config.nodeEnv,
    mongoDb:    mongoEnabled ? "connected" : "disabled",
    adminCount: adminStore.size(),
  });

  if (process.send) process.send("ready");
}

bootstrap().catch((err: unknown) => {
  log.error("Fatal startup error.", err);
  process.exit(1);
});
