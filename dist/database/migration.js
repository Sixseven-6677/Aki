"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runMigrationIfNeeded = runMigrationIfNeeded;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const LoggerManager_1 = require("../logger/LoggerManager");
// ── Normal top-level model imports (no lazy require needed — models have no
//    transitive dependency back to migration.ts, so there is no circular dep).
const bot_config_model_1 = require("./models/bot-config.model");
const black_config_model_1 = require("./models/black-config.model");
const botadmin_model_1 = require("./models/botadmin.model");
const group_settings_model_1 = require("./models/group-settings.model");
const ban_model_1 = require("./models/ban.model");
const log = LoggerManager_1.LoggerManager.getLogger("Migration");
// ─── Flag file ────────────────────────────────────────────────────────────────
const DONE_FLAG = path_1.default.resolve("data/.migration-done");
function hasDone() {
    return fs_1.default.existsSync(DONE_FLAG);
}
function markDone() {
    try {
        const dir = path_1.default.dirname(DONE_FLAG);
        if (!fs_1.default.existsSync(dir))
            fs_1.default.mkdirSync(dir, { recursive: true });
        fs_1.default.writeFileSync(DONE_FLAG, new Date().toISOString(), "utf8");
    }
    catch { /* best effort */ }
}
// ─── Per-collection migrations ────────────────────────────────────────────────
async function migratePrefix() {
    const src = path_1.default.resolve("data/prefix.json");
    if (!fs_1.default.existsSync(src))
        return 0;
    let count = 0;
    try {
        const raw = JSON.parse(fs_1.default.readFileSync(src, "utf8"));
        const pref = raw.prefix;
        if (pref && pref.length > 0) {
            await bot_config_model_1.BotConfigModel.findOneAndUpdate({ key: "prefix" }, { $set: { value: pref, updatedAt: new Date() }, $setOnInsert: { key: "prefix" } }, { upsert: true }).exec();
            log.info(`Migration: prefix → "${pref}"`);
            count = 1;
        }
    }
    catch (err) {
        log.warn("Migration: prefix failed.", { error: String(err) });
    }
    return count;
}
async function migrateBlack() {
    const src = path_1.default.resolve("data/black-plugin.json");
    if (!fs_1.default.existsSync(src))
        return 0;
    let count = 0;
    try {
        const raw = JSON.parse(fs_1.default.readFileSync(src, "utf8"));
        for (const [threadId, cfg] of Object.entries(raw.threads ?? {})) {
            await black_config_model_1.BlackConfigModel.findOneAndUpdate({ threadId }, {
                $set: {
                    message: cfg.message,
                    intervalSec: cfg.intervalSec,
                    active: cfg.active,
                    lastSentAt: cfg.lastSentAt ? new Date(cfg.lastSentAt) : null,
                    updatedAt: new Date(),
                },
                $setOnInsert: { threadId },
            }, { upsert: true }).exec();
            count++;
        }
        if (count > 0)
            log.info(`Migration: black-config → ${count} thread(s).`);
    }
    catch (err) {
        log.warn("Migration: black-config failed.", { error: String(err) });
    }
    return count;
}
async function migrateAdmins() {
    const src = path_1.default.resolve("data/admin-store.json");
    if (!fs_1.default.existsSync(src))
        return 0;
    let count = 0;
    try {
        const raw = JSON.parse(fs_1.default.readFileSync(src, "utf8"));
        for (const fbId of (raw.admins ?? [])) {
            await botadmin_model_1.BotAdminModel.findOneAndUpdate({ fbId }, { $setOnInsert: { fbId, addedBy: "migration:file", addedAt: new Date() } }, { upsert: true }).exec();
            count++;
        }
        if (count > 0)
            log.info(`Migration: bot-admins → ${count} record(s).`);
    }
    catch (err) {
        log.warn("Migration: bot-admins failed.", { error: String(err) });
    }
    return count;
}
async function migrateLockdown() {
    const src = path_1.default.resolve("data/lockdown.json");
    if (!fs_1.default.existsSync(src))
        return 0;
    let count = 0;
    try {
        const raw = JSON.parse(fs_1.default.readFileSync(src, "utf8"));
        for (const [threadId, locked] of Object.entries(raw.threads ?? {})) {
            await group_settings_model_1.GroupSettingsModel.findOneAndUpdate({ threadId }, {
                $set: { lockdown: !!locked, updatedAt: new Date() },
                $setOnInsert: { threadId },
            }, { upsert: true }).exec();
            count++;
        }
        if (count > 0)
            log.info(`Migration: lockdown → ${count} thread(s).`);
    }
    catch (err) {
        log.warn("Migration: lockdown failed.", { error: String(err) });
    }
    return count;
}
async function migrateBans() {
    const src = path_1.default.resolve("data/bans.json");
    if (!fs_1.default.existsSync(src))
        return 0;
    let count = 0;
    try {
        const raw = JSON.parse(fs_1.default.readFileSync(src, "utf8"));
        for (const [userId, ban] of Object.entries(raw.bans ?? {})) {
            await ban_model_1.BanModel.findOneAndUpdate({ userId }, {
                $set: {
                    reason: ban.reason,
                    bannedAt: new Date(ban.bannedAt),
                    expiresAt: ban.expiresAt ? new Date(ban.expiresAt) : null,
                    bannedBy: ban.bannedBy,
                },
                $setOnInsert: { userId },
            }, { upsert: true }).exec();
            count++;
        }
        if (count > 0)
            log.info(`Migration: bans → ${count} record(s).`);
    }
    catch (err) {
        log.warn("Migration: bans failed.", { error: String(err) });
    }
    return count;
}
// ─── Main entry ───────────────────────────────────────────────────────────────
/**
 * Runs once per deployment when data/*.json files exist.
 * Imports file-based data into MongoDB and stamps a flag so it never re-runs.
 */
async function runMigrationIfNeeded() {
    if (hasDone()) {
        log.debug("Migration: already done — skipping.");
        return;
    }
    const dataDir = path_1.default.resolve("data");
    const hasAnyJson = fs_1.default.existsSync(dataDir) &&
        fs_1.default.readdirSync(dataDir).some((f) => f.endsWith(".json"));
    if (!hasAnyJson) {
        log.debug("Migration: no JSON data files found — nothing to migrate.");
        markDone();
        return;
    }
    log.info("Migration: JSON data found — starting import to MongoDB...");
    const results = await Promise.all([
        migratePrefix(),
        migrateBlack(),
        migrateAdmins(),
        migrateLockdown(),
        migrateBans(),
    ]);
    const total = results.reduce((s, n) => s + n, 0);
    log.info(`Migration: complete — ${total} record(s) imported to MongoDB.`);
    markDone();
}
