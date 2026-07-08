"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthStatus = void 0;
var AuthStatus;
(function (AuthStatus) {
    AuthStatus["AUTHENTICATED"] = "AUTHENTICATED";
    AuthStatus["UNAUTHENTICATED"] = "UNAUTHENTICATED";
    AuthStatus["EXPIRED"] = "EXPIRED";
    AuthStatus["CORRUPTED"] = "CORRUPTED";
    AuthStatus["LOADING"] = "LOADING";
})(AuthStatus || (exports.AuthStatus = AuthStatus = {}));
