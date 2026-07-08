"use strict";
/**
 * Shared promise wrappers around FCA callback-based API methods.
 * Import these instead of duplicating the wrapper pattern in each plugin.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchThreadInfo = fetchThreadInfo;
exports.setAdminStatus = setAdminStatus;
// ─── Promise wrappers ─────────────────────────────────────────────────────────
/**
 * Promisified wrapper for `api.getThreadInfo`.
 * Used by admin and management plugins.
 */
function fetchThreadInfo(api, threadID) {
    return new Promise((resolve, reject) => {
        api.getThreadInfo(threadID, (err, info) => {
            if (err)
                reject(err);
            else
                resolve(info);
        });
    });
}
/**
 * Promisified wrapper for `api.changeAdminStatus`.
 * Used by the admin plugin.
 */
function setAdminStatus(api, threadID, userIDs, isAdmin) {
    return new Promise((resolve, reject) => {
        api.changeAdminStatus(threadID, userIDs, isAdmin, (err) => {
            if (err)
                reject(err);
            else
                resolve();
        });
    });
}
