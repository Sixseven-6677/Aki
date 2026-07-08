"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StartupValidator = void 0;
const IStartupCheck_1 = require("./IStartupCheck");
const LoggerManager_1 = require("../../logger/LoggerManager");
const log = LoggerManager_1.LoggerManager.getLogger("StartupValidator");
class StartupValidator {
    checks = [];
    add(check) {
        this.checks.push(check);
        return this;
    }
    addMany(checks) {
        checks.forEach((c) => this.add(c));
        return this;
    }
    async validate() {
        const start = Date.now();
        const results = [];
        log.info(`StartupValidator: running ${this.checks.length} check(s)...`);
        log.info("─".repeat(50));
        for (const check of this.checks) {
            let result;
            try {
                result = await check.run();
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                result = {
                    name: check.name,
                    passed: false,
                    severity: check.severity,
                    message: `Check threw an unexpected error: ${msg}`,
                };
            }
            results.push(result);
            this.logResult(result);
        }
        const criticalFailed = results
            .filter((r) => !r.passed && r.severity === IStartupCheck_1.CheckSeverity.CRITICAL)
            .map((r) => r.name);
        const warnings = results
            .filter((r) => !r.passed && r.severity === IStartupCheck_1.CheckSeverity.WARNING)
            .map((r) => r.name);
        const passed = criticalFailed.length === 0;
        const durationMs = Date.now() - start;
        log.info("─".repeat(50));
        if (passed) {
            log.info(`StartupValidator: ✓ All critical checks passed. ` +
                `(${results.filter((r) => r.passed).length}/${results.length} passed, ${durationMs}ms)`);
        }
        else {
            log.error(`StartupValidator: ✗ ${criticalFailed.length} critical check(s) failed: ` +
                `[${criticalFailed.join(", ")}]`);
        }
        return { passed, results, criticalFailed, warnings, durationMs };
    }
    logResult(result) {
        const icon = result.passed ? "✓" : (result.severity === IStartupCheck_1.CheckSeverity.CRITICAL ? "✗" : "⚠");
        const fn = result.passed
            ? (m) => log.info(m)
            : result.severity === IStartupCheck_1.CheckSeverity.CRITICAL
                ? (m) => log.error(m)
                : (m) => log.warn(m);
        fn(`  ${icon} [${result.name}] ${result.message}`);
        if (result.detail && !result.passed) {
            fn(`      └─ ${result.detail}`);
        }
    }
}
exports.StartupValidator = StartupValidator;
