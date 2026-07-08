"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// deploy: v3.1 — all category fixes loaded
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const PrefixStore_1 = require("../../../prefix/PrefixStore");
const BotUI_1 = require("../../../ui/BotUI");
// ─── Self-documenting: write docs/COMMANDS.md ─────────────────────────────────
function generateCommandsDocs(registry, prefix) {
    const byCategory = registry.byCategory();
    const lines = [
        "# COMMANDS.md",
        "",
        "> ⚙️ هذا الملف يُنشأ تلقائياً عند بدء تشغيل البوت — لا تعدّله يدوياً.",
        "",
        `**البادئة الحالية:** \`${prefix}\``,
        "",
        "---",
        "",
    ];
    // الأقسام الثلاثة الرئيسية
    for (const meta of BotUI_1.CATEGORY_META) {
        const cmds = (byCategory.get(meta.key) ?? []).filter((c) => !c.hidden);
        if (cmds.length === 0)
            continue;
        lines.push(`## ${meta.emoji} ${meta.label} (${cmds.length} أوامر)`);
        lines.push("");
        lines.push("| الأمر | الأسماء البديلة | الوصف | الصلاحيات |");
        lines.push("|-------|----------------|--------|-----------|");
        for (const cmd of cmds) {
            const aliases = cmd.aliases?.map((a) => `\`${prefix}${a}\``).join(", ") ?? "—";
            const perms = cmd.adminOnly ? "🔐 أدمن فقط" : "🌐 للجميع";
            const desc = cmd.description ?? "—";
            lines.push(`| \`${prefix}${cmd.name}\` | ${aliases} | ${desc} | ${perms} |`);
        }
        lines.push("");
    }
    // أقسام أخرى (util, debug, moderation…)
    const knownKeys = new Set(BotUI_1.CATEGORY_META.map((m) => m.key));
    const otherCmds = [];
    for (const [cat, cmds] of byCategory) {
        if (knownKeys.has(cat))
            continue;
        otherCmds.push(...cmds.filter((c) => !c.hidden));
    }
    if (otherCmds.length > 0) {
        lines.push("## 📌 أوامر أخرى");
        lines.push("");
        for (const cmd of otherCmds) {
            lines.push(`- \`${prefix}${cmd.name}\` — ${cmd.description ?? ""}`);
        }
        lines.push("");
    }
    lines.push("---");
    lines.push(`*تم الإنشاء: ${new Date().toISOString()}*`);
    return lines.join("\n");
}
function writeDocs(registry, prefix) {
    try {
        const docsDir = path_1.default.resolve("docs");
        if (!fs_1.default.existsSync(docsDir))
            fs_1.default.mkdirSync(docsDir, { recursive: true });
        fs_1.default.writeFileSync(path_1.default.join(docsDir, "COMMANDS.md"), generateCommandsDocs(registry, prefix), "utf8");
    }
    catch { /* non-fatal — docs are informational */ }
}
// ─── Helper: build catCounts map from live registry ──────────────────────────
function buildCatCounts(registry) {
    const byCategory = registry.byCategory();
    const counts = new Map();
    for (const meta of BotUI_1.CATEGORY_META) {
        counts.set(meta.key, (byCategory.get(meta.key) ?? []).filter((c) => !c.hidden).length);
    }
    return counts;
}
// ─── Command factory ──────────────────────────────────────────────────────────
function makeCommand(pCtx) {
    return {
        name: "اوامر",
        aliases: ["commands", "cmds", "أوامر", "help", "مساعدة"],
        description: "عرض قائمة أوامر البوت — أو تصفيتها: اوامر [نظام|خاصة|ادارة]",
        usage: "اوامر | اوامر [نظام|خاصة|ادارة]",
        category: "system",
        adminOnly: false,
        hidden: false,
        async execute(ctx) {
            await ctx.typingOn();
            const registry = pCtx.consumeService("command-registry");
            const prefix = PrefixStore_1.prefixStore.get();
            const filter = ctx.args[0]?.trim();
            if (!registry) {
                await ctx.reply(`${BotUI_1.BRAND}\n\n⚠️ خدمة الأوامر غير متاحة مؤقتاً.`);
                return;
            }
            // ── Category detail ─────────────────────────────────────────────────
            if (filter) {
                const meta = (0, BotUI_1.resolveCategory)(filter);
                if (meta) {
                    const catCmds = (registry.byCategory().get(meta.key) ?? [])
                        .filter((c) => !c.hidden);
                    await ctx.reply((0, BotUI_1.buildCategoryMessage)(meta, catCmds, prefix));
                    return;
                }
                // Unknown filter — show full menu with hint
                const catCounts = buildCatCounts(registry);
                await ctx.reply((0, BotUI_1.buildCommandsMessage)(prefix, catCounts) +
                    `\n\n⚠️ القسم "${filter}" غير موجود.\nالأقسام المتاحة: نظام · خاصة · ادارة`);
                return;
            }
            // ── Full dynamic menu ───────────────────────────────────────────────
            const catCounts = buildCatCounts(registry);
            await ctx.reply((0, BotUI_1.buildCommandsMessage)(prefix, catCounts));
        },
    };
}
// ─── Plugin ───────────────────────────────────────────────────────────────────
class CommandsPlugin {
    manifest = {
        name: "commands",
        version: "3.0.0",
        description: "قائمة الأوامر الديناميكية — تُحسب تلقائياً من الأوامر المسجّلة في الـ Registry.",
        author: "Sixseven-6677",
    };
    ctx;
    async onLoad(ctx) {
        this.ctx = ctx;
        ctx.logger.info("CommandsPlugin v3 loaded.");
    }
    async onEnable() {
        const cmd = makeCommand(this.ctx);
        this.ctx.registerCommand(cmd);
        // ── Self-documenting: write docs/COMMANDS.md ───────────────────────
        const registry = this.ctx.consumeService("command-registry");
        if (registry) {
            writeDocs(registry, PrefixStore_1.prefixStore.get());
            this.ctx.logger.info("CommandsPlugin: docs/COMMANDS.md generated.", { total: registry.size() });
        }
        this.ctx.logger.info(`Command "${cmd.name}" registered (aliases: ${cmd.aliases?.join(", ")}).`);
    }
    async onDisable() {
        this.ctx.logger.info("CommandsPlugin disabled.");
    }
    async onUnload() {
        this.ctx.logger.info("CommandsPlugin unloaded.");
    }
}
exports.default = new CommandsPlugin();
