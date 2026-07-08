"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const DiagnosticMonitor_1 = require("../../../diagnostic/DiagnosticMonitor");
// ─── Command ───────────────────────────────────────────────────────────────
const diagCommand = {
    name: "تشخيص",
    aliases: ["diag", "diagnostic", "session-report"],
    description: "يعرض تقرير تشخيصي كامل عن حالة الجلسة وطلبات API",
    usage: "تشخيص",
    category: "system",
    adminOnly: true,
    hidden: false,
    async execute(ctx) {
        await ctx.typingOn();
        // Force a save to /tmp as well
        DiagnosticMonitor_1.diagnosticMonitor.saveReport();
        const report = DiagnosticMonitor_1.diagnosticMonitor.getReportText();
        // Split into chunks of 2000 chars to stay within Facebook message limits
        const CHUNK = 1_900;
        for (let i = 0; i < report.length; i += CHUNK) {
            const chunk = report.slice(i, i + CHUNK);
            await ctx.reply(chunk);
            // Small delay between chunks to avoid hitting send rate limits
            if (i + CHUNK < report.length) {
                await new Promise(r => setTimeout(r, 800));
            }
        }
    },
};
// ─── Plugin ────────────────────────────────────────────────────────────────
class DiagnosticPlugin {
    manifest = {
        name: "diagnostic",
        version: "1.0.0",
        description: "نظام التشخيص — يتتبع دورة حياة الجلسة وطلبات API ويكشف سبب انتهاء AppState.",
        author: "Sixseven-6677",
    };
    ctx;
    async onLoad(ctx) {
        this.ctx = ctx;
        ctx.logger.info("DiagnosticPlugin loaded.");
    }
    async onEnable() {
        this.ctx.registerCommand(diagCommand);
        this.ctx.logger.info(`Command "${diagCommand.name}" registered (aliases: ${diagCommand.aliases?.join(", ")}).`);
    }
    async onDisable() {
        this.ctx.logger.info("DiagnosticPlugin disabled.");
    }
    async onUnload() {
        this.ctx.logger.info("DiagnosticPlugin unloaded.");
    }
}
exports.default = new DiagnosticPlugin();
