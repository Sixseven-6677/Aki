"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CheckSeverity = void 0;
var CheckSeverity;
(function (CheckSeverity) {
    /** Failure stops the bot from starting. */
    CheckSeverity["CRITICAL"] = "CRITICAL";
    /** Failure is logged but bot continues. */
    CheckSeverity["WARNING"] = "WARNING";
    /** Always logged, never fails startup. */
    CheckSeverity["INFO"] = "INFO";
})(CheckSeverity || (exports.CheckSeverity = CheckSeverity = {}));
