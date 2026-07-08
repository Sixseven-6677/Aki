"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isValidCommand = isValidCommand;
function isValidCommand(obj) {
    return (typeof obj === "object" &&
        obj !== null &&
        "name" in obj &&
        typeof obj.name === "string" &&
        obj.name.trim().length > 0 &&
        "execute" in obj &&
        typeof obj.execute === "function");
}
