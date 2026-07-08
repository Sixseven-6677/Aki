"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toMiddlewareFn = toMiddlewareFn;
function toMiddlewareFn(middleware) {
    if (typeof middleware === "function")
        return middleware;
    return (ctx, command, next) => middleware.handle(ctx, command, next);
}
