"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InitializationManager = void 0;
class InitializationManager {
    registered = new Map();
    register(system) {
        if (this.registered.has(system.name)) {
            throw new Error(`System already registered: "${system.name}"`);
        }
        this.registered.set(system.name, system);
    }
    resolve() {
        const resolved = [];
        const visited = new Set();
        const visiting = new Set();
        const visit = (name) => {
            if (visited.has(name))
                return;
            if (visiting.has(name)) {
                throw new Error(`Circular dependency detected involving: "${name}"`);
            }
            const system = this.registered.get(name);
            if (!system) {
                throw new Error(`Unknown system dependency: "${name}"`);
            }
            visiting.add(name);
            for (const dep of system.dependencies ?? []) {
                visit(dep);
            }
            visiting.delete(name);
            visited.add(name);
            resolved.push(system);
        };
        for (const name of this.registered.keys()) {
            visit(name);
        }
        return resolved;
    }
    has(name) {
        return this.registered.has(name);
    }
}
exports.InitializationManager = InitializationManager;
