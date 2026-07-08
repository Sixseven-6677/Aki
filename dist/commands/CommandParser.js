"use strict";
/**
 * CommandParser — pure text → ParsedCommand.
 *
 * Supports:
 *   - Configurable prefix list  (e.g. ["/", "!", "."])
 *   - Positional args           (tokens without leading dashes)
 *   - Long flags                (--flag, --key=value)
 *   - Short flags               (-f)
 *   - Quoted strings            ("hello world" treated as one token)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommandParser = void 0;
const TOKEN_RE = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
class CommandParser {
    /**
     * Parse raw message text into a structured command.
     *
     * @param input    Raw text received from the user.
     * @param prefixes List of accepted prefixes (e.g. ["/", "!"]).
     *                 Pass an empty array to accept any text as a command.
     * @returns ParsedCommand, or null if no prefix matched (when prefixes is non-empty).
     */
    static parse(input, prefixes = []) {
        const text = input.trim();
        if (!text)
            return null;
        let prefix = "";
        let body = text;
        if (prefixes.length > 0) {
            const matched = prefixes.find((p) => text.startsWith(p));
            if (!matched)
                return null;
            prefix = matched;
            body = text.slice(matched.length).trim();
        }
        if (!body)
            return null;
        const rawTokens = [];
        let m;
        TOKEN_RE.lastIndex = 0;
        while ((m = TOKEN_RE.exec(body)) !== null) {
            // group 1 = "…", group 2 = '…', otherwise the full match
            rawTokens.push(m[1] ?? m[2] ?? m[0] ?? "");
        }
        if (rawTokens.length === 0)
            return null;
        const rawName = rawTokens[0];
        const name = rawName.toLowerCase();
        const args = [];
        const flags = new Map();
        for (let i = 1; i < rawTokens.length; i++) {
            const tok = rawTokens[i];
            if (tok.startsWith("--") && tok.length > 2) {
                const eq = tok.indexOf("=", 2);
                if (eq !== -1) {
                    flags.set(tok.slice(2, eq), tok.slice(eq + 1));
                }
                else {
                    flags.set(tok.slice(2), true);
                }
            }
            else if (/^-[a-zA-Z]$/.test(tok)) {
                flags.set(tok.slice(1), true);
            }
            else {
                args.push(tok);
            }
        }
        return { prefix, rawName, name, args, flags, raw: text };
    }
    /** Check if a flag is present (regardless of value). */
    static hasFlag(parsed, flag) {
        return parsed.flags.has(flag);
    }
    /** Get the string value of a flag, or undefined if it's boolean / absent. */
    static getFlag(parsed, flag) {
        const val = parsed.flags.get(flag);
        return val === true ? undefined : val;
    }
    /** Get the flag value as a string or a fallback default. */
    static getFlagOr(parsed, flag, fallback) {
        return CommandParser.getFlag(parsed, flag) ?? fallback;
    }
}
exports.CommandParser = CommandParser;
