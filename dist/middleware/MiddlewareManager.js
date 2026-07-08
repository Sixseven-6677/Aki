"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MiddlewareManager = void 0;
const MiddlewareChain_1 = require("./MiddlewareChain");
const LoggerManager_1 = require("../logger/LoggerManager");
const log = LoggerManager_1.LoggerManager.getLogger("MiddlewareManager");
class MiddlewareManager {
    /** Ordered list of registered names (insertion order). */
    order = [];
    registry = new Map();
    register(middleware) {
        if (this.registry.has(middleware.name)) {
            throw new Error(`Middleware already registered: "${middleware.name}"`);
        }
        this.registry.set(middleware.name, middleware);
        this.order.push(middleware.name);
        log.info(`Registered: "${middleware.name}"` +
            (middleware.description ? ` — ${middleware.description}` : ""));
        return this;
    }
    unregister(name) {
        if (!this.registry.has(name))
            return this;
        this.registry.delete(name);
        const idx = this.order.indexOf(name);
        if (idx !== -1)
            this.order.splice(idx, 1);
        log.info(`Unregistered: "${name}"`);
        return this;
    }
    get(name) {
        const mw = this.registry.get(name);
        if (!mw)
            throw new Error(`Middleware not found: "${name}"`);
        return mw;
    }
    /**
     * Returns a MiddlewareFn whose `.name` property equals the middleware name.
     * CommandPipeline uses `fn.name` for per-step debug tracing.
     */
    fn(name) {
        const mw = this.get(name);
        // Computed-property name trick: JS assigns fn.name from the object key.
        const namedFns = {
            [name]: (ctx, command, next) => mw.handle(ctx, command, next),
        };
        return namedFns[name];
    }
    has(name) {
        return this.registry.has(name);
    }
    /**
     * Build a MiddlewareChain from named middlewares.
     * If no names given, uses all registered in registration order.
     */
    createChain(...names) {
        const chain = new MiddlewareChain_1.MiddlewareChain();
        const targets = names.length > 0 ? names : this.order;
        for (const n of targets) {
            chain.use(this.get(n));
        }
        return chain;
    }
    /** Returns all middlewares in registration order. */
    getAll() {
        return this.order.map((n) => this.registry.get(n));
    }
    /** Returns registered names in insertion order. */
    list() {
        return [...this.order];
    }
    size() {
        return this.registry.size;
    }
}
exports.MiddlewareManager = MiddlewareManager;
