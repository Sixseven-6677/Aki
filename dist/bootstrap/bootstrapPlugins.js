"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.bootstrapPlugins = bootstrapPlugins;
const path_1 = __importDefault(require("path"));
const env_1 = require("../config/env");
const PluginManager_1 = require("../plugins/PluginManager");
const AkiSender_1 = require("../facebook/AkiSender");
const HumanBehaviorSender_1 = require("../facebook/HumanBehaviorSender");
const botadmin_repository_1 = require("../database/repositories/botadmin.repository");
const group_settings_repository_1 = require("../database/repositories/group-settings.repository");
const ban_repository_1 = require("../database/repositories/ban.repository");
const black_config_repository_1 = require("../database/repositories/black-config.repository");
const bot_config_repository_1 = require("../database/repositories/bot-config.repository");
const command_stats_repository_1 = require("../database/repositories/command-stats.repository");
const LoggerManager_1 = require("../logger/LoggerManager");
const log = LoggerManager_1.LoggerManager.getLogger("Boot.Plugins");
function bootstrapPlugins(bot, registry, scheduler, userSvc, banStore, lockdownStore, adminStore, transports, mongoEnabled) {
    const pluginManager = new PluginManager_1.PluginManager({
        commandRegistry: registry,
        scheduler,
        pluginsDir: path_1.default.resolve(env_1.config.plugins.dir),
        watch: env_1.config.plugins.watch,
    });
    const svcReg = pluginManager.getServiceRegistry();
    svcReg.provide("command-registry", registry, "core");
    svcReg.provide("ban-store", banStore, "core");
    svcReg.provide("lockdown-store", lockdownStore, "core");
    svcReg.provide("admin-store", adminStore, "core");
    svcReg.provide("user-service", userSvc, "core");
    if (transports[0]) {
        svcReg.provide("mirai-transport", transports[0].transport, "core");
        const primarySender = new HumanBehaviorSender_1.HumanBehaviorSender(new AkiSender_1.AkiSender(transports[0].transport));
        svcReg.provide("facebook-sender", primarySender, "core");
    }
    if (transports[1]) {
        svcReg.provide("mirai-transport-secondary", transports[1].transport, "core");
    }
    if (env_1.config.facebook.pageAccessToken) {
        svcReg.provide("fb-access-token", env_1.config.facebook.pageAccessToken, "core");
    }
    let botAdminRepo = null;
    let groupSettingsRepo = null;
    let banRepo = null;
    let botConfigRepo = null;
    if (mongoEnabled) {
        botAdminRepo = new botadmin_repository_1.BotAdminRepository();
        groupSettingsRepo = new group_settings_repository_1.GroupSettingsRepository();
        banRepo = new ban_repository_1.BanRepository();
        const blackConfigRepo = new black_config_repository_1.BlackConfigRepository();
        botConfigRepo = new bot_config_repository_1.BotConfigRepository();
        const commandStatsRepo = new command_stats_repository_1.CommandStatsRepository();
        adminStore.setRepository(botAdminRepo);
        lockdownStore.setRepository(groupSettingsRepo);
        banStore.setRepository(banRepo);
        svcReg.provide("group-settings-repo", groupSettingsRepo, "core");
        svcReg.provide("ban-repo", banRepo, "core");
        svcReg.provide("botadmin-repo", botAdminRepo, "core");
        svcReg.provide("black-config-repo", blackConfigRepo, "core");
        svcReg.provide("bot-config-repo", botConfigRepo, "core");
        svcReg.provide("command-stats-repo", commandStatsRepo, "core");
        log.info("Plugins: MongoDB repos wired (pre-start).");
    }
    bot.register(pluginManager);
    return { pluginManager, botAdminRepo, groupSettingsRepo, banRepo, botConfigRepo };
}
