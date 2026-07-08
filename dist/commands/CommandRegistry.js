"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommandRegistry = void 0;
const LoggerManager_1 = require("../logger/LoggerManager");
const log = LoggerManager_1.LoggerManager.getLogger("CommandRegistry");
class CommandRegistry {
    commands = new Map();
    aliases = new Map();
    register(command) {
        if (this.commands.has(command.name)) {
            throw new Error(`Command already registered: "${command.name}"`);
        }
        this.commands.set(command.name, command);
        for (const alias of command.aliases ?? []) {
            if (this.aliases.has(alias) || this.commands.has(alias)) {
                throw new Error(`Alias "${alias}" for command "${command.name}" conflicts with an existing command or alias.`);
            }
            this.aliases.set(alias, command.name);
        }
        log.info(`Registered: ${command.name}` +
            (command.aliases?.length ? ` (aliases: ${command.aliases.join(", ")})` : "") +
            (command.category ? ` [${command.category}]` : ""));
    }
    unregister(name) {
        const command = this.commands.get(name);
        if (!command)
            return;
        for (const alias of command.aliases ?? []) {
            this.aliases.delete(alias);
        }
        this.commands.delete(name);
        log.info(`Unregistered: ${name}`);
    }
    resolve(nameOrAlias) {
        if (this.commands.has(nameOrAlias)) {
            return this.commands.get(nameOrAlias);
        }
        const canonical = this.aliases.get(nameOrAlias);
        if (canonical) {
            return this.commands.get(canonical);
        }
        return undefined;
    }
    has(nameOrAlias) {
        return this.commands.has(nameOrAlias) || this.aliases.has(nameOrAlias);
    }
    getAll() {
        return Array.from(this.commands.values());
    }
    /** Return commands grouped by category (visible only, excludes hidden). */
    byCategory() {
        const map = new Map();
        for (const cmd of this.commands.values()) {
            if (cmd.hidden)
                continue;
            const cat = cmd.category ?? "general";
            if (!map.has(cat))
                map.set(cat, []);
            map.get(cat).push(cmd);
        }
        return map;
    }
    /** Total number of registered commands (including hidden). */
    size() {
        return this.commands.size;
    }
    clear() {
        this.commands.clear();
        this.aliases.clear();
        log.info("Registry cleared.");
    }
}
exports.CommandRegistry = CommandRegistry;
