"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthFailureReason = exports.AuthStage = void 0;
// ─── Auth stages ──────────────────────────────────────────────────────────────
/** The ordered authentication stages attempted by AuthPipeline.run(). */
var AuthStage;
(function (AuthStage) {
    /** Cookie-based login using a saved AppState JSON array. */
    AuthStage["APPSTATE"] = "appstate";
    /** Full credential login using email + password — generates a fresh AppState. */
    AuthStage["EMAIL_PASSWORD"] = "email-password";
})(AuthStage || (exports.AuthStage = AuthStage = {}));
// ─── Failure taxonomy ─────────────────────────────────────────────────────────
/**
 * Structured reason for an authentication stage failure.
 * Each value maps to a distinct remediation path.
 */
var AuthFailureReason;
(function (AuthFailureReason) {
    /** AppState cookies are missing from env/file/session — nothing to try. */
    AuthFailureReason["APPSTATE_MISSING"] = "appstate-missing";
    /** AppState cookies are present but Facebook rejected them as expired. */
    AuthFailureReason["APPSTATE_EXPIRED"] = "appstate-expired";
    /** AppState data is present but cannot be parsed (invalid JSON / not an array). */
    AuthFailureReason["APPSTATE_CORRUPTED"] = "appstate-corrupted";
    /** Email or password is not configured in environment variables. */
    AuthFailureReason["CREDENTIAL_MISSING"] = "credential-missing";
    /** Email or password was incorrect. */
    AuthFailureReason["CREDENTIAL_INVALID"] = "credential-invalid";
    /** Facebook requires solving a checkpoint before this session can continue. */
    AuthFailureReason["CHECKPOINT"] = "checkpoint";
    /** Facebook requires a two-factor verification code. */
    AuthFailureReason["TWO_FACTOR_AUTH"] = "two-factor-auth";
    /** The account has been suspended, restricted, or permanently disabled. */
    AuthFailureReason["ACCOUNT_RESTRICTED"] = "account-restricted";
    /** A transient network error (DNS, TCP, timeout) prevented the login attempt. */
    AuthFailureReason["NETWORK_FAILURE"] = "network-failure";
    /** Facebook returned a temporary server error (e.g. error code 1357031). */
    AuthFailureReason["FACEBOOK_TEMPORARY_ERROR"] = "facebook-temporary-error";
    /** Reason could not be determined from the error message. */
    AuthFailureReason["UNKNOWN"] = "unknown";
})(AuthFailureReason || (exports.AuthFailureReason = AuthFailureReason = {}));
