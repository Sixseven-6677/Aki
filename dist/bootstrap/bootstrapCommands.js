"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.bootstrapCommands = bootstrapCommands;
/**
 * bootstrapCommands
 *
 * Builds the command registry, loads command files, constructs the pipeline
 * with all middleware, and wires the MessageHandler singleton so handleMessage
 * routes correctly when invoked by the FCA event adapter.
 */
const path_1 = __importDefault(require("path"));
const env_1 = require("../config/env");
const CommandRegistry_1 = require("../commands/CommandRegistry");
const CommandLoader_1 = require("../commands/CommandLoader");
const CommandPipeline_1 = require("../commands/CommandPipeline");
const typing_middleware_1 = require("../commands/middleware/typing.middleware");
const groupmute_middleware_1 = require("../commands/middleware/groupmute.middleware");
const MiddlewareManager_1 = require("../middleware/MiddlewareManager");
const logging_middleware_1 = require("../middleware/built-in/logging.middleware");
const cooldown_middleware_1 = require("../middleware/built-in/cooldown.middleware");
const antispam_middleware_1 = require("../middleware/built-in/antispam.middleware");
const permissions_middleware_1 = require("../middleware/built-in/permissions.middleware");
const banned_middleware_1 = require("../middleware/built-in/banned.middleware");
const lockdown_middleware_1 = require("../middleware/built-in/lockdown.middleware");
const PrefixStore_1 = require("../prefix/PrefixStore");
const message_handler_1 = require("../handlers/message.handler");
const LoggerManager_1 = require("../logger/LoggerManager");
const log = LoggerManager_1.LoggerManager.getLogger("Boot.Commands");
function buildBanMessage(entry) {
    const expiry = entry.expiresAt
        ? ` ينتهي: ${entry.expiresAt.toLocaleString("ar-SA")}.`
        : "";
    if (entry.reason?.startsWith("[MUTED]"))
        return `🔇 تم كتمك من التفاعل مع البوت.${expiry}`;
    if (entry.reason?.startsWith("[KICKED]"))
        return `👢 تم طردك مؤقتاً.${expiry}`;
    const reason = entry.reason ? ` السبب: ${entry.reason}.` : "";
    const durStr = entry.expiresAt ? expiry : " الحظر دائم.";
    return `🚫 أنت محظور من استخدام البوت.${reason}${durStr}`;
}
async function bootstrapCommands(banStore, lockdownStore, adminStore, scheduler, reconnect, userSvc) {
    const registry = new CommandRegistry_1.CommandRegistry();
    const loader = new CommandLoader_1.CommandLoader(registry);
    await loader.load(path_1.default.resolve(env_1.config.bot.commandsDir));
    loader.watch(path_1.default.resolve(env_1.config.bot.commandsDir));
    log.info("Commands: registry loaded.", { commandsDir: env_1.config.bot.commandsDir });
    const mwManager = new MiddlewareManager_1.MiddlewareManager()
        .register((0, banned_middleware_1.createBannedMiddleware)({ store: banStore, message: buildBanMessage }))
        .register((0, lockdown_middleware_1.createLockdownMiddleware)({ store: lockdownStore }))
        .register((0, logging_middleware_1.createLoggingMiddleware)({ logEntry: true }))
        .register((0, antispam_middleware_1.createAntiSpamMiddleware)({ maxMessages: 5, windowMs: 10_000 }))
        .register((0, cooldown_middleware_1.createCooldownMiddleware)({ durationMs: 3_000 }))
        .register((0, permissions_middleware_1.createPermissionsMiddleware)({
        adminIds: env_1.config.bot.adminIds,
        adminStore,
    }));
    const pipeline = new CommandPipeline_1.CommandPipeline(registry, () => PrefixStore_1.prefixStore.get())
        .use(mwManager.fn("banned"))
        .use(mwManager.fn("logging"))
        .use(mwManager.fn("lockdown"))
        .use(groupmute_middleware_1.groupMuteMiddleware)
        .use(mwManager.fn("antispam"))
        .use(mwManager.fn("cooldown"))
        .use(mwManager.fn("permissions"))
        .use(typing_middleware_1.typingMiddleware)
        .onNotFound(async (ctx) => {
        await ctx.reply(`❓ الأمر "${ctx.commandName}" غير موجود.`);
    });
    // Wire MessageHandler singleton — handleMessage() (exported from the module)
    // calls through to this instance.
    (0, message_handler_1.createMessageHandler)(pipeline, registry, scheduler, reconnect, banStore, userSvc);
    log.info("Commands: MessageHandler wired.");
    return { registry, pipeline, loader };
}
