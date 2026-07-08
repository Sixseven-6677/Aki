"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileTransport = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const ILogger_1 = require("../types/ILogger");
function formatEntry(entry) {
    const record = {
        timestamp: entry.timestamp.toISOString(),
        level: entry.level,
        message: entry.message,
    };
    if (entry.context)
        record["context"] = entry.context;
    if (entry.meta)
        record["meta"] = entry.meta;
    if (entry.error) {
        record["error"] = {
            message: entry.error.message,
            stack: entry.error.stack,
            name: entry.error.name,
        };
    }
    return JSON.stringify(record);
}
function resolveDaily(dir, base) {
    const date = new Date().toISOString().slice(0, 10);
    const ext = path_1.default.extname(base);
    const name = path_1.default.basename(base, ext);
    return path_1.default.join(dir, `${name}-${date}${ext}`);
}
class FileTransport {
    name = "file";
    dir;
    combined;
    errors;
    maxSize;
    constructor(options) {
        this.dir = path_1.default.resolve(options.dir);
        this.combined = options.combined ?? "combined.log";
        this.errors = options.errors ?? "error.log";
        this.maxSize = options.maxSizeBytes ?? 10 * 1024 * 1024;
        fs_1.default.mkdirSync(this.dir, { recursive: true });
    }
    write(entry) {
        const line = formatEntry(entry) + "\n";
        this.append(resolveDaily(this.dir, this.combined), line);
        if (entry.level === ILogger_1.LogLevel.ERROR || entry.level === ILogger_1.LogLevel.WARN) {
            this.append(resolveDaily(this.dir, this.errors), line);
        }
    }
    append(filePath, data) {
        try {
            this.rotateIfNeeded(filePath);
            fs_1.default.appendFileSync(filePath, data, "utf8");
        }
        catch {
            /* intentionally silent — file errors should not crash the app */
        }
    }
    rotateIfNeeded(filePath) {
        try {
            const stat = fs_1.default.statSync(filePath);
            if (stat.size >= this.maxSize) {
                const rotated = filePath.replace(/(\.\w+)$/, `.${Date.now()}$1`);
                fs_1.default.renameSync(filePath, rotated);
            }
        }
        catch {
            /* file doesn't exist yet — that's fine */
        }
    }
}
exports.FileTransport = FileTransport;
