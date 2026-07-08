"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConsoleTransport = void 0;
const ILogger_1 = require("../types/ILogger");
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const GRAY = "\x1b[90m";
const WHITE = "\x1b[37m";
const LEVEL_COLOR = {
    [ILogger_1.LogLevel.DEBUG]: GRAY,
    [ILogger_1.LogLevel.INFO]: CYAN,
    [ILogger_1.LogLevel.WARN]: YELLOW,
    [ILogger_1.LogLevel.ERROR]: `${BOLD}${RED}`,
};
const LEVEL_LABEL = {
    [ILogger_1.LogLevel.DEBUG]: "DEBUG",
    [ILogger_1.LogLevel.INFO]: "INFO ",
    [ILogger_1.LogLevel.WARN]: "WARN ",
    [ILogger_1.LogLevel.ERROR]: "ERROR",
};
function formatTime(date) {
    return date.toTimeString().slice(0, 8);
}
function formatDate(date) {
    return date.toISOString().slice(0, 10);
}
function formatMeta(meta) {
    const entries = Object.entries(meta);
    if (entries.length === 0)
        return "";
    const pairs = entries.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(" ");
    return ` ${DIM}${pairs}${RESET}`;
}
class ConsoleTransport {
    name = "console";
    write(entry) {
        const color = LEVEL_COLOR[entry.level];
        const label = LEVEL_LABEL[entry.level];
        const time = `${DIM}${formatDate(entry.timestamp)} ${formatTime(entry.timestamp)}${RESET}`;
        const level = `${color}${label}${RESET}`;
        const context = entry.context ? ` ${BOLD}${WHITE}[${entry.context}]${RESET}` : "";
        const message = entry.message;
        const meta = entry.meta ? formatMeta(entry.meta) : "";
        const line = `${time} ${level}${context} ${message}${meta}`;
        if (entry.level === ILogger_1.LogLevel.ERROR) {
            process.stderr.write(line + "\n");
            if (entry.error?.stack) {
                process.stderr.write(`${DIM}${entry.error.stack}${RESET}\n`);
            }
        }
        else {
            process.stdout.write(line + "\n");
        }
    }
}
exports.ConsoleTransport = ConsoleTransport;
