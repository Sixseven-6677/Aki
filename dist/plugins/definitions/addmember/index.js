"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// ─── Constants ─────────────────────────────────────────────────────────────
const HEADER = "⸪⟅𝐕̶݈̂͜𝔈̟͢⃟݃།̶𝝬̶۪͛ۡ⸸𝚬̱̩⩨ܵ𝐁᮫͎ܺ݀ࣸ᷼᷍⃢ː𝚶̶݄݈݊𝐓݂ ❈ 🦢";
function getApi(pCtx) {
    return (pCtx.consumeService("mirai-transport")?.getApi?.() ??
        pCtx.consumeService("mirai-transport-secondary")?.getApi?.() ??
        null);
}
// ─── Plugin ────────────────────────────────────────────────────────────────
class AddMemberPlugin {
    manifest = {
        name: "addmember",
        version: "1.0.0",
        description: "إضافة عضو للقروب عبر الـ ID.",
        author: "Sixseven-6677",
    };
    ctx;
    async onLoad(ctx) {
        this.ctx = ctx;
        ctx.logger.info("AddMemberPlugin loaded.");
    }
    async onEnable() {
        const pCtx = this.ctx;
        const cmd = {
            name: "إضافة",
            aliases: ["adduser", "addmember", "اضافة", "ضيف"],
            description: "إضافة عضو للقروب عبر الـ ID",
            usage: "إضافة [ID]",
            category: "admin",
            adminOnly: true,
            hidden: false,
            async execute(ctx) {
                await ctx.typingOn();
                const api = getApi(pCtx);
                if (!api) {
                    await ctx.reply("⚠️ خدمة Facebook غير متاحة حالياً.");
                    return;
                }
                const userId = ctx.getArg(0)?.trim();
                if (!userId || !/^\d+$/.test(userId)) {
                    await ctx.reply(`${HEADER}\n\n` +
                        "⚠️ الرجاء إدخال الـ ID بشكل صحيح.\n\n" +
                        "📌 مثال: إضافة 100123456789");
                    return;
                }
                // Check if already in group (best-effort)
                try {
                    const info = await new Promise((res, rej) => {
                        api.getThreadInfo(ctx.thread.id, (err, i) => (err ? rej(err) : res(i)));
                    });
                    if (info.participantIDs.includes(userId)) {
                        await ctx.reply("ℹ️ هذا المستخدم موجود في القروب بالفعل.");
                        return;
                    }
                }
                catch { /* best-effort */ }
                // Fetch name (best-effort)
                let name = userId;
                try {
                    const info = await new Promise((res, rej) => {
                        api.getUserInfo(userId, (err, d) => (err ? rej(err) : res(d)));
                    });
                    name = info[userId]?.name ?? userId;
                }
                catch { /* ignore */ }
                try {
                    await new Promise((res, rej) => {
                        api.addUserToGroup(userId, ctx.thread.id, (err) => (err ? rej(err) : res()));
                    });
                    pCtx.logger.info("AddMemberPlugin: added.", { userId, name, threadId: ctx.thread.id, by: ctx.user.id });
                    await ctx.reply(`${HEADER}\n\n✅ تم إضافة ${name} للقروب بنجاح 🎉`);
                }
                catch (err) {
                    pCtx.logger.warn("AddMemberPlugin: add failed.", { error: String(err) });
                    await ctx.reply(`❌ تعذّرت الإضافة.\n` +
                        `تأكد من صحة الـ ID وأن البوت يملك صلاحية الإضافة.\n\n` +
                        `🔑 ID: ${userId}`);
                }
            },
        };
        pCtx.registerCommand(cmd);
        pCtx.logger.info(`AddMemberPlugin enabled. Command "إضافة" registered.`);
    }
    async onDisable() { this.ctx.logger.info("AddMemberPlugin disabled."); }
    async onUnload() { this.ctx.logger.info("AddMemberPlugin unloaded."); }
}
exports.default = new AddMemberPlugin();
