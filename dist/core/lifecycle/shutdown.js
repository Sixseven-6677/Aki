"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildShutdownSteps = buildShutdownSteps;
exports.runShutdownSteps = runShutdownSteps;
function buildShutdownSteps(systems, onStep) {
    return [...systems].reverse().map((system) => ({
        name: system.name,
        execute: async () => {
            onStep(system.name);
            await system.destroy();
        },
    }));
}
async function runShutdownSteps(steps, timeoutMs = 10_000) {
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("Shutdown timed out after " + timeoutMs + "ms")), timeoutMs));
    const work = (async () => {
        for (const step of steps) {
            await step.execute();
        }
    })();
    await Promise.race([work, timeout]);
}
