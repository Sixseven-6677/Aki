"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PluginServiceRegistry = void 0;
const LoggerManager_1 = require("../logger/LoggerManager");
const log = LoggerManager_1.LoggerManager.getLogger("PluginServiceRegistry");
/**
 * Shared service registry for inter-plugin dependency injection.
 * Plugins provide services; other plugins consume them by name.
 */
class PluginServiceRegistry {
    services = new Map();
    provide(name, service, owner) {
        if (this.services.has(name)) {
            const existing = this.services.get(name);
            log.warn(`Service "${name}" already registered by plugin "${existing.owner}". ` +
                `Overriding with registration from plugin "${owner}".`);
        }
        this.services.set(name, { service, owner });
        log.info(`Service registered: "${name}" by plugin "${owner}".`);
        return () => {
            const current = this.services.get(name);
            if (current?.owner === owner) {
                this.services.delete(name);
                log.info(`Service unregistered: "${name}" (owner: "${owner}").`);
            }
        };
    }
    consume(name) {
        return this.services.get(name)?.service;
    }
    has(name) {
        return this.services.has(name);
    }
    listByOwner(owner) {
        const result = [];
        for (const [name, entry] of this.services) {
            if (entry.owner === owner)
                result.push(name);
        }
        return result;
    }
    removeByOwner(owner) {
        for (const [name, entry] of this.services) {
            if (entry.owner === owner) {
                this.services.delete(name);
                log.info(`Service removed: "${name}" (owner: "${owner}").`);
            }
        }
    }
}
exports.PluginServiceRegistry = PluginServiceRegistry;
