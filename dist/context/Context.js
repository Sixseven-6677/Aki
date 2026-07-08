"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Context = void 0;
class Context {
    user;
    thread;
    message;
    args;
    commandName;
    sender;
    constructor(user, thread, message, sender) {
        this.user = user;
        this.thread = thread;
        this.message = message;
        this.sender = sender;
        const parts = (message.text ?? "").trim().split(/\s+/).filter(Boolean);
        this.commandName = parts[0]?.toLowerCase() ?? "";
        this.args = parts.slice(1);
    }
    // ── Messaging ─────────────────────────────────────────────────────────
    /**
     * Send a text reply to the conversation.
     * Uses thread.id (the threadID / conversation ID) so replies go to the
     * correct group or DM regardless of who sent the message.
     */
    async reply(text) {
        await this.sender.sendText(this.thread.id, text);
    }
    /**
     * React to the current message in this conversation.
     * Uses thread.id to identify the correct conversation context.
     */
    async react(emoji) {
        await this.sender.sendReaction(this.message.id, this.thread.id, emoji);
    }
    /**
     * Send a typing indicator to this conversation.
     * Uses thread.id for correct targeting in group chats.
     */
    async typingOn() {
        await this.sender.sendTyping(this.thread.id);
    }
    // ── Args helpers ──────────────────────────────────────────────────────
    hasArgs() {
        return this.args.length > 0;
    }
    getArg(index) {
        return this.args[index];
    }
    getArgOrFail(index, errorMsg) {
        const value = this.args[index];
        if (!value)
            throw new Error(errorMsg);
        return value;
    }
    getRemainingText(fromIndex = 0) {
        return this.args.slice(fromIndex).join(" ");
    }
    // ── User profile helpers ──────────────────────────────────────────────
    /**
     * Returns the user's preference value for `key`,
     * or `defaultValue` if the preference is not set.
     */
    getPreference(key, defaultValue) {
        const val = this.user.preferences[key];
        return (val !== undefined ? val : defaultValue);
    }
    /**
     * Returns true if the user's role is at least as privileged as `role`.
     * Hierarchy (ascending): user -> moderator -> admin -> owner
     */
    hasRole(role) {
        const hierarchy = ["user", "moderator", "admin", "owner"];
        return hierarchy.indexOf(this.user.role) >= hierarchy.indexOf(role);
    }
    /** Convenience — true only on the user's very first message to the bot. */
    get isNewUser() {
        return this.user.isNew;
    }
}
exports.Context = Context;
