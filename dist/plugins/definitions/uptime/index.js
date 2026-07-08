"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const os_1 = __importDefault(require("os"));
const BotUI_1 = require("../../../ui/BotUI");
// ─── Helpers ───────────────────────────────────────────────────────────────
function formatBytes(bytes) {
    const mb = bytes / 1024 / 1024;
    return `${mb.toFixed(1)}`;
}
function getCpuUsage() {
    return new Promise((resolve) => {
        const start = process.cpuUsage();
        setTimeout(() => {
            const end = process.cpuUsage(start);
            const total = end.user + end.system;
            const pct = (total / 1_000_000 / 0.1) * 100;
            resolve(Math.min(Math.round(pct * 10) / 10, 100));
        }, 100);
    });
}
// ─── Command ───────────────────────────────────────────────────────────────
const uptimeCommand = {
    name: "ابتيم",
    aliases: ["uptime", "stats", "حالة"],
    description: "يعرض معلومات تشغيل البوت الحالية",
    usage: "ابتيم",
    category: "system",
    adminOnly: false,
    hidden: false,
    async execute(ctx) {
        await ctx.typingOn();
        // Measure ping BEFORE getCpuUsage (which blocks 100ms)
        const pingStart = Date.now();
        // Gather system info
        const uptimeSec = process.uptime();
        const totalMemMB = (os_1.default.totalmem() / 1024 / 1024).toFixed(1);
        const freeMemMB = (os_1.default.freemem() / 1024 / 1024).toFixed(1);
        const usedMemMB = ((os_1.default.totalmem() - os_1.default.freemem()) / 1024 / 1024).toFixed(1);
        const cpuCores = os_1.default.cpus().length;
        const nodeVersion = process.version;
        const osType = os_1.default.type();
        const arch = os_1.default.arch();
        // Record latency before the 100ms CPU sampling window
        const latencyMs = Date.now() - pingStart;
        // CPU usage sample (~100ms)
        const cpuPct = await getCpuUsage();
        const msg = (0, BotUI_1.buildUptimeMessage)({
            uptimeSec,
            freeMemMB,
            usedMemMB,
            totalMemMB,
            cpuPct,
            cpuCores,
            nodeVersion,
            osType,
            arch,
            latencyMs,
        });
        await ctx.reply(msg);
    },
};
// ─── Plugin ────────────────────────────────────────────────────────────────
class UptimePlugin {
    manifest = {
        name: "uptime",
        version: "1.0.0",
        description: "يعرض معلومات تشغيل البوت — مدة التشغيل، الرام، المعالج، Node.js، وزمن الاستجابة.",
        author: "Sixseven-6677",
    };
    ctx;
    async onLoad(ctx) {
        this.ctx = ctx;
        ctx.logger.info("UptimePlugin loaded.");
    }
    async onEnable() {
        this.ctx.registerCommand(uptimeCommand);
        this.ctx.logger.info(`Command "${uptimeCommand.name}" registered (aliases: ${uptimeCommand.aliases?.join(", ")}).`);
    }
    async onDisable() {
        this.ctx.logger.info("UptimePlugin disabled.");
    }
    async onUnload() {
        this.ctx.logger.info("UptimePlugin unloaded.");
    }
}
exports.default = new UptimePlugin();
