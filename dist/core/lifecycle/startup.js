"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildStartupSteps = buildStartupSteps;
exports.runStartupSteps = runStartupSteps;
function buildStartupSteps(systems, onStep) {
    return systems.map((system) => ({
        name: system.name,
        execute: async () => {
            onStep(system.name);
            await system.initialize();
        },
    }));
}
async function runStartupSteps(steps) {
    for (const step of steps) {
        await step.execute();
    }
}
