"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const PrefixStore_1 = require("../../../prefix/PrefixStore");
// ─── Constants ────────────────────────────────────────────────────────────────
const HEADER = "⸪⟅𝐕̶݈̂͜𝔈̟͢⃟݃།̶𝝬̶۪͛ۡ⸸𝚬̱̩⩨ܵ𝐁᮫͎ܺ݀ࣸ᷼᷍⃢ː𝚶̶݄݈݊𝐓݂ ❈ 🦢";
function isValidPrefix(p) {
    const trimmed = p.trim();
    if (trimmed.length === 0 || trimmed.length > 3)
        return false;
    if (/\s/.test(trimmed))
        return false;
    return true;
}
// ─── Plugin ───────────────────────────────────────────────────────────────────
class BadeiaPlugin {
    manifest = {
        name: "badeia",
        version: "2.0.0",
        description: "عرض البادئة الحالية للبوت أو تغييرها (للمالك فقط).",
        author: "Sixseven-6677",
    };
    ctx;
    async onLoad(ctx) {
        this.ctx = ctx;
        ctx.logger.info("BadeiaPlugin loaded.", { currentPrefix: PrefixStore_1.prefixStore.get() });
    }
    async onEnable() {
        const pCtx = this.ctx;
        const badeiaCommand = {
            name: "بادئة",
            aliases: ["prefix", "badeia"],
            description: "عرض البادئة الحالية أو تغييرها (للمالك فقط): بادئة [رمز]",
            usage: "بادئة | بادئة [رمز]",
            category: "system",
            adminOnly: false,
            hidden: false,
            async execute(ctx) {
                await ctx.typingOn();
                const newPrefix = ctx.args[0];
                // ── Show current prefix ──────────────────────────────────────────────
                if (!newPrefix) {
                    const current = PrefixStore_1.prefixStore.get();
                    await ctx.reply([
                        HEADER,
                        "",
                        `⌯ البادئة الحالية: ${current}`,
                        "",
                        `⌯ مثال: ${current}اوامر`,
                        `⌯ مثال: ${current}بادئة`,
                        "",
                        "⌯ لتغيير البادئة (للمالك فقط):",
                        `  ↳ ${current}بادئة !`,
                        `  ↳ ${current}بادئة .`,
                        `  ↳ ${current}بادئة /`,
                    ].join("\n"));
                    pCtx.logger.info("BadeiaPlugin: prefix displayed.", {
                        threadID: ctx.thread.id,
                        userID: ctx.user.id,
                        prefix: current,
                    });
                    return;
                }
                // ── Change prefix (admin only) ───────────────────────────────────────
                if (!ctx.hasRole("admin")) {
                    await ctx.reply([
                        HEADER,
                        "",
                        "🚫 فقط المالك يستطيع تغيير البادئة.",
                    ].join("\n"));
                    return;
                }
                const trimmed = newPrefix.trim();
                if (!isValidPrefix(trimmed)) {
                    await ctx.reply([
                        HEADER,
                        "",
                        "⚠️ البادئة غير صالحة.",
                        "",
                        "⌯ الشروط:",
                        "  • من 1 إلى 3 رموز فقط",
                        "  • لا تحتوي على مسافات",
                        "",
                        "⌯ أمثلة صحيحة: ! . / ? $ # @ ~ ; : - +",
                    ].join("\n"));
                    return;
                }
                const old = PrefixStore_1.prefixStore.get();
                PrefixStore_1.prefixStore.set(trimmed);
                pCtx.logger.info("BadeiaPlugin: prefix changed.", {
                    from: old,
                    to: trimmed,
                    by: ctx.user.id,
                    threadID: ctx.thread.id,
                });
                await ctx.reply([
                    HEADER,
                    "",
                    "✅ تم تغيير البادئة بنجاح!",
                    "",
                    `⌯ البادئة القديمة: ${old}`,
                    `⌯ البادئة الجديدة: ${trimmed}`,
                    "",
                    `⌯ مثال الاستخدام: ${trimmed}اوامر`,
                    `⌯ مثال الاستخدام: ${trimmed}بادئة`,
                    "",
                    "⌯ البادئة محفوظة وتستمر بعد إعادة التشغيل.",
                ].join("\n"));
            },
        };
        pCtx.registerCommand(badeiaCommand);
        pCtx.logger.info(`Command "${badeiaCommand.name}" registered (aliases: ${badeiaCommand.aliases?.join(", ")}). ` +
            `Current prefix: "${PrefixStore_1.prefixStore.get()}".`);
    }
    async onDisable() {
        this.ctx.logger.info("BadeiaPlugin disabled.");
    }
    async onUnload() {
        this.ctx.logger.info("BadeiaPlugin unloaded.");
    }
}
exports.default = new BadeiaPlugin();
