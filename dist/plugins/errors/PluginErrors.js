"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PluginCircularDependencyError = exports.PluginServiceError = exports.PluginStateError = exports.PluginDependencyError = exports.PluginNotFoundError = exports.PluginError = void 0;
class PluginError extends Error {
    pluginName;
    cause;
    constructor(pluginName, message, cause) {
        super(`[Plugin:${pluginName}] ${message}`);
        this.pluginName = pluginName;
        this.cause = cause;
        this.name = "PluginError";
    }
}
exports.PluginError = PluginError;
class PluginNotFoundError extends PluginError {
    constructor(pluginName) {
        super(pluginName, `Plugin not found: "${pluginName}".`);
        this.name = "PluginNotFoundError";
    }
}
exports.PluginNotFoundError = PluginNotFoundError;
class PluginDependencyError extends PluginError {
    constructor(pluginName, depName) {
        super(pluginName, `Missing dependency: "${depName}" must be enabled before "${pluginName}".`);
        this.name = "PluginDependencyError";
    }
}
exports.PluginDependencyError = PluginDependencyError;
class PluginStateError extends PluginError {
    constructor(pluginName, current, desired) {
        super(pluginName, `Invalid state transition: "${current}" → "${desired}" is not allowed.`);
        this.name = "PluginStateError";
    }
}
exports.PluginStateError = PluginStateError;
class PluginServiceError extends PluginError {
    constructor(pluginName, serviceName) {
        super(pluginName, `Required service not found: "${serviceName}".`);
        this.name = "PluginServiceError";
    }
}
exports.PluginServiceError = PluginServiceError;
class PluginCircularDependencyError extends PluginError {
    constructor(pluginName, chain) {
        super(pluginName, `Circular dependency detected: ${chain.join(" → ")}.`);
        this.name = "PluginCircularDependencyError";
    }
}
exports.PluginCircularDependencyError = PluginCircularDependencyError;
