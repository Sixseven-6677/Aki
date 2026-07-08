"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionStatus = void 0;
var SessionStatus;
(function (SessionStatus) {
    SessionStatus["ACTIVE"] = "ACTIVE";
    SessionStatus["EXPIRED"] = "EXPIRED";
    SessionStatus["CORRUPTED"] = "CORRUPTED";
    SessionStatus["DISCONNECTED"] = "DISCONNECTED";
    SessionStatus["RESTORING"] = "RESTORING";
})(SessionStatus || (exports.SessionStatus = SessionStatus = {}));
