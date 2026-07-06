export interface ThreadState {
  protectName:      boolean;
  lockedName:       string;
  protectNicknames: boolean;
  nicknames:        Record<string, string>;
}

export interface ProtectionStore {
  threads:      Record<string, ThreadState>;
  botNicknames: Record<string, string>;
}

export interface ProtectionMeta {
  enabledAt:    Record<string, string>;
  lastRevertAt: Record<string, string>;
  revertCount:  Record<string, number>;
  lastEventAt:  Record<string, string>;
}

class ProtectionRegistryImpl {
  private _store: ProtectionStore = { threads: {}, botNicknames: {} };
  private _meta:  ProtectionMeta  = { enabledAt: {}, lastRevertAt: {}, revertCount: {}, lastEventAt: {} };

  getStore():  ProtectionStore { return this._store; }
  setStore(s:  ProtectionStore): void { this._store = s; }
  getMeta():   ProtectionMeta  { return this._meta; }

  recordProtectionEnabled(threadId: string): void { this._meta.enabledAt[threadId] = new Date().toISOString(); }
  recordNameEvent(threadId: string): void { this._meta.lastEventAt[threadId] = new Date().toISOString(); }
  recordRevert(threadId: string): void {
    this._meta.lastRevertAt[threadId] = new Date().toISOString();
    this._meta.revertCount[threadId]  = (this._meta.revertCount[threadId] ?? 0) + 1;
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

export function getProtectionStore(): ProtectionStore { return _registry.getStore(); }
export function setProtectionStore(s: ProtectionStore): void { _registry.setStore(s); }
export function getProtectionMeta():  ProtectionMeta  { return _registry.getMeta(); }
export function recordProtectionEnabled(threadId: string): void { _registry.recordProtectionEnabled(threadId); }
export function recordNameEvent(threadId: string): void { _registry.recordNameEvent(threadId); }
export function recordRevert(threadId: string): void { _registry.recordRevert(threadId); }
export function getProtectionSummary() { return _registry.summary(); }
