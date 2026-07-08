"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SystemLoader = void 0;
const ISystem_1 = require("./interfaces/ISystem");
class SystemLoader {
    entries = new Map();
    manager;
    constructor(manager) {
        this.manager = manager;
    }
    register(system) {
        this.manager.register(system);
        this.entries.set(system.name, {
            system,
            status: ISystem_1.SystemStatus.PENDING,
        });
        return this;
    }
    getResolved() {
        return this.manager.resolve();
    }
    setStatus(name, status) {
        const entry = this.entries.get(name);
        if (!entry)
            return;
        entry.status = status;
        if (status === ISystem_1.SystemStatus.READY) {
            entry.initializedAt = Date.now();
        }
    }
    get(name) {
        const entry = this.entries.get(name);
        if (!entry) {
            throw new Error(`System not found: "${name}"`);
        }
        return entry.system;
    }
    getStatus(name) {
        return this.entries.get(name)?.status;
    }
    summary() {
        const result = {};
        for (const [name, entry] of this.entries) {
            result[name] = entry.status;
        }
        return result;
    }
}
exports.SystemLoader = SystemLoader;
