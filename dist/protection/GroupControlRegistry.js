"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.muteThread = muteThread;
exports.unmuteThread = unmuteThread;
exports.isMuted = isMuted;
exports.getMutedThreads = getMutedThreads;
exports.recordActivity = recordActivity;
exports.getLastActivity = getLastActivity;
class GroupControlRegistryImpl {
    _mutedThreads = new Set();
    _lastActivity = new Map();
    mute(id) { this._mutedThreads.add(id); }
    unmute(id) { this._mutedThreads.delete(id); }
    isMuted(id) { return this._mutedThreads.has(id); }
    getMuted() { return this._mutedThreads; }
    recordActivity(id) { this._lastActivity.set(id, Date.now()); }
    getLastActivity(id) { return this._lastActivity.get(id) ?? 0; }
}
const _registry = new GroupControlRegistryImpl();
function muteThread(id) { _registry.mute(id); }
function unmuteThread(id) { _registry.unmute(id); }
function isMuted(id) { return _registry.isMuted(id); }
function getMutedThreads() { return _registry.getMuted(); }
function recordActivity(id) { _registry.recordActivity(id); }
function getLastActivity(id) { return _registry.getLastActivity(id); }
