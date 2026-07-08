"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProtectionStore = getProtectionStore;
exports.setProtectionStore = setProtectionStore;
exports.getProtectionMeta = getProtectionMeta;
exports.recordProtectionEnabled = recordProtectionEnabled;
exports.recordNameEvent = recordNameEvent;
exports.recordRevert = recordRevert;
exports.getProtectionSummary = getProtectionSummary;
class ProtectionRegistryImpl {
    _store = { threads: {}, botNicknames: {} };
    _meta = { enabledAt: {}, lastRevertAt: {}, revertCount: {}, lastEventAt: {} };
    getStore() { return this._store; }
    setStore(s) { this._store = s; }
    getMeta() { return this._meta; }
    recordProtectionEnabled(threadId) { this._meta.enabledAt[threadId] = new Date().toISOString(); }
    recordNameEvent(threadId) { this._meta.lastEventAt[threadId] = new Date().toISOString(); }
    recordRevert(threadId) {
        this._meta.lastRevertAt[threadId] = new Date().toISOString();
        this._meta.revertCount[threadId] = (this._meta.revertCount[threadId] ?? 0) + 1;
    }
    summary() {
        const threads = Object.entries(this._store.threads).map(([id, s]) => ({
            threadId: id, protectName: s.protectName, lockedName: s.lockedName,
            enabledAt: this._meta.enabledAt[id], lastRevertAt: this._meta.lastRevertAt[id],
            revertCount: this._meta.revertCount[id] ?? 0, lastEventAt: this._meta.lastEventAt[id],
        }));
        return {
            totalThreads: threads.length,
            protectedNames: threads.filter(t => t.protectName).length,
            protectedNicks: Object.values(this._store.threads).filter(s => s.protectNicknames).length,
            threads,
        };
    }
}
const _registry = new ProtectionRegistryImpl();
function getProtectionStore() { return _registry.getStore(); }
function setProtectionStore(s) { _registry.setStore(s); }
function getProtectionMeta() { return _registry.getMeta(); }
function recordProtectionEnabled(threadId) { _registry.recordProtectionEnabled(threadId); }
function recordNameEvent(threadId) { _registry.recordNameEvent(threadId); }
function recordRevert(threadId) { _registry.recordRevert(threadId); }
function getProtectionSummary() { return _registry.summary(); }
