"use strict";
// ─── Shared UI Formatter ─────────────────────────────────────────────────────
// Single source of truth for all bot message styling.
// All plugins import from here — never build raw message strings manually.
Object.defineProperty(exports, "__esModule", { value: true });
exports.CATEGORY_META = exports.DIV = exports.BRAND = void 0;
exports.toBold = toBold;
exports.resolveCategory = resolveCategory;
exports.buildCommandsMessage = buildCommandsMessage;
exports.buildCategoryMessage = buildCategoryMessage;
exports.buildUptimeMessage = buildUptimeMessage;
exports.pluginHeader = pluginHeader;
exports.BRAND = "⸪⟅𝐕̶݈̂͜𝔈̟͢⃟݃།̶𝝬̶۪͛ۡ⸸𝚬̱̩⩨ܵ𝐁᮫͎ܺ݀ࣸ᷼᷍⃢ː𝚬̶݄݈݊𝐓݂ ❈ 🦢";
exports.DIV = "━━━━━━━━━━━━";
// ─── Bold unicode digits ──────────────────────────────────────────────────────
// ممنوع استخدام 0-9 مباشرة في الرسائل — استخدم toBold() دائماً.
const BOLD_DIGIT = {
    "0": "𝟶", "1": "𝟷", "2": "𝟸", "3": "𝟹", "4": "𝟺",
    "5": "𝟻", "6": "𝟼", "7": "𝟽", "8": "𝟾", "9": "𝟿",
};
/** تحويل أي عدد إلى نمط الأرقام المزخرفة — يدعم أي عدد مهما كبر. */
function toBold(n) {
    return String(n)
        .split("")
        .map((c) => BOLD_DIGIT[c] ?? c)
        .join("");
}
/**
 * الأقسام الثلاثة الرسمية للبوت.
 * أضف أوامر جديدة لأي قسم عبر category: "system" | "private" | "admin"
 * في تعريف ICommand — ستظهر تلقائياً في القائمة.
 */
exports.CATEGORY_META = [
    {
        key: "system",
        label: "اوامر النظام",
        emoji: "🪅",
        triggers: ["نظام", "system", "sys"],
    },
    {
        key: "private",
        label: "اوامر خاصة",
        emoji: "🌨",
        triggers: ["خاصة", "خاص", "special", "private"],
    },
    {
        key: "admin",
        label: "اوامر الادارة",
        emoji: "🏴",
        triggers: ["ادارة", "الادارة", "إدارة", "الإدارة", "admin", "adm"],
    },
];
/** ترجمة كلمة مفتاح عربية/إنجليزية إلى CategoryMeta، أو null إن لم تُعرَف. */
function resolveCategory(keyword) {
    const k = keyword.trim().toLowerCase();
    return exports.CATEGORY_META.find((c) => c.triggers.some((t) => t.toLowerCase() === k)) ?? null;
}
// ─── Dynamic main menu ───────────────────────────────────────────────────────
/**
 * بناء رسالة القائمة الرئيسية ديناميكياً.
 *
 * @param prefix    - البادئة الحالية
 * @param catCounts - عدد الأوامر لكل category key (من CommandRegistry.byCategory())
 */
function buildCommandsMessage(prefix, catCounts) {
    const groupLines = exports.CATEGORY_META.map((cat) => {
        const count = catCounts.get(cat.key) ?? 0;
        return `${cat.label} ${toBold(count)} . ̶ׁ${cat.emoji} ▾`;
    });
    return [
        exports.BRAND,
        `⌗ ⨯ أمر البادئة الحالي هو  ' ${prefix} ' ${exports.DIV}`,
        ...groupLines,
        `${exports.DIV} `,
        `🪭 . ៹࣪- لعرض التفاصيل  :[اوامر"اسم القسم"]`,
        exports.BRAND,
    ].join("\n");
}
// ─── Dynamic category detail ─────────────────────────────────────────────────
/**
 * بناء رسالة تفاصيل قسم واحد من الأوامر الحية.
 *
 * @param meta   - بيانات الفئة
 * @param cmds   - الأوامر الحية من Registry لهذا القسم
 * @param prefix - البادئة الحالية
 */
function buildCategoryMessage(meta, cmds, prefix) {
    const cmdLines = cmds.map((c) => `. ̶ׁ${meta.emoji} ${prefix}${c.name} — ${c.description ?? ""}`);
    return [
        exports.BRAND,
        `⌗ ⨯ ${meta.emoji} ${meta.label} ${exports.DIV}`,
        ...cmdLines,
        `${exports.DIV} `,
        `🪭 . ៹࣪- للقائمة الكاملة: ${prefix}اوامر`,
    ].join("\n");
}
function fmtUptime(seconds) {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${s}ث:${m}د:${h}س:${d}يوم`;
}
function buildUptimeMessage(data) {
    return [
        `، معلومات النظام ̸̸🪭ˑ˖`,
        ` ${exports.DIV} `,
        `. 🎉وقت التشغيل: ${fmtUptime(data.uptimeSec)}`,
        ` 🌨 الرام المتبقي: ${data.freeMemMB} MB `,
        `🎫 رام النظام: ${data.usedMemMB}/${data.totalMemMB} MB`,
        ` 🪇استهلاك المعالج: ${data.cpuPct}% `,
        `🎬الانوية: ${data.cpuCores} `,
        `📜اصدار Node: ${data.nodeVersion} `,
        `⛓️النظام: ${data.osType} ${data.arch} `,
        `⌛الاستجابة: ${data.latencyMs}ms ${exports.DIV}`,
    ].join("\n");
}
// ─── Generic reply header ─────────────────────────────────────────────────────
function pluginHeader(section) {
    return `${exports.BRAND}\n⌗ ⨯ ${section} ${exports.DIV}`;
}
