"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.groupMuteMiddleware = void 0;
const GroupControlRegistry_1 = require("../../protection/GroupControlRegistry");
/**
 * groupMuteMiddleware
 *
 * Placed in the CommandPipeline right after the lockdown check.
 *
 * • Records last-activity for every thread that sends a command.
 * • Silently blocks command execution from any thread whose ID is in the
 *   muted set (toggled via "قروب كتم [n]" / "قروب فتح [n]" commands).
 */
const groupMuteMiddleware = async (ctx, _cmd, next) => {
    (0, GroupControlRegistry_1.recordActivity)(ctx.thread.id);
    if ((0, GroupControlRegistry_1.isMuted)(ctx.thread.id)) {
        return; // silently swallow — no reply to muted group
    }
    await next();
};
exports.groupMuteMiddleware = groupMuteMiddleware;
