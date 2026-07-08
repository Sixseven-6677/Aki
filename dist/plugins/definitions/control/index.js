"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const GroupControlRegistry_1 = require("../../../protection/GroupControlRegistry");
// ─── Error helpers ─────────────────────────────────────────────────────────────
/**
 * Serialize any value thrown by fca-unofficial into a human-readable string.
 * FCA often rejects with a plain object like { error: 1357004, ... } rather
 * than a proper Error instance, so String(err) yields "[object Object]".
 */
function serializeError(err) {
    if (err instanceof Error)
        return err.message;
    if (typeof err === "string")
        return err;
    try {
        return JSON.stringify(err);
    }
    catch {
        return String(err);
    }
}
class GroupCache {
    _groups = [];
    _refreshedAt = 0;
    _lastError = null;
    TTL_MS = 60_000;
    get groups() { return this._groups; }
    get refreshedAt() { return this._refreshedAt; }
    get ageSeconds() { return Math.round((Date.now() - this._refreshedAt) / 1000); }
    get stale() { return Date.now() - this._refreshedAt > this.TTL_MS; }
    get lastError() { return this._lastError; }
    /**
     * Fetch the thread list from FCA.
     * Tries ["INBOX"] first; falls back to [] if that call returns an error
     * (some account types / FCA versions reject the INBOX tag).
     */
    async refresh(api) {
        const fetchThreads = (tags) => new Promise((resolve, reject) => {
            api.getThreadList(100, null, tags, (err, list) => {
                if (err)
                    reject(err);
                else
                    resolve(list ?? []);
            });
        });
        let threads;
        try {
            threads = await fetchThreads(["INBOX"]);
        }
        catch (firstErr) {
            // Fallback: try without tag filter — works on some account types
            try {
                threads = await fetchThreads([]);
            }
            catch (secondErr) {
                // Both attempts failed — propagate the second error (more informative)
                this._lastError = serializeError(secondErr);
                throw secondErr;
            }
        }
        this._groups = threads
            .filter(t => t.isGroup)
            .map(g => ({
            threadID: g.threadID,
            name: g.name?.trim() || "قروب بدون اسم",
            membersCount: g.participantIDs?.length ?? 0,
        }));
        this._refreshedAt = Date.now();
        this._lastError = null;
    }
    getByIndex(n) { return this._groups[n - 1]; }
    updateName(threadID, name) {
        const e = this._groups.find(g => g.threadID === threadID);
        if (e)
            e.name = name;
    }
    remove(threadID) {
        this._groups = this._groups.filter(g => g.threadID !== threadID);
    }
}
// ─── Helpers ──────────────────────────────────────────────────────────────────
const HEADER = "⸪⟅𝐕̶݈̂͜𝔈̟͢⃟݃།̶𝝬̶۪͛ۡ⸸𝚬̱̩⩨ܵ𝐁᮫͎ܺ݀ࣸ᷼᷍⃢ː𝚶̶݄݈݊𝐓݂ ❈ 🦢";
function getApi(pCtx) {
    return (pCtx.consumeService("mirai-transport")?.getApi?.() ??
        pCtx.consumeService("mirai-transport-secondary")?.getApi?.() ??
        null);
}
async function ensureFresh(cache, api, pCtx) {
    if (!cache.stale)
        return true;
    try {
        await cache.refresh(api);
        pCtx.logger.info("ControlPlugin: cache refreshed.", { count: cache.groups.length });
        return true;
    }
    catch (err) {
        pCtx.logger.warn("ControlPlugin: cache refresh failed.", { error: serializeError(err) });
        return false;
    }
}
function formatAge(ts) {
    if (!ts)
        return "لم يُسجَّل";
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60_000);
    if (m < 1)
        return "الآن";
    if (m < 60)
        return `منذ ${m} دقيقة`;
    const h = Math.floor(m / 60);
    if (h < 24)
        return `منذ ${h} ساعة`;
    return `منذ ${Math.floor(h / 24)} يوم`;
}
function parseIndex(arg, max) {
    if (!arg)
        return null;
    const n = parseInt(arg, 10);
    return (!isNaN(n) && n >= 1 && n <= max) ? n : null;
}
// ─── Sub-command handlers ─────────────────────────────────────────────────────
async function handleList(ctx, pCtx, cache) {
    const api = getApi(pCtx);
    if (!api) {
        await ctx.reply("⚠️ خدمة Facebook غير متاحة.");
        return;
    }
    const refreshed = await ensureFresh(cache, api, pCtx);
    // If refresh failed AND cache is completely empty, show the actual error
    // instead of the misleading "البوت ليس في أي قروب" message.
    if (!refreshed && cache.groups.length === 0) {
        const errDetail = cache.lastError ?? "خطأ غير معروف";
        await ctx.reply([
            HEADER, "",
            "⚠️ تعذّر جلب قائمة القروبات من Facebook.",
            `⌯ السبب: ${errDetail}`,
            "",
            "⌯ حاول مجدداً بعد لحظات أو أعد تشغيل البوت.",
        ].join("\n"));
        return;
    }
    const groups = cache.groups;
    if (groups.length === 0) {
        await ctx.reply(`${HEADER}\n\n⌯ البوت ليس في أي قروب حالياً.`);
        return;
    }
    const lines = groups.slice(0, 25).map((g, i) => {
        const muted = (0, GroupControlRegistry_1.isMuted)(g.threadID) ? " 🔕" : "";
        const activity = (0, GroupControlRegistry_1.getLastActivity)(g.threadID);
        const active = activity ? ` · ${formatAge(activity)}` : "";
        return `  ${i + 1}. ${g.name} (${g.membersCount} عضو)${muted}${active}`;
    });
    const more = groups.length > 25 ? `\n⌯ +${groups.length - 25} قروب إضافي` : "";
    const staleNote = !refreshed ? "⚠️ البيانات قد تكون غير محدّثة (تعذّر التحديث من Facebook)." : "";
    await ctx.reply([
        HEADER, "",
        `⌯ إجمالي القروبات: ${groups.length}`,
        `⌯ آخر تحديث: قبل ${cache.ageSeconds} ثانية`,
        staleNote,
        "",
        ...lines, more, "",
        "⌯ للإدارة: قروب [حالة|رسالة|مغادرة|اسم|كتم|فتح] [رقم]",
    ].filter(Boolean).join("\n"));
}
async function handleStatus(ctx, pCtx, cache, n) {
    const api = getApi(pCtx);
    if (!api) {
        await ctx.reply("⚠️ خدمة Facebook غير متاحة.");
        return;
    }
    const entry = cache.getByIndex(n);
    if (!entry) {
        await ctx.reply("⚠️ رقم غير صحيح. استخدم «قروبات» لرؤية القائمة.");
        return;
    }
    let adminsCount = 0;
    try {
        const info = await new Promise((resolve, reject) => {
            api.getThreadInfo(entry.threadID, (err, i) => err ? reject(err) : resolve(i));
        });
        adminsCount = info.adminIDs?.length ?? 0;
        entry.membersCount = info.participantIDs?.length ?? entry.membersCount;
    }
    catch { /* best effort */ }
    await ctx.reply([
        HEADER, "",
        `⌯ القروب رقم ${n}`, "",
        `📛 الاسم: ${entry.name}`,
        `👥 الأعضاء: ${entry.membersCount}`,
        `👑 الأدمن: ${adminsCount || "غير معروف"}`,
        `🔇 الكتم: ${(0, GroupControlRegistry_1.isMuted)(entry.threadID) ? "مفعّل ✅" : "غير مفعّل ❌"}`,
        `🕐 آخر نشاط: ${formatAge((0, GroupControlRegistry_1.getLastActivity)(entry.threadID))}`,
        `🆔 المعرّف: ${entry.threadID}`,
    ].join("\n"));
}
async function handleSendMessage(ctx, pCtx, cache, n, text) {
    const api = getApi(pCtx);
    if (!api) {
        await ctx.reply("⚠️ خدمة Facebook غير متاحة.");
        return;
    }
    const entry = cache.getByIndex(n);
    if (!entry) {
        await ctx.reply("⚠️ رقم غير صحيح.");
        return;
    }
    if (!text.trim()) {
        await ctx.reply("⚠️ الرجاء كتابة نص الرسالة بعد الرقم.\n📌 مثال: قروب رسالة 3 مرحبا");
        return;
    }
    try {
        await new Promise((resolve, reject) => {
            api.sendMessage({ body: text }, entry.threadID, (err) => err ? reject(err) : resolve());
        });
        pCtx.logger.info("ControlPlugin: message sent.", { to: entry.threadID, name: entry.name, by: ctx.user.id });
        await ctx.reply(`✅ تم إرسال الرسالة إلى «${entry.name}».`);
    }
    catch (err) {
        pCtx.logger.warn("ControlPlugin: sendMessage failed.", { error: serializeError(err) });
        await ctx.reply("⚠️ فشل إرسال الرسالة.");
    }
}
async function handleLeave(ctx, pCtx, cache, n) {
    const api = getApi(pCtx);
    if (!api) {
        await ctx.reply("⚠️ خدمة Facebook غير متاحة.");
        return;
    }
    const entry = cache.getByIndex(n);
    if (!entry) {
        await ctx.reply("⚠️ رقم غير صحيح.");
        return;
    }
    const botId = api.getCurrentUserID();
    try {
        await new Promise((resolve, reject) => {
            api.removeUserFromGroup(botId, entry.threadID, (err) => err ? reject(err) : resolve());
        });
        const name = entry.name;
        cache.remove(entry.threadID);
        (0, GroupControlRegistry_1.unmuteThread)(entry.threadID);
        pCtx.logger.info("ControlPlugin: left group.", { threadID: entry.threadID, name, by: ctx.user.id });
        await ctx.reply(`✅ غادر البوت القروب «${name}» بنجاح.`);
    }
    catch (err) {
        pCtx.logger.warn("ControlPlugin: leaveGroup failed.", { error: serializeError(err) });
        await ctx.reply(`⚠️ فشل مغادرة القروب. تأكد أن البوت ليس المالك الوحيد.`);
    }
}
async function handleRename(ctx, pCtx, cache, n, newName) {
    const api = getApi(pCtx);
    if (!api) {
        await ctx.reply("⚠️ خدمة Facebook غير متاحة.");
        return;
    }
    const entry = cache.getByIndex(n);
    if (!entry) {
        await ctx.reply("⚠️ رقم غير صحيح.");
        return;
    }
    if (!newName.trim()) {
        await ctx.reply("⚠️ الرجاء إدخال الاسم الجديد.\n📌 مثال: قروب اسم 2 اسم جديد");
        return;
    }
    const oldName = entry.name;
    try {
        await new Promise((resolve, reject) => {
            api.setTitle(newName, entry.threadID, (err) => err ? reject(err) : resolve());
        });
        cache.updateName(entry.threadID, newName);
        pCtx.logger.info("ControlPlugin: renamed.", { threadID: entry.threadID, from: oldName, to: newName, by: ctx.user.id });
        await ctx.reply(`${HEADER}\n\n✅ تم تغيير اسم القروب:\n«${oldName}» ← «${newName}»`);
    }
    catch (err) {
        pCtx.logger.warn("ControlPlugin: setTitle failed.", { error: serializeError(err) });
        await ctx.reply("⚠️ فشل تغيير الاسم. تأكد أن البوت أدمن في القروب.");
    }
}
async function handleMute(ctx, pCtx, cache, n) {
    const entry = cache.getByIndex(n);
    if (!entry) {
        await ctx.reply("⚠️ رقم غير صحيح.");
        return;
    }
    if ((0, GroupControlRegistry_1.isMuted)(entry.threadID)) {
        await ctx.reply(`ℹ️ القروب «${entry.name}» مكتوم بالفعل. استخدم «قروب فتح ${n}» لإلغاء الكتم.`);
        return;
    }
    (0, GroupControlRegistry_1.muteThread)(entry.threadID);
    pCtx.logger.info("ControlPlugin: muted.", { threadID: entry.threadID, by: ctx.user.id });
    await ctx.reply([
        HEADER, "",
        `🔇 تم كتم القروب «${entry.name}».`,
        `⌯ لن يتم تنفيذ أي أوامر من هذا القروب حتى يُفتح.`,
        `⌯ لإلغاء الكتم: قروب فتح ${n}`,
    ].join("\n"));
}
async function handleUnmute(ctx, pCtx, cache, n) {
    const entry = cache.getByIndex(n);
    if (!entry) {
        await ctx.reply("⚠️ رقم غير صحيح.");
        return;
    }
    if (!(0, GroupControlRegistry_1.isMuted)(entry.threadID)) {
        await ctx.reply(`ℹ️ القروب «${entry.name}» غير مكتوم أصلاً.`);
        return;
    }
    (0, GroupControlRegistry_1.unmuteThread)(entry.threadID);
    pCtx.logger.info("ControlPlugin: unmuted.", { threadID: entry.threadID, by: ctx.user.id });
    await ctx.reply([
        HEADER, "",
        `🔔 تم فتح القروب «${entry.name}».`,
        "⌯ تم استئناف تنفيذ الأوامر في هذا القروب.",
    ].join("\n"));
}
// ─── Plugin class ─────────────────────────────────────────────────────────────
class ControlPlugin {
    manifest = {
        name: "control",
        version: "1.1.0",
        description: "لوحة تحكم مركزية لإدارة جميع القروبات عن بُعد.",
        author: "Sixseven-6677",
    };
    ctx;
    cache = new GroupCache();
    async onLoad(ctx) {
        this.ctx = ctx;
        ctx.logger.info("ControlPlugin loaded.");
    }
    async onEnable() {
        const pCtx = this.ctx;
        const cache = this.cache;
        pCtx.scheduleRecurring({
            name: "control-group-cache-refresh",
            intervalMs: 600_000, // 10 min - heavy API call was every 60s
            runImmediately: true,
            fn: async () => {
                const api = getApi(pCtx);
                if (!api)
                    return;
                try {
                    await cache.refresh(api);
                    pCtx.logger.info("ControlPlugin: scheduled cache refresh.", {
                        groups: cache.groups.length,
                        muted: (0, GroupControlRegistry_1.getMutedThreads)().size,
                    });
                }
                catch (err) {
                    pCtx.logger.warn("ControlPlugin: scheduled refresh failed.", { error: serializeError(err) });
                }
            },
        });
        const cmdList = {
            name: "قروبات",
            aliases: ["groups", "threads", "qroubat"],
            description: "عرض قائمة جميع القروبات مع حالة كل منها",
            usage: "قروبات",
            category: "admin",
            adminOnly: true,
            hidden: false,
            async execute(ctx) { await handleList(ctx, pCtx, cache); },
        };
        const cmdControl = {
            name: "قروب",
            aliases: ["group", "ctrl"],
            description: "إدارة قروب محدد: حالة | رسالة | مغادرة | اسم | كتم | فتح",
            usage: "قروب [أمر] [رقم] [نص؟]",
            category: "admin",
            adminOnly: true,
            hidden: false,
            async execute(ctx) {
                const sub = ctx.getArg(0);
                const max = cache.groups.length;
                const noIdx = `⚠️ الرجاء تحديد رقم القروب (1–${max || "؟"}). استخدم «قروبات» أولاً.`;
                if (!sub) {
                    await ctx.reply([
                        HEADER, "",
                        "⌯ أوامر التحكم بالقروبات:", "",
                        "  قروبات — عرض جميع القروبات",
                        "  قروب حالة [رقم] — حالة قروب محدد",
                        "  قروب رسالة [رقم] [نص] — إرسال رسالة",
                        "  قروب مغادرة [رقم] — مغادرة القروب",
                        "  قروب اسم [رقم] [اسم] — تغيير الاسم",
                        "  قروب كتم [رقم] — كتم الأوامر من القروب",
                        "  قروب فتح [رقم] — إلغاء كتم القروب",
                    ].join("\n"));
                    return;
                }
                const n = parseIndex(ctx.getArg(1), max);
                if (sub === "حالة" || sub === "status") {
                    if (!n) {
                        await ctx.reply(noIdx);
                        return;
                    }
                    await handleStatus(ctx, pCtx, cache, n);
                }
                else if (sub === "رسالة" || sub === "msg" || sub === "message") {
                    if (!n) {
                        await ctx.reply(noIdx);
                        return;
                    }
                    await handleSendMessage(ctx, pCtx, cache, n, ctx.args.slice(2).join(" ").trim());
                }
                else if (sub === "مغادرة" || sub === "leave") {
                    if (!n) {
                        await ctx.reply(noIdx);
                        return;
                    }
                    await handleLeave(ctx, pCtx, cache, n);
                }
                else if (sub === "اسم" || sub === "name") {
                    if (!n) {
                        await ctx.reply(noIdx);
                        return;
                    }
                    await handleRename(ctx, pCtx, cache, n, ctx.args.slice(2).join(" ").trim());
                }
                else if (sub === "كتم" || sub === "mute") {
                    if (!n) {
                        await ctx.reply(noIdx);
                        return;
                    }
                    await handleMute(ctx, pCtx, cache, n);
                }
                else if (sub === "فتح" || sub === "unmute" || sub === "open") {
                    if (!n) {
                        await ctx.reply(noIdx);
                        return;
                    }
                    await handleUnmute(ctx, pCtx, cache, n);
                }
                else {
                    await ctx.reply(`⚠️ أمر غير معروف: «${sub}»\n` +
                        `⌯ الأوامر: حالة | رسالة | مغادرة | اسم | كتم | فتح`);
                }
            },
        };
        pCtx.registerCommand(cmdList);
        pCtx.registerCommand(cmdControl);
        pCtx.logger.info(`ControlPlugin enabled. Commands: قروبات, قروب. ` +
            `Groups cached: ${cache.groups.length}. Muted: ${(0, GroupControlRegistry_1.getMutedThreads)().size}.`);
    }
    async onDisable() { this.ctx.logger.info("ControlPlugin disabled."); }
    async onUnload() { this.ctx.logger.info("ControlPlugin unloaded."); }
}
exports.default = new ControlPlugin();
