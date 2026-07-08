"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tryCatch = tryCatch;
exports.safeRun = safeRun;
exports.withErrorBoundary = withErrorBoundary;
const ErrorReporter_1 = require("../ErrorReporter");
async function tryCatch(fn) {
    try {
        const value = await fn();
        return [null, value];
    }
    catch (err) {
        return [err instanceof Error ? err : new Error(String(err)), null];
    }
}
async function safeRun(fn, context) {
    try {
        return await fn();
    }
    catch (err) {
        ErrorReporter_1.errorReporter.report(err, context);
        return undefined;
    }
}
function withErrorBoundary(fn, context) {
    return async (...args) => {
        return safeRun(() => fn(...args), context);
    };
}
