"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bootstrapCore = bootstrapCore;
/**
 * bootstrapCore
 *
 * Initialises the fundamental runtime systems (Bot, error handler, cache,
 * scheduler, optional DatabaseManager). Returns the live instances so the
 * orchestrator can pass them to subsequent bootstrap modules.
 */
const Bot_1 = require("../core/Bot");
const CacheManager_1 = require("../cache/CacheManager");
const createProvider_1 = require("../cache/providers/createProvider");
const DatabaseManager_1 = require("../database/DatabaseManager");
const scheduler_1 = require("../scheduler");
const LoggerManager_1 = require("../logger/LoggerManager");
const log = LoggerManager_1.LoggerManager.getLogger("Boot.Core");
async function bootstrapCore(mongoUri) {
    const bot = new Bot_1.Bot();
    const cache = new CacheManager_1.CacheManager({ provider: await (0, createProvider_1.createCacheProvider)() });
    bot.register(cache);
    const mongoEnabled = (mongoUri.startsWith("mongodb://") && mongoUri.length > 10) ||
        (mongoUri.startsWith("mongodb+srv://") && mongoUri.length > 14);
    if (mongoEnabled) {
        bot.register(new DatabaseManager_1.DatabaseManager());
        log.info("Core: MongoDB enabled.");
    }
    else if (mongoUri) {
        log.warn("Core: MONGODB_URI looks invalid — skipping. Set a valid mongodb+srv:// URI.");
    }
    else {
        log.warn("Core: no MONGODB_URI — running without persistence. " +
            "Set MONGODB_URI on Railway to enable full persistence.");
    }
    const scheduler = new scheduler_1.TaskScheduler();
    bot.register(scheduler);
    return { bot, cache, scheduler, mongoEnabled };
}
