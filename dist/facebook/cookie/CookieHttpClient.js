"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CookieHttpClient = void 0;
/**
 * Wraps an FCA app-state cookie array and exposes the helpers
 * that MessengerPoller needs:
 *   - getUserId()      — the c_user value (Facebook user ID of the bot account)
 *   - getRawAppState() — the raw cookie array passed to fca-unofficial
 */
class CookieHttpClient {
    appState;
    _userId;
    constructor(appState) {
        this.appState = appState;
        this._userId = this.extractUserId(appState);
    }
    getUserId() {
        return this._userId;
    }
    getRawAppState() {
        return this.appState;
    }
    extractUserId(appState) {
        const cUser = appState.find((c) => c.key === "c_user");
        return cUser?.value ?? "";
    }
}
exports.CookieHttpClient = CookieHttpClient;
