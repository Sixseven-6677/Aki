"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MiddlewareChain = void 0;
const IMiddleware_1 = require("./types/IMiddleware");
class MiddlewareChain {
    fns;
    constructor(fns = []) {
        this.fns = [...fns];
    }
    use(middleware) {
        this.fns.push((0, IMiddleware_1.toMiddlewareFn)(middleware));
        return this;
    }
    /**
     * Execute the middleware chain.
     * Stops early if any middleware doesn't call next().
     */
    async execute(ctx, command, terminal) {
        const chain = terminal ? [...this.fns, terminal] : [...this.fns];
        await this.dispatch(ctx, command, chain, 0);
    }
    /**
     * Execute the chain and return whether it was stopped.
     * A tracker sentinel is injected just before the terminal to detect
     * whether all middlewares called next().
     */
    async executeWithResult(ctx, command, terminal) {
        const start = Date.now();
        let reachedTerminal = false;
        const tracker = async (_ctx, _cmd, next) => {
            reachedTerminal = true;
            await next();
        };
        const chain = terminal
            ? [...this.fns, tracker, terminal]
            : [...this.fns, tracker];
        await this.dispatch(ctx, command, chain, 0);
        return {
            stopped: !reachedTerminal,
            durationMs: Date.now() - start,
        };
    }
    async dispatch(ctx, command, chain, index) {
        if (index >= chain.length)
            return;
        const fn = chain[index];
        await fn(ctx, command, () => this.dispatch(ctx, command, chain, index + 1));
    }
    clone() {
        return new MiddlewareChain(this.fns);
    }
    get size() {
        return this.fns.length;
    }
}
exports.MiddlewareChain = MiddlewareChain;
