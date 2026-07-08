"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReconnectStatus = void 0;
var ReconnectStatus;
(function (ReconnectStatus) {
    ReconnectStatus["IDLE"] = "IDLE";
    ReconnectStatus["RETRYING"] = "RETRYING";
    ReconnectStatus["CONNECTED"] = "CONNECTED";
    ReconnectStatus["FAILED"] = "FAILED";
    ReconnectStatus["BLOCKED"] = "BLOCKED";
    /** Circuit breaker OPEN — all reconnect attempts blocked until
     *  resetCircuit() is called (after new credentials are provided). */
    ReconnectStatus["CIRCUIT_OPEN"] = "CIRCUIT_OPEN";
})(ReconnectStatus || (exports.ReconnectStatus = ReconnectStatus = {}));
