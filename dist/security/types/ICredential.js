"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CredentialStatus = exports.CredentialSource = void 0;
var CredentialSource;
(function (CredentialSource) {
    CredentialSource["ENV"] = "ENV";
    CredentialSource["ENCRYPTED_FILE"] = "ENCRYPTED_FILE";
    CredentialSource["UNKNOWN"] = "UNKNOWN";
})(CredentialSource || (exports.CredentialSource = CredentialSource = {}));
var CredentialStatus;
(function (CredentialStatus) {
    CredentialStatus["VALID"] = "VALID";
    CredentialStatus["MISSING"] = "MISSING";
    CredentialStatus["CORRUPTED"] = "CORRUPTED";
    CredentialStatus["EXPIRED"] = "EXPIRED";
    CredentialStatus["HARDCODED"] = "HARDCODED";
})(CredentialStatus || (exports.CredentialStatus = CredentialStatus = {}));
