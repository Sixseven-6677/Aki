"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isValidPlugin = isValidPlugin;
function isValidPlugin(obj) {
    return (typeof obj === "object" &&
        obj !== null &&
        "manifest" in obj &&
        typeof obj.manifest === "object" &&
        obj.manifest !== null &&
        typeof obj.manifest.name === "string" &&
        obj.manifest.name.trim().length > 0 &&
        typeof obj.manifest.version === "string" &&
        "onLoad" in obj &&
        typeof obj.onLoad === "function" &&
        "onUnload" in obj &&
        typeof obj.onUnload === "function");
}
