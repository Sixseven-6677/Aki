"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// ─── Constants ────────────────────────────────────────────────────────────────
const HEADER = "⸪⟅𝐕̶݈̂͜𝔈̟͢⃟݃།̶𝝬̶۪͛ۡ⸸𝚬̱̩⩨ܵ𝐁᮫͎ܺ݀ࣸ᷼᷍⃢ː𝚶̶݄݈݊𝐓݂ ❈ 🦢";
// ─── Helpers ──────────────────────────────────────────────────────────────────
function getAdminStore(pCtx) {
    return pCtx.consumeService("admin-store") ?? null;
}
function getUserService(pCtx) {
    return pCtx.consumeService("user-service") ?? null;
}
/**
 * Sync the admin role change to MongoDB via UserService.
 * Fire-and-forget — never blocks the command handler.
 * Automatically invalidates the 5-minute user cache so
 * ctx.hasRole("admin") reflects the new role immediately.
 */
function syncRoleToDb(pCtx, fbId, role, action) {
    const userSvc = getUserService(pCtx);
    if (!userSvc)
        return;
    userSvc.updateProfile(fbId, { role }).catch((err) => {
        pCtx.logger.warn(`OwnerPlugin: failed to sync role "${role}" to MongoDB for ${fbId} (${action}).`, { error: err instanceof Error ? err.message : String(err) });
    });
}
// ─── Sub-handlers ─────────────────────────────────────────────────────────────
async function handleAdd(ctx, pCtx) {
    await ctx.typingOn();
    const store = getAdminStore(pCtx);
    if (!store) {
        await ctx.reply("⚠️ خدمة إدارة الأدمن غير متاحة.");
        return;
    }
    const targetId = ctx.getArg(1);
    if (!targetId || !/^\d+$/.test(targetId)) {
        await ctx.reply([
            HEADER, "",
            "⚠️ الرجاء إدخال ID صحيح.",
            "مثال: /مالك اضافة 1234567890",
        ].join("\n"));
        return;
    }
    if (store.has(targetId)) {
        await ctx.reply([
            HEADER, "",
            `ℹ️ المستخدم ${targetId} هو أدمن بوت بالفعل.`,
        ].join("\n"));
        return;
    }
    // 1. Add to in-memory AdminStore (+ MongoDB via AdminStore.add)
    store.add(targetId, ctx.user.id);
    // 2. Sync MongoDB User role → "admin" + invalidate cache
    //    This ensures ctx.hasRole("admin") works even on next restart
    //    before AdminStore is loaded from MongoDB.
    syncRoleToDb(pCtx, targetId, "admin", "add");
    pCtx.logger.info("OwnerPlugin: bot admin added.", { targetId, by: ctx.user.id });
    await ctx.reply([
        HEADER, "",
        `✅ تم إضافة ${targetId} كأدمن للبوت.`,
        `⌯ إجمالي الأدمن: ${store.size()}`,
        `⌯ الصلاحيات مفعّلة فوراً دون إعادة تشغيل.`,
    ].join("\n"));
}
async function handleRemove(ctx, pCtx) {
    await ctx.typingOn();
    const store = getAdminStore(pCtx);
    if (!store) {
        await ctx.reply("⚠️ خدمة إدارة الأدمن غير متاحة.");
        return;
    }
    const raw = ctx.getArg(1);
    if (!raw) {
        await ctx.reply([
            HEADER, "",
            "⚠️ الرجاء تحديد ID أو رقم الأدمن من القائمة.",
            "مثال: /ادمن حذف 1234567890",
            "أو:    /ادمن حذف 2",
        ].join("\n"));
        return;
    }
    let targetId = raw;
    const num = parseInt(raw, 10);
    if (!isNaN(num) && num >= 1) {
        const all = store.getAll();
        const entry = all[num - 1];
        if (!entry) {
            await ctx.reply(`⚠️ لا يوجد أدمن برقم ${num}.`);
            return;
        }
        targetId = entry;
    }
    if (!store.has(targetId)) {
        await ctx.reply([
            HEADER, "",
            `ℹ️ المستخدم ${targetId} ليس أدمن بوت.`,
        ].join("\n"));
        return;
    }
    // 1. Remove from in-memory AdminStore (+ MongoDB via AdminStore.remove)
    store.remove(targetId);
    // 2. Downgrade MongoDB User role → "user" + invalidate cache
    syncRoleToDb(pCtx, targetId, "user", "remove");
    pCtx.logger.info("OwnerPlugin: bot admin removed.", { targetId, by: ctx.user.id });
    await ctx.reply([
        HEADER, "",
        `✅ تم إزالة ${targetId} من أدمن البوت.`,
        `⌯ إجمالي الأدمن: ${store.size()}`,
    ].join("\n"));
}
async function handleList(ctx, pCtx) {
    await ctx.typingOn();
    const store = getAdminStore(pCtx);
    if (!store) {
        await ctx.reply("⚠️ خدمة إدارة الأدمن غير متاحة.");
        return;
    }
    const all = store.getAll();
    if (all.length === 0) {
        await ctx.reply([HEADER, "", "⌯ لا يوجد أدمن مضافون حالياً."].join("\n"));
        return;
    }
    const lines = all.map((id, i) => `  ${i + 1}. ${id}`);
    await ctx.reply([
        HEADER, "",
        `⌯ أدمن البوت (${all.length}):`,
        ...lines,
    ].join("\n"));
}
async function showHelp(ctx) {
    await ctx.reply([
        HEADER, "",
        "⌯ أوامر إدارة الأدمن (للأدمن فقط):", "",
        "• /مالك اضافة <ID>",
        "  ↳ إضافة مستخدم كأدمن للبوت", "",
        "• /مالك حذف <ID أو رقم>",
        "  ↳ إزالة أدمن من البوت", "",
        "• /مالك قائمة",
        "  ↳ عرض جميع أدمن البوت",
    ].join("\n"));
}
// ─── Plugin ───────────────────────────────────────────────────────────────────
class OwnerPlugin {
    manifest = {
        name: "owner",
        version: "2.0.0",
        description: "إدارة أدمن البوت — إضافة وحذف الأدمن (للأدمن فقط). يزامن مع MongoDB.",
        author: "Sixseven-6677",
    };
    ctx;
    async onLoad(ctx) {
        this.ctx = ctx;
        ctx.logger.info("OwnerPlugin loaded.");
    }
    async onEnable() {
        const pCtx = this.ctx;
        const ownerCommand = {
            name: "مالك",
            aliases: ["owner", "botadmin"],
            description: "إدارة أدمن البوت (إضافة/حذف) — للأدمن فقط",
            usage: "مالك [اضافة <ID> | حذف <ID> | قائمة]",
            category: "admin",
            adminOnly: false,
            hidden: false,
            async execute(ctx) {
                if (!ctx.hasRole("admin")) {
                    await ctx.reply("🚫 هذا الأمر للأدمن فقط.");
                    return;
                }
                const sub = ctx.getArg(0);
                switch (sub) {
                    case "اضافة":
                    case "add":
                        await handleAdd(ctx, pCtx);
                        break;
                    case "حذف":
                    case "remove":
                        await handleRemove(ctx, pCtx);
                        break;
                    case "قائمة":
                    case "list":
                        await handleList(ctx, pCtx);
                        break;
                    default:
                        await showHelp(ctx);
                }
            },
        };
        pCtx.registerCommand(ownerCommand);
        pCtx.logger.info(`Command "${ownerCommand.name}" registered ` +
            `(aliases: ${ownerCommand.aliases?.join(", ")}). Category: admin.`);
    }
    async onDisable() { this.ctx.logger.info("OwnerPlugin disabled."); }
    async onUnload() { this.ctx.logger.info("OwnerPlugin unloaded."); }
}
exports.default = new OwnerPlugin();
