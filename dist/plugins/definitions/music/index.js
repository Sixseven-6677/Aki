"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const fs_1 = __importDefault(require("fs"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
// ─── Constants ───────────────────────────────────────────────────────────────
const HEADER = "⸪⟅𝐕̶݈̂͜𝔈̟͢⃟݃།̶𝝬̶۪͛ۡ⸸𝚬̱̩⩨ܵ𝐁᮫͎ܺ݀ࣸ᷼᷍⃢ː𝚶̶݄݈݊𝐓݂ ❈ 🦢";
const COOLDOWN_MS = 15_000;
const TIMEOUT_MS = 120_000; // 2 min max
const YT_URL_REGEX = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/;
const cooldowns = new Map();
// ─── Helpers ─────────────────────────────────────────────────────────────────
function getApi(pCtx) {
    return (pCtx.consumeService("mirai-transport")?.getApi?.() ??
        pCtx.consumeService("mirai-transport-secondary")?.getApi?.() ??
        null);
}
function sendRaw(api, threadID, msg) {
    return new Promise((resolve, reject) => {
        api.sendMessage(msg, threadID, (err, info) => {
            if (err)
                reject(err);
            else
                resolve(info);
        });
    });
}
function tryUnsend(api, messageID) {
    if (!messageID)
        return;
    try {
        api.unsendMessage(messageID);
    }
    catch { /* best-effort */ }
}
function withTimeout(promise, ms, label) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`⏱ انتهت مهلة ${label} (${ms / 1000} ثانية)`)), ms)),
    ]);
}
/**
 * Download audio from a YouTube URL using the system yt-dlp + ffmpeg.
 * Returns the path to the temporary mp3 file.
 *
 * Why yt-dlp instead of @distube/ytdl-core:
 *   - yt-dlp is actively maintained and handles YouTube's frequent API changes.
 *   - ytdl-core npm packages frequently break when YouTube updates their player JS.
 *   - yt-dlp is provided as a nixpkgs system package so there are no npm install issues.
 */
async function downloadAudio(videoUrl, tmpMp3) {
    // yt-dlp -x extracts audio, --audio-format mp3 converts via ffmpeg.
    // -o specifies output template (yt-dlp appends the extension itself, so we strip it).
    const outputTemplate = tmpMp3.replace(/\.mp3$/, "");
    await execFileAsync("yt-dlp", [
        "--no-playlist",
        "--no-warnings",
        "--quiet",
        "-x",
        "--audio-format", "mp3",
        "--audio-quality", "128K",
        "--no-part",
        "-o", `${outputTemplate}.%(ext)s`,
        videoUrl,
    ], { timeout: TIMEOUT_MS });
    // yt-dlp writes e.g. /tmp/file.mp3 — verify it exists
    if (!fs_1.default.existsSync(tmpMp3)) {
        // Try without extension in case yt-dlp named it differently
        const files = fs_1.default.readdirSync(os_1.default.tmpdir()).filter((f) => f.startsWith(path_1.default.basename(outputTemplate)) && f.endsWith(".mp3"));
        if (files.length === 0) {
            throw new Error("yt-dlp ran but no mp3 file was created. Check ffmpeg is installed.");
        }
        // If found under a slightly different name, rename to expected path
        fs_1.default.renameSync(path_1.default.join(os_1.default.tmpdir(), files[0]), tmpMp3);
    }
}
// ─── Plugin ──────────────────────────────────────────────────────────────────
class MusicPlugin {
    manifest = {
        name: "music",
        version: "2.0.0",
        description: "تحميل الأغاني من يوتيوب عبر yt-dlp + ffmpeg (نظام). أكثر ثباتاً من ytdl-core.",
        author: "Sixseven-6677",
    };
    ctx;
    async onLoad(ctx) {
        this.ctx = ctx;
        // Verify yt-dlp is available at startup
        try {
            const { stdout } = await execFileAsync("yt-dlp", ["--version"]);
            ctx.logger.info("MusicPlugin: yt-dlp ready.", { version: stdout.trim() });
        }
        catch {
            ctx.logger.warn("MusicPlugin: yt-dlp not found in PATH. " +
                "Add nixPkgs = ['yt-dlp', 'ffmpeg'] to nixpacks.toml and redeploy.");
        }
    }
    async onEnable() {
        const pCtx = this.ctx;
        const cmd = {
            name: "اغاني",
            aliases: ["ytb", "music", "يوتيوب", "أغاني", "اغنية"],
            description: "تحميل اغنية من يوتيوب وإرسالها كملف صوتي",
            usage: "اغاني [اسم الاغنية أو رابط يوتيوب]",
            category: "private",
            adminOnly: false,
            hidden: false,
            async execute(ctx) {
                await ctx.typingOn();
                // ── Cooldown ──────────────────────────────────────────────────────
                const cdKey = `${ctx.user.id}:${ctx.thread.id}`;
                const lastRun = cooldowns.get(cdKey) ?? 0;
                const wait = COOLDOWN_MS - (Date.now() - lastRun);
                if (wait > 0) {
                    await ctx.reply(`⏳ انتظر ${Math.ceil(wait / 1000)} ثانية قبل الطلب التالي.`);
                    return;
                }
                const api = getApi(pCtx);
                if (!api) {
                    await ctx.reply("⚠️ خدمة Facebook غير متاحة حالياً.");
                    return;
                }
                const query = ctx.getRemainingText(0).trim();
                if (!query) {
                    await ctx.reply(`${HEADER}\n\n` +
                        "⚠️ اكتب اسم الأغنية أو رابط يوتيوب.\n\n" +
                        "📌 أمثلة:\n" +
                        "  اغاني صوت الحرية\n" +
                        "  اغاني https://youtu.be/dQw4w9WgXcQ");
                    return;
                }
                cooldowns.set(cdKey, Date.now());
                const threadID = ctx.thread.id;
                // Helper: update status message (unsend previous, send new)
                let statusMsgId = null;
                const setStatus = async (text) => {
                    tryUnsend(api, statusMsgId);
                    statusMsgId = null;
                    try {
                        const info = await sendRaw(api, threadID, text);
                        statusMsgId = info.messageID;
                    }
                    catch { /* ignore — status messages are non-critical */ }
                };
                const tmpMp3 = path_1.default.join(os_1.default.tmpdir(), `sixsu_${Date.now()}.mp3`);
                await setStatus(`🔍 جاري البحث عن: "${query}"...`);
                try {
                    // ── Step 1: Search YouTube ─────────────────────────────────────
                    // eslint-disable-next-line @typescript-eslint/no-var-requires
                    const ytSearch = require("youtube-search-api");
                    let videoId;
                    let title;
                    const urlMatch = query.match(YT_URL_REGEX);
                    if (urlMatch) {
                        videoId = urlMatch[1];
                        try {
                            const d = await withTimeout(ytSearch.GetVideoDetails(videoId), 15_000, "جلب التفاصيل");
                            title = d.title ?? query;
                        }
                        catch {
                            title = query;
                        }
                    }
                    else {
                        const results = await withTimeout(ytSearch.GetListByKeyword(query, false, 5), 15_000, "البحث");
                        const videos = (results.items ?? []).filter((v) => v.type === "video");
                        if (!videos.length) {
                            tryUnsend(api, statusMsgId);
                            await ctx.reply(`❌ لم أجد نتائج لـ "${query}"`);
                            return;
                        }
                        videoId = videos[0].id;
                        title = videos[0].title;
                    }
                    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
                    // ── Step 2: Download via yt-dlp ────────────────────────────────
                    await setStatus(`🎵 وجدت: ${title}\n🔄 جاري التحميل...`);
                    await withTimeout(downloadAudio(videoUrl, tmpMp3), TIMEOUT_MS, "التحميل");
                    // ── Step 3: Send audio file ────────────────────────────────────
                    await setStatus("📤 جاري الإرسال...");
                    if (!fs_1.default.existsSync(tmpMp3)) {
                        throw new Error("ملف الصوت لم يُنشأ — تحقق من تثبيت yt-dlp وffmpeg");
                    }
                    const fileSize = fs_1.default.statSync(tmpMp3).size;
                    pCtx.logger.info("MusicPlugin: sending audio.", {
                        title,
                        videoId,
                        fileSize,
                        threadId: threadID,
                    });
                    tryUnsend(api, statusMsgId);
                    statusMsgId = null;
                    await sendRaw(api, threadID, {
                        body: `${HEADER}\n\n🎵 ${title}`,
                        attachment: fs_1.default.createReadStream(tmpMp3),
                    });
                    try {
                        fs_1.default.unlinkSync(tmpMp3);
                    }
                    catch { /* ignore */ }
                    pCtx.logger.info("MusicPlugin: done.", { title, threadId: threadID });
                }
                catch (err) {
                    tryUnsend(api, statusMsgId);
                    statusMsgId = null;
                    const msg = err instanceof Error ? err.message : String(err);
                    pCtx.logger.warn("MusicPlugin: failed.", { error: msg, threadId: threadID });
                    // Cleanup temp file
                    try {
                        if (fs_1.default.existsSync(tmpMp3))
                            fs_1.default.unlinkSync(tmpMp3);
                    }
                    catch { /* ignore */ }
                    // User-facing error — show actual reason, not a generic npm hint
                    let friendlyMsg = `❌ تعذّر تحميل الأغنية.\n\n🔍 السبب:\n${msg}`;
                    if (msg.includes("yt-dlp") && msg.includes("not found")) {
                        friendlyMsg =
                            "❌ أداة yt-dlp غير مثبّتة على السيرفر.\n\n" +
                                "💡 الحل: أضف هذا لـ nixpacks.toml وأعد النشر:\n" +
                                "[phases.setup]\nnixPkgs = [\"yt-dlp\", \"ffmpeg\"]";
                    }
                    else if (msg.includes("429") || msg.includes("rate limit")) {
                        friendlyMsg =
                            "❌ يوتيوب يحجب الطلب مؤقتاً (rate limit).\n\n💡 حاول مرة أخرى بعد قليل.";
                    }
                    else if (msg.includes("age") || msg.includes("sign in")) {
                        friendlyMsg = "❌ هذا الفيديو مقيّد بالعمر — لا يمكن تحميله.";
                    }
                    else if (msg.includes("private") || msg.includes("unavailable")) {
                        friendlyMsg = "❌ هذا الفيديو خاص أو غير متاح.";
                    }
                    else if (msg.includes("انتهت مهلة")) {
                        friendlyMsg = "⏱ انتهت مهلة التحميل (أكثر من دقيقتين). حاول مع أغنية أقصر.";
                    }
                    await ctx.reply(`${HEADER}\n\n${friendlyMsg}`);
                }
            },
        };
        pCtx.registerCommand(cmd);
        pCtx.logger.info(`MusicPlugin v2.0 enabled. Command "اغاني" registered. Using yt-dlp + ffmpeg.`);
    }
    async onDisable() { this.ctx.logger.info("MusicPlugin disabled."); }
    async onUnload() { this.ctx.logger.info("MusicPlugin unloaded."); }
}
exports.default = new MusicPlugin();
