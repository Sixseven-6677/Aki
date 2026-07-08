"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.typingMiddleware = void 0;
const typingMiddleware = async (ctx, _command, next) => {
    await ctx.typingOn();
    await next();
};
exports.typingMiddleware = typingMiddleware;
