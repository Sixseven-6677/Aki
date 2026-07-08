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
class KickPlugin {
    manifest = {
        name: "kick",
        version: "1.0.0",
        description: "طرد عضو من القروب برد على رسالته أو إدخال ID مباشرة.",
        author: "Sixseven-6677",
    };
    ctx;
    rawListener;
    /** threadID → last reply-target senderID seen in that thread */
    replyMap = new Map();
    async onLoad(ctx) {
        this.ctx = ctx;
        ctx.logger.info("KickPlugin loaded.");
    }
    async onEnable() {
        const pCtx = this.ctx;
        const replyMap = this.replyMap;
        // Track raw message_reply events to detect who was replied to
        const transport = pCtx.consumeService("mirai-transport");
        if (transport) {
            this.rawListener = (raw) => {
                const e = raw;
                if (e.type === "message_reply" && e.threadID && e.messageReply?.senderID) {
                    replyMap.set(e.threadID, e.messageReply.senderID);
                }
            };
            transport.addRawEventListener(this.rawListener);
            pCtx.logger.info("KickPlugin: raw reply listener attached.");
        }
        const cmd = {
            name: "طرد",
            aliases: ["kick", "remove"],
            description: "طرد عضو من القروب (رد على رسالته أو أرسل ID مباشرة)",
            usage: "طرد [ID] — أو: رد على رسالة الشخص ثم اكتب طرد",
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
                // Resolve target: explicit ID arg → last reply target in thread
                const argId = ctx.getArg(0);
                let targetId = (argId && /^\d+$/.test(argId)) ? argId : undefined;
                if (!targetId)
                    targetId = replyMap.get(ctx.thread.id);
                if (!targetId) {
                    await ctx.reply(`${HEADER}\n\n` +
                        "⚠️ لم يتم تحديد الشخص المراد طرده.\n\n" +
                        "📌 طريقة الاستخدام:\n" +
                        "  • رد على رسالة الشخص واكتب: طرد\n" +
                        "  • أو اكتب مباشرة: طرد [ID]");
                    return;
                }
                const botId = api.getCurrentUserID();
                if (targetId === botId) {
                    await ctx.reply("😅 لا أستطيع طرد نفسي!");
                    return;
                }
                if (targetId === ctx.user.id) {
                    await ctx.reply("⚠️ لا يمكنك طرد نفسك.");
                    return;
                }
                let name = targetId;
                try {
                    const info = await new Promise((res, rej) => {
                        api.getUserInfo(targetId, (err, d) => (err ? rej(err) : res(d)));
                    });
                    name = info[targetId]?.name ?? targetId;
                }
                catch { /* best-effort */ }
                try {
                    await new Promise((res, rej) => {
                        api.removeUserFromGroup(targetId, ctx.thread.id, (err) => (err ? rej(err) : res()));
                    });
                    replyMap.delete(ctx.thread.id);
                    pCtx.logger.info("KickPlugin: kicked.", { targetId, name, threadId: ctx.thread.id, by: ctx.user.id });
                    await ctx.reply(`${HEADER}\n\n✅ تم طرد ${name} من القروب 🚫`);
                }
                catch (err) {
                    pCtx.logger.warn("KickPlugin: kick failed.", { error: String(err) });
                    await ctx.reply(`❌ تعذّر طرد ${name}\nتأكد أن البوت أدمن في القروب.`);
                }
            },
        };
        pCtx.registerCommand(cmd);
        pCtx.logger.info(`KickPlugin enabled. Command "طرد" registered.`);
    }
    async onDisable() {
        if (this.rawListener) {
            const t = this.ctx.consumeService("mirai-transport");
            t?.removeRawEventListener(this.rawListener);
            this.rawListener = undefined;
        }
        this.ctx.logger.info("KickPlugin disabled.");
    }
    async onUnload() { this.ctx.logger.info("KickPlugin unloaded."); }
}
exports.default = new KickPlugin();
